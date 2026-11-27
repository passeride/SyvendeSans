import { basicSetup } from 'codemirror';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { gitHubVault, notePath } from './github.js';
import { readLocal, seal, unseal } from './storage.js';
import { wikilink, resolveWikilink } from './wikilinks.js';
import { mountCadBlocks } from './plugins/cad-viewer/index.js';
import './style.css';

const get = id => document.getElementById(id);
const on = (id, event, handler) => get(id).addEventListener(event, handler);
const status = message => { get('status').textContent = message; };
const nameOf = path => path.split('/').at(-1).replace(/\.md$/i, '');
const parentOf = path => path.split('/').slice(0, -1).join('/');
const settingsPath = '.syvende-sans/settings.json';
const defaults = { version: 1, theme: 'system', defaultMode: 'edit', inbox: 'Innboks', width: 'normal' };
const connectionKey = 'syv.connection';
let settings = defaults, settingsSha, settingsReady = Promise.resolve(), vault, ref, sessionKey;
let tabs = [], active, paths = [], searchIndex = [], rows = [], folders, recent = [], expanded = new Set();
let recentMode = false, paletteMode, selected = 0, results = [], storeTimer, searchTimer, saveSettingsBusy = false;
let sidebarTouched = false, linkCandidates = [];
let previewRequest;
const narrow = matchMedia('(max-width:700px)');
const extensions = [
  basicSetup, markdown(), EditorView.lineWrapping,
  EditorView.theme({ '.cm-content': { fontFamily: 'system-ui, sans-serif', fontSize: '1rem', lineHeight: '1.65' }, '.cm-gutters': { display: 'none' } }),
  EditorView.contentAttributes.of({ 'aria-label': 'Notattekst', spellcheck: 'true' }),
  EditorView.updateListener.of(update => {
    if (!active?.state) return;
    active.state = update.state;
    if (update.docChanged) {
      active.localSaved = false;
      active.dirty = true;
      get('save').disabled = active.saving;
      renderLocalStatus();
    }
    schedulePersist();
  }),
];
const makeState = text => EditorState.create({ doc: text, extensions });
const editor = new EditorView({ state: makeState(''), parent: get('editor') });

function persist() {
  clearTimeout(storeTimer);
  if (!sessionKey) return;
  try {
    localStorage.setItem(sessionKey, JSON.stringify({
      active: active?.path, expanded: [...expanded], recent, paths, settings, settingsSha,
      tabs: tabs.map(tab => ({
        path: tab.path, mode: tab.mode, sha: tab.sha, eol: tab.eol, dirty: tab.dirty,
        text: tab.state?.doc.toString() ?? tab.text, base: tab.base,
        selection: tab.state?.selection.main.toJSON() ?? tab.selection,
        scroll: tab.scroll,
      })),
    }));
    for (const tab of tabs) tab.localSaved = true;
    renderLocalStatus();
  } catch { status('Lokalt lager er fullt eller utilgjengelig. Synk viktige utkast før du lukker appen.'); }
}
function renderLocalStatus() {
  const indicator = get('local-status');
  indicator.textContent = active?.dirty
    ? (active.localSaved ? 'Lagret på denne enheten · venter på synk' : 'Lagrer utkast på enheten …')
    : '';
}

function schedulePersist() {
  clearTimeout(storeTimer);
  storeTimer = setTimeout(persist, 500);
}
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

function node(label, action, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = action;
  if (className) button.className = className;
  return button;
}

function indexPaths() {
  paths.sort((a, b) => a.localeCompare(b, 'nb'));
  searchIndex = paths.map(path => ({ path, label: nameOf(path), detail: parentOf(path), nameKey: nameOf(path).toLocaleLowerCase('nb'), pathKey: path.toLocaleLowerCase('nb') }));
  folders = { children: new Map(), files: [] };
  for (const path of paths) {
    let dir = folders, prefix = '';
    for (const part of path.split('/').slice(0, -1)) {
      prefix = prefix ? prefix + '/' + part : part;
      if (!dir.children.has(part)) dir.children.set(part, { path: prefix, children: new Map(), files: [] });
      dir = dir.children.get(part);
    }
    dir.files.push(path);
  }
  rebuildRows();
}

function rebuildRows() {
  rows = [];
  function visit(dir, depth) {
    for (const [name, child] of dir.children) {
      rows.push({ path: child.path, name, depth, folder: true });
      if (expanded.has(child.path)) visit(child, depth + 1);
    }
    for (const path of dir.files) rows.push({ path, name: nameOf(path), depth });
  }
  if (recentMode) rows = recent.map(path => ({ path, name: nameOf(path), depth: 0 }));
  else if (folders) visit(folders, 0);
  renderTree();
}

function renderTree() {
  const tree = get('tree');
  const start = Math.max(0, Math.floor(tree.scrollTop / 32) - 6);
  const end = Math.min(rows.length, start + Math.ceil(tree.clientHeight / 32) + 13);
  const fragment = document.createDocumentFragment();
  function spacer(height) {
    const div = document.createElement('div');
    div.style.height = height + 'px';
    fragment.append(div);
  }
  spacer(start * 32);
  for (const row of rows.slice(start, end)) {
    const open = expanded.has(row.path);
    const button = node((row.folder ? (open ? '▾ ' : '▸ ') : '') + row.name, () => {
      if (!row.folder) return openNote(row.path);
      if (open) expanded.delete(row.path);
      else expanded.add(row.path);
      rebuildRows();
      schedulePersist();
      [...tree.querySelectorAll('button')].find(item => item.title === row.path)?.focus({ preventScroll: true });
    }, 'tree-row');
    button.title = row.path;
    button.style.paddingInlineStart = (8 + 14 * row.depth) + 'px';
    if (row.folder) button.setAttribute('aria-expanded', open);
    else if (row.path === active?.path) button.setAttribute('aria-current', 'true');
    fragment.append(button);
  }
  spacer(Math.max(0, rows.length - end) * 32);
  tree.replaceChildren(fragment);
}
on('tree', 'scroll', renderTree);
new ResizeObserver(renderTree).observe(get('tree'));

function renderTabs() {
  const bar = get('tabs');
  const focus = bar.contains(document.activeElement);
  const fragment = document.createDocumentFragment();
  for (const tab of tabs) {
    const wrap = document.createElement('div');
    wrap.className = 'tab';
    const title = tabs.some(other => other !== tab && nameOf(other.path) === nameOf(tab.path))
      ? nameOf(tab.path) + ' · ' + parentOf(tab.path) : nameOf(tab.path);
    const pick = node(title, () => activate(tab));
    pick.title = tab.path;
    pick.setAttribute('role', 'tab');
    pick.setAttribute('aria-selected', tab === active);
    const close = node('×', () => closeTab(tab));
    close.setAttribute('aria-label', 'Lukk ' + title);
    wrap.append(pick, close);
    fragment.append(wrap);
  }
  fragment.append(node('＋', () => showPalette('notes')));
  bar.replaceChildren(fragment);
  if (focus) bar.querySelector('[aria-selected=true]')?.focus({ preventScroll: true });
  get('mobile-tabs').textContent = 'Faner (' + tabs.length + ')';
}

function hydrate(tab) {
  if (!tab.state && tab.text !== undefined) {
    tab.state = EditorState.create({ doc: tab.text, extensions, selection: tab.selection });
    delete tab.text;
  }
}

function activate(tab) {
  if (active?.state) active.scroll = get('document').scrollTop;
  active = tab;
  if (tab) {
    hydrate(tab);
    recent = [tab.path, ...recent.filter(path => path !== tab.path)].slice(0, 40);
    let prefix = '';
    for (const part of parentOf(tab.path).split('/').filter(Boolean)) {
      prefix = prefix ? prefix + '/' + part : part;
      expanded.add(prefix);
    }
    if (!tab.state && !tab.loading) void loadNote(tab);
  }
  showActive();
  renderTabs();
  rebuildRows();
  schedulePersist();
}

function showActive() {
  clearPreview();
  renderLocalStatus();
  get('document').hidden = !active;
  get('empty').hidden = !!active;
  if (!active) return;
  get('title').textContent = nameOf(active.path);
  get('crumb').textContent = parentOf(active.path).replaceAll('/', ' / ');
  get('save').disabled = !active.dirty || !!active.saving;
  get('mode').disabled = !active.state;
  get('mode').textContent = active.mode === 'read' ? 'Rediger' : 'Les';
  get('editor').hidden = !active.state || active.mode === 'read';
  get('preview').hidden = !active.state || active.mode !== 'read';
  if (!active.state) {
    status(active.error ?? 'Henter ' + nameOf(active.path) + ' …');
    return;
  }
  if (editor.state !== active.state) editor.setState(active.state);
  get('document').scrollTop = active.scroll ?? 0;
  if (active.mode === 'read') void preview(active);
  status(active.error ?? (active.saving ? 'Synker …' : active.dirty ? 'Bruk Synk nå for å lagre til vaultet' : (ref === 'demo' ? 'Lagret i demoen' : 'Synket med GitHub')));
}

function clearPreview() {
  previewRequest?.abort();
  previewRequest = undefined;
  get('preview').replaceChildren();
}

async function preview(tab) {
  const target = get('preview');
  const state = tab.state;
  const client = vault, branch = ref;
  const { signal } = previewRequest = new AbortController();
  const [{ Marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
  if (signal.aborted) return;
  target.innerHTML = DOMPurify.sanitize(new Marked({ extensions: [wikilink] }).parse(state.doc.toString()), {
    FORBID_TAGS: ['img', 'audio', 'video', 'source', 'style', 'input', 'form', 'svg', 'math'],
    FORBID_ATTR: ['style', 'src', 'srcset', 'poster', 'ping'],
  });
  for (const link of target.querySelectorAll('a')) link.removeAttribute('href');
  for (const link of target.querySelectorAll('button[data-wikilink]')) {
    link.onclick = () => {
      const matches = resolveWikilink(link.dataset.wikilink, tab.path, paths);
      if (matches.length === 1) {
        openNote(matches[0]);
        return;
      }
      if (!matches.length) return status('Fant ikke notatet «' + link.dataset.wikilink + '».');
      linkCandidates = matches;
      showPalette('links');
    };
  }
  mountCadBlocks(target, tab.path, (path, signal) => client.readBinary(path, branch, signal), signal);
}

async function loadNote(tab) {
  const client = vault;
  tab.loading = true;
  tab.error = undefined;
  try {
    const file = await client.read(tab.path, ref);
    if (client !== vault || !tabs.includes(tab)) return;
    tab.sha = file.sha;
    tab.eol = file.text.includes('\r\n') && !file.text.replaceAll('\r\n', '').includes('\n') ? '\r\n' : '\n';
    tab.base = file.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    tab.text = tab.base;
    if (active === tab) hydrate(tab);
  } catch (error) { tab.error = error.message + ' Velg fanen igjen for å prøve på nytt.'; }
  finally {
    tab.loading = false;
    if (active === tab) showActive();
    if (client === vault && tabs.includes(tab)) schedulePersist();
  }
}

function openNote(path) {
  let tab = tabs.find(item => item.path === path);
  if (!tab) {
    tab = { path, mode: settings.defaultMode };
    tabs.push(tab);
  }
  activate(tab);
  if (narrow.matches) setSidebar(false);
}

function closeTab(tab) {
  if (tab.saving) return status('Vent til synk av dette notatet er ferdig.');
  if (tab.dirty) return status('Synk utkastet, eller bruk «Forkast aktivt utkast» i paletten før du lukker fanen.');
  const position = tabs.indexOf(tab);
  tabs.splice(position, 1);
  if (active === tab) activate(tabs[position] ?? tabs.at(-1));
  else { renderTabs(); schedulePersist(); }
}

async function saveNote() {
  const tab = active;
  if (!tab?.dirty || tab.saving) return;
  const text = tab.state.doc.toString();
  tab.saving = true;
  tab.error = undefined;
  get('save').disabled = true;
  status('Synker ' + nameOf(tab.path) + ' …');
  try {
    tab.sha = await vault.write(tab.path, ref, text.replaceAll('\n', tab.eol ?? '\n'), tab.sha);
    tab.base = text;
    tab.dirty = tab.state.doc.toString() !== text;
    if (!paths.includes(tab.path)) { paths.push(tab.path); indexPaths(); }
  } catch (error) { tab.error = error.message + ' Utkastet er beholdt.'; }
  finally {
    tab.saving = false;
    if (tab === active) {
      get('save').disabled = !tab.dirty;
      status(tab.error ?? (tab.dirty ? 'Nyere endringer ligger i utkastet.' : (ref === 'demo' ? 'Lagret i demoen' : 'Synket med GitHub')));
    }
    persist();
  }
}

function setSidebar(open) {
  get('workspace').classList.toggle('collapsed', !open);
  get('sidebar').setAttribute('aria-expanded', String(open));
}
function toggleSidebar() {
  sidebarTouched = true;
  setSidebar(get('workspace').classList.contains('collapsed'));
}
narrow.addEventListener('change', () => setSidebar(!narrow.matches));

function setRecent(value) {
  recentMode = value;
  get('tree-mode').setAttribute('aria-pressed', !value);
  get('recent-mode').setAttribute('aria-pressed', value);
  get('tree').scrollTop = 0;
  rebuildRows();
}

function switchMode() {
  if (!active?.state) return;
  active.mode = active.mode === 'read' ? 'edit' : 'read';
  showActive();
  if (active.mode === 'edit') editor.focus();
  schedulePersist();
}

function forgetToken() {
  const saved = readLocal(connectionKey, {});
  delete saved.secret;
  localStorage.setItem(connectionKey, JSON.stringify(saved));
  refreshLogin();
  status('Det lagrede tokenet er fjernet.');
}
function refreshLogin() {
  const saved = readLocal(connectionKey, {});
  get('pass-label').hidden = !saved.secret && !get('remember').checked;
  get('forget').hidden = !saved.secret;
}
function showLogin() {
  if (tabs.some(tab => tab.saving) || saveSettingsBusy) return status('Vent til den pågående synken er ferdig.');
  persist();
  active = undefined;
  renderLocalStatus();
  tabs = [];
  vault = undefined;
  sessionKey = undefined;
  clearPreview();
  editor.setState(makeState(''));
  get('workspace').hidden = true;
  get('login').hidden = false;
  for (const id of ['sidebar', 'find', 'command', 'mobile-tabs', 'quick-note']) get(id).hidden = true;
  get('vault-name').textContent = '';
  refreshLogin();
  get('repo').focus();
  status('Åpne et vault for å fortsette.');
}

function applySettings() {
  document.documentElement.style.colorScheme = ['dark', 'light'].includes(settings.theme) ? settings.theme : 'light dark';
  document.documentElement.style.setProperty('--note-width', settings.width === 'wide' ? '110ch' : '76ch');
  if (!sidebarTouched && !narrow.matches) setSidebar(settings.sidebarOpen !== false);
}
async function readSettings(client, branch) {
  try {
    const file = await client.read(settingsPath, branch);
    const value = JSON.parse(file.text);
    if (value.version !== 1) throw new Error('Ukjent versjon av vault-innstillingene.');
    return { value: { ...defaults, ...value }, sha: file.sha };
  } catch (error) {
    if (error.status === 404) return { value: { ...defaults }, sha: undefined };
    throw error;
  }
}
function openSettings() {
  for (const field of Object.keys(defaults).filter(field => field !== 'version')) {
    get('preferences-form').elements[field].value = settings[field];
  }
  get('settings-status').textContent = '';
  get('preferences').showModal();
}
on('preferences-form', 'submit', async event => {
  event.preventDefault();
  if (saveSettingsBusy) return;
  const proposed = Object.fromEntries(new FormData(event.target));
  saveSettingsBusy = true;
  get('settings-status').textContent = 'Lagrer i vault …';
  try {
    await settingsReady;
    const edits = Object.entries(proposed).filter(([field, value]) => settings[field] !== value);
    const latest = await readSettings(vault, ref);
    for (const [field, value] of edits) {
      if (latest.sha !== settingsSha && latest.value[field] !== settings[field] && latest.value[field] !== value) {
        throw new Error('Samme innstilling ble endret på en annen enhet: ' + field + '. Ditt valg er fortsatt i skjemaet.');
      }
      latest.value[field] = value;
    }
    if (edits.length) latest.sha = await vault.write(settingsPath, ref, JSON.stringify(latest.value, null, 2) + '\n', latest.sha);
    settings = latest.value;
    settingsSha = latest.sha;
    applySettings();
    get('preferences').close();
    status('Vault-innstillinger oppdatert.');
  } catch (error) { get('settings-status').textContent = error.message; }
  finally { saveSettingsBusy = false; }
});
on('cancel-settings', 'click', () => get('preferences').close());

function hydrateWorkspace(client, repo, connected) {
  vault = client;
  ref = connected.ref;
  sessionKey = 'syv.workspace.' + repo.toLowerCase() + ':' + ref;
  const previous = readLocal(sessionKey, {});
  tabs = (previous.tabs ?? []).map(tab => ({ ...tab, localSaved: true }));
  paths = connected.paths;
  expanded = new Set(previous.expanded);
  recent = previous.recent ?? [];
  settings = { ...defaults, ...previous.settings };
  settingsSha = previous.settingsSha;
  sidebarTouched = false;
  applySettings();
  get('vault-name').textContent = repo + ' · ' + ref;
  get('login').hidden = true;
  get('workspace').hidden = false;
  for (const id of ['sidebar', 'find', 'command', 'mobile-tabs', 'quick-note']) get(id).hidden = false;
  setSidebar(!narrow.matches && settings.sidebarOpen !== false);
  indexPaths();
  activate(tabs.find(tab => tab.path === previous.active) ?? tabs[0]);
  settingsReady = readSettings(client, ref).then(data => {
    if (vault !== client) return;
    settings = data.value;
    settingsSha = data.sha;
    applySettings();
    schedulePersist();
  }).catch(error => { if (vault === client && !active?.dirty) status(error.message); });
  if (!active) status('Vault åpnet · ' + paths.length + ' notater');
}
on('connection', 'submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.inert) return;
  form.inert = true;
  try {
    const repo = get('repo').value.trim();
    const branch = get('branch').value.trim();
    const stored = readLocal(connectionKey, {});
    const supplied = get('token').value.trim();
    const previousSecret = stored.repo === repo ? stored.secret : undefined;
    const token = supplied || (previousSecret ? await unseal(previousSecret, get('pass').value) : '');
    const secret = supplied && get('remember').checked ? await seal(token, get('pass').value) : !supplied ? previousSecret : undefined;
    const client = gitHubVault(repo, token);
    status('Kobler til GitHub …');
    const cache = previousSecret && !supplied && branch === stored.branch
      ? readLocal('syv.workspace.' + repo.toLowerCase() + ':' + branch, {}) : {};
    if (Array.isArray(cache.paths)) {
      hydrateWorkspace(client, repo, { ref: branch, paths: cache.paths });
      get('pass').value = '';
      try {
        const refreshed = await client.connect(branch);
        if (vault === client) {
          paths = refreshed.paths;
          indexPaths();
          schedulePersist();
        }
      } catch (error) {
        if (vault === client) status('Bruker lokal kopi. ' + error.message);
      }
      return;
    }
    const connected = await client.connect(branch);
    try { localStorage.setItem(connectionKey, JSON.stringify({ repo, branch: connected.ref, secret })); }
    catch { if (secret) status('Kunne ikke huske token i denne nettleseren.'); }
    get('token').value = get('pass').value = '';
    hydrateWorkspace(client, repo, connected);
  } catch (error) { status(error.message); }
  finally { form.inert = false; }
});

function newNote() {
  get('new-path').setCustomValidity('');
  get('new-path').value = settings.inbox ? settings.inbox + '/' : '';
  get('new-dialog').showModal();
  const input = get('new-path');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
on('new-form', 'submit', event => {
  event.preventDefault();
  try {
    const path = notePath(get('new-path').value);
    if (paths.includes(path) || tabs.some(tab => tab.path === path)) throw new Error('Notatet finnes allerede.');
    const tab = { path, mode: 'edit', dirty: true, state: makeState('') };
    tabs.push(tab);
    get('new-dialog').close();
    activate(tab);
    if (narrow.matches) setSidebar(false);
    editor.focus();
  } catch (error) { get('new-path').setCustomValidity(error.message); get('new-path').reportValidity(); }
});
on('new-path', 'input', () => get('new-path').setCustomValidity(''));
on('cancel-new', 'click', () => { get('new-path').setCustomValidity(''); get('new-dialog').close(); });

function quickNote() {
  const stamp = new Date().toISOString().slice(0, 23).replaceAll(':', '-').replace('T', ' ');
  const path = notePath((settings.inbox ? settings.inbox + '/' : '') + 'Notat ' + stamp);
  tabs.push({ path, mode: 'edit', dirty: true, state: makeState('') });
  activate(tabs.at(-1));
  if (narrow.matches) setSidebar(false);
  editor.focus();
}
on('quick-note', 'click', quickNote);

const commands = [
  ['Hurtignotat', quickNote],
  ['Nytt notat', newNote], ['Åpne hurtig', () => showPalette('notes'), 'Ctrl+O'],
  ['Vis eller skjul filer', toggleSidebar], ['Bytt lesemodus', switchMode],
  ['Synk aktivt notat', saveNote, 'Ctrl+S'], ['Bytt vault', showLogin],
  ['Vault-innstillinger', openSettings], ['Glem lagret token', forgetToken],
  ['Forkast aktivt utkast', () => {
    if (!active?.dirty || active.saving || !confirm('Forkaste endringene i aktivt utkast?')) return;
    active.dirty = false;
    closeTab(active);
  }],
];
function rank(label, query) {
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  let offset = 0;
  for (const char of query) {
    const match = label.indexOf(char, offset);
    if (match < 0) return 3;
    offset = match + 1;
  }
  return 2;
}
function renderResults() {
  searchTimer = undefined;
  const query = get('query').value.trim().toLocaleLowerCase('nb');
  let items;
  if (paletteMode === 'commands') items = commands.map(([label, action, detail]) => ({ label, action, detail }));
  else {
    if (paletteMode === 'notes' && query) items = searchIndex;
    else {
      const candidates = paletteMode === 'tabs' ? tabs.map(tab => tab.path) : paletteMode === 'links' ? linkCandidates : [...new Set([...recent, ...paths.slice(0, 80)])];
      items = candidates.map(path => ({ path, label: nameOf(path), detail: parentOf(path) }));
    }
  }
  results = query ? items.map(item => ({ ...item, score: Math.min(
    rank(item.nameKey ?? item.label.toLocaleLowerCase('nb'), query),
    rank(item.pathKey ?? (item.detail ?? '').toLocaleLowerCase('nb'), query) + 1,
  ) })).filter(item => item.score < 3).sort((a, b) => a.score - b.score).slice(0, 40) : items.slice(0, 40);
  selected = 0;
  const fragment = document.createDocumentFragment();
  results.forEach((item, index) => {
    const button = node(item.label, () => selectResult(index));
    button.setAttribute('aria-pressed', index === selected);
    if (item.detail) {
      const detail = document.createElement('small');
      detail.textContent = item.detail;
      button.append(detail);
    }
    fragment.append(button);
  });
  if (!results.length) fragment.append(document.createTextNode('Ingen treff'));
  get('results').replaceChildren(fragment);
}
function selectResult(index) {
  const item = results[index];
  if (!item) return;
  get('palette').close();
  if (item.path) openNote(item.path);
  else item.action();
}
function showPalette(mode) {
  paletteMode = mode;
  get('palette-title').textContent = { notes: 'Finn notat', commands: 'Kommandopalett', tabs: 'Åpne faner', links: 'Velg lenkemål' }[mode];
  get('query').value = '';
  renderResults();
  if (!get('palette').open) get('palette').showModal();
  get('query').focus();
}
on('query', 'input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderResults, 30);
});
on('palette', 'keydown', event => {
  if (event.isComposing || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  if (event.key === 'Enter' && event.target !== get('query')) return;
  event.preventDefault();
  if (event.key === 'Enter') {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = undefined; renderResults(); }
    return selectResult(selected);
  }
  if (!results.length) return;
  const buttons = get('results').querySelectorAll('button');
  buttons[selected]?.setAttribute('aria-pressed', 'false');
  selected = (selected + results.length + (event.key === 'ArrowDown' ? 1 : -1)) % results.length;
  buttons[selected]?.setAttribute('aria-pressed', 'true');
  buttons[selected]?.scrollIntoView({ block: 'nearest' });
});
document.addEventListener('keydown', event => {
  if (!vault || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (document.querySelector('dialog[open]') && !get('palette').open) return;
  if (key === 'p' || key === 'o' || key === 's') {
    event.preventDefault();
    if (key === 's') void saveNote();
    else showPalette(key === 'p' ? 'commands' : 'notes');
  }
});

const saved = readLocal(connectionKey, {});
get('repo').value = saved.repo ?? '';
get('branch').value = saved.branch ?? '';
refreshLogin();
if (saved.secret) status('Skriv passfrasen for å åpne siste vault.');
on('remember', 'change', refreshLogin);
on('forget', 'click', forgetToken);
on('find', 'click', () => showPalette('notes'));
on('open-empty', 'click', () => showPalette('notes'));
on('command', 'click', () => showPalette('commands'));
on('mobile-tabs', 'click', () => showPalette('tabs'));
on('sidebar', 'click', toggleSidebar);
on('tree-mode', 'click', () => setRecent(false));
on('recent-mode', 'click', () => setRecent(true));
on('new', 'click', newNote);
on('settings', 'click', openSettings);
on('save', 'click', saveNote);
on('mode', 'click', switchMode);

on('demo', 'click', async () => {
  try {
    const { demoVault } = await import('./demo.js');
    const client = demoVault();
    hydrateWorkspace(client, 'Eksempelvault', await client.connect());
    if (!active) openNote('Innboks/Velkommen.md');
  } catch (error) { status(error.message); }
});
