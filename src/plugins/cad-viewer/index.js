const extensions = /\.(stl|step|stp)$/i;

export function modelPath(input, notePath) {
  const path = input.trim();
  if (!extensions.test(path) || /[\\:\x00-\x1f\x7f]/.test(path)) {
    throw new Error('Oppgi en vault-sti til en .stl-, .step- eller .stp-fil.');
  }
  const relative = path.startsWith('./') || path.startsWith('../');
  const parts = relative ? notePath.split('/').slice(0, -1) : [];
  for (const part of path.replace(/^\//, '').split('/')) {
    if (part === '.') continue;
    if (part === '..' && parts.length) parts.pop();
    else if (!part || part.startsWith('.')) throw new Error('Modellstien må ligge i vaultet.');
    else parts.push(part);
  }
  return parts.join('/');
}

function button(text, action) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.onclick = action;
  return element;
}

export function mountCadBlocks(preview, notePath, readBinary, signal) {
  for (const code of preview.querySelectorAll('pre > code.language-cad:only-child')) {
    const block = document.createElement('section');
    block.className = 'cad-block';
    const toolbar = document.createElement('div');
    toolbar.className = 'cad-toolbar';
    const label = document.createElement('span');
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.className = 'cad-status';
    toolbar.append(label);
    code.parentElement.replaceWith(block);

    let path;
    try { path = modelPath(code.textContent, notePath); }
    catch (error) {
      status.textContent = error.message;
      block.append(status);
      continue;
    }
    label.textContent = path.split('/').at(-1);
    label.title = path;

    const stage = document.createElement('div');
    stage.className = 'cad-stage';
    stage.hidden = true;
    const dialog = document.createElement('dialog');
    dialog.className = 'cad-dialog';
    dialog.setAttribute('aria-label', '3D-visning av ' + label.textContent);
    const panel = document.createElement('div');
    panel.append(toolbar, status, stage);
    block.append(panel, dialog);
    dialog.addEventListener('close', () => {
      if (dialog.open || signal.aborted) return;
      block.insertBefore(panel, dialog);
      expand.textContent = 'Fullskjerm';
      expand.focus();
    });

    let viewer;
    const expand = button('Fullskjerm', () => {
      if (dialog.open) { dialog.close(); return; }
      dialog.append(panel);
      expand.textContent = 'Tilbake til notatet';
      dialog.showModal();
      expand.focus();
    });
    const reset = button('Nullstill visning', () => viewer.reset());
    expand.hidden = reset.hidden = true;
    const load = button('Vis 3D', async () => {
      load.disabled = true;
      status.textContent = 'Laster 3D-modellen …';
      try {
        const [{ createViewer }, bytes] = await Promise.all([import('./viewer.js'), readBinary(path, signal)]);
        signal.throwIfAborted();
        const extension = path.split('.').at(-1).toLowerCase();
        stage.hidden = false;
        viewer = await createViewer(stage, bytes, extension, signal);
        status.textContent = '';
        load.hidden = true;
        expand.hidden = reset.hidden = false;
        reset.focus();
      } catch (error) {
        stage.hidden = true;
        if (!signal.aborted) status.textContent = error.message;
      } finally { load.disabled = false; }
    });
    toolbar.append(load, reset, expand);
  }
}
