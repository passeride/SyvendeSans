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
