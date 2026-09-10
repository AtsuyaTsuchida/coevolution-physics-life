'use client';
import { useEffect, useRef, useState } from 'react';
import { defaults, modes, presets, type Config } from '../core/Config';
import { createGPU } from '../core/GPUContext';
import { Simulation } from '../core/Simulation';
import { Renderer } from '../rendering/Renderer';
import {
  runGroundValidation,
  type GroundReport,
} from '../core/GroundExperiments';
import { runValidation, type ValidationReport } from '../core/Experiments';
import { exportExperiment, type Metric } from '../metrics/Metrics';
import { materialNames, materialColors } from '../creatures/VoxelMaterial';
import { Choice, Range, Toggle, Advanced } from './Controls';
const num = (n: number | undefined, d = 0) =>
  n === undefined
    ? '—'
    : n.toLocaleString('en-US', { maximumFractionDigits: d });
function Chart({
  a,
  b,
  color = '#83dfbf',
}: {
  a: number[];
  b?: number[];
  color?: string;
}) {
  const all = [...a, ...(b || [])],
    max = Math.max(0.00001, ...all),
    min = Math.min(0, ...all);
  const path = (values: number[]) =>
    values
      .map(
        (v, i) =>
          `${(i / Math.max(1, values.length - 1)) * 420},${110 - ((v - min) / (max - min)) * 92}`,
      )
      .join(' ');
  return (
    <svg viewBox="0 0 420 130" aria-label="Recorded experiment trajectory">
      <path
        d="M0 18H420 M0 64H420 M0 110H420"
        stroke="#2b3e46"
        strokeWidth="1"
      />
      <text x="0" y="128" fill="#849ea9" fontSize="10">
        0 s
      </text>
      <text x="365" y="128" fill="#849ea9" fontSize="10">
        Latest
      </text>
      {a.length > 1 && (
        <polyline points={path(a)} fill="none" stroke={color} strokeWidth="2" />
      )}
      {b && b.length > 1 && (
        <polyline
          points={path(b)}
          fill="none"
          stroke="#dfac76"
          strokeWidth="2"
        />
      )}
      {a.length < 2 && (
        <text x="105" y="66" fill="#819ca7" fontSize="13">
          Collecting observations…
        </text>
      )}
    </svg>
  );
}
export default function Laboratory() {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<{
      sim: Simulation;
      renderer: Renderer;
      device: GPUDevice;
    } | null>(null),
    settings = useRef<Config>({ ...defaults }),
    running = useRef(false),
    disposed = useRef(false);
  const [activeSeed, setActiveSeed] = useState(defaults.seed);
  const [config, setConfig] = useState<Config>({ ...defaults }),
    [revision, setRevision] = useState(0),
    [status, setStatus] = useState('Initializing WebGPU…'),
    [error, setError] = useState(''),
    [metric, setMetric] = useState<Metric>(),
    [history, setHistory] = useState<Metric[]>([]),
    [fps, setFps] = useState(0),
    [groundDepth, setGroundDepth] = useState(0),
    [gpu, setGpu] = useState('WebGPU compute'),
    [busy, setBusy] = useState(false),
    [groundReport, setGroundReport] = useState<GroundReport>(),
    [report, setReport] = useState<ValidationReport>(),
    [preset, setPreset] = useState('C · Strong coevolution');
  const update = (key: keyof Config, value: number | boolean) => {
    settings.current = { ...settings.current, [key]: value };
    if (
      engine.current &&
      !['initialCount', 'maxCount', 'initialVoxels', 'seed'].includes(key)
    )
      engine.current.sim.setParameter(key, value);
    setConfig({ ...settings.current });
  };
  useEffect(() => {
    disposed.current = false;
    let dead = false,
      frame = 0,
      last = performance.now(),
      acc = 0,
      frames = 0,
      frameClock = performance.now(),
      pending = false;
    let local:
      | { sim: Simulation; renderer: Renderer; device: GPUDevice }
      | undefined;
    let ownedDevice: GPUDevice | undefined;
    const boot = async () => {
      try {
        const { adapter, device } = await createGPU();
        ownedDevice = device;
        if (dead) {
          device.destroy();
          return;
        }
        device.addEventListener('uncapturederror', (e) => {
          if (!dead) {
            setError(e.error.message);
            settings.current.paused = true;
            if (engine.current) engine.current.sim.config.paused = true;
            setConfig({ ...settings.current });
          }
        });
        void device.lost.then((info) => {
          if (!dead && info.reason !== 'destroyed')
            setError(`GPU device lost: ${info.message}. Reset the experiment.`);
        });
        const c = {
          ...settings.current,
          maxCount: Math.max(
            settings.current.maxCount,
            settings.current.initialCount,
          ),
        };
        const sim = new Simulation(device, c);
        await sim.initialize();
        if (dead) {
          sim.dispose();
          device.destroy();
          return;
        }
        const renderer = new Renderer(device, canvas.current!);
        await renderer.initialize(sim);
        if (dead) {
          renderer.dispose();
          sim.dispose();
          device.destroy();
          return;
        }
        local = { sim, renderer, device };
        engine.current = local;
        setGpu(
          adapter.info.description ||
            adapter.info.device ||
            'WebGPU · hardware compute',
        );
        setStatus('Running');
        setMetric(sim.records.at(-1));
        setGroundDepth(sim.groundDepth);
        const animate = async (now: number) => {
          if (dead) return;
          try {
            const elapsed = Math.min(0.1, (now - last) / 1000);
            last = now;
            frames++;
            if (now - frameClock > 1000) {
              setFps(Math.round((frames * 1000) / (now - frameClock)));
              frames = 0;
              frameClock = now;
            }
            if (!running.current && !sim.config.paused) {
              acc += elapsed * sim.config.speed;
              let steps = 0;
              while (acc >= 1 / 120 && steps < 8) {
                sim.step();
                acc -= 1 / 120;
                steps++;
                if (sim.tick % 120 === 0) {
                  pending = true;
                  break;
                }
              }
              acc = Math.min(acc, 0.1);
              if (pending) {
                await sim.snapshot();
                if (dead) return;
                pending = false;
                setMetric(sim.records.at(-1));
                setGroundDepth(sim.groundDepth);
                setHistory(sim.records.slice(-240));
              }
            }
            renderer.render();
            frame = requestAnimationFrame(animate);
          } catch (e) {
            if (dead) return;
            setError(String(e));
            setStatus('Stopped');
          }
        };
        frame = requestAnimationFrame(animate);
      } catch (e) {
        ownedDevice?.destroy();
        if (dead) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus('Unavailable');
      }
    };
    void boot();
    return () => {
      dead = true;
      disposed.current = true;
      cancelAnimationFrame(frame);
      if (local) {
        local.renderer.dispose();
        local.sim.dispose();
        local.device.destroy();
      }
      ownedDevice?.destroy();
      engine.current = null;
    };
  }, [revision]);
  function reset() {
    setError('');
    setReport(undefined);
    setGroundReport(undefined);
    setStatus('Initializing WebGPU…');
    setHistory([]);
    setMetric(undefined);
    setActiveSeed(settings.current.seed);
    setRevision((v) => v + 1);
  }
  async function validate() {
    const e = engine.current;
    if (!e) return;
    running.current = true;
    setBusy(true);
    setReport(undefined);
    try {
      const result = await runValidation(
        e.device,
        settings.current.seed,
        setStatus,
        () => disposed.current || !running.current,
      );
      setReport(result);
      setStatus(
        `${result.checks.filter((c) => c.pass).length} / 4 checks passed`,
      );
    } catch (err) {
      setStatus(String(err));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function validateGround() {
    const e = engine.current;
    if (!e) return;
    running.current = true;
    setBusy(true);
    setGroundReport(undefined);
    try {
      const result = await runGroundValidation(
        e.device,
        settings.current.seed,
        setStatus,
        () => disposed.current || !running.current,
      );
      setGroundReport(result);
      setStatus(
        `${result.checks.filter((c) => c.pass).length} / 4 ground checks passed`,
      );
    } catch (err) {
      setStatus(String(err));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const exportData = () =>
    exportExperiment(
      {
        schemaVersion: 2,
        groundSnapshot: engine.current?.sim.lastGround
          ? {
              simulationTime: engine.current.sim.records.at(-1)?.simulationTime,
              grid: [65, 65],
              spacing: 0.625,
              strideFloats: 4,
              fields: ['height', 'verticalVelocity', 'contactLoad', 'reserved'],
              data: Array.from(engine.current.sim.lastGround),
            }
          : undefined,
        groundValidation: groundReport,
        initialConfig: engine.current?.sim.initialConfig,
        parameterChanges: engine.current?.sim.configChanges,
        fieldSnapshot: engine.current?.sim.lastField
          ? {
              simulationTime: engine.current.sim.records.at(-1)?.simulationTime,
              strideFloats: 12,
              data: Array.from(engine.current.sim.lastField),
            }
          : undefined,
        config: engine.current?.sim.config || config,
        gpu,
        metrics: engine.current?.sim.records || [],
        validation: report,
        genomes: engine.current
          ? [...engine.current.sim.manager.individuals.values()].map((c) => ({
              id: c.genome.id,
              generation: c.genome.generation,
              cells: Array.from(c.genome.cells),
              preference: Array.from(c.genome.preference),
              controller: Array.from(c.genome.controller),
              descriptor: c.phenotype.descriptor,
            }))
          : [],
      },
      `coevolution-${config.seed}.json`,
    );
  return (
    <main>
      <header>
        <div className="brand">
          ◈ <span>FIELD / LIFE</span>
        </div>
        <span className="eyebrow">ARTIFICIAL LIFE LABORATORY</span>
        <span className="status">RESEARCH PROTOTYPE · 01</span>
      </header>
      <section className="titlebar">
        <div>
          <p className="eyebrow">EXPERIMENTAL ECOLOGY</p>
          <h1>Coevolution of Physics and Life</h1>
        </div>
        <button onClick={exportData} disabled={!metric}>
          Export experiment ↗
        </button>
      </section>
      <div className="workspace">
        <aside>
          <p className="eyebrow">EXPERIMENT</p>
          <h2>Life ↔ Physics</h2>
          <Choice
            label="Experiment preset"
            value={preset}
            items={Object.keys(presets)}
            onChange={(v) => {
              setPreset(v);
              Object.entries(presets[v as keyof typeof presets]).forEach(
                ([k, val]) => update(k as keyof Config, val),
              );
            }}
          />
          <Toggle
            label="Physics evolution"
            value={config.physicsEvolution}
            onChange={(v) => update('physicsEvolution', v)}
          />
          <p className="small">
            Changes apply to this world. Reset restores the same seeded initial
            conditions.
          </p>
          <div className="buttons">
            <button
              className="accent-button"
              disabled={busy || !metric}
              onClick={() => update('paused', !config.paused)}
            >
              {config.paused ? '▶ Resume' : 'Ⅱ Pause'}
            </button>
            <button disabled={busy} onClick={reset}>
              ↺ Reset
            </button>
          </div>
          <div className="control row">
            <label htmlFor="seed">Random seed</label>
            <input
              id="seed"
              type="number"
              min="1"
              max="4294967295"
              value={config.seed}
              onChange={(e) =>
                update('seed', Math.max(1, Number(e.target.value) || 1))
              }
            />
          </div>
          <Range
            label="Simulation speed"
            value={config.speed}
            min={0.25}
            max={4}
            step={0.25}
            onChange={(v) => update('speed', v)}
          />
          <div className="divider" />
          <p className="eyebrow">LOCAL PHYSICS</p>
          <Range
            label="Creature influence"
            value={config.influence}
            max={1}
            onChange={(v) => update('influence', v)}
          />
          <Range
            label="Field mutation"
            value={config.physicsMutation}
            max={0.2}
            step={0.002}
            onChange={(v) => update('physicsMutation', v)}
          />
          <Range
            label="Field diffusion"
            value={config.diffusion}
            max={1}
            onChange={(v) => update('diffusion', v)}
          />
          <div className="divider" />
          <p className="eyebrow">DEFORMABLE GROUND</p>
          <Toggle
            label="Soft ground"
            value={config.deformGround}
            onChange={(v) => update('deformGround', v)}
          />
          <Range
            label="Ground stiffness"
            value={config.groundStiffness}
            min={2}
            max={40}
            step={1}
            onChange={(v) => update('groundStiffness', v)}
          />
          <p className="note">
            Bodies press the ground down. Local viscosity slows its recovery;
            stiffness resists sinking.
          </p>
          <div className="divider" />
          <p className="note">
            Deepest depression: {num(groundDepth, 3)} world units
          </p>
          <p className="eyebrow">OBSERVATION</p>
          <Choice
            label="Body rendering"
            value={config.surfaceMode === 0 ? 'Smooth mesh' : 'Voxels'}
            items={['Smooth mesh', 'Voxels']}
            onChange={(v) => update('surfaceMode', v === 'Smooth mesh' ? 0 : 1)}
          />
          <Choice
            label="Visualization"
            value={modes[config.mode]}
            items={modes}
            onChange={(v) => update('mode', modes.indexOf(v))}
          />
          <Toggle
            label="Creature bodies"
            value={config.showVoxels}
            onChange={(v) => update('showVoxels', v)}
          />
          <Toggle
            label="Physics field slice"
            value={config.showField}
            onChange={(v) => update('showField', v)}
          />
          <Toggle
            label={config.surfaceMode === 0 ? 'Sensor colors' : 'Sensor voxels'}
            value={config.showSensors}
            onChange={(v) => update('showSensors', v)}
          />
          <Toggle
            label="Gravity vectors"
            value={config.showGravity}
            onChange={(v) => update('showGravity', v)}
          />
          <Choice
            label="Slice plane"
            value={['YZ', 'XZ', 'XY'][config.sliceAxis]}
            items={['XZ', 'XY', 'YZ']}
            onChange={(v) => update('sliceAxis', ['YZ', 'XZ', 'XY'].indexOf(v))}
          />
          <Range
            label="Slice position"
            value={config.slice}
            onChange={(v) => update('slice', v)}
          />
          <Range
            label="Vector spacing"
            value={config.glyphStep}
            min={2}
            max={8}
            step={1}
            onChange={(v) => update('glyphStep', v)}
          />
          <Advanced config={config} onChange={update} />
        </aside>
        <section className="world">
          <div className="viewport-label">
            01 / LIVE WORLD{' '}
            <span className="run-state">
              {config.paused
                ? 'PAUSED'
                : busy
                  ? 'EXPERIMENT RUNNING'
                  : metric
                    ? '● LIVE'
                    : 'GPU INITIALIZATION'}
            </span>
          </div>
          <div className="viewport">
            <div className="view-tools">
              <button
                disabled={!metric}
                onClick={() => engine.current?.renderer.inspectCreature()}
              >
                Inspect organism
              </button>
              <button
                disabled={!metric}
                onClick={() => engine.current?.renderer.worldView()}
              >
                World view
              </button>
            </div>
            <canvas
              ref={canvas}
              aria-label="Interactive 3D world with structured voxel organisms and local physical field"
            />
            {!metric && !error && <div className="loading">{status}</div>}
            {error && (
              <div className="loading error" role="alert">
                {error}
              </div>
            )}
            <div className="overlay">
              <div className="tag">
                {config.physicsEvolution ? 'COEVOLUTION' : 'FIXED PHYSICS'} /
                SEED {activeSeed}
              </div>
              <p className="small">
                32 × 16 × 32 local physics cells
                <br />t = {num(metric?.simulationTime, 1)} s · {fps} FPS
              </p>
            </div>
          </div>
          <div className="legend">
            {config.mode === 1 ? (
              materialNames.map((m, i) => (
                <span key={m}>
                  <i style={{ background: materialColors[i] }} />
                  {m}
                </span>
              ))
            ) : (
              <span>
                {config.mode === 0
                  ? 'Color: individual identity'
                  : config.mode === 2
                    ? 'Color: strain · 0 to 0.25 relative rest length'
                    : `Color: ${modes[config.mode]} · ${['', '', '', '0–15 acceleration units', '0–5 drag', '0–5 viscosity', '0–5 adhesion', '0–1 nutrient availability', '0–1 local deviation'][config.mode]}`}
              </span>
            )}
          </div>
          <div className="metrics">
            <div className="metric">
              <small>Living organisms</small>
              <strong>{num(metric?.aliveCreatures)}</strong>
            </div>
            <div className="metric">
              <small>Active voxels</small>
              <strong>{num(metric?.totalVoxels)}</strong>
            </div>
            <div className="metric">
              <small>Births / deaths</small>
              <strong>
                {num(metric?.births)} / {num(metric?.deaths)}
              </strong>
            </div>
            <div className="metric">
              <small>Mean energy</small>
              <strong>{num(metric?.meanEnergy, 1)}</strong>
            </div>
            <div className="metric">
              <small>Mean body size</small>
              <strong>{num(metric?.meanCreatureSize, 1)}</strong>
            </div>
          </div>
          <footer>
            Drag to orbit · Scroll to zoom
            <span>
              {config.surfaceMode === 0
                ? 'GPU-deformed continuous mesh'
                : 'GPU compute + instanced cubes'}
            </span>
          </footer>
        </section>
      </div>
      <section className="analytics">
        <div className="panel">
          <div className="row">
            <h3>Physics diversity</h3>
            <span className="gpu">{num(metric?.physicsDiversity, 6)}</span>
          </div>
          <p>Normalized spatial variance of gravity, drag and viscosity.</p>
          <Chart
            a={
              report
                ? report.coevolution.map((m) => m.physicsDiversity)
                : history.map((m) => m.physicsDiversity)
            }
            b={report?.baseline.map((m) => m.physicsDiversity)}
          />
          <div className="chart-key">
            <span>— {report ? 'Coevolution' : 'Current experiment'}</span>
            {report && <span>— Fixed physics</span>}
          </div>
          <div className="spectrum" />
          <div className="row small">
            <span>Low field value</span>
            <span>High field value</span>
          </div>
        </div>
        <div className="panel">
          <h3>Morphology & physical niche</h3>
          <p>Pearson r · local field averaged over every body voxel.</p>
          <dl>
            <dt>Stiffness ↔ gravity</dt>
            <dd>
              {metric?.stiffnessGravity == null
                ? '—'
                : num(metric.stiffnessGravity, 3)}
            </dd>
            <dt>Body size ↔ gravity</dt>
            <dd>
              {metric?.sizeGravity == null ? '—' : num(metric.sizeGravity, 3)}
            </dd>
            <dt>Muscle ratio ↔ viscosity</dt>
            <dd>
              {metric?.muscleViscosity == null
                ? '—'
                : num(metric.muscleViscosity, 3)}
            </dd>
            <dt>Morphology diversity</dt>
            <dd>{num(metric?.morphologyDiversity, 4)}</dd>
            <dt>Genome diversity</dt>
            <dd>{num(metric?.genomeDiversity, 4)}</dd>
            <dt>Mean generation</dt>
            <dd>{num(metric?.meanGeneration, 2)}</dd>
            <dt>Gravity mean / variance</dt>
            <dd>
              {num(metric?.meanGravity, 3)} / {num(metric?.gravityVariance, 4)}
            </dd>
          </dl>
          <p>
            Correlation is an observation, not evidence of causation. Use
            matched-seed controls.
          </p>
        </div>
        <div className="panel">
          <h3>Matched-seed validation</h3>
          <p>
            Tests muscle-only movement, local law response, niche formation and
            ecological divergence. Includes matched 120 s experiments and a
            no-influence control with 32 founders.
          </p>
          <button
            className="full"
            disabled={busy || !metric}
            onClick={validate}
          >
            {busy ? 'Running GPU experiments…' : 'Run 4 success tests →'}
          </button>
          <button
            className="full"
            disabled={busy || !metric}
            onClick={validateGround}
            style={{ marginTop: 8 }}
          >
            Test ground response →
          </button>
          <p className="note">
            Original tests use a flat floor. Ground tests compare stiffness,
            viscosity, contact and a flat control.
          </p>
          {groundReport && (
            <div className="compare-report">
              {groundReport.checks.map((c) => (
                <p key={c.name}>
                  {c.pass ? '✓' : '×'} {c.name}
                </p>
              ))}
              <details>
                <summary>Ground numerical evidence</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 11,
                    maxHeight: 350,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(groundReport, null, 2)}
                </pre>
              </details>
            </div>
          )}
          {busy && (
            <button
              className="full"
              style={{ marginTop: 8 }}
              onClick={() => {
                running.current = false;
              }}
            >
              Cancel tests
            </button>
          )}
          <output className="note" aria-live="polite">
            {status}
          </output>
          {report && (
            <div className="compare-report">
              {report.checks.map((c) => (
                <p key={c.name}>
                  {c.pass ? '✓' : '×'} {c.name}
                </p>
              ))}
              <button
                onClick={() =>
                  exportExperiment(report, `validation-${report.seed}.json`)
                }
              >
                Export validation JSON
              </button>
              <details>
                <summary>Numerical evidence</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 11,
                    maxHeight: 350,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(report.checks, null, 2)}
                </pre>
              </details>
            </div>
          )}
          <p className="gpu">{gpu}</p>
        </div>
      </section>
      <p className="footnote">
        Bodies have a continuous surface driven by connected voxel genomes.
        Movement comes from muscle contraction, structural constraints and
        contact with the environment.
        <br />
        No predefined gait or authored physics zones. Field inheritance is
        spatial persistence; this prototype does not establish open-ended
        evolution.
      </p>
    </main>
  );
}
