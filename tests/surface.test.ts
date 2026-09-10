import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/core/Config';
import { randomGenome } from '../src/creatures/CreatureGenome';
import { DirectMorphologyGenerator } from '../src/creatures/MorphologyGenerator';
import { createSurface } from '../src/rendering/SurfaceMesh';

void test('continuous skin is closed, connected and bound to its own body', () => {
  for (const seed of [2, 19, 2048]) {
    const body = new DirectMorphologyGenerator().generate(
      randomGenome(new RNG(seed), 36, 0),
      0,
      0,
      0,
    );
    const mesh = createSurface(body),
      count = mesh.positions.length / 3;
    assert.ok(count > 36);
    const edges = new Map<string, number>(),
      neighbors = Array.from({ length: count }, () => new Set<number>());
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const triangle = Array.from(mesh.indices.slice(i, i + 3));
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) || 0) + 1);
        neighbors[a].add(b);
        neighbors[b].add(a);
      }
    }
    for (const n of edges.values())
      assert.equal(n, 2, 'Every edge has exactly two incident faces');
    const visited = new Set([0]),
      queue = [0];
    for (let i = 0; i < queue.length; i++)
      for (const n of neighbors[queue[i]])
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
    assert.equal(visited.size, count, 'Skin has one connected component');
    for (let v = 0; v < count; v++) {
      const weights = mesh.weights.slice(v * 8, v * 8 + 8);
      assert.ok(Math.abs(weights.reduce((s, w) => s + w, 0) - 1) < 1e-5);
      for (let a = 0; a < 3; a++) {
        let p = mesh.residuals[v * 3 + a];
        for (let k = 0; k < 8; k++) {
          const bone = mesh.bones[v * 8 + k];
          assert.ok(bone < 36);
          p += weights[k] * body.meta[bone * 16 + a];
        }
        assert.ok(
          Math.abs(p - mesh.positions[v * 3 + a]) < 1e-5,
          'Rest skin is reproduced without drift',
        );
      }
      assert.ok(mesh.normalRanges[v * 2 + 1] >= 3);
    }
  }
});
void test('skin weights preserve rigid translations without changing topology', () => {
  const body = new DirectMorphologyGenerator().generate(
    randomGenome(new RNG(7), 50, 0),
    0,
    0,
    0,
  );
  const mesh = createSurface(body),
    translation = [7, -3, 2];
  for (let v = 0; v < mesh.positions.length / 3; v++)
    for (let a = 0; a < 3; a++) {
      let p = mesh.residuals[v * 3 + a];
      for (let k = 0; k < 8; k++)
        p +=
          mesh.weights[v * 8 + k] *
          (body.meta[mesh.bones[v * 8 + k] * 16 + a] + translation[a]);
      assert.ok(
        Math.abs(p - mesh.positions[v * 3 + a] - translation[a]) < 1e-4,
      );
    }
});
