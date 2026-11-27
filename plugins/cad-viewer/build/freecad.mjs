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
  return object.querySelector(':scope > Properties > Property[name="' + name + '"]')?.firstElementChild;
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
  const files = unzip(bytes, { filter(entry) {
    if (!['Document.xml', 'GuiDocument.xml'].includes(entry.name) && !geometryFile.test(entry.name)) return false;
    size += entry.originalSize;
    if (size > 64 * 1024 * 1024) throw new Error('FreeCAD-modellen er for stor til å åpne.');
    return true;
  } });
  if (!files['Document.xml']) throw new Error('FreeCAD-filen mangler Document.xml.');
  const doc = xml(files['Document.xml']);
  const gui = files['GuiDocument.xml'] && xml(files['GuiDocument.xml']);
  const hidden = new Set(Array.from(gui?.querySelectorAll('ViewProvider') ?? [])
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

  const meshes = [];
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
    const part = importer.ReadBrepFile(files[file], null);
    if (!part.success || !part.meshes?.length) { skipped++; continue; }
    for (const mesh of part.meshes) meshes.push({ mesh, matrix });
  }
  if (!meshes.length) throw new Error('Fant ingen synlige FreeCAD-flater. Åpne og lagre modellen i FreeCAD, eller eksporter til STEP.');
  return { meshes, skipped };
}
