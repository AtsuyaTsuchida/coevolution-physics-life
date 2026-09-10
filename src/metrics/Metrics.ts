import type { CreatureManager } from '../creatures/CreatureManager';
import type { Config } from '../core/Config';
export const mean = (a: number[]) =>
  a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
export const variance = (a: number[]) => {
  const m = mean(a);
  return mean(a.map((v) => (v - m) ** 2));
};
export function correlation(a: number[], b: number[]): number | null {
  if (a.length < 3) return null;
  const x = mean(a),
    y = mean(b),
    den = Math.sqrt(
      a.reduce((s, v) => s + (v - x) ** 2, 0) *
        b.reduce((s, v) => s + (v - y) ** 2, 0),
    );
  return den > 1e-10
    ? a.reduce((s, v, i) => s + (v - x) * (b[i] - y), 0) / den
    : null;
}
export interface Metric {
  simulationTime: number;
  aliveCreatures: number;
  totalVoxels: number;
  births: number;
  deaths: number;
  meanCreatureSize: number;
  meanEnergy: number;
  meanLifetime: number;
  meanOffspring: number;
  genomeDiversity: number;
  morphologyDiversity: number;
  physicsDiversity: number;
  meanGravity: number;
  gravityVariance: number;
  meanDrag: number;
  dragVariance: number;
  meanViscosity: number;
  viscosityVariance: number;
  distanceTraveled: number;
  energyEfficiency: number;
  stiffnessGravity: number | null;
  sizeGravity: number | null;
  muscleViscosity: number | null;
  fieldActivity: number;
  meanGeneration: number;
  finite: boolean;
  materialDistribution: number[];
  sizeHistogram: number[];
  genomeFingerprint: string;
}
export interface Experiment {
  config: Config;
  metrics: Metric[];
}
export function measure(
  m: CreatureManager,
  c: Float32Array,
  f: Float32Array,
  time: number,
): Metric {
  const individuals = [...m.individuals.values()];
  const ids = individuals.map((v) => v.slot),
    energies = ids.map((i) => c[i * 32 + 2]),
    g: number[] = [],
    drag: number[] = [],
    viscosity: number[] = [],
    activity: number[] = [];
  for (let i = 0; i < f.length; i += 12) {
    g.push(Math.hypot(f[i], f[i + 1], f[i + 2]));
    drag.push(f[i + 3]);
    viscosity.push(f[i + 4]);
    activity.push(f[i + 9]);
  }
  const descriptors = individuals.map((i) => i.phenotype.descriptor);
  const size = individuals.map((i) => i.count),
    stiff = descriptors.map((d) => d[6]),
    muscle = descriptors.map((d) => d[9] + d[10] + d[11]),
    localG = ids.map((i) => c[i * 32 + 26]),
    localV = ids.map((i) => c[i * 32 + 27]);
  let md = 0,
    gd = 0,
    pairs = 0;
  for (let a = 0; a < Math.min(64, individuals.length); a++) {
    const b = (a + 1) % individuals.length;
    let distance = 0;
    for (let j = 0; j < 512; j++) {
      const x = individuals[a].genome.cells,
        y = individuals[b].genome.cells;
      if (x[j * 6] !== y[j * 6]) distance += 1;
      else if (x[j * 6] && x[j * 6 + 1] !== y[j * 6 + 1]) distance += 0.5;
    }
    gd += distance / 512;
    md += mean(
      descriptors[a]
        .slice(0, 14)
        .map(
          (v, k) =>
            Math.abs(v - descriptors[b][k]) /
            (Math.abs(v) + Math.abs(descriptors[b][k]) + 1),
        ),
    );
    pairs++;
  }
  const sizeHistogram = Array.from({ length: 61 }, () => 0);
  const materialDistribution = Array.from({ length: 7 }, () => 0);
  let fingerprint = 0;
  for (const organism of individuals) {
    sizeHistogram[organism.count - 20]++;
    for (let k = 0; k < 7; k++)
      materialDistribution[k] +=
        (organism.phenotype.descriptor[7 + k] * organism.count) /
        Math.max(1, m.total);
    let hash = 2166136261;
    for (const value of organism.genome.cells)
      hash = Math.imul(hash ^ Math.round(value * 10000), 16777619);
    for (const value of organism.genome.preference)
      hash = Math.imul(hash ^ Math.round(value * 10000), 16777619);
    for (const value of organism.genome.controller)
      hash = Math.imul(hash ^ Math.round(value * 10000), 16777619);
    fingerprint = (fingerprint + hash) >>> 0;
  }
  return {
    materialDistribution,
    sizeHistogram,
    genomeFingerprint: fingerprint.toString(16),
    simulationTime: time,
    aliveCreatures: ids.length,
    totalVoxels: m.total,
    births: m.births,
    deaths: m.deaths,
    meanCreatureSize: mean(size),
    meanEnergy: mean(energies),
    meanLifetime: mean(m.lifetimes),
    meanOffspring: mean(individuals.map((i) => i.offspring)),
    genomeDiversity: gd / Math.max(1, pairs),
    morphologyDiversity: md / Math.max(1, pairs),
    physicsDiversity:
      variance(g) / 400 + variance(drag) / 25 + variance(viscosity) / 25,
    meanGravity: mean(g),
    gravityVariance: variance(g),
    meanDrag: mean(drag),
    dragVariance: variance(drag),
    meanViscosity: mean(viscosity),
    viscosityVariance: variance(viscosity),
    distanceTraveled: mean(ids.map((i) => c[i * 32 + 24])),
    energyEfficiency: mean(
      ids.map((i) => c[i * 32 + 24] / Math.max(0.01, c[i * 32 + 25])),
    ),
    stiffnessGravity: correlation(stiff, localG),
    sizeGravity: correlation(size, localG),
    muscleViscosity: correlation(muscle, localV),
    fieldActivity: mean(activity.filter((x) => x > 0)),
    meanGeneration: mean(individuals.map((i) => i.genome.generation)),
    finite: [...c, ...f].every(Number.isFinite),
  };
}
export function exportExperiment(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
