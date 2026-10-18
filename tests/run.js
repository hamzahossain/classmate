// Tests for the plain-code scoring parts (no model needed): `npm test`
import assert from 'node:assert/strict';
import { tokenize, align, wcpm } from '../public/js/align.js';
import { findCopying } from '../public/js/copycheck.js';
import { parseJson } from '../server/tasks.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const page = tokenize('Mina sat on a rock and counted the clouds. When the sun came out, the river began to shine.');

test('perfect reading is all correct', () => {
  const r = align(page, 'mina sat on a rock and counted the clouds when the sun came out the river began to shine');
  assert.equal(r.correct, page.length);
  assert.equal(r.errors.length, 0);
});

test('skipped word is "missed", swapped word is "misread"', () => {
  const r = align(page, 'mina sat on rock and county the clouds when the sun came out');
  const status = Object.fromEntries(r.words.map((w, i) => [i + ':' + w.raw, w.status]));
  assert.equal(status['3:a'], 'missed');
  assert.equal(status['6:counted'], 'misread');
  assert.equal(r.words[6].said, 'county');
});

test('stopping early marks the rest "not reached", not "missed"', () => {
  const r = align(page, 'mina sat on a rock');
  assert.equal(r.attempted, 5);
  assert.equal(r.correct, 5);
  assert.ok(r.words.slice(5).every(w => w.status === 'notreached'));
  assert.equal(r.errors.length, 0);
});

test('repeated words are extras, not errors', () => {
  const r = align(page, 'mina mina sat on a rock');
  assert.deepEqual(r.extras, ['mina']);
  assert.equal(r.correct, 5);
});

test('empty transcript reaches nothing', () => {
  const r = align(page, '');
  assert.equal(r.attempted, 0);
  assert.equal(r.correct, 0);
});

test('words correct per minute', () => {
  assert.equal(wcpm(40, 30), 80);
  assert.equal(wcpm(10, 0), 0);
});

test('copying check: shared misspellings flag the right pair', () => {
  const answers = [
    { id: 1, name: 'Rafi', text: 'Light is faster than sound so we see the flash first and hear the thunder later.' },
    { id: 2, name: 'Mina', text: 'Becaus the sound has to travle around the clouds and gets stuck so it is slow.' },
    { id: 3, name: 'Tanvir', text: 'Becaus the sound has to travle around the clouds and get stuck so it come slow.' },
    { id: 4, name: 'Ayesha', text: 'Because light travels very fast and sound travels slower, so the sound comes after.' }
  ];
  const pairs = findCopying(answers, 'Light travels much faster than sound, so the flash reaches us before the sound of the thunder.');
  const top = pairs[0];
  assert.deepEqual([top.a.name, top.b.name].sort(), ['Mina', 'Tanvir']);
  assert.ok(top.flagged);
  assert.ok(top.shared.includes('becaus') && top.shared.includes('travle'));
  assert.equal(pairs.filter(p => p.flagged).length, 1);
});

test('JSON is recovered from messy model output', () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a": 1, "b": "x"}\n```'), { a: 1, b: 'x' });
  assert.deepEqual(parseJson('<think>hmm</think>{"a": [1,2,],}'), { a: [1, 2] });
  assert.deepEqual(parseJson('{"q": "say \\"hi\\" {ok}"} trailing'), { q: 'say "hi" {ok}' });
});

console.log(`\n${passed} tests passed`);
