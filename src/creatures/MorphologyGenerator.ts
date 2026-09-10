import { coordinates, occupied, type Genome } from './CreatureGenome';
import { density, damping } from './VoxelMaterial';
import { VOXEL_SIZE } from '../core/Config';
export interface Phenotype {
  voxelSize?: number;
  meta: Float32Array;
  adjacency: Uint32Array;
  indices: number[];
  descriptor: number[];
}
export interface MorphologyGenerator {
  generate(
    g: Genome,
    creatureID: number,
    offset: number,
    linkOffset: number,
  ): Phenotype;
}
export class DirectMorphologyGenerator implements MorphologyGenerator {
  constructor(public scale = 1) {}
  generate(
    g: Genome,
    creatureID: number,
    offset: number,
    linkOffset: number,
  ): Phenotype {
    const indices = occupied(g),
      index = new Map(indices.map((v, i) => [v, i]));
    const meta = new Float32Array(indices.length * 16),
      links: number[] = [];
    const distribution = Array.from({ length: 7 }, () => 0);
    let faces = 0,
      stiffness = 0,
      sym = 0;
    const min = [8, 8, 8],
      max = [0, 0, 0],
      com = [0, 0, 0];
    indices.forEach((cell, i) => {
      const xyz = coordinates(cell),
        k = cell * 6,
        mat = g.cells[k + 1];
      distribution[mat]++;
      stiffness += mat === 1 ? 0.98 : g.cells[k + 2];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], xyz[a]);
        max[a] = Math.max(max[a], xyz[a]);
        com[a] += xyz[a] / indices.length;
      }
      const begin = links.length;
      let exposed = 6;
      const reach = this.scale > 1 ? 2 : 1;
      for (let z = -reach; z <= reach; z++)
        for (let y = -reach; y <= reach; y++)
          for (let x = -reach; x <= reach; x++) {
            if (!x && !y && !z) continue;
            const q = [xyz[0] + x, xyz[1] + y, xyz[2] + z];
            if (q.some((v) => v < 0 || v > 7)) continue;
            const neighbor = index.get(q[0] + q[1] * 8 + q[2] * 64);
            if (neighbor !== undefined) {
              links.push(offset + neighbor);
              if (Math.abs(x) + Math.abs(y) + Math.abs(z) === 1) exposed--;
            }
          }
      faces += exposed;
      if (index.has(7 - xyz[0] + xyz[1] * 8 + xyz[2] * 64)) sym++;
      meta.set(
        [
          (xyz[0] - 3.5) * VOXEL_SIZE * this.scale,
          xyz[1] * VOXEL_SIZE * this.scale,
          (xyz[2] - 3.5) * VOXEL_SIZE * this.scale,
          mat,
          density[mat],
          mat === 1 ? 0.98 : g.cells[k + 2],
          damping[mat],
          creatureID,
          g.cells[k + 3],
          g.cells[k + 4],
          g.cells[k + 5],
          exposed,
          linkOffset + begin,
          links.length - begin,
          cell,
          this.scale,
        ],
        i * 16,
      );
    });
    const dims = max.map((v, i) => v - min[i] + 1);
    return {
      voxelSize: VOXEL_SIZE * this.scale,
      meta,
      adjacency: new Uint32Array(links),
      indices,
      descriptor: [
        indices.length,
        dims[0] / dims[1],
        dims[2] / dims[1],
        faces,
        indices.length / (dims[0] * dims[1] * dims[2]),
        sym / indices.length,
        stiffness / indices.length,
        ...distribution.map((v) => v / indices.length),
        ...com,
      ],
    };
  }
}
