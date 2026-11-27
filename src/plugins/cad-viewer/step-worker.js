import occtImport from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

self.onmessage = async ({ data }) => {
  try {
    const importer = await occtImport({ locateFile: () => wasmUrl });
    const result = importer.ReadStepFile(new Uint8Array(data), null);
    if (!result.success || !result.meshes?.length) throw new Error('STEP-filen inneholder ingen lesbar geometri.');
    const meshes = result.meshes.map(mesh => ({
      positions: Float32Array.from(mesh.attributes.position.array),
      normals: mesh.attributes.normal && Float32Array.from(mesh.attributes.normal.array),
      indices: Uint32Array.from(mesh.index.array),
      color: mesh.color,
    }));
    const buffers = meshes.flatMap(({ positions, normals, indices }) =>
      normals ? [positions.buffer, normals.buffer, indices.buffer] : [positions.buffer, indices.buffer]);
    self.postMessage({ meshes }, buffers);
  } catch (error) { self.postMessage({ error: error.message }); }
};
