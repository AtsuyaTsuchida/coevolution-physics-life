import { Simulation } from './Simulation';
import { defaults, type Config } from './Config';
import { initialField } from '../environment/PhysicsField';
import type { Metric } from '../metrics/Metrics';
export interface ValidationReport {
  seed: number;
  duration: number;
  checks: { name: string; pass: boolean; evidence: Record<string, unknown> }[];
  baseline: Metric[];
  coevolution: Metric[];
  noInfluence: Metric[];
  wallSeconds: number;
  gpu: string;
}
const yieldFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));
export async function runValidation(
  device: GPUDevice,
  seed: number,
  progress: (s: string) => void,
  cancel: () => boolean,
): Promise<ValidationReport> {
  const started = performance.now();
  const make = (extra: Partial<Config>) =>
    new Simulation(device, {
      ...defaults,
      seed,
      deformGround: false,
      initialCount: 32,
      maxCount: 80,
      initialVoxels: 32,
      iterations: 8,
      metabolism: 0.02,
      muscleCost: 0.025,
      reproductionThreshold: 110,
      ...extra,
    });
  async function advance(s: Simulation, seconds: number, label: string) {
    const total = Math.round(seconds * 120);
    for (let i = 0; i < total; i++) {
      if (cancel()) throw new Error('Experiment cancelled');
      s.step();
      if ((i + 1) % 120 === 0) {
        await s.snapshot();
        progress(`${label} · ${Math.round(s.time)} / ${seconds} s`);
        await yieldFrame();
      }
    }
  }
  async function motion(act: number, gravity: number) {
    const s = make({
      initialCount: 1,
      maxCount: 1,
      creatureEvolution: false,
      physicsEvolution: false,
      actuatorStrength: act,
    });
    try {
      // The spatial diagnostic uses the same genome on opposite sides of one
      // diagnostic field. Authored zones are used only in this test.
      if (gravity !== -7) {
        const organism = s.manager.individuals.get(0)!;
        organism.spawn = [gravity === -2 ? -10 : 10, 0.2, 0];
        organism.genome.controller.fill(0);
      }
      await s.initialize();
      const field = initialField(seed);
      for (let i = 0; i < field.length; i += 12) {
        field[i] = 0;
        field[i + 1] = gravity === -7 ? -7 : (i / 12) % 32 < 16 ? -2 : -14;
        field[i + 2] = 0;
      }
      for (const b of s.field) device.queue.writeBuffer(b, 0, field);
      await advance(s, 4, 'Settling body');
      const before = await s.readVoxels();
      await advance(s, 14, 'Testing embodiment');
      const after = await s.readVoxels();
      const center = (v: Float32Array) => {
        const c = [0, 0, 0];
        for (let i = 0; i < v.length; i += 16)
          for (let a = 0; a < 3; a++) c[a] += v[i + a] / (v.length / 16);
        return c;
      };
      const a = center(before),
        b = center(after);
      let deformation = 0;
      for (let i = 0; i < after.length; i += 16)
        for (let k = 0; k < 3; k++)
          deformation += (after[i + k] - b[k] - before[i + k] + a[k]) ** 2;
      return {
        horizontal: Math.hypot(b[0] - a[0], b[2] - a[2]),
        deformation: Math.sqrt(deformation / (after.length / 16)),
        remainingEnergy: s.records.at(-1)!.meanEnergy,
        position: b,
        sampledGravity: s.lastSnapshot![26],
        finite: [...after].every(Number.isFinite),
      };
    } finally {
      s.dispose();
    }
  }
  const passive = await motion(0, -7),
    active = await motion(1, -7),
    low = await motion(1, -2),
    high = await motion(1, -14);
  const run = async (evolving: boolean, influence = defaults.influence) => {
    const s = make({ physicsEvolution: evolving, influence });
    try {
      await s.initialize();
      await advance(
        s,
        120,
        !evolving
          ? 'Fixed physics'
          : influence === 0
            ? 'No-influence control'
            : 'Coevolution',
      );
      return s.records;
    } finally {
      s.dispose();
    }
  };
  const baseline = await run(false),
    coevolution = await run(true),
    noInfluence = await run(true, 0);
  const a = baseline.at(-1)!,
    b = coevolution.at(-1)!;
  const d = Math.abs(a.morphologyDiversity - b.morphologyDiversity);
  return {
    seed,
    duration: 120,
    checks: [
      {
        name: 'Muscle-only physical motion',
        pass:
          active.finite &&
          active.horizontal > 0.003 &&
          Math.abs(active.horizontal - passive.horizontal) > 0.001,
        evidence: { active, passive },
      },
      {
        name: 'Local law changes embodied behavior',
        pass:
          Math.abs(low.horizontal - high.horizontal) > 0.001 ||
          Math.abs(low.deformation - high.deformation) > 0.005,
        evidence: { lowGravity: low, highGravity: high },
      },
      {
        name: 'Body activity structures local physics',
        pass:
          b.physicsDiversity > coevolution[0].physicsDiversity * 2 &&
          b.fieldActivity > 0 &&
          b.physicsDiversity > noInfluence.at(-1)!.physicsDiversity * 2,
        evidence: {
          initial: coevolution[0].physicsDiversity,
          final: b.physicsDiversity,
          baseline: a.physicsDiversity,
          noInfluence: noInfluence.at(-1)!.physicsDiversity,
        },
      },
      {
        name: 'Matched-seed ecological trajectories diverge',
        pass:
          d > 1e-6 &&
          b.births > 0 &&
          (b.deaths > 0 || a.deaths > 0) &&
          baseline[0].genomeFingerprint === coevolution[0].genomeFingerprint &&
          a.genomeFingerprint !== b.genomeFingerprint &&
          a.materialDistribution.some(
            (v, i) => Math.abs(v - b.materialDistribution[i]) > 1e-5,
          ) &&
          a.sizeHistogram.some((v, i) => v !== b.sizeHistogram[i]),
        evidence: { baseline: a, coevolution: b, morphologyDifference: d },
      },
    ],
    baseline,
    coevolution,
    noInfluence,
    wallSeconds: (performance.now() - started) / 1000,
    gpu:
      device.adapterInfo?.description ||
      device.adapterInfo?.device ||
      'WebGPU adapter',
  };
}
