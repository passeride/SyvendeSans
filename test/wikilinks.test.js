import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { resolveWikilink, wikilink } from '../src/wikilinks.js';

test('uses explicit paths, prefers a nearby name, and preserves ambiguity', () => {
  const paths = ['A/Notat.md', 'B/Notat.md'];
  assert.deepEqual(resolveWikilink('B/Notat#Intro', 'A/Test.md', paths), ['B/Notat.md']);
  assert.deepEqual(resolveWikilink('Notat', 'A/Test.md', paths), ['A/Notat.md']);
  assert.deepEqual(resolveWikilink('Notat', 'Test.md', paths), paths);
});

test('wikilink labels are escaped and code remains literal', () => {
  const html = new Marked({ extensions: [wikilink] }).parse('[[Notat|<b>Hei</b>]] `[[Kilde]]`');
  assert.match(html, /data-wikilink="Notat">&lt;b&gt;Hei&lt;\/b&gt;<\/button>/);
  assert.match(html, /<code>\[\[Kilde\]\]<\/code>/);
});
