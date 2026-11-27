import {
  AmbientLight, Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight,
  Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Sphere, SRGBColorSpace,
  Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { readFreeCad } from './freecad.mjs';

const palette = [0x83bacd, 0xec9a62, 0xa9cb77, 0xb9a1e2, 0xe480a8, 0xe3c565, 0x63bca4, 0x8fabe8, 0xcdad91, 0xdf8177];

function fallbackColor(index) {
  return index < palette.length ? new Color(palette[index])
    : new Color().setHSL(index * 0.61803398875 % 1, 0.6, 0.66, SRGBColorSpace);
}

function savedColor(rgb) {
  return new Color().setRGB(...rgb, SRGBColorSpace);
}

function savedColorsAreUniform(parts) {
  if (parts.length < 2) return false;
  let first;
  for (const part of parts) {
    const colors = [part.color, ...part.mesh.brep_faces.map(face => face.color)].filter(Boolean);
    if (!colors.length) return false;
    for (const color of colors) {
      const key = color.map(channel => Math.round(channel * 255)).join(',');
      if (first === undefined) first = key;
      else if (key !== first) return false;
    }
  }
  return true;
}

function faceMaterials(geometry, faces, base) {
  const materials = [new MeshStandardMaterial({ color: base })];
  const indices = new Map([[base.getHex(), 0]]);
  let cursor = 0;
  function addGroup(start, count, index) {
    if (!count) return;
    const last = geometry.groups.at(-1);
    if (last && last.materialIndex === index && last.start + last.count === start) last.count += count;
    else geometry.addGroup(start, count, index);
  }
  for (const face of faces) {
    if (!face.color) continue;
    const start = face.first * 3, end = (face.last + 1) * 3;
    if (start < cursor || start >= end || end > geometry.index.count) continue;
    const color = savedColor(face.color);
    const key = color.getHex();
    if (!indices.has(key)) {
      indices.set(key, materials.length);
      materials.push(new MeshStandardMaterial({ color }));
    }
    addGroup(cursor, start - cursor, 0);
    addGroup(start, end - start, indices.get(key));
    cursor = end;
  }
  addGroup(cursor, geometry.index.count - cursor, 0);
  return materials;
}

function solidMesh(mesh, color, useSavedFaces) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(mesh.attributes.position.array), 3));
  const normal = mesh.attributes.normal;
  if (normal) geometry.setAttribute('normal', new BufferAttribute(Float32Array.from(normal.array), 3));
  geometry.setIndex(new BufferAttribute(Uint32Array.from(mesh.index.array), 1));
  if (!normal) geometry.computeVertexNormals();
  const material = useSavedFaces && mesh.brep_faces.some(face => face.color)
    ? faceMaterials(geometry, mesh.brep_faces, color)
    : new MeshStandardMaterial({ color });
  return new Mesh(geometry, material);
}

export function buildModel(bytes, importer, unzip) {
  const model = new Group();
  let skipped = 0;
  if (importer) {
    let parts;
    if (unzip) {
      const result = readFreeCad(bytes, importer, unzip);
      skipped = result.skipped;
      parts = result.parts.flatMap(({ meshes, matrix, color }) => meshes.map(mesh => ({ mesh, matrix, color })));
    } else {
      const result = importer.ReadStepFile(bytes, null);
      if (!result.success || !result.meshes?.length) throw new Error('STEP-filen inneholder ingen lesbar geometri.');
      parts = result.meshes.map(mesh => ({ mesh, color: mesh.color }));
    }
    const useSavedColors = !savedColorsAreUniform(parts);
    parts.forEach(({ mesh, matrix, color }, index) => {
      const base = useSavedColors && color ? savedColor(color) : fallbackColor(index);
      const solid = solidMesh(mesh, base, useSavedColors);
      if (matrix) solid.applyMatrix4(matrix);
      model.add(solid);
    });
  } else {
    let geometry;
    try { geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); }
    catch { throw new Error('Kunne ikke lese STL-filen.'); }
    geometry.computeVertexNormals();
    const material = geometry.getAttribute('color')
      ? new MeshStandardMaterial({ vertexColors: true })
      : geometry.groups.length > 1
        ? geometry.groups.map((_, index) => new MeshStandardMaterial({ color: fallbackColor(index) }))
        : new MeshStandardMaterial({ color: fallbackColor(0) });
    model.add(new Mesh(geometry, material));
  }
  return { model, skipped };
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

export function createViewer(stage, bytes, importer, unzip) {
  const { model, skipped } = buildModel(bytes, importer, unzip);

  const disposeModel = () => {
    for (const mesh of model.children) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
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
    skipped,
    dispose() {
      observer.disconnect();
      controls.dispose();
      disposeModel();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
