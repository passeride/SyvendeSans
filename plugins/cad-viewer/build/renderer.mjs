import {
  AmbientLight, Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Sphere, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

function stepMesh(mesh) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(mesh.attributes.position.array), 3));
  const normal = mesh.attributes.normal;
  if (normal) geometry.setAttribute('normal', new BufferAttribute(Float32Array.from(normal.array), 3));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(mesh.index.array), 1));
  if (!normal) geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({
    color: mesh.color ? new Color().setRGB(...mesh.color, SRGBColorSpace) : 0x62b19e,
  }));
}

export function createViewer(stage, bytes, importer) {
  const model = new Group();
  if (importer) {
    const result = importer.ReadStepFile(bytes, null);
    if (!result.success || !result.meshes?.length) throw new Error('STEP-filen inneholder ingen lesbar geometri.');
    for (const mesh of result.meshes) model.add(stepMesh(mesh));
  } else {
    let geometry;
    try { geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
    catch { throw new Error('Kunne ikke lese STL-filen.'); }
    geometry.computeVertexNormals();
    model.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x62b19e })));
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
    throw new Error('Denne enheten kunne ikke starte WebGL 2-visningen.');
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.setAttribute('aria-label', '3D-modell');
  renderer.domElement.style.cssText = 'display:block;touch-action:none';
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
  return {
    reset,
    dispose() {
      observer.disconnect();
      controls.dispose();
      disposeModel();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
