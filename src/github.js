const origin = 'https://api.github.com';
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const maxModelSize = 20 * 1024 * 1024;

export function gitHubVault(repository, token, request = fetch) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository) || /\/\.{1,2}$/.test(repository)) {
    throw new Error('Skriv GitHub-repo som eier/repo.');
  }
  const root = '/repos/' + encodePath(repository);

  async function api(path, data, { accept = 'application/vnd.github+json', signal, binary = false } = {}) {
    const response = await request(origin + root + path, {
      method: data ? 'PUT' : 'GET',
      headers: {
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      redirect: 'error',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      const message = {
        401: 'Sjekk at tokenet er gyldig.',
        403: 'Sjekk repoets tillatelser og GitHubs API-grenser.',
        404: 'Sjekk repo, gren og tokenets tilgang.',
        409: 'Filen kan ha blitt endret på GitHub. Kopier teksten eller flett med siste versjon før nytt forsøk.',
        422: 'GitHub avviste lagringen. Sjekk om filen allerede finnes eller om grenen er beskyttet.',
      }[response.status];
      const error = new Error('GitHub svarte ' + response.status + '. ' + (message ?? 'Prøv igjen.'));
      error.status = response.status;
      throw error;
    }
    return binary ? response.arrayBuffer() : response.json();
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
    async readBinary(path, ref, signal) {
      const file = await api('/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(ref), undefined, {
        accept: 'application/vnd.github.object+json', signal,
      });
      if (file.type !== 'file' || !/^[a-f0-9]{40}$/i.test(file.sha) || !Number.isSafeInteger(file.size) || file.size < 0) {
        throw new Error('Modellen må være en vanlig fil i vaultet.');
      }
      if (file.size > maxModelSize) throw new Error('3D-modellen må være på maks 20 MB.');
      const bytes = await api('/git/blobs/' + file.sha, undefined, {
        accept: 'application/vnd.github.raw+json', signal, binary: true,
      });
      if (bytes.byteLength !== file.size) throw new Error('Modellfilen kunne ikke lastes inn i sin helhet.');
      if (bytes.byteLength < 256 && new TextDecoder().decode(bytes).startsWith('version https://git-lfs.github.com/spec/v1')) {
        throw new Error('3D-viseren støtter foreløpig bare modeller lagret direkte i Git.');
      }
      return bytes;
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
