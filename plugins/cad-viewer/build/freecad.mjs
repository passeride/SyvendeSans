import { Matrix4, Quaternion, Vector3 } from 'three';

const xmlDecoder = new TextDecoder('utf-8', { fatal: true });
const geometryFile = /\.(brp|brep)$/i;

function xml(bytes) {
  const text = xmlDecoder.decode(bytes);
  if (/<!DOCTYPE\b/i.test(text)) throw new Error('FreeCAD-filen inneholder en ugyldig XML-deklarasjon.');
  const parsed = new DOMParser().parseFromString(text, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('Kunne ikke lese FreeCAD-dokumentet.');
  return parsed;
}

function property(object, name) {
  return object?.querySelector(':scope > Properties > Property[name="' + name + '"]')?.firstElementChild;
}

function packedColor(value) {
  if (value == null || value === '') return;
  const rgba = Number(value);
  if (!Number.isInteger(rgba) || rgba < 0 || rgba > 0xffffffff) return;
  return [rgba >>> 24, (rgba >>> 16) & 255, (rgba >>> 8) & 255].map(channel => channel / 255);
}

function colorList(entry, files, stride, colorOffset) {
  const bytes = files[entry?.getAttribute('file')];
  if (!bytes || bytes.length < 4) return [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = data.getUint32(0, true);
  if (count > 200_000 || count > Math.floor((bytes.length - 4) / stride)) return [];
  return Array.from({ length: count }, (_, index) => packedColor(data.getUint32(4 + index * stride + colorOffset, true)));
}

function appearance(provider, files) {
  const material = property(provider, 'ShapeAppearance');
  // FreeCAD writes the count followed by four packed colors and two floats per material.
  const version = material?.getAttribute('version');
  const modern = version == null || ['0', '2', '3'].includes(version) ? colorList(material, files, 24, 4) : [];
  const diffuse = modern.length ? modern : colorList(property(provider, 'DiffuseColor'), files, 4, 0);
  const shape = packedColor(property(provider, 'ShapeColor')?.getAttribute('value'))
    ?? packedColor(property(provider, 'ShapeMaterial')?.getAttribute('diffuseColor'));
  return { color: diffuse.length === 1 ? diffuse[0] : shape, faces: diffuse.length > 1 ? diffuse : [] };
}

function placement(object) {
  const data = property(object, 'Placement');
  if (!data) return new Matrix4();
  const values = ['Px', 'Py', 'Pz', 'Q0', 'Q1', 'Q2', 'Q3'].map(key => Number(data.getAttribute(key)));
  if (!values.every(Number.isFinite)) throw new Error('FreeCAD-filen inneholder en ugyldig plassering.');
  return new Matrix4().compose(new Vector3(...values.slice(0, 3)),
    new Quaternion(...values.slice(3)).normalize(), new Vector3(1, 1, 1));
}

export function readFreeCad(bytes, importer, unzip) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Dette er ikke et lesbart FCStd-arkiv.');
  let size = 0;
  const extract = include => unzip(bytes, { filter(entry) {
    if (!include(entry.name)) return false;
    size += entry.originalSize;
    if (size > 64 * 1024 * 1024) throw new Error('FreeCAD-modellen er for stor til å åpne.');
    return true;
  } });
  const files = extract(name => ['Document.xml', 'GuiDocument.xml'].includes(name) || geometryFile.test(name));
  if (!files['Document.xml']) throw new Error('FreeCAD-filen mangler Document.xml.');
  const doc = xml(files['Document.xml']);
  const gui = files['GuiDocument.xml'] && xml(files['GuiDocument.xml']);
  const providers = new Map(Array.from(gui?.querySelectorAll('ViewProvider') ?? []).map(obj => [obj.getAttribute('name'), obj]));
  const hidden = new Set(Array.from(providers.values())
    .filter(obj => property(obj, 'Visibility')?.getAttribute('value') === 'false')
    .map(obj => obj.getAttribute('name')));
  const types = new Map(Array.from(doc.querySelectorAll('Objects > Object'))
    .map(obj => [obj.getAttribute('name'), obj.getAttribute('type')]));
  const objects = new Map(Array.from(doc.querySelectorAll('ObjectData > Object'))
    .map(obj => [obj.getAttribute('name'), obj]));
  const parents = new Map();
  const shapes = new Map();
  for (const [name, object] of objects) {
    const type = types.get(name);
    if (type === 'App::Part' || type === 'PartDesign::Body' || type === 'App::DocumentObjectGroup' || type === 'Assembly::AssemblyObject') {
      for (const child of property(object, 'Group')?.children ?? []) {
        if (child.hasAttribute('value') && !parents.has(child.getAttribute('value'))) parents.set(child.getAttribute('value'), name);
      }
    }
    const shape = property(object, 'Shape')?.getAttribute('file');
    if (shape && geometryFile.test(shape) && Object.hasOwn(files, shape) && !type?.startsWith('Sketcher::')) shapes.set(name, shape);
    if (property(object, 'Visibility')?.getAttribute('value') === 'false') hidden.add(name);
  }

  const colorFiles = new Set();
  for (const provider of providers.values()) {
    for (const key of ['ShapeAppearance', 'DiffuseColor']) {
      const name = property(provider, key)?.getAttribute('file');
      if (name) colorFiles.add(name);
    }
  }
  const colors = colorFiles.size ? extract(name => colorFiles.has(name)) : {};
  const parts = [];
  let skipped = 0;
  for (const [name, file] of shapes) {
    if (hidden.has(name)) continue;
    const matrix = new Matrix4();
    const visited = new Set([name]);
    let ancestor = parents.get(name);
    while (ancestor && !visited.has(ancestor) && !hidden.has(ancestor) && !shapes.has(ancestor)) {
      visited.add(ancestor);
      if (types.get(ancestor) !== 'App::DocumentObjectGroup') matrix.premultiply(placement(objects.get(ancestor)));
      ancestor = parents.get(ancestor);
    }
    if (ancestor) continue;
    // The saved BREP already contains the object's own placement.
    const result = importer.ReadBrepFile(files[file], null);
    const meshes = result.success ? result.meshes?.filter(mesh => mesh.index.array.length > 0) : [];
    if (!meshes?.length) { skipped++; continue; }
    let saved = appearance(providers.get(name), colors);
    if (!saved.color && !saved.faces.length) {
      const tip = property(objects.get(name), 'Tip')?.getAttribute('value');
      if (tip) saved = appearance(providers.get(tip), colors);
    }
    const faceCount = meshes.reduce((count, mesh) => count + mesh.brep_faces.length, 0);
    if (saved.faces.length === faceCount) {
      let index = 0;
      for (const mesh of meshes) {
        for (const face of mesh.brep_faces) face.color = saved.faces[index++];
      }
    }
    parts.push({ meshes, matrix, color: saved.color ?? saved.faces[0] });
  }
  if (!parts.length) throw new Error('Fant ingen synlige FreeCAD-flater. Åpne og lagre modellen i FreeCAD, eller eksporter til STEP.');
  return { parts, skipped };
}
