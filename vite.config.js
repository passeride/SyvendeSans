import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

const licenses = {
  'three.txt': './node_modules/three/LICENSE',
  'occt-import-js.txt': './node_modules/occt-import-js/dist/license.occt-import-js.txt',
  'open-cascade.txt': './node_modules/occt-import-js/dist/license.occt.txt',
};

export default defineConfig({
  plugins: [{
    name: 'cad-viewer-licenses',
    apply: 'build',
    async generateBundle() {
      for (const [name, path] of Object.entries(licenses)) {
        const source = await readFile(new URL(path, import.meta.url), 'utf8');
        this.emitFile({ type: 'asset', fileName: 'licenses/' + name, source });
      }
    },
  }],
});
