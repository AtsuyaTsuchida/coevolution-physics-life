import { VOXEL_SIZE } from '../core/Config';
import type { Phenotype } from '../creatures/MorphologyGenerator';

export interface SurfaceMesh {
  positions: Float32Array;
  indices: Uint32Array;
  bones: Uint32Array;
  weights: Float32Array;
  residuals: Float32Array;
  // Each vertex lists the two other vertices of every incident triangle.
  normalLinks: Uint32Array;
  normalRanges: Uint32Array;
}
const corners = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const tetrahedra = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];
const spacing = 0.5,
  threshold = 0.6,
  radius = 1.5;

/** Rest-pose isosurface. Generated only at birth, never from CPU position readback. */
export function createSurface(phenotype: Phenotype): SurfaceMesh {
  const body = phenotype.meta,
    count = body.length / 16;
  const centers = Array.from({ length: count }, (_, i) => [
    body[i * 16] / VOXEL_SIZE,
    body[i * 16 + 1] / VOXEL_SIZE,
    body[i * 16 + 2] / VOXEL_SIZE,
  ]);
  const lower = [0, 1, 2].map(
    (a) =>
      Math.floor((Math.min(...centers.map((c) => c[a])) - radius) / spacing) *
      spacing,
  );
  const dims = [0, 1, 2].map(
    (a) =>
      Math.ceil(
        (Math.max(...centers.map((c) => c[a])) + radius - lower[a]) / spacing,
      ) + 1,
  );
  const [nx, ny, nz] = dims,
    density = new Float32Array(nx * ny * nz);
  const gridIndex = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  for (const center of centers) {
    const lo = center.map((v, a) =>
      Math.max(0, Math.ceil((v - radius - lower[a]) / spacing)),
    );
    const hi = center.map((v, a) =>
      Math.min(dims[a] - 1, Math.floor((v + radius - lower[a]) / spacing)),
    );
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const d2 =
            (lower[0] + x * spacing - center[0]) ** 2 +
            (lower[1] + y * spacing - center[1]) ** 2 +
            (lower[2] + z * spacing - center[2]) ** 2;
          if (d2 <= radius * radius)
            density[gridIndex(x, y, z)] += Math.exp(-d2 / 0.37);
        }
  }
  const points: number[] = [],
    triangles: number[] = [],
    edgeVertices = new Map<string, number>();
  const gridPosition = (i: number) => [
    lower[0] + (i % nx) * spacing,
    lower[1] + (Math.floor(i / nx) % ny) * spacing,
    lower[2] + Math.floor(i / (nx * ny)) * spacing,
  ];
  const intersect = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const existing = edgeVertices.get(key);
    if (existing !== undefined) return existing;
    const p = gridPosition(a),
      q = gridPosition(b),
      t = (threshold - density[a]) / (density[b] - density[a]);
    const index = points.length / 3;
    points.push(...p.map((v, i) => (v + (q[i] - v) * t) * VOXEL_SIZE));
    edgeVertices.set(key, index);
    return index;
  };
  const emit = (a: number, b: number, c: number, outward: number[]) => {
    const ab = [0, 1, 2].map((k) => points[b * 3 + k] - points[a * 3 + k]);
    const ac = [0, 1, 2].map((k) => points[c * 3 + k] - points[a * 3 + k]);
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    if (Math.hypot(...n) < 1e-12) return;
    if (n.reduce((s, v, k) => s + v * outward[k], 0) < 0)
      triangles.push(a, c, b);
    else triangles.push(a, b, c);
  };
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const ids = corners.map((c) => gridIndex(x + c[0], y + c[1], z + c[2]));
        if (
          ids.every((i) => density[i] < threshold) ||
          ids.every((i) => density[i] >= threshold)
        )
          continue;
        for (const tetra of tetrahedra) {
          const inside = tetra
            .map((i) => ids[i])
            .filter((i) => density[i] >= threshold);
          const outside = tetra
            .map((i) => ids[i])
            .filter((i) => density[i] < threshold);
          if (!inside.length || !outside.length) continue;
          const outward = [0, 1, 2].map(
            (k) =>
              outside.reduce(
                (s, i) => s + gridPosition(i)[k] / outside.length,
                0,
              ) -
              inside.reduce(
                (s, i) => s + gridPosition(i)[k] / inside.length,
                0,
              ),
          );
          if (inside.length === 1)
            emit(
              intersect(inside[0], outside[0]),
              intersect(inside[0], outside[1]),
              intersect(inside[0], outside[2]),
              outward,
            );
          else if (inside.length === 3)
            emit(
              intersect(outside[0], inside[0]),
              intersect(outside[0], inside[1]),
              intersect(outside[0], inside[2]),
              outward,
            );
          else {
            const a = intersect(inside[0], outside[0]),
              b = intersect(inside[0], outside[1]),
              c = intersect(inside[1], outside[0]),
              d = intersect(inside[1], outside[1]);
            emit(a, b, c, outward);
            emit(b, d, c, outward);
          }
        }
      }
  // Relax the tetrahedral sampling pattern without subdividing or changing topology.
  const surfaceNeighbors = Array.from(
    { length: points.length / 3 },
    () => new Set<number>(),
  );
  for (let i = 0; i < triangles.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = triangles[i + k],
        b = triangles[i + ((k + 1) % 3)];
      surfaceNeighbors[a].add(b);
      surfaceNeighbors[b].add(a);
    }
  for (const strength of [0.38, -0.4, 0.38, -0.4]) {
    const previous = points.slice();
    surfaceNeighbors.forEach((neighbors, v) => {
      if (!neighbors.size) return;
      for (let a = 0; a < 3; a++) {
        let average = 0;
        for (const n of neighbors)
          average += previous[n * 3 + a] / neighbors.size;
        points[v * 3 + a] =
          previous[v * 3 + a] + strength * (average - previous[v * 3 + a]);
      }
    });
  }
  const vertexCount = points.length / 3,
    bones = new Uint32Array(vertexCount * 8),
    weights = new Float32Array(vertexCount * 8),
    residuals = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v++) {
    const p = points.slice(v * 3, v * 3 + 3).map((x) => x / VOXEL_SIZE);
    const nearest = centers
      .map((c, i) => ({ i, d: c.reduce((s, x, a) => s + (x - p[a]) ** 2, 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
    const base = nearest.map((n) => 1 / (0.12 + n.d) ** 2),
      sum = base.reduce((s, w) => s + w, 0);
    const centroid = [0, 1, 2].map((a) =>
      nearest.reduce((s, n, i) => s + (base[i] / sum) * centers[n.i][a], 0),
    );
    const covariance = Array.from({ length: 9 }, () => 0);
    nearest.forEach((n, i) => {
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          covariance[a * 3 + b] +=
            (base[i] / sum) *
            (centers[n.i][a] - centroid[a]) *
            (centers[n.i][b] - centroid[b]);
    });
    // Regularized moving least-squares coordinates allow rotations and stretch,
    // unlike independent spheres or rigid cubes attached to each voxel.
    for (let a = 0; a < 3; a++) covariance[a * 3 + a] += 0.0001;
    const [a, b, c, d, e, f, g, h, i] = covariance;
    const determinant =
      a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    const inverse = [
      e * i - f * h,
      c * h - b * i,
      b * f - c * e,
      f * g - d * i,
      a * i - c * g,
      c * d - a * f,
      d * h - e * g,
      b * g - a * h,
      a * e - b * d,
    ].map((x) => x / determinant);
    const delta = p.map((x, k) => x - centroid[k]);
    const q = [0, 1, 2].map((row) =>
      inverse
        .slice(row * 3, row * 3 + 3)
        .reduce((s, x, k) => s + x * delta[k], 0),
    );
    nearest.forEach((n, k) => {
      bones[v * 8 + k] = n.i;
      weights[v * 8 + k] =
        (base[k] / sum) *
        (1 + q.reduce((s, x, j) => s + x * (centers[n.i][j] - centroid[j]), 0));
    });
    for (let k = nearest.length; k < 8; k++) bones[v * 8 + k] = nearest[0].i;
    for (let axis = 0; axis < 3; axis++)
      residuals[v * 3 + axis] =
        points[v * 3 + axis] -
        nearest.reduce(
          (s, n, k) => s + weights[v * 8 + k] * body[n.i * 16 + axis],
          0,
        );
  }
  const linked = Array.from({ length: vertexCount }, () => [] as number[]);
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3);
    linked[a].push(b, c);
    linked[b].push(c, a);
    linked[c].push(a, b);
  }
  const normalRanges = new Uint32Array(vertexCount * 2),
    normalLinks = new Uint32Array(triangles.length * 2);
  let offset = 0;
  linked.forEach((list, i) => {
    normalRanges.set([offset, list.length / 2], i * 2);
    normalLinks.set(list, offset);
    offset += list.length;
  });
  return {
    positions: new Float32Array(points),
    indices: new Uint32Array(triangles),
    bones,
    weights,
    residuals,
    normalLinks,
    normalRanges,
  };
}
