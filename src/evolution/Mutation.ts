import { clamp, RNG, MAX_BODY, type Config } from '../core/Config';
import {
  connected,
  CORE,
  neighbors,
  occupied,
  setGene,
  type Genome,
} from '../creatures/CreatureGenome';
export function mutate(parent: Genome, r: RNG, c: Config, id: number): Genome {
  const g: Genome = {
    cells: parent.cells.slice(),
    preference: parent.preference.slice(),
    controller: parent.controller.slice(),
    id,
    generation: parent.generation + 1,
  };
  let cells = occupied(g);
  if (r.next() < c.addRate && cells.length < MAX_BODY) {
    const boundary = [...new Set(cells.flatMap(neighbors))].filter(
      (i) => !g.cells[i * 6],
    );
    if (boundary.length) setGene(g.cells, boundary[r.int(boundary.length)], r);
  }
  cells = occupied(g);
  if (r.next() < c.removeRate && cells.length > 20) {
    const i = cells[r.int(cells.length)];
    if (i !== CORE) {
      g.cells[i * 6] = 0;
      if (connected(g.cells).size < cells.length - 1) g.cells[i * 6] = 1;
    }
  }
  cells = occupied(g);
  for (const i of cells) {
    const k = i * 6;
    if (r.next() < c.materialRate) g.cells[k + 1] = r.int(7);
    if (r.next() < c.mutationRate) {
      g.cells[k + 2] = clamp(g.cells[k + 2] + r.signed() * 0.16, 0.1, 1);
      g.cells[k + 3] = clamp(g.cells[k + 3] + r.signed() * 0.06, 0, 0.35);
      g.cells[k + 4] = clamp(g.cells[k + 4] + r.signed() * 0.3, 0.2, 4);
      g.cells[k + 5] += r.signed() * 0.7;
    }
  }
  for (let i = 0; i < 8; i++)
    if (r.next() < c.mutationRate * 3)
      g.preference[i] += r.signed() * (i < 3 ? 1 : 0.25);
  const mag = Math.hypot(...g.preference.slice(0, 3));
  for (let i = 0; i < 3; i++)
    g.preference[i] *= clamp(mag, 0.5, 20) / Math.max(0.001, mag);
  for (let i = 3; i < 8; i++)
    g.preference[i] = clamp(g.preference[i], 0, i === 7 ? 4 : 5);
  for (let i = 0; i < 4; i++)
    if (r.next() < c.mutationRate * 3)
      g.controller[i] = clamp(g.controller[i] + r.signed() * 0.3, -2, 2);
  return g;
}
