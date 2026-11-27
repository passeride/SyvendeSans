import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitHubVault, notePath } from '../src/github.js';

test('loads the default branch and lists only ordinary Markdown notes', async () => {
  const requested = [];
  const vault = gitHubVault('example/obsidian', 'test-token', async (url, options) => {
    requested.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (requested.length === 1) return Response.json({ default_branch: 'test/mobile' });
    return Response.json({ tree: [
      { type: 'blob', mode: '100644', path: 'Notater/Idé.md' },
      { type: 'blob', mode: '100644', path: '.obsidian/data.md' },
      { type: 'blob', mode: '120000', path: 'symlink.md' },
      { type: 'blob', mode: '100644', path: 'bilde.png' },
    ] });
  });
  assert.deepEqual(await vault.connect(''), { ref: 'test/mobile', paths: ['Notater/Idé.md'] });
  assert.equal(requested[1], 'https://api.github.com/repos/example/obsidian/git/trees/test%2Fmobile?recursive=1');
});

test('reads UTF-8 and uses the loaded SHA for a compare-and-swap save', async () => {
  const text = '\ufeff---\r\ntags: [prøve]\r\n---\r\n[[Idé]] 🌿';
  const encoded = Buffer.from(text).toString('base64');
  const vault = gitHubVault('example/obsidian', 'test-token', async (url, options) => {
    assert.match(url, /contents\/Notater\/Id%C3%A9%20%231\.md/);
    if (options.method === 'GET') {
      assert.equal(new URL(url).searchParams.get('ref'), 'test/mobile');
      return Response.json({ type: 'file', encoding: 'base64', content: encoded, sha: 'old' });
    }
    const request = JSON.parse(options.body);
    assert.equal(request.content, encoded);
    assert.equal(request.sha, 'old');
    assert.equal(request.branch, 'test/mobile');
    return Response.json({ content: { sha: 'updated' } });
  });
  const file = await vault.read('Notater/Idé #1.md', 'test/mobile');
  assert.equal(file.text, text);
  assert.equal(await vault.write('Notater/Idé #1.md', 'test/mobile', file.text, file.sha), 'updated');
});

test('surfaces conflicts without retrying or switching to a blind write', async () => {
  let calls = 0;
  const vault = gitHubVault('example/obsidian', 'test-token', async () => {
    calls++;
    return new Response(null, { status: 409 });
  });
  await assert.rejects(vault.write('test.md', 'master', 'test', 'old'), /409/);
  assert.equal(calls, 1);
});

test('constrains new notes to visible relative Markdown paths', () => {
  assert.equal(notePath('Innboks/Idé'), 'Innboks/Idé.md');
  for (const path of ['', '../test', '/test', 'a//b', 'a/.b', 'a\\b']) {
    assert.throws(() => notePath(path));
  }
});

test('reads CAD as raw bytes from the selected vault branch', async () => {
  const bytes = Uint8Array.of(0, 128, 255);
  const sha = 'abcd'.repeat(10);
  const { signal } = new AbortController();
  const urls = [];
  const vault = gitHubVault('example/obsidian', 'test-token', async (url, options) => {
    urls.push(url);
    assert.equal(options.signal, signal);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (urls.length === 1) {
      assert.equal(options.headers.Accept, 'application/vnd.github.object+json');
      return Response.json({ type: 'file', sha, size: bytes.length });
    }
    assert.equal(options.headers.Accept, 'application/vnd.github.raw+json');
    return new Response(bytes);
  });
  const result = await vault.readBinary('Vedlegg/Øvre #1.step', 'test/mobile', signal);
  assert.deepEqual(new Uint8Array(result), bytes);
  assert.deepEqual(urls, [
    'https://api.github.com/repos/example/obsidian/contents/Vedlegg/%C3%98vre%20%231.step?ref=test%2Fmobile',
    'https://api.github.com/repos/example/obsidian/git/blobs/' + sha,
  ]);
});

test('rejects oversized CAD attachments before downloading a blob', async () => {
  const vault = gitHubVault('example/obsidian', '', async url => {
    assert.match(url, /\/contents\//);
    return Response.json({ type: 'file', sha: 'abcd'.repeat(10), size: 21 * 1024 * 1024 });
  });
  await assert.rejects(vault.readBinary('modell.step', 'main'), /20 MB/);
});
