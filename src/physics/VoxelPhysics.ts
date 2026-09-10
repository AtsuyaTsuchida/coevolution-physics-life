import common from '../shaders/common.wgsl?raw';
import sensors from '../shaders/sensors.wgsl?raw';
import actuator from '../shaders/actuator.wgsl?raw';
import forces from '../shaders/voxelForces.wgsl?raw';
import constraints from '../shaders/constraints.wgsl?raw';
import grid from '../shaders/spatialGrid.wgsl?raw';
import collision from '../shaders/collision.wgsl?raw';
import energy from '../shaders/energy.wgsl?raw';
import influence from '../shaders/physicsInfluence.wgsl?raw';
import field from '../shaders/physicsField.wgsl?raw';
import { shader } from '../core/GPUContext';
export interface Kernel {
  pipeline: GPUComputePipeline;
  layout: GPUBindGroupLayout;
}
export class VoxelPhysics {
  kernels: Record<string, Kernel> = {};
  constructor(public device: GPUDevice) {}
  async initialize() {
    const specifications: [string, string, GPUBufferBindingType[], string?][] =
      [
        [
          'sensors',
          sensors,
          [
            'uniform',
            'read-only-storage',
            'read-only-storage',
            'storage',
            'read-only-storage',
          ],
        ],
        [
          'actuator',
          actuator,
          ['uniform', 'read-only-storage', 'read-only-storage', 'storage'],
        ],
        [
          'forces',
          forces,
          [
            'uniform',
            'read-only-storage',
            'storage',
            'read-only-storage',
            'read-only-storage',
          ],
        ],
        [
          'constraints',
          constraints,
          [
            'uniform',
            'read-only-storage',
            'storage',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
          ],
        ],
        [
          'clearGrid',
          grid,
          ['uniform', 'read-only-storage', 'storage', 'storage'],
          'clear',
        ],
        [
          'grid',
          grid,
          ['uniform', 'read-only-storage', 'storage', 'storage'],
          'build',
        ],
        [
          'collision',
          collision,
          [
            'uniform',
            'read-only-storage',
            'storage',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
          ],
        ],
        [
          'energy',
          energy,
          [
            'uniform',
            'storage',
            'read-only-storage',
            'storage',
            'read-only-storage',
            'read-only-storage',
          ],
        ],
        [
          'clearInfluence',
          influence,
          [
            'uniform',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'storage',
          ],
          'clear',
        ],
        [
          'influence',
          influence,
          [
            'uniform',
            'read-only-storage',
            'read-only-storage',
            'read-only-storage',
            'storage',
          ],
        ],
        [
          'field',
          field,
          ['uniform', 'read-only-storage', 'storage', 'read-only-storage'],
        ],
      ];
    for (const [name, code, types, entry = 'main'] of specifications) {
      const layout = this.device.createBindGroupLayout({
        label: name,
        entries: types.map((type, binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type },
        })),
      });
      this.kernels[name] = {
        layout,
        pipeline: await this.device.createComputePipelineAsync({
          label: name,
          layout: this.device.createPipelineLayout({
            bindGroupLayouts: [layout],
          }),
          compute: {
            module: await shader(this.device, name, common + code),
            entryPoint: entry,
          },
        }),
      };
    }
  }
  group(name: string, buffers: GPUBuffer[]) {
    return this.device.createBindGroup({
      layout: this.kernels[name].layout,
      entries: buffers.map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
  }
  dispatch(
    encoder: GPUCommandEncoder,
    name: string,
    group: GPUBindGroup,
    workgroups: number,
  ) {
    if (!workgroups) return;
    const pass = encoder.beginComputePass({ label: name });
    pass.setPipeline(this.kernels[name].pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(workgroups);
    pass.end();
  }
}
