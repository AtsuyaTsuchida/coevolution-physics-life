import common from '../shaders/common.wgsl?raw';
import code from '../shaders/terrain.wgsl?raw';
import sample from '../shaders/terrainSample.wgsl?raw';
import { buffer, shader } from '../core/GPUContext';
import type { Simulation } from '../core/Simulation';
export class DeformableGround {
  readonly state: GPUBuffer;
  readonly scratch: GPUBuffer;
  readonly loads: GPUBuffer;
  pipelines: GPUComputePipeline[] = [];
  groups: GPUBindGroup[][] = [];
  constructor(private device: GPUDevice) {
    this.state = buffer(device, 'Deforming ground', 4225 * 16);
    this.scratch = buffer(device, 'Ground next state', 4225 * 16);
    this.loads = buffer(device, 'Ground contact loads', 4225 * 4);
  }
  async initialize(sim: Simulation) {
    const shaderModule = await shader(
      this.device,
      'Deformable ground',
      common + code + sample,
    );
    const types: GPUBufferBindingType[] = [
      'uniform',
      'read-only-storage',
      'storage',
      'storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
    ];
    const layout = this.device.createBindGroupLayout({
      entries: types.map((type, binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type },
      })),
    });
    for (const entryPoint of ['clear', 'deposit', 'update'])
      this.pipelines.push(
        await this.device.createComputePipelineAsync({
          layout: this.device.createPipelineLayout({
            bindGroupLayouts: [layout],
          }),
          compute: { module: shaderModule, entryPoint },
        }),
      );
    this.groups = [0, 1].map((s) =>
      [0, 1].map((f) =>
        this.device.createBindGroup({
          layout,
          entries: [
            sim.uniform,
            this.state,
            this.scratch,
            this.loads,
            sim.state[s],
            sim.meta,
            sim.field[f],
          ].map((buffer, binding) => ({ binding, resource: { buffer } })),
        }),
      ),
    );
  }
  step(e: GPUCommandEncoder, s: Simulation) {
    for (let i = 0; i < 3; i++) {
      const n = i === 1 ? Math.ceil(s.manager.total / 128) : 34;
      if (!n) continue;
      const pass = e.beginComputePass();
      pass.setPipeline(this.pipelines[i]);
      pass.setBindGroup(0, this.groups[s.voxelIndex][s.fieldIndex]);
      pass.dispatchWorkgroups(n);
      pass.end();
    }
    e.copyBufferToBuffer(this.scratch, 0, this.state, 0, 4225 * 16);
  }
  dispose() {
    this.state.destroy();
    this.scratch.destroy();
    this.loads.destroy();
  }
}
