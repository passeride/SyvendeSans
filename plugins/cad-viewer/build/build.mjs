import { build } from 'esbuild';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const plugin = new URL('../', import.meta.url);
const unpacked = async path => readFile(new URL(path, import.meta.url));
const put = (name, content) => writeFile(new URL(name, plugin), content);
const json = value => JSON.stringify(value, null, 2) + '\n';
const chunkSize = 120_000;
const { outputFiles: [renderer] } = await build({
  entryPoints: [fileURLToPath(new URL('./renderer.mjs', import.meta.url))],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  globalName: 'CadRenderer',
});

for (const file of await readdir(plugin)) {
  if (/^(renderer|wasm)-\d+\.txt$/.test(file)) await rm(new URL(file, plugin));
}
const counts = {};
const files = [];
for (const [name, bytes] of [
  ['renderer', renderer.contents],
  ['wasm', await unpacked('./node_modules/occt-import-js/dist/occt-import-js.wasm')],
]) {
  const base64 = gzipSync(bytes, { level: 9 }).toString('base64');
  counts[name] = Math.ceil(base64.length / chunkSize);
  for (let i = 0; i < counts[name]; i++) {
    const file = `${name}-${i}.txt`;
    await put(file, base64.slice(i * chunkSize, (i + 1) * chunkSize));
    files.push(file);
  }
}
await put('engine-index.json', json(counts));
for (const [file, source] of Object.entries({
  'occt.js': './node_modules/occt-import-js/dist/occt-import-js.js',
  'license.occt-import-js.txt': './node_modules/occt-import-js/dist/license.occt-import-js.txt',
  'license.occt.txt': './node_modules/occt-import-js/dist/license.occt.txt',
  'three-LICENSE.txt': './node_modules/three/LICENSE',
  'fflate.js': '../../plantuml/fflate.js',
  'fflate-LICENSE.txt': '../../plantuml/fflate-LICENSE.txt',
})) {
  const text = (await unpacked(source)).toString('utf8');
  await put(file, text.replace(/[ \t]*\r?\n/g, '\n'));
  files.push(file);
}
files.push('engine-index.json', 'README.md');
const manifest = JSON.parse(await readFile(new URL('manifest.json', plugin), 'utf8'));
const { id, name, description, author, version } = manifest;
const catalogPath = new URL('../../manifest.json', plugin);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const entry = { id, name, description, author, version, dir: `plugins/${id}`, files: files.sort() };
const sizes = await Promise.all(files.map(file => readFile(new URL(file, plugin)).then(bytes => bytes.length)));
const total = sizes.reduce((sum, size) => sum + size, 0) + (await readFile(new URL('main.js', plugin))).length;
if (files.length > 64 || sizes.some(size => size > 131_072) || total > 5_000_000) {
  throw new Error(`The built plugin exceeds the Noteriv catalog limits (${total} bytes).`);
}
catalog.plugins = [...catalog.plugins.filter(plugin => plugin.id !== id), entry].sort((a, b) => a.id.localeCompare(b.id));
await writeFile(catalogPath, json(catalog));
console.log(`Built ${name} with ${files.length} assets and ${total} bytes.`);
