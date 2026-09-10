import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseConfig } from '../src/core/Config';
import { CreatureManager } from '../src/creatures/CreatureManager';
import { connected, occupied } from '../src/creatures/CreatureGenome';
import { createSurface } from '../src/rendering/SurfaceMesh';
void test('four distinct large bodies have connected genes, valid extended links and closed scaled skins', () => {
  const m = new CreatureManager({ ...showcaseConfig });
  assert.equal(m.individuals.size, 4);
  const shapes = new Set<string>();
  for (const c of m.individuals.values()) {
    assert.equal(connected(c.genome.cells).size, c.count);
    shapes.add(occupied(c.genome).join(','));
    assert.equal(c.phenotype.voxelSize, 0.29 * 3);
    for (const j of c.phenotype.adjacency)
      assert.ok(j >= c.offset && j < c.offset + c.count);
    const skin = createSurface(c.phenotype);
    assert.ok(skin.positions.every(Number.isFinite));
    const edges = new Map<string, number>();
    for (let i = 0; i < skin.indices.length; i += 3)
      for (let j = 0; j < 3; j++) {
        const a = skin.indices[i + j],
          b = skin.indices[i + ((j + 1) % 3)],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    for (const n of edges.values()) assert.equal(n, 2);
  }
  assert.equal(shapes.size, 4);
});
