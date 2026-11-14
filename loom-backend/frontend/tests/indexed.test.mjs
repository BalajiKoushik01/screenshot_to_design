import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/studio/model.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const sample = () => ({ schema: 'weavecore.indexed.v1', width: 3, height: 2, pixels: Uint8Array.from([0, 1, 2, 2, 1, 0]), palette: [[0, 0, 0], [255, 200, 30], [255, 200, 30]], names: ['Ground', 'Zari A', 'Zari B'], regions: [], provenance: {}, report: { used_colors: 3, rgb_mae: 0, exact_sampled_rgb: true, notes: [] } });
test('BMP header, row padding, orientation and duplicate index slots', () => {
  const d = sample(), b = m.bmp(d), v = new DataView(b.buffer);
  assert.equal(v.getUint16(28, true), 8); assert.equal(v.getUint32(30, true), 0);
  assert.equal(v.getUint32(10, true), 1078); assert.equal(v.getInt32(22, true), 2);
  assert.deepEqual([...b.slice(1078)], [2, 1, 0, 0, 0, 1, 2, 0]);
  assert.deepEqual([...b.slice(58, 62)], [30, 200, 255, 0]);
  assert.equal(v.getUint32(2, true), b.length);
});
test('project roundtrip preserves every index and palette slot', () => assert.deepEqual(m.fromJSON(m.serialize(sample())), sample()));
test('malformed projects rejected before allocation', () => {
  for (const patch of [{ width: -1 }, { width: 16000, height: 16000 }, { indices: '////' }, { palette: [[NaN, 0, 0]] }, { regions: [{ name: 'bad', x: 4, y: 0, width: 2, height: 2 }] }]) assert.throws(() => m.fromJSON({ ...m.serialize(sample()), ...patch }));
});
test('crop and repeat preserve indices, not just colors', () => {
  const d = m.crop(sample(), { name: 'Border', x: 1, y: 0, width: 2, height: 2 });
  assert.deepEqual([...d.pixels], [1, 2, 1, 0]);
  assert.deepEqual([...m.tile(d, 2, 1).pixels], [1, 2, 1, 2, 1, 0, 1, 0]);
  assert.throws(() => m.tile(d, 20000, 1));
});
test('fill respects connectivity and duplicate RGB colors with different indices', () => {
  const d = sample(); m.fill(d, 1, 0, 0); assert.deepEqual([...d.pixels], [0, 0, 2, 2, 0, 0]);
});
test('fast strokes interpolate missing pointer events and stay in bounds', () => {
  const d = { ...sample(), width: 10, height: 10, pixels: new Uint8Array(100) };
  m.stroke(d, [0, 0], [9, 9], 1, 1);
  assert.equal(d.pixels.filter(x => x === 1).length, 10);
  for (let i = 0; i < 10; i++) assert.equal(d.pixels[i * 11], 1);
});
test('mirrors are reversible and transform panel coordinates', () => {
  const d = sample(); d.regions = [{ name: 'A', x: 0, y: 0, width: 1, height: 1 }];
  assert.equal(m.flip(d, true).regions[0].x, 2);
  assert.deepEqual(m.flip(m.flip(d, true), true), d);
  assert.deepEqual(m.flip(m.flip(d, false), false), d);
});
test('editing a clone does not mutate undo snapshot', () => {
  const d = sample(), next = m.clone(d); next.pixels[0] = 2; next.palette[0][0] = 100;
  assert.equal(d.pixels[0], 0); assert.equal(d.palette[0][0], 0);
});
