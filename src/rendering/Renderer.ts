import {
  BoxGeometry,
  PerspectiveCamera,
  Vector3,
  WebGPUCoordinateSystem,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import groundSample from '../shaders/terrainSample.wgsl?raw';
import code from '../shaders/render.wgsl?raw';
import { buffer, shader } from '../core/GPUContext';
import { CreatureSurface } from './CreatureSurface';
import type { Simulation } from '../core/Simulation';
export class Renderer {
  context: GPUCanvasContext;
  camera: PerspectiveCamera;
  orbit: OrbitControls;
  depth?: GPUTexture;
  uniform: GPUBuffer;
  vertices: GPUBuffer;
  count: number;
  pipelines: Record<string, GPURenderPipeline> = {};
  groups: GPUBindGroup[][] = [];
  format: GPUTextureFormat;
  observer: ResizeObserver;
  sim?: Simulation;
  surface: CreatureSurface;
  focusedSlot = -1;
  constructor(
    public device: GPUDevice,
    public canvas: HTMLCanvasElement,
  ) {
    this.surface = new CreatureSurface(device);
    this.context = canvas.getContext('webgpu')!;
    if (!this.context) throw new Error('WebGPU canvas initialization failed.');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.format,
      alphaMode: 'opaque',
    });
    this.camera = new PerspectiveCamera(51, 1, 0.1, 200);
    this.camera.coordinateSystem = WebGPUCoordinateSystem;
    this.camera.position.set(25, 24, 30);
    this.camera.lookAt(new Vector3(0, 1, 0));
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.target.set(0, 1, 0);
    this.orbit.minDistance = 3;
    this.orbit.maxDistance = 85;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.orbit.enableDamping = true;
    this.uniform = buffer(
      device,
      'Camera',
      112,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    const geometry = new BoxGeometry(1, 1, 1).toNonIndexed();
    const p = geometry.getAttribute('position'),
      n = geometry.getAttribute('normal');
    this.count = p.count;
    const data = new Float32Array(p.count * 6);
    for (let i = 0; i < p.count; i++)
      data.set(
        [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)],
        i * 6,
      );
    this.vertices = buffer(
      device,
      'Unit cube',
      data.byteLength,
      GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
    device.queue.writeBuffer(this.vertices, 0, data);
    geometry.dispose();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect(),
      dpr = Math.min(2, window.devicePixelRatio);
    const width = Math.max(1, Math.floor(r.width * dpr)),
      height = Math.max(1, Math.floor(r.height * dpr));
    if (
      this.canvas.width === width &&
      this.canvas.height === height &&
      this.depth
    )
      return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.depth?.destroy();
    this.depth = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  async initialize(sim: Simulation) {
    await this.surface.initialize(sim);
    const shaderModule = await shader(
      this.device,
      'GPU instanced voxel renderer',
      code + groundSample,
    );
    const layout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        ...[1, 2, 3, 4, 5, 6, 7].map((binding) => ({
          binding,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        })),
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [layout],
    });
    for (const name of ['voxel', 'mesh', 'ground', 'slice', 'arrow'])
      this.pipelines[name] = await this.device.createRenderPipelineAsync({
        label: name,
        layout: pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: name === 'voxel' ? 'voxelVs' : name + 'Vs',
          buffers:
            name === 'voxel'
              ? [
                  {
                    arrayStride: 24,
                    attributes: [
                      { shaderLocation: 0, offset: 0, format: 'float32x3' },
                      { shaderLocation: 1, offset: 12, format: 'float32x3' },
                    ],
                  },
                ]
              : [],
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs',
          targets: [
            {
              format: this.format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        primitive: {
          topology: name === 'arrow' ? 'line-list' : 'triangle-list',
          cullMode: 'none',
        },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: name !== 'slice',
          depthCompare: 'less-equal',
        },
      });
    this.attach(sim, layout);
  }
  attach(sim: Simulation, layout = this.pipelines.voxel.getBindGroupLayout(0)) {
    this.sim = sim;
    this.groups = [0, 1].map((s) =>
      [0, 1].map((f) =>
        this.device.createBindGroup({
          layout,
          entries: [
            this.uniform,
            sim.state[s],
            sim.meta,
            sim.field[f],
            this.surface.vertices,
            this.surface.deformed,
            this.surface.normalLinks,
            sim.ground.state,
          ].map((buffer, binding) => ({ binding, resource: { buffer } })),
        }),
      ),
    );
  }
  render() {
    const s = this.sim;
    if (!s || !this.depth) return;
    if (this.surface.rebuild(s)) this.attach(s);
    if (this.focusedSlot >= 0) {
      if (!s.manager.individuals.has(this.focusedSlot)) this.worldView();
      else if (s.lastSnapshot) {
        const k = this.focusedSlot * 32;
        const target = new Vector3(
          s.lastSnapshot[k + 16],
          s.lastSnapshot[k + 17],
          s.lastSnapshot[k + 18],
        );
        this.camera.position.add(target.clone().sub(this.orbit.target));
        this.orbit.target.copy(target);
      }
    }
    this.orbit.update();
    this.camera.updateMatrixWorld();
    const vp = this.camera.projectionMatrix
      .clone()
      .multiply(this.camera.matrixWorldInverse);
    const c = s.config;
    const data = new Float32Array([
      ...vp.elements,
      ...this.camera.position.toArray(),
      0,
      c.mode,
      +c.showSensors,
      c.slice,
      c.sliceAxis,
      +c.showField,
      +c.showGravity,
      c.glyphStep,
      this.focusedSlot + 1,
    ]);
    this.device.queue.writeBuffer(this.uniform, 0, data);
    const e = this.device.createCommandEncoder();
    if (c.surfaceMode === 0 && c.showVoxels)
      this.surface.deform(e, s.voxelIndex);
    const pass = e.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.055, g: 0.102, b: 0.13, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      },
    });
    pass.setBindGroup(0, this.groups[s.voxelIndex][s.fieldIndex]);
    pass.setPipeline(this.pipelines.ground);
    pass.draw(64 * 64 * 6);
    if (c.showVoxels) {
      if (c.surfaceMode === 0) {
        pass.setPipeline(this.pipelines.mesh);
        pass.setIndexBuffer(this.surface.indices, 'uint32');
        pass.drawIndexed(this.surface.indexCount);
      } else {
        pass.setPipeline(this.pipelines.voxel);
        pass.setVertexBuffer(0, this.vertices);
        pass.draw(this.count, s.manager.total);
      }
    }
    if (c.showField && this.focusedSlot < 0) {
      pass.setPipeline(this.pipelines.slice);
      pass.draw(6);
    }
    if (c.showGravity && this.focusedSlot < 0) {
      pass.setPipeline(this.pipelines.arrow);
      pass.draw(6, Math.ceil(32 / c.glyphStep) ** 2);
    }
    pass.end();
    this.device.queue.submit([e.finish()]);
  }
  inspectCreature() {
    const sim = this.sim;
    if (!sim?.lastSnapshot || !sim.manager.individuals.size) return;
    const states = sim.lastSnapshot;
    const organism = [...sim.manager.individuals.values()].sort(
      (a, b) =>
        Math.hypot(states[a.slot * 32 + 16], states[a.slot * 32 + 18]) -
        Math.hypot(states[b.slot * 32 + 16], states[b.slot * 32 + 18]),
    )[0];
    this.focusedSlot = organism.slot;
    const k = organism.slot * 32;
    this.orbit.target.set(states[k + 16], states[k + 17], states[k + 18]);
    this.camera.position.copy(this.orbit.target).add(new Vector3(2.5, 1.7, 3));
    this.orbit.update();
  }
  worldView() {
    this.focusedSlot = -1;
    this.orbit.target.set(0, 1, 0);
    this.camera.position.set(25, 24, 30);
    this.orbit.update();
  }
  dispose() {
    this.observer.disconnect();
    this.orbit.dispose();
    this.depth?.destroy();
    this.uniform.destroy();
    this.vertices.destroy();
    this.surface.dispose();
    this.context.unconfigure();
  }
}
