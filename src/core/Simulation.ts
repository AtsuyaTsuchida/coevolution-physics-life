import { buffer } from './GPUContext';
import { DT, MAX_BODY, FIELD_CELLS, type Config } from './Config';
import { CreatureManager } from '../creatures/CreatureManager';
import { initialField } from '../environment/PhysicsField';
import { VoxelPhysics } from '../physics/VoxelPhysics';
import { measure, type Metric } from '../metrics/Metrics';
export class Simulation {
  manager: CreatureManager;
  physics: VoxelPhysics;
  state: GPUBuffer[];
  field: GPUBuffer[];
  meta: GPUBuffer;
  adjacency: GPUBuffer;
  creatures: GPUBuffer;
  act: GPUBuffer;
  heads: GPUBuffer;
  next: GPUBuffer;
  deposits: GPUBuffer;
  uniform: GPUBuffer;
  staging: GPUBuffer;
  readback: GPUBuffer;
  voxelIndex = 0;
  fieldIndex = 0;
  tick = 0;
  time = 0;
  records: Metric[] = [];
  groups: Record<string, GPUBindGroup> = {};
  destroyed = false;
  lastSnapshot?: Float32Array;
  lastField?: Float32Array;
  readonly initialConfig: Config;
  configChanges: {
    simulationTime: number;
    key: keyof Config;
    value: number | boolean;
  }[] = [];
  setParameter(key: keyof Config, value: number | boolean) {
    Object.assign(this.config, { [key]: value });
    this.configChanges.push({ simulationTime: this.time, key, value });
  }
  constructor(
    public device: GPUDevice,
    public config: Config,
  ) {
    this.initialConfig = { ...config };
    this.manager = new CreatureManager(config);
    this.physics = new VoxelPhysics(device);
    const cap = config.maxCount * MAX_BODY;
    this.state = [
      buffer(device, 'Voxel state A', cap * 64),
      buffer(device, 'Voxel state B', cap * 64),
    ];
    this.field = [
      buffer(device, 'Physics genome A', FIELD_CELLS * 48),
      buffer(device, 'Physics genome B', FIELD_CELLS * 48),
    ];
    this.meta = buffer(device, 'Active voxel metadata', cap * 64);
    this.adjacency = buffer(device, '26-neighbor adjacency', cap * 26 * 4);
    this.creatures = buffer(device, 'Creature state', config.maxCount * 128);
    this.act = buffer(device, 'Actuator output', cap * 16);
    this.heads = buffer(device, 'Spatial grid heads', FIELD_CELLS * 4);
    this.next = buffer(device, 'Spatial grid links', cap * 4);
    this.deposits = buffer(
      device,
      'Fixed-point environment influence',
      FIELD_CELLS * 48,
    );
    this.uniform = buffer(
      device,
      'Simulation parameters',
      96,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    this.staging = buffer(device, 'GPU compaction scratch', cap * 64);
    this.readback = buffer(
      device,
      'Ecology readback',
      config.maxCount * 128 + FIELD_CELLS * 48,
      GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    );
  }
  async initialize() {
    await this.physics.initialize();
    const packed = this.manager.pack();
    this.device.queue.writeBuffer(this.meta, 0, packed.meta);
    this.device.queue.writeBuffer(this.adjacency, 0, packed.adjacency);
    for (const c of this.manager.individuals.values()) {
      this.device.queue.writeBuffer(
        this.creatures,
        c.slot * 128,
        this.manager.creatureData(c),
      );
      const v = this.manager.voxelData(c);
      for (const b of this.state)
        this.device.queue.writeBuffer(b, c.offset * 64, v);
    }
    const f = initialField(this.config.seed);
    for (const b of this.field) this.device.queue.writeBuffer(b, 0, f);
    this.cacheGroups();
    await this.snapshot(false);
  }
  cacheGroups() {
    const p = this.physics;
    for (let s = 0; s < 2; s++)
      for (let f = 0; f < 2; f++) {
        const a = this.state[s],
          b = this.state[1 - s],
          world = this.field[f],
          u = this.uniform;
        const specs: Record<string, GPUBuffer[]> = {
          sensors: [u, a, this.meta, this.creatures, world],
          actuator: [u, this.meta, this.creatures, this.act],
          forces: [u, a, b, this.meta, world],
          constraints: [u, a, b, this.meta, this.adjacency, this.act],
          clearGrid: [u, a, this.heads, this.next],
          grid: [u, a, this.heads, this.next],
          collision: [u, a, b, this.meta, world, this.heads, this.next],
          energy: [u, a, this.meta, this.creatures, world, this.act],
          clearInfluence: [u, a, this.meta, this.creatures, this.deposits],
          influence: [u, a, this.meta, this.creatures, this.deposits],
          field: [u, world, this.field[1 - f], this.deposits],
        };
        for (const name in specs)
          this.groups[`${name}${s}${f}`] = p.group(name, specs[name]);
      }
  }
  step() {
    const c = this.config;
    const parameters = new Float32Array([
      this.time,
      DT,
      this.tick,
      0,
      this.manager.total,
      c.maxCount,
      FIELD_CELLS,
      0,
      c.stability,
      c.actuatorStrength,
      c.iterations,
      0,
      c.metabolism,
      c.muscleCost,
      0,
      0,
      c.influence,
      c.physicsMutation,
      c.diffusion,
      +c.physicsEvolution,
      c.seed,
      0,
      0,
      0,
    ]);
    this.device.queue.writeBuffer(this.uniform, 0, parameters);
    const e = this.device.createCommandEncoder();
    const run = (name: string, n: number) =>
      this.physics.dispatch(
        e,
        name,
        this.groups[`${name}${this.voxelIndex}${this.fieldIndex}`],
        n,
      );
    const nv = Math.ceil(this.manager.total / 128),
      nc = Math.ceil(c.maxCount / 64),
      nf = 128;
    run('sensors', nc);
    run('actuator', nv);
    run('forces', nv);
    this.voxelIndex = 1 - this.voxelIndex;
    for (let i = 0; i < c.iterations; i++) {
      run('constraints', nv);
      this.voxelIndex = 1 - this.voxelIndex;
    }
    run('clearGrid', nf);
    run('grid', nv);
    run('collision', nv);
    this.voxelIndex = 1 - this.voxelIndex;
    run('energy', nc);
    run('clearInfluence', nf);
    run('influence', nv);
    run('field', nf);
    this.fieldIndex = 1 - this.fieldIndex;
    this.device.queue.submit([e.finish()]);
    this.tick++;
    this.time = this.tick * DT;
  }
  async snapshot(evolve = true) {
    if (this.destroyed) return;
    const e = this.device.createCommandEncoder();
    const bytes = this.config.maxCount * 128;
    e.copyBufferToBuffer(this.creatures, 0, this.readback, 0, bytes);
    e.copyBufferToBuffer(
      this.field[this.fieldIndex],
      0,
      this.readback,
      bytes,
      FIELD_CELLS * 48,
    );
    this.device.queue.submit([e.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const mapped = this.readback.getMappedRange();
    const cs = new Float32Array(mapped.slice(0, bytes)),
      fs = new Float32Array(mapped.slice(bytes));
    this.readback.unmap();
    if (this.destroyed) return;
    this.lastSnapshot = cs;
    this.lastField = fs;
    const metric = measure(this.manager, cs, fs, this.time);
    this.records.push(metric);
    if (!metric.finite)
      throw new Error(
        'Non-finite GPU state detected. Simulation stopped. Reset to recover.',
      );
    if (evolve) {
      const result = this.manager.evolve(cs, this.time);
      if (result.changed) {
        const packed = this.manager.pack();
        const enc = this.device.createCommandEncoder();
        for (const [slot, c] of this.manager.individuals) {
          const old = result.old.get(slot);
          if (old && !result.newborn.includes(slot))
            enc.copyBufferToBuffer(
              this.state[this.voxelIndex],
              old.offset * 64,
              this.staging,
              c.offset * 64,
              c.count * 64,
            );
          cs[slot * 32] = c.offset;
          cs[slot * 32 + 1] = c.count;
        }
        for (const b of this.state)
          if (this.manager.total)
            enc.copyBufferToBuffer(
              this.staging,
              0,
              b,
              0,
              this.manager.total * 64,
            );
        this.device.queue.submit([enc.finish()]);
        this.device.queue.writeBuffer(this.meta, 0, packed.meta);
        this.device.queue.writeBuffer(this.adjacency, 0, packed.adjacency);
        for (const slot of result.newborn) {
          const child = this.manager.individuals.get(slot)!;
          for (const b of this.state)
            this.device.queue.writeBuffer(
              b,
              child.offset * 64,
              this.manager.voxelData(child),
            );
        }
        this.device.queue.writeBuffer(this.creatures, 0, cs);
      }
    }
    return metric;
  }
  async readVoxels() {
    const bytes = this.manager.total * 64;
    if (!bytes) return new Float32Array();
    const b = buffer(
      this.device,
      'Validation voxel readback',
      bytes,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    const e = this.device.createCommandEncoder();
    e.copyBufferToBuffer(this.state[this.voxelIndex], 0, b, 0, bytes);
    this.device.queue.submit([e.finish()]);
    await b.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(b.getMappedRange().slice(0));
    b.unmap();
    b.destroy();
    return values;
  }
  dispose() {
    this.destroyed = true;
    for (const b of [
      ...this.state,
      ...this.field,
      this.meta,
      this.adjacency,
      this.creatures,
      this.act,
      this.heads,
      this.next,
      this.deposits,
      this.uniform,
      this.staging,
      this.readback,
    ])
      b.destroy();
  }
}
