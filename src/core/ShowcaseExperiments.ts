import { Simulation } from './Simulation';
import { showcaseConfig } from './Config';
import { showcaseNames } from '../creatures/ShowcaseGenome';
import type { GroundReport } from './GroundExperiments';
export async function runShowcaseValidation(
  device: GPUDevice,
  seed: number,
  progress: (s: string) => void,
  cancel: () => boolean,
): Promise<GroundReport> {
  async function run(strength: number) {
    const sim = new Simulation(device, {
      ...showcaseConfig,
      seed,
      actuatorStrength: strength,
    });
    try {
      await sim.initialize();
      let before: Float32Array | undefined;
      let centers: number[][] = [];
      const path = [0, 0, 0, 0],
        deformation = [0, 0, 0, 0],
        turn = [0, 0, 0, 0],
        signedTurn = [0, 0, 0, 0];
      let previousAxes: number[][] = [];
      let finite = true,
        minClearance = Infinity;
      for (let t = 0; t < 16 * 120; t++) {
        if (cancel()) throw new Error('Motion tests cancelled');
        sim.step();
        if (t % 60 === 59) {
          await sim.snapshot(false);
          const v = await sim.readVoxels();
          finite = finite && v.every(Number.isFinite);
          const current: number[][] = [];
          const axes: number[][] = [];
          for (const c of sim.manager.individuals.values()) {
            let cx = 0,
              cy = 0,
              cz = 0;
            for (let j = 0; j < c.count; j++) {
              const k = (c.offset + j) * 16;
              cx += v[k] / c.count;
              cy += v[k + 1] / c.count;
              cz += v[k + 2] / c.count;
            }
            current.push([cx, cy, cz]);
            const a = c.offset * 16,
              b = (c.offset + c.count - 1) * 16;
            axes.push([v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]]);
            if (before && sim.time > 4) {
              path[c.slot] += Math.hypot(
                cx - centers[c.slot][0],
                cz - centers[c.slot][2],
              );
              let sum = 0;
              for (let j = 0; j < c.count; j++) {
                const k = (c.offset + j) * 16;
                for (let d = 0; d < 3; d++)
                  sum +=
                    (v[k + d] -
                      current[c.slot][d] -
                      before[k + d] +
                      centers[c.slot][d]) **
                    2;
              }
              deformation[c.slot] = Math.max(
                deformation[c.slot],
                Math.sqrt(sum / c.count),
              );
              const old = previousAxes[c.slot],
                axis = axes[c.slot];
              const angle =
                Math.atan2(axis[1], axis[0]) - Math.atan2(old[1], old[0]);
              signedTurn[c.slot] += Math.atan2(
                Math.sin(angle),
                Math.cos(angle),
              );
              turn[c.slot] += Math.acos(
                Math.max(
                  -1,
                  Math.min(
                    1,
                    axis.reduce((n, x, i) => n + x * old[i], 0) /
                      (Math.hypot(...axis) * Math.hypot(...old)),
                  ),
                ),
              );
            }
          }
          // Exact triangle height check for all centers.
          const g = sim.lastGround!;
          for (let k = 0; k < v.length; k += 16) {
            const u = Math.max(0, Math.min(63.9999, (v[k] + 20) / 0.625)),
              w = Math.max(0, Math.min(63.9999, (v[k + 2] + 20) / 0.625));
            const x = Math.floor(u),
              z = Math.floor(w),
              tx = u - x,
              tz = w - z,
              i = (x + z * 65) * 4;
            const a = g[i],
              b = g[i + 4],
              c = g[i + 260],
              d = g[i + 264];
            const h =
              tx + tz <= 1
                ? a + (b - a) * tx + (c - a) * tz
                : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
            minClearance = Math.min(minClearance, v[k + 1] - h);
          }
          before = v;
          centers = current;
          previousAxes = axes;
          progress(
            `Four giants · muscles ${strength ? 'ON' : 'OFF'} · ${sim.time.toFixed(1)} / 16 s`,
          );
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      }
      return { path, deformation, turn, signedTurn, finite, minClearance };
    } finally {
      sim.dispose();
    }
  }
  const active = await run(1),
    passive = await run(0);
  return {
    seed,
    kind: 'showcase',
    checks: showcaseNames.map((name, i) => ({
      name,
      pass:
        active.finite &&
        active.minClearance > 0.434 &&
        active.path[i] > 0.15 &&
        active.path[i] > passive.path[i] * 1.15 &&
        active.deformation[i] > 0.04 &&
        (i !== 3 || Math.abs(active.signedTurn[i]) > Math.PI / 2),
      evidence: {
        active: {
          path: active.path[i],
          deformation: active.deformation[i],
          axisTurning: active.turn[i],
          signedXYTurning: active.signedTurn[i],
          minimumClearance: active.minClearance,
        },
        passive: {
          path: passive.path[i],
          deformation: passive.deformation[i],
          axisTurning: passive.turn[i],
        },
      },
    })),
  };
}
