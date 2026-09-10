export interface Config {
  demoMode: number;
  deformGround: boolean;
  groundStiffness: number;
  seed: number;
  initialCount: number;
  maxCount: number;
  initialVoxels: number;
  iterations: number;
  stability: number;
  actuatorStrength: number;
  speed: number;
  paused: boolean;
  creatureEvolution: boolean;
  physicsEvolution: boolean;
  mutationRate: number;
  addRate: number;
  removeRate: number;
  materialRate: number;
  metabolism: number;
  muscleCost: number;
  reproductionThreshold: number;
  influence: number;
  physicsMutation: number;
  diffusion: number;
  mode: number;
  surfaceMode: number;
  showVoxels: boolean;
  showField: boolean;
  showSensors: boolean;
  showGravity: boolean;
  slice: number;
  sliceAxis: number;
  glyphStep: number;
}
export const defaults: Config = {
  demoMode: 0,
  deformGround: true,
  groundStiffness: 8,
  seed: 2048,
  initialCount: 240,
  maxCount: 480,
  initialVoxels: 36,
  iterations: 6,
  stability: 0.8,
  actuatorStrength: 1,
  speed: 1,
  paused: false,
  creatureEvolution: true,
  physicsEvolution: true,
  mutationRate: 0.08,
  addRate: 0.32,
  removeRate: 0.18,
  materialRate: 0.08,
  metabolism: 0.02,
  muscleCost: 0.025,
  reproductionThreshold: 110,
  influence: 0.3,
  physicsMutation: 0.008,
  diffusion: 0.12,
  mode: 1,
  surfaceMode: 0,
  showVoxels: true,
  showField: false,
  showSensors: true,
  showGravity: false,
  slice: 0.04,
  sliceAxis: 1,
  glyphStep: 4,
};
export const showcaseConfig: Config = {
  ...defaults,
  demoMode: 1,
  mode: 0,
  initialCount: 4,
  maxCount: 4,
  iterations: 40,
  stability: 1,
  actuatorStrength: 1,
  creatureEvolution: false,
  physicsEvolution: false,
  groundStiffness: 24,
};
export const presets = {
  'A · Fixed physics': {
    physicsEvolution: false,
    influence: 0,
    physicsMutation: 0,
    diffusion: 0,
  },
  'B · Slow coevolution': {
    physicsEvolution: true,
    influence: 0.06,
    physicsMutation: 0.002,
    diffusion: 0.06,
  },
  'C · Strong coevolution': {
    physicsEvolution: true,
    influence: 0.3,
    physicsMutation: 0.008,
    diffusion: 0.12,
  },
  'D · Unstable world': {
    physicsEvolution: true,
    influence: 0.4,
    physicsMutation: 0.18,
    diffusion: 0.7,
  },
};
export const FIELD_CELLS = 32 * 16 * 32,
  VOXEL_SIZE = 0.29,
  DT = 1 / 120,
  MAX_BODY = 80;
export const modes = [
  'Creature',
  'Creature Material',
  'Creature Stress',
  'Gravity',
  'Drag',
  'Viscosity',
  'Adhesion',
  'Energy',
  'Physics Diversity',
];
export class RNG {
  constructor(public state: number) {}
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
  signed() {
    return this.next() * 2 - 1;
  }
}
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
