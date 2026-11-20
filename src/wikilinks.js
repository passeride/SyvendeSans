const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export const wikilink = {
  name: 'vaultWikilink',
  level: 'inline',
  start(source) { return source.indexOf('[['); },
  tokenizer(source) {
    const match = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(source);
    if (match) return { type: 'vaultWikilink', raw: match[0], target: match[1].trim(), label: match[2] ?? match[1] };
  },
  renderer({ target, label }) {
    return '<button type="button" class="wiki-link" data-wikilink="' + escapeHtml(target) + '">' + escapeHtml(label) + '</button>';
  },
};

export function resolveWikilink(target, current, paths) {
  const name = target.split('#', 1)[0].trim();
  if (!name) return [];
  const key = value => value.normalize('NFC').replace(/\.md$/i, '').toLowerCase();
  const currentParent = current.split('/').slice(0, -1).join('/');
  const matches = paths.filter(path => {
    if (name.includes('/')) return key(path) === key(name) || key(path) === key(currentParent + '/' + name);
    return key(path.split('/').at(-1)) === key(name);
  });
  const nearby = matches.filter(path => path.split('/').slice(0, -1).join('/') === currentParent);
  return nearby.length === 1 ? nearby : matches;
}
