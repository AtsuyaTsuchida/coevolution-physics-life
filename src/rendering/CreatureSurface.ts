import type { Simulation } from '../core/Simulation';
import { buffer, shader } from '../core/GPUContext';
import { createSurface, type SurfaceMesh } from './SurfaceMesh';
import code from '../shaders/skin.wgsl?raw';

/** One indexed mesh batch, skinned on the GPU from the existing physical state. */
export class CreatureSurface {
  vertices: GPUBuffer;
  deformed: GPUBuffer;
  normalLinks: GPUBuffer;
  indices: GPUBuffer;
  vertexCount = 0;
  indexCount = 0;
  revision = '';
  cache = new Map<number, SurfaceMesh>();
  pipeline?: GPUComputePipeline;
  groups: GPUBindGroup[] = [];
  constructor(public device: GPUDevice) {
    this.vertices = buffer(device, 'Surface skin metadata', 96);
    this.deformed = buffer(device, 'Deformed surface', 32);
    this.normalLinks = buffer(device, 'Surface normal adjacency', 16);
    this.indices = buffer(
      device,
      'Surface triangles',
      16,
      GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    );
  }
  async initialize(sim: Simulation) {
    this.pipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      label: 'Surface mesh skinning',
      compute: {
        module: await shader(this.device, 'Surface mesh skinning', code),
        entryPoint: 'main',
      },
    });
    this.rebuild(sim);
  }
  rebuild(sim: Simulation) {
    const m = sim.manager;
    const revision = `${m.births}:${m.deaths}:${m.individuals.size}`;
    if (revision === this.revision) return false;
    this.revision = revision;
    let vertexCount = 0,
      indexCount = 0,
      linkCount = 0;
    const active = new Set<number>();
    for (const c of m.individuals.values()) {
      active.add(c.genome.id);
      let surface = this.cache.get(c.genome.id);
      if (!surface) {
        surface = createSurface(c.phenotype);
        this.cache.set(c.genome.id, surface);
      }
      vertexCount += surface.positions.length / 3;
      indexCount += surface.indices.length;
      linkCount += surface.normalLinks.length;
    }
    for (const id of this.cache.keys())
      if (!active.has(id)) this.cache.delete(id);
    const packed = new ArrayBuffer(Math.max(96, vertexCount * 96)),
      floats = new Float32Array(packed),
      integers = new Uint32Array(packed),
      links = new Uint32Array(Math.max(4, linkCount)),
      indices = new Uint32Array(Math.max(4, indexCount));
    let vo = 0,
      io = 0,
      lo = 0;
    for (const c of m.individuals.values()) {
      const s = this.cache.get(c.genome.id)!;
      const count = s.positions.length / 3;
      for (let v = 0; v < count; v++) {
        const k = (vo + v) * 24;
        integers.set(s.bones.subarray(v * 8, v * 8 + 8), k);
        floats.set(s.weights.subarray(v * 8, v * 8 + 8), k + 8);
        floats.set(s.residuals.subarray(v * 3, v * 3 + 3), k + 16);
        integers.set(
          [c.slot, lo + s.normalRanges[v * 2], s.normalRanges[v * 2 + 1], 0],
          k + 20,
        );
      }
      for (let i = 0; i < s.indices.length; i++)
        indices[io + i] = s.indices[i] + vo;
      for (let i = 0; i < s.normalLinks.length; i++)
        links[lo + i] = s.normalLinks[i] + vo;
      vo += count;
      io += s.indices.length;
      lo += s.normalLinks.length;
    }
    for (const b of [
      this.vertices,
      this.deformed,
      this.normalLinks,
      this.indices,
    ])
      b.destroy();
    this.vertexCount = vertexCount;
    this.indexCount = indexCount;
    this.vertices = buffer(
      this.device,
      'Surface skin metadata',
      packed.byteLength,
    );
    this.deformed = buffer(
      this.device,
      'Deformed surface',
      Math.max(32, vertexCount * 32),
    );
    this.normalLinks = buffer(
      this.device,
      'Surface normal adjacency',
      links.byteLength,
    );
    this.indices = buffer(
      this.device,
      'Surface triangles',
      indices.byteLength,
      GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    );
    this.device.queue.writeBuffer(this.vertices, 0, packed);
    this.device.queue.writeBuffer(this.normalLinks, 0, links);
    this.device.queue.writeBuffer(this.indices, 0, indices);
    this.groups = [0, 1].map((i) =>
      this.device.createBindGroup({
        layout: this.pipeline!.getBindGroupLayout(0),
        entries: [
          sim.state[i],
          sim.meta,
          sim.creatures,
          this.vertices,
          this.deformed,
        ].map((buffer, binding) => ({ binding, resource: { buffer } })),
      }),
    );
    return true;
  }
  deform(encoder: GPUCommandEncoder, stateIndex: number) {
    if (!this.vertexCount || !this.pipeline) return;
    const pass = encoder.beginComputePass({
      label: 'Skin continuous creature surfaces',
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.groups[stateIndex]);
    pass.dispatchWorkgroups(Math.ceil(this.vertexCount / 128));
    pass.end();
  }
  dispose() {
    for (const b of [
      this.vertices,
      this.deformed,
      this.normalLinks,
      this.indices,
    ])
      b.destroy();
    this.cache.clear();
  }
}
