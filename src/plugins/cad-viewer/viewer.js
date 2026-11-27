import {
  AmbientLight, Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Sphere, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

function parseStep(bytes, signal) {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./step-worker.js', import.meta.url), { type: 'module' });
  let cancel;
  return new Promise((resolve, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.meshes);
    worker.onerror = () => reject(new Error('Kunne ikke starte STEP-importen.'));
    worker.onmessageerror = () => reject(new Error('Kunne ikke lese geometrien fra STEP-importen.'));
    worker.postMessage(bytes, [bytes]);
  }).finally(() => {
    signal.removeEventListener('abort', cancel);
    worker.terminate();
  });
}

function stepMesh({ positions, normals, indices, color }) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (normals) geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  if (!normals) geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({
    color: color ? new Color().setRGB(...color, SRGBColorSpace) : 0x62b19e,
  }));
}

export async function createViewer(stage, bytes, extension, signal) {
  const model = new Group();
  if (extension === 'stl') {
    let geometry;
    try { geometry = new STLLoader().parse(bytes); }
    catch { throw new Error('Kunne ikke lese STL-filen.'); }
    geometry.computeVertexNormals();
    model.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x62b19e })));
  } else {
    const parts = await parseStep(bytes, signal);
    signal.throwIfAborted();
    for (const part of parts) model.add(stepMesh(part));
  }

  const disposeModel = () => {
    for (const mesh of model.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  };
  const bounds = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
  if (!Number.isFinite(bounds.radius) || bounds.radius <= 0) {
    disposeModel();
    throw new Error('Modellen inneholder ingen visbare flater.');
  }
  model.position.copy(bounds.center).negate();

  let renderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: true }); }
  catch {
    disposeModel();
    throw new Error('Denne enheten kunne ikke starte WebGL-visningen.');
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D-modell');
  stage.replaceChildren(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, bounds.radius / 100, bounds.radius * 100);
  camera.up.set(0, 0, 1);
  const light = new DirectionalLight(0xffffff, 2);
  light.position.set(3, -4, 6);
  scene.add(model, new AmbientLight(0xffffff, 1.6), light);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = bounds.radius / 4;
  controls.maxDistance = bounds.radius * 40;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  function reset() {
    const vertical = camera.fov * Math.PI / 360;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = bounds.radius / Math.sin(Math.min(vertical, horizontal));
    controls.target.set(0, 0, 0);
    camera.position.copy(new Vector3(1, -1.4, 0.9).normalize().multiplyScalar(distance * 1.1));
    controls.update();
    render();
  }
  const resize = () => {
    if (!stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  reset();
  signal.addEventListener('abort', () => {
    observer.disconnect();
    controls.dispose();
    disposeModel();
    renderer.dispose();
    renderer.forceContextLoss();
  }, { once: true });
  return { reset };
}
