import { Simulation } from './Simulation';
import { defaults } from './Config';
import { initialField } from '../environment/PhysicsField';
export interface GroundReport {
  seed: number;
  checks: { name: string; pass: boolean; evidence: Record<string, unknown> }[];
}
// Diagnostic fixtures are isolated from the user's live world.
export async function runGroundValidation(
  device: GPUDevice,
  seed: number,
  progress: (s: string) => void,
  cancel: () => boolean,
): Promise<GroundReport> {
  async function run(stiffness: number, viscosity: number, enabled = true) {
    const sim = new Simulation(device, {
      ...defaults,
      seed,
      initialCount: 1,
      maxCount: 1,
      initialVoxels: 36,
      creatureEvolution: false,
      physicsEvolution: false,
      actuatorStrength: 0,
      groundStiffness: stiffness,
      deformGround: enabled,
    });
    try {
      await sim.initialize();
      const field = initialField(seed);
      for (let i = 0; i < field.length; i += 12) {
        field[i] = 0;
        field[i + 1] = -7;
        field[i + 2] = 0;
        field[i + 4] = viscosity;
      }
      for (const b of sim.field) device.queue.writeBuffer(b, 0, field);
      async function advance(seconds: number) {
        for (let t = 0; t < seconds * 120; t++) {
          if (cancel()) throw new Error('Ground tests cancelled');
          sim.step();
          if (t % 120 === 119) {
            await sim.snapshot(false);
            progress(
              `Ground test · stiffness ${stiffness}, viscosity ${viscosity} · ${Math.round(sim.time)} s`,
            );
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
          }
        }
      }
      await advance(12);
      const loaded = sim.groundDepth;
      const v = await sim.readVoxels();
      const terrain = sim.lastGround!;
      const height = (x: number, z: number) => {
        const u = Math.max(0, Math.min(63.9999, (x + 20) / 0.625)),
          w = Math.max(0, Math.min(63.9999, (z + 20) / 0.625));
        const a = Math.floor(u),
          b = Math.floor(w),
          tx = u - a,
          tz = w - b,
          k = (a + b * 65) * 4;
        const h = terrain[k],
          hx = terrain[k + 4],
          hz = terrain[k + 260],
          hd = terrain[k + 264];
        return tx + tz <= 1
          ? h + (hx - h) * tx + (hz - h) * tz
          : hd + (hz - hd) * (1 - tx) + (hx - hd) * (1 - tz);
      };
      let minimumClearance = Infinity,
        centerY = 0;
      for (let i = 0; i < v.length; i += 16) {
        minimumClearance = Math.min(
          minimumClearance,
          v[i + 1] - height(v[i], v[i + 2]),
        );
        centerY += v[i + 1] / (v.length / 16);
      }
      // Remove the diagnostic body from physics, then observe unloaded recovery.
      sim.manager.total = 0;
      sim.manager.individuals.clear();
      device.queue.writeBuffer(sim.creatures, 0, new Float32Array(32));
      await advance(2);
      const remaining = sim.groundDepth;
      return {
        loaded,
        remaining,
        recoveryFraction: loaded > 1e-8 ? remaining / loaded : 0,
        minimumClearance,
        centerY,
        finite:
          v.every(Number.isFinite) && sim.lastGround!.every(Number.isFinite),
      };
    } finally {
      sim.dispose();
    }
  }
  const soft = await run(4, 0.3),
    hard = await run(32, 0.3),
    slow = await run(4, 3),
    flat = await run(4, 0.3, false);
  return {
    seed,
    checks: [
      {
        name: 'Softer ground sinks further under the same body',
        pass: soft.loaded > hard.loaded * 1.2 && soft.loaded > 0.02,
        evidence: { soft, hard },
      },
      {
        name: 'Local viscosity delays unloaded recovery',
        pass:
          slow.recoveryFraction > soft.recoveryFraction + 0.05 &&
          slow.remaining < slow.loaded &&
          soft.remaining < soft.loaded,
        evidence: { fast: soft, slow },
      },
      {
        name: 'Deformed contact stays finite and above the visible ground',
        pass:
          [soft, hard, slow, flat].every(
            (v) => v.finite && v.minimumClearance >= 0.144,
          ) && soft.centerY < flat.centerY - 0.01,
        evidence: { soft, hard, slow, flat },
      },
      {
        name: 'Disabling deformation retains a flat control',
        pass: flat.loaded === 0 && flat.remaining === 0,
        evidence: { flat },
      },
    ],
  };
}
