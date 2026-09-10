import { RNG, clamp, type Config } from '../core/Config';
import { randomGenome, type Genome } from './CreatureGenome';
import {
  DirectMorphologyGenerator,
  type Phenotype,
} from './MorphologyGenerator';
import { mutate } from '../evolution/Mutation';
export interface Individual {
  slot: number;
  genome: Genome;
  phenotype: Phenotype;
  offset: number;
  count: number;
  spawn: number[];
  born: number;
  offspring: number;
}
export class CreatureManager {
  individuals = new Map<number, Individual>();
  rng: RNG;
  nextID = 0;
  births = 0;
  deaths = 0;
  lifetimes: number[] = [];
  generator = new DirectMorphologyGenerator();
  total = 0;
  constructor(public config: Config) {
    this.rng = new RNG(config.seed);
    const side = Math.ceil(Math.sqrt(config.initialCount));
    for (let i = 0; i < config.initialCount; i++) {
      const x =
          -17 + (34 * ((i % side) + 0.5)) / side + this.rng.signed() * 0.2,
        z =
          -17 +
          (34 * (Math.floor(i / side) + 0.5)) / side +
          this.rng.signed() * 0.2;
      this.add(
        randomGenome(
          this.rng,
          clamp(config.initialVoxels + this.rng.int(13) - 6, 20, 80),
          this.nextID++,
        ),
        i,
        [x, 0.2, z],
        0,
      );
    }
    this.pack();
  }
  add(genome: Genome, slot: number, spawn: number[], time: number) {
    const phenotype = this.generator.generate(genome, slot, 0, 0);
    this.individuals.set(slot, {
      slot,
      genome,
      phenotype,
      offset: 0,
      count: phenotype.indices.length,
      spawn,
      born: time,
      offspring: 0,
    });
  }
  pack() {
    let offset = 0,
      linkOffset = 0;
    const meta: number[] = [],
      adjacency: number[] = [];
    for (const c of this.individuals.values()) {
      c.offset = offset;
      c.phenotype = this.generator.generate(
        c.genome,
        c.slot,
        offset,
        linkOffset,
      );
      c.count = c.phenotype.indices.length;
      meta.push(...c.phenotype.meta);
      adjacency.push(...c.phenotype.adjacency);
      offset += c.count;
      linkOffset += c.phenotype.adjacency.length;
    }
    this.total = offset;
    return {
      meta: new Float32Array(meta),
      adjacency: new Uint32Array(adjacency),
    };
  }
  creatureData(c: Individual, energy = 85) {
    const out = new Float32Array(32);
    out.set([c.offset, c.count, energy, 0]);
    out.set(c.genome.preference.slice(0, 4), 4);
    out.set(c.genome.preference.slice(4), 8);
    out.set(c.genome.controller, 12);
    const v = this.voxelData(c);
    const center = [0, 0, 0];
    for (let i = 0; i < c.count; i++)
      for (let a = 0; a < 3; a++) center[a] += v[i * 16 + a] / c.count;
    out.set([...center, 0], 16);
    out.set([c.genome.id, c.born, c.genome.generation, 1], 28);
    return out;
  }
  voxelData(c: Individual) {
    const data = new Float32Array(c.count * 16);
    const m = c.phenotype.meta;
    let lowest = Infinity;
    for (let i = 0; i < c.count; i++) lowest = Math.min(lowest, m[i * 16 + 1]);
    for (let i = 0; i < c.count; i++) {
      const p = [
        c.spawn[0] + m[i * 16],
        c.spawn[1] + m[i * 16 + 1] - lowest,
        c.spawn[2] + m[i * 16 + 2],
      ];
      data.set([...p, 85 / c.count, 0, 0, 0, 0, ...p, 0, 0, 0, 0, 0], i * 16);
    }
    return data;
  }
  evolve(snapshot: Float32Array, time: number) {
    const old = new Map(
      [...this.individuals].map(([id, c]) => [
        id,
        { offset: c.offset, count: c.count },
      ]),
    );
    const newborn: number[] = [];
    for (const [id, c] of this.individuals) {
      const energy = snapshot[id * 32 + 2];
      if (energy <= 0 || !Number.isFinite(energy)) {
        this.lifetimes.push(time - c.born);
        this.individuals.delete(id);
        snapshot.fill(0, id * 32, (id + 1) * 32);
        this.deaths++;
      }
    }
    if (this.config.creatureEvolution) {
      const parents = [...this.individuals.values()];
      for (const p of parents) {
        const k = p.slot * 32;
        if (
          snapshot[k + 2] < this.config.reproductionThreshold ||
          snapshot[k + 3] < 8 ||
          this.individuals.size >= this.config.maxCount
        )
          continue;
        let slot = 0;
        while (this.individuals.has(slot)) slot++;
        const angle = this.rng.next() * Math.PI * 2;
        this.add(
          mutate(p.genome, this.rng, this.config, this.nextID++),
          slot,
          [
            clamp(snapshot[k + 16] + Math.cos(angle) * 1.6, -18, 18),
            0.3,
            clamp(snapshot[k + 18] + Math.sin(angle) * 1.6, -18, 18),
          ],
          time,
        );
        const child = this.individuals.get(slot)!;
        const transfer = snapshot[k + 2] * 0.42;
        snapshot[k + 2] -= transfer + 5;
        p.offspring++;
        snapshot[k + 19] = p.offspring;
        snapshot.set(this.creatureData(child, transfer), slot * 32);
        newborn.push(slot);
        this.births++;
      }
    }
    const changed =
      newborn.length > 0 ||
      old.size !== this.individuals.size ||
      [...old.keys()].some((k) => !this.individuals.has(k));
    return { old, newborn, changed };
  }
}
