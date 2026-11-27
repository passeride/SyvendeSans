const maxBytes = 20 * 1024 * 1024;
const formats = /\.(stl|step|stp|fcstd)$/i;
const assetError = 'Installer CAD Viewer på nytt fra Noteriv-pluginlisten.';

function modelPath(source, notePath) {
  const path = source.trim();
  if (!formats.test(path) || /[\\:\x00-\x1f\x7f]/.test(path) || path.startsWith('//')) {
    throw new Error('Skriv én vault-sti til en STL-, STEP- eller FCStd-fil.');
  }
  const relative = path.startsWith('./') || path.startsWith('../');
  if (relative && !notePath) throw new Error('Bruk en sti fra roten av vaultet.');
  const parts = relative ? notePath.split('/').slice(0, -1) : [];
  for (const part of path.replace(/^\//, '').split('/')) {
    if (part === '.') continue;
    if (part === '..' && parts.length) parts.pop();
    else if (!part || part.startsWith('.') || /[. ]$/.test(part)) throw new Error('Modellstien må ligge i vaultet.');
    else parts.push(part);
  }
  return parts.join('/');
}

function decode(base64) {
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function readModel(api, path, type) {
  const bridge = globalThis.electronAPI;
  const root = api.app.vaultPath;
  let bytes;
  if (typeof api.vault.readBinary === 'function') {
    bytes = await api.vault.readBinary(path);
  } else if (root && bridge?.readBinaryFile) {
    const base64 = await bridge.readBinaryFile(root.replace(/[/\\]+$/, '') + '/' + path);
    if (base64?.length > Math.ceil(maxBytes / 3) * 4) throw new Error('Modellen kan være opptil 20 MiB.');
    if (base64) bytes = decode(base64);
  } else {
    if (type === 'fcstd') throw new Error('Denne filen krever en Noteriv-versjon med binær fillesing.');
    const content = await api.vault.read(path);
    if (type === 'stl' && (content === null || !/^\s*solid\b[\s\S]*\bendsolid\b/i.test(content) || /[\u0000\ufffd]/.test(content))) {
      throw new Error('Denne Noteriv-versjonen leser STL fra vaultet som tekst. Bruk ASCII STL eller STEP.');
    }
    if (content != null) bytes = new TextEncoder().encode(content);
  }
  if (!bytes?.byteLength) throw new Error('Fant ingen modell på stien «' + path + '».');
  if (bytes.byteLength > maxBytes) throw new Error('Modellen kan være opptil 20 MiB.');
  return bytes;
}

function engines(assets) {
  let index, renderer, step, fflate;
  async function read(name) {
    if (!assets?.readText) throw new Error('Oppdater Noteriv til en versjon med pluginressurser.');
    const text = await assets.readText(name);
    if (typeof text !== 'string') throw new Error(assetError);
    return text;
  }
  async function unpack(name) {
    index ??= read('engine-index.json').then(JSON.parse).catch(error => { index = undefined; throw error; });
    const count = (await index)[name];
    if (!Number.isInteger(count) || count < 1 || count > 48) throw new Error(assetError);
    const chunks = [];
    for (let offset = 0; offset < count; offset += 4) {
      const length = Math.min(count - offset, 4);
      chunks.push(...await Promise.all(Array.from({ length }, (_, i) => read(name + '-' + (offset + i) + '.txt'))));
    }
    const bytes = decode(chunks.join(''));
    if (typeof DecompressionStream === 'function') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return (await compression()).gunzipSync(bytes);
  }
  function compression() {
    fflate ??= read('fflate.js').then(code => {
      const module = { exports: {} };
      new Function('module', 'exports', code)(module, module.exports);
      return module.exports;
    }).catch(error => { fflate = undefined; throw error; });
    return fflate;
  }
  return {
    renderer() {
      renderer ??= unpack('renderer').then(bytes =>
        new Function(new TextDecoder().decode(bytes) + '\nreturn CadRenderer;')()
      ).catch(error => { renderer = undefined; throw error; });
      return renderer;
    },
    compression,
    step() {
      step ??= Promise.all([read('occt.js'), unpack('wasm')]).then(([glue, wasmBinary]) => {
        const module = { exports: {} };
        new Function('module', 'exports', glue)(module, module.exports);
        return module.exports({ wasmBinary });
      }).catch(error => { step = undefined; throw error; });
      return step;
    },
  };
}

function element(parent, tag, text, style) {
  const node = parent.ownerDocument.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (style) node.style.cssText = style;
  parent.append(node);
  return node;
}

function button(parent, text, action) {
  const node = element(parent, 'button', text, 'min-height:2.75rem;padding:.45rem .85rem;cursor:pointer;border:1px solid #526373;border-radius:.6rem;background:#202a33;color:#f1f5f9;font:inherit');
  node.type = 'button';
  node.onclick = action;
  return node;
}

function mount(api, engine, source, container, context) {
  const viewport = context?.layout === 'viewport';
  const block = element(container, 'section', undefined, viewport
    ? 'height:100%;color:#eef4fa;font:14px system-ui,sans-serif;overflow:hidden;background:#171e27'
    : 'min-width:0;white-space:normal;color:inherit;font:14px system-ui,sans-serif');
  let path;
  try { path = modelPath(source, context?.sourcePath); }
  catch (error) { element(block, 'div', error.message); return () => block.remove(); }
  const type = path.split('.').at(-1).toLowerCase();
  const panel = element(block, 'div', undefined, viewport ? 'position:relative;height:100%' : '');
  const bar = element(panel, 'div', undefined, viewport
    ? 'position:absolute;z-index:1;right:12px;bottom:12px;display:flex;gap:.45rem'
    : 'display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;padding:.4rem');
  const label = element(bar, 'span', path.split('/').at(-1), 'overflow-wrap:anywhere;margin-inline-end:auto');
  label.title = path;
  label.hidden = viewport;
  const status = element(panel, 'div', undefined, viewport
    ? 'position:absolute;z-index:1;top:45%;left:1rem;right:1rem;text-align:center;overflow-wrap:anywhere'
    : 'overflow-wrap:anywhere');
  status.setAttribute('role', 'status');
  const backdrop = 'overflow:hidden;background:radial-gradient(ellipse at 50% 42%,#303e4d,#171e27)';
  const stage = element(panel, 'div', undefined, viewport
    ? 'position:absolute;inset:0;' + backdrop
    : 'height:clamp(14rem,60vw,30rem);' + backdrop + ';border-radius:.6rem');
  stage.hidden = true;
  const dialog = element(block, 'dialog', undefined, 'box-sizing:border-box;width:calc(100% - 1rem);max-width:none;height:calc(100dvh - 1rem);max-height:none;padding:.5rem');
  dialog.setAttribute('aria-label', '3D-visning av ' + label.textContent);
  const controller = new AbortController();
  let viewer;

  async function showModel() {
    retry.hidden = true;
    status.textContent = 'Laster 3D-modellen …';
    try {
      const [renderer, bytes] = await Promise.all([engine.renderer(), readModel(api, path, type)]);
      if (controller.signal.aborted) return;
      const [importer, compression] = await Promise.all([
        type === 'stl' ? null : engine.step(),
        type === 'fcstd' ? engine.compression() : null,
      ]);
      if (controller.signal.aborted) return;
      stage.hidden = false;
      viewer = renderer.createViewer(stage, bytes, importer, compression?.unzipSync);
      status.textContent = viewer.skipped ? 'Noen FreeCAD-deler kunne ikke vises.' : '';
      if (viewer.skipped && viewport) status.style.top = '1rem';
      reset.hidden = false;
      expand.hidden = api.app.platform === 'mobile' || typeof dialog.showModal !== 'function';
    } catch (error) {
      if (controller.signal.aborted) return;
      stage.hidden = true;
      status.textContent = String(error?.message || error).slice(0, 400);
      retry.hidden = false;
    }
  }
  const retry = button(bar, 'Prøv igjen', showModel);
  const reset = button(bar, 'Tilpass', () => viewer?.reset());
  reset.setAttribute('aria-label', 'Tilpass modell til visningen');
  const expand = button(bar, 'Fullskjerm', () => {
    if (dialog.open) { dialog.close(); return; }
    dialog.append(panel);
    panel.style.cssText = 'display:flex;flex-direction:column;height:100%';
    stage.style.flex = '1';
    expand.textContent = 'Tilbake til notatet';
    dialog.showModal();
    expand.focus();
  });
  expand.hidden = reset.hidden = true;
  dialog.addEventListener('close', () => {
    if (controller.signal.aborted || dialog.open) return;
    block.insertBefore(panel, dialog);
    panel.style.cssText = '';
    stage.style.flex = '';
    expand.textContent = 'Fullskjerm';
    expand.focus();
  });
  void showModel();
  return () => {
    controller.abort();
    if (dialog.open) dialog.close();
    viewer?.dispose();
    block.remove();
  };
}

let unload;
module.exports = {
  onLoad(api) {
    const engine = engines(api.assets);
    api.markdown.registerCodeBlockProcessor('cad', (source, container, context) => mount(api, engine, source, container, context));
    const id = 'insert-cad-block';
    let installed = false;
    const update = () => {
      const canInsert = Boolean(api.app.currentFile);
      if (canInsert === installed) return;
      installed = canInsert;
      if (!canInsert) { api.ui.removeCommand(id); return; }
      api.ui.addCommand({
        id,
        name: 'Sett inn 3D-modell',
        callback() {
          if (!api.app.currentFile || api.editor.getContent() === null) return;
          api.editor.insertAtCursor('\n\n```cad\nVedlegg/modell.step\n```\n\n');
        },
      });
    };
    const events = ['plugin-loaded', 'file-open', 'layout-change', 'vault-change'];
    for (const event of events) api.events.on(event, update);
    update();
    unload = () => {
      for (const event of events) api.events.off(event, update);
      api.markdown.unregisterCodeBlockProcessor('cad');
      if (installed) api.ui.removeCommand(id);
    };
  },
  onUnload() { unload?.(); unload = undefined; },
};
