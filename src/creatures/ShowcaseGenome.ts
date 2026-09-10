import { CORE, connected, type Genome } from './CreatureGenome';
export const showcaseNames = [
  'Ribbon · undulate',
  'Crawler · alternating legs',
  'Star · radial flexion',
  'Roller · traveling contraction',
];
/** Authored bodies and muscle phases; these are not evolved gaits. */
export function showcaseGenome(id: number): Genome {
  const cells = new Float32Array(512 * 6);
  for (let z = 0; z < 8; z++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const dx = x - 3.5,
          dy = y - 3.5,
          dz = z - 3.5;
        let inside = false,
          material = 2,
          phase = 0;
        if (id === 0) {
          inside = y >= 3 && y <= 4 && z >= 3 && z <= 4;
          phase = x * 0.85 + (z === 3 ? 0 : Math.PI) + (y === 3 ? 0 : 0.6);
          material = 2;
        }
        if (id === 1) {
          inside =
            (x >= 1 && x <= 6 && y >= 3 && y <= 4 && z >= 3 && z <= 4) ||
            ((x === 1 || x === 2 || x === 5 || x === 6) &&
              y >= 1 &&
              y <= 3 &&
              z >= 1 &&
              z <= 6);
          phase = x * 0.7 + (z < 3.5 ? 0 : Math.PI);
          material = y < 3 ? 3 : 2;
        }
        if (id === 2) {
          inside =
            y >= 3 && y <= 4 && ((x >= 3 && x <= 4) || (z >= 3 && z <= 4));
          phase = Math.atan2(dz, dx) * 2 + Math.hypot(dx, dz) * 0.7;
          material = Math.abs(dx) > Math.abs(dz) ? 2 : 4;
        }
        if (id === 3) {
          inside = dx * dx + dy * dy + dz * dz <= 8;
          phase = Math.atan2(dy, dx) + dz * 0.25;
          material = 3;
        }
        if (inside)
          cells.set(
            [1, material, 0.96, 0.52, 0.48, phase],
            (x + y * 8 + z * 64) * 6,
          );
      }
  if (
    !cells[CORE * 6] ||
    connected(cells).size !==
      cells.filter((_, i) => i % 6 === 0 && cells[i] > 0).length
  )
    throw new Error('Disconnected showcase body');
  return {
    id,
    generation: 0,
    cells,
    preference: new Float32Array([0, -7, 0, 0.12, 0.25, 0.8, 1, 1.4]),
    controller: new Float32Array(4),
  };
}
