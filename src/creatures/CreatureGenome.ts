import { RNG } from '../core/Config';
export const GRID = 8,
  CELLS = 512,
  GENE_STRIDE = 6,
  CORE = 3 + 3 * 8 + 3 * 64;
// Typed arrays: occupancy, material, stiffness, amplitude, frequency, phase.
export interface Genome {
  cells: Float32Array;
  preference: Float32Array;
  controller: Float32Array;
  id: number;
  generation: number;
}
export function coordinates(i: number) {
  return [i % 8, Math.floor(i / 8) % 8, Math.floor(i / 64)];
}
export function neighbors(i: number) {
  const [x, y, z] = coordinates(i);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < 7) out.push(i + 1);
  if (y > 0) out.push(i - 8);
  if (y < 7) out.push(i + 8);
  if (z > 0) out.push(i - 64);
  if (z < 7) out.push(i + 64);
  return out;
}
export function connected(cells: Float32Array) {
  const visited = new Set<number>();
  if (!cells[CORE * 6]) return visited;
  const queue = [CORE];
  visited.add(CORE);
  for (let j = 0; j < queue.length; j++)
    for (const n of neighbors(queue[j]))
      if (cells[n * 6] && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
  return visited;
}
export function occupied(g: Genome) {
  const out: number[] = [];
  for (let i = 0; i < CELLS; i++) if (g.cells[i * 6]) out.push(i);
  return out;
}
export function setGene(cells: Float32Array, i: number, r: RNG) {
  cells.set(
    [
      1,
      r.int(7),
      0.35 + r.next() * 0.6,
      0.06 + r.next() * 0.2,
      0.6 + r.next() * 2,
      r.next() * Math.PI * 2,
    ],
    i * 6,
  );
}
export function randomGenome(r: RNG, count: number, id: number): Genome {
  const cells = new Float32Array(CELLS * 6);
  setGene(cells, CORE, r);
  const active = [CORE];
  while (active.length < count) {
    const n = neighbors(active[r.int(active.length)]);
    const i = n[r.int(n.length)];
    if (!cells[i * 6]) {
      setGene(cells, i, r);
      active.push(i);
    }
  }
  return {
    cells,
    preference: new Float32Array([
      r.signed() * 2,
      -(2 + r.next() * 12),
      r.signed() * 2,
      r.next() * 2,
      r.next() * 3,
      r.next() * 2,
      0.5 + r.next() * 2,
      1 + r.next() * 2,
    ]),
    controller: new Float32Array([
      r.signed(),
      r.signed(),
      r.signed(),
      r.signed(),
    ]),
    id,
    generation: 0,
  };
}
