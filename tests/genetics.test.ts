import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, RNG } from '../src/core/Config';
import {
  connected,
  occupied,
  randomGenome,
} from '../src/creatures/CreatureGenome';
import { DirectMorphologyGenerator } from '../src/creatures/MorphologyGenerator';
import { CreatureManager } from '../src/creatures/CreatureManager';
import { mutate } from '../src/evolution/Mutation';
import { initialField } from '../src/environment/PhysicsField';
import { correlation } from '../src/metrics/Metrics';
void test('seed reproduces genome and nearly uniform physics', () => {
  assert.deepEqual(
    randomGenome(new RNG(40), 45, 0),
    randomGenome(new RNG(40), 45, 0),
  );
  assert.deepEqual(initialField(5), initialField(5));
  assert.notDeepEqual(initialField(5), initialField(6));
  const f = initialField(5);
  for (let i = 0; i < f.length; i += 12)
    assert.ok(Math.abs(f[i + 1] + 7) < 0.031);
});
void test('1000 morphological mutations retain one core-connected body and bounds', () => {
  const r = new RNG(9);
  let g = randomGenome(r, 40, 0);
  for (let i = 0; i < 1000; i++) {
    g = mutate(
      g,
      r,
      { ...defaults, addRate: 0.9, removeRate: 0.9, mutationRate: 0.4 },
      i + 1,
    );
    assert.equal(connected(g.cells).size, occupied(g).length);
    assert.ok(occupied(g).length >= 20 && occupied(g).length <= 80);
    for (let j = 0; j < 512; j++)
      if (g.cells[j * 6])
        assert.ok(g.cells[j * 6 + 1] >= 0 && g.cells[j * 6 + 1] <= 6);
  }
});
void test('packed lattice uses reciprocal links within the creature', () => {
  const p = new DirectMorphologyGenerator().generate(
    randomGenome(new RNG(23), 64, 0),
    2,
    17,
    0,
  );
  for (let i = 0; i < 64; i++) {
    const k = i * 16;
    for (let n = p.meta[k + 12]; n < p.meta[k + 12] + p.meta[k + 13]; n++) {
      const j = p.adjacency[n] - 17;
      assert.ok(j >= 0 && j < 64);
      const a = p.meta[j * 16 + 12],
        b = a + p.meta[j * 16 + 13];
      assert.ok(Array.from(p.adjacency.slice(a, b)).includes(i + 17));
    }
  }
});
void test('birth transfers parent energy and death frees slots without disconnected offspring', () => {
  const m = new CreatureManager({ ...defaults, initialCount: 2, maxCount: 3 });
  const data = new Float32Array(96);
  for (const c of m.individuals.values())
    data.set(m.creatureData(c), c.slot * 32);
  data[2] = 160;
  data[3] = 9;
  data[34] = -1;
  const before = data[2];
  const result = m.evolve(data, 10);
  assert.equal(m.births, 1);
  assert.equal(m.deaths, 1);
  assert.equal(m.individuals.size, 2);
  assert.ok(result.changed);
  assert.ok(Math.abs(data[2] + data[34] + 5 - before) < 1e-4);
  assert.equal(
    connected(m.individuals.get(1)!.genome.cells).size,
    m.individuals.get(1)!.count,
  );
});
void test('correlation reports insufficient variance honestly', () => {
  assert.equal(correlation([1, 1, 1], [2, 3, 4]), null);
  assert.equal(correlation([1, 2, 3], [2, 4, 6]), 1);
});
