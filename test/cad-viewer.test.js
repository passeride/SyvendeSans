import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelPath } from '../src/plugins/cad-viewer/index.js';

const note = 'Prosjekter/CNC/Fixtur.md';

test('resolves vault paths and explicit note-relative paths for CAD blocks', () => {
  assert.equal(modelPath(' Vedlegg/Øvre #1.STEP\n', note), 'Vedlegg/Øvre #1.STEP');
  assert.equal(modelPath('/modeller/Fixtur.stl', note), 'modeller/Fixtur.stl');
  assert.equal(modelPath('./Fixtur.stp', note), 'Prosjekter/CNC/Fixtur.stp');
  assert.equal(modelPath('../../Fixtur.stl', note), 'Fixtur.stl');
});

test('rejects remote URLs, non-models and paths outside the vault', () => {
  for (const path of ['https://example.com/a.step', '//example.com/a.stl', '../../../a.stl',
    'a\\b.step', 'a.stl\nb.stl', '.git/a.stl', 'a.md']) {
    assert.throws(() => modelPath(path, note));
  }
});
