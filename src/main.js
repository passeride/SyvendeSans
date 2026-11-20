import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { gitHubVault, notePath } from './github.js';
import './style.css';

const get = id => document.getElementById(id);
const status = get('status');
let vault, ref, current;
let paths = [];
let busy = false;
let editing = true;
const editorExtensions = [
  basicSetup, markdown(), EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': 'Notattekst', spellcheck: 'true' }),
  EditorView.updateListener.of(update => { if (update.docChanged) refreshSave(); }),
];
const editor = new EditorView({ extensions: editorExtensions, parent: get('editor') });
const editorText = () => editor.state.doc.toString();
const dirty = () => current && (!current.sha || editorText() !== current.base);
const confirmDiscard = () => !dirty() || confirm('Forkaste endringene som ikke er lagret?');

function refreshSave() {
  get('save').disabled = busy || !dirty();
}

async function run(operation) {
  if (busy) return;
  busy = true;
  status.textContent = 'Venter på GitHub …';
  get('workspace').inert = true;
  get('connection').inert = true;
  get('disconnect').disabled = true;
  refreshSave();
  try {
    status.textContent = await operation();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
    get('workspace').inert = false;
    get('connection').inert = false;
    get('disconnect').disabled = false;
    refreshSave();
  }
}

function renderList() {
  const query = get('filter').value.toLocaleLowerCase();
  const list = document.createDocumentFragment();
  for (const path of paths.filter(path => path.toLocaleLowerCase().includes(query))) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = path;
    if (path === current?.path) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      if (current?.path !== path && confirmDiscard()) open(path);
    });
    item.append(button);
    list.append(item);
  }
  get('notes').replaceChildren(list);
}

function renderMode() {
  get('preview-toggle').setAttribute('aria-pressed', String(!editing));
  get('editor').hidden = !editing;
  const preview = get('preview');
  preview.hidden = editing;
  if (!editing) {
    preview.innerHTML = DOMPurify.sanitize(marked.parse(editorText()), {
      FORBID_TAGS: ['img', 'audio', 'video', 'source', 'style', 'input', 'form', 'svg', 'math'],
      FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'ping'],
    });
    for (const link of preview.querySelectorAll('a')) link.removeAttribute('href');
  }
}

function showNote(path, text, sha) {
  const lineEnding = text.includes('\r\n') && !text.replaceAll('\r\n', '').includes('\n') ? '\r\n' : '\n';
  current = { path, sha, lineEnding, base: text.replaceAll('\r\n', '\n').replaceAll('\r', '\n') };
  editor.setState(EditorState.create({ doc: current.base, extensions: editorExtensions }));
  get('title').textContent = path;
  get('document').hidden = false;
  editing = true;
  renderMode();
  renderList();
}

function open(path) {
  run(async () => {
    const file = await vault.read(path, ref);
    showNote(path, file.text, file.sha);
    return 'Åpnet ' + path;
  });
}

get('connection').addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const repo = get('repo').value.trim();
    const client = gitHubVault(repo, get('token').value.trim());
    const connected = await client.connect(get('branch').value.trim());
    vault = client;
    ref = connected.ref;
    paths = connected.paths.sort((a, b) => a.localeCompare(b, 'nb'));
    get('token').value = '';
    get('connection').hidden = true;
    get('disconnect').hidden = false;
    get('workspace').hidden = false;
    renderList();
    return repo + ' · ' + ref + ' · ' + paths.length + ' notater';
  });
});

get('disconnect').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  vault = ref = current = undefined;
  paths = [];
  editor.setState(EditorState.create({ extensions: editorExtensions }));
  get('preview').replaceChildren();
  get('title').textContent = 'Velg et notat';
  get('document').hidden = true;
  get('workspace').hidden = true;
  get('disconnect').hidden = true;
  get('connection').hidden = false;
  get('filter').value = '';
  renderList();
  status.textContent = 'Koblet fra GitHub.';
});
get('filter').addEventListener('input', renderList);
get('new').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  const input = prompt('Sti til nytt notat', 'Innboks/');
  if (!input) return;
  try {
    const path = notePath(input);
    if (paths.includes(path)) throw new Error('Notatet finnes allerede.');
    showNote(path, '', undefined);
    editor.focus();
  } catch (error) {
    status.textContent = error.message;
  }
});
get('save').addEventListener('click', () => {
  if (!dirty()) return;
  run(async () => {
    const text = editorText();
    current.sha = await vault.write(current.path, ref, text.replaceAll('\n', current.lineEnding), current.sha);
    current.base = text;
    if (!paths.includes(current.path)) {
      paths.push(current.path);
      paths.sort((a, b) => a.localeCompare(b, 'nb'));
    }
    renderList();
    return 'Lagret på GitHub · ' + ref;
  });
});
get('preview-toggle').addEventListener('click', () => {
  editing = !editing;
  renderMode();
});
window.addEventListener('beforeunload', event => {
  if (dirty()) event.preventDefault();
});
