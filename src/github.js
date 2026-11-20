const origin = 'https://api.github.com';
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');

export function gitHubVault(repository, token, request = fetch) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository) || /\/\.{1,2}$/.test(repository)) {
    throw new Error('Skriv GitHub-repo som eier/repo.');
  }
  const root = '/repos/' + encodePath(repository);

  async function api(path, data) {
    const response = await request(origin + root + path, {
      method: data ? 'PUT' : 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) {
      const message = {
        401: 'Sjekk at tokenet er gyldig.',
        403: 'Sjekk repoets tillatelser og GitHubs API-grenser.',
        404: 'Sjekk repo, gren og tokenets tilgang.',
        409: 'Filen kan ha blitt endret på GitHub. Kopier teksten eller flett med siste versjon før nytt forsøk.',
        422: 'GitHub avviste lagringen. Sjekk om filen allerede finnes eller om grenen er beskyttet.',
      }[response.status];
      throw new Error('GitHub svarte ' + response.status + '. ' + (message ?? 'Prøv igjen.'));
    }
    return response.json();
  }

  return {
    async connect(branch) {
      const ref = branch || (await api('')).default_branch;
      const result = await api('/git/trees/' + encodeURIComponent(ref) + '?recursive=1');
      if (result.truncated) throw new Error('GitHub returnerte en ufullstendig filoversikt.');
      const paths = result.tree.filter(entry => entry.type === 'blob' &&
        ['100644', '100755'].includes(entry.mode) && /\.md$/i.test(entry.path) &&
        !entry.path.split('/').some(part => part.startsWith('.'))
      ).map(entry => entry.path);
      return { ref, paths };
    },
    async read(path, ref) {
      const file = await api('/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(ref));
      if (file.type !== 'file' || file.encoding !== 'base64') {
        throw new Error('Filen kan ikke åpnes i denne versjonen. Prøv et Markdown-notat under 1 MB.');
      }
      const bytes = Uint8Array.from(atob(file.content), character => character.charCodeAt(0));
      return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), sha: file.sha };
    },
    async write(path, ref, text, sha) {
      const bytes = new TextEncoder().encode(text);
      if (bytes.length > 1024 * 1024) throw new Error('Notatet må være under 1 MB.');
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const result = await api('/contents/' + encodePath(path), {
        message: 'Update note via SyvendeSans: ' + path,
        branch: ref,
        content: btoa(binary),
        ...(sha ? { sha } : {}),
      });
      return result.content.sha;
    },
  };
}

export function notePath(input) {
  const path = input.trim();
  const parts = path.split('/');
  if (parts.some(part => !part || part.startsWith('.') || /[\\\x00-\x1f\x7f]/.test(part))) {
    throw new Error('Bruk en relativ notatsti, for eksempel Innboks/Idé.md.');
  }
  return /\.md$/i.test(path) ? path : path + '.md';
}
