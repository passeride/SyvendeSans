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
    color: mesh.color ? new Color().setRGB(...mesh.color, SRGBColorSpace).lerp(new Color(0xc5d8ec), 0.22) : 0x83bacd,
  }));
}

export function fitDistance(corners, direction, up, fov, aspect) {
  const horizontal = new Vector3().crossVectors(up, direction).normalize();
  const vertical = new Vector3().crossVectors(direction, horizontal);
  const halfHeight = Math.tan(fov * Math.PI / 360) * 0.88;
  const halfWidth = halfHeight * aspect;
  return Math.max(...corners.map(corner => {
    const offset = Math.max(Math.abs(corner.dot(horizontal)) / halfWidth,
      Math.abs(corner.dot(vertical)) / halfHeight);
    return corner.dot(direction) + offset;
  }));
}

function defaultView(size, portrait) {
  const axes = [
    { length: size.x, unit: new Vector3(1, 0, 0) },
    { length: size.y, unit: new Vector3(0, 1, 0) },
    { length: size.z, unit: new Vector3(0, 0, 1) },
  ].sort((a, b) => a.length - b.length);
  const [thin, short, long] = axes;
  if (thin.length < short.length * 0.25) {
    return {
      direction: thin.unit.clone().addScaledVector(short.unit, -0.27).addScaledVector(long.unit, 0.2).normalize(),
      up: portrait ? long.unit : short.unit,
    };
  }
  return { direction: new Vector3(1, -1.4, 0.9).normalize(), up: new Vector3(0, 0, 1) };
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
    model.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x83bacd })));
  }

  const disposeModel = () => {
    for (const mesh of model.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  };
  const box = new Box3().setFromObject(model);
  const bounds = box.getBoundingSphere(new Sphere());
  if (!Number.isFinite(bounds.radius) || bounds.radius <= 0) {
    disposeModel();
    throw new Error('Modellen inneholder ingen visbare flater.');
  }
  const size = box.getSize(new Vector3());
  const corners = [];
  for (const x of [-size.x / 2, size.x / 2]) {
    for (const y of [-size.y / 2, size.y / 2]) {
      for (const z of [-size.z / 2, size.z / 2]) corners.push(new Vector3(x, y, z));
    }
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
  const camera = new PerspectiveCamera(40, 1, bounds.radius / 1000, bounds.radius * 100);
  const { up, direction } = defaultView(size, stage.clientHeight > stage.clientWidth);
  camera.up.copy(up);
  const light = new DirectionalLight(0xffffff, 2.6);
  light.position.set(3, -4, 6);
  const fill = new DirectionalLight(0xbdd8ff, 1.1);
  fill.position.set(-5, 3, 2);
  scene.add(model, new AmbientLight(0xffffff, 1.9), light, fill);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = bounds.radius / 20;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);

  function reset() {
    const distance = Math.max(bounds.radius * 0.1, fitDistance(corners, direction, camera.up, camera.fov, camera.aspect));
    controls.maxDistance = Math.max(distance * 2, bounds.radius * 40);
    camera.far = controls.maxDistance + bounds.radius * 2;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    camera.position.copy(direction).multiplyScalar(distance);
    controls.update();
    render();
  }
  let previousAspect = 0;
  const resize = () => {
    if (!stage.clientWidth || !stage.clientHeight) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    const refit = Math.abs(previousAspect - camera.aspect) > 0.001;
    previousAspect = camera.aspect;
    if (refit) reset();
    else render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
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
