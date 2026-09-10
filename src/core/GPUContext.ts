/// <reference types="@webgpu/types" />
export async function createGPU() {
  if (!navigator.gpu)
    throw new Error(
      'WebGPU is unavailable. Open this experiment in a WebGPU-enabled browser using HTTPS or localhost.',
    );
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter)
    throw new Error(
      'No WebGPU adapter is available. Hardware acceleration is required.',
    );
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: Math.min(
        12,
        adapter.limits.maxStorageBuffersPerShaderStage,
      ),
    },
  });
  return { adapter, device };
}
export function buffer(
  device: GPUDevice,
  label: string,
  size: number,
  usage = GPUBufferUsage.STORAGE |
    GPUBufferUsage.COPY_DST |
    GPUBufferUsage.COPY_SRC,
) {
  return device.createBuffer({
    label,
    size: Math.max(16, Math.ceil(size / 4) * 4),
    usage,
  });
}
export async function shader(device: GPUDevice, label: string, code: string) {
  const shaderModule = device.createShaderModule({ label, code });
  const info = await shaderModule.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length)
    throw new Error(
      `${label}: ${errors.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n')}`,
    );
  return shaderModule;
}
