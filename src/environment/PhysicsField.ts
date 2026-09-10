import { RNG, FIELD_CELLS } from '../core/Config';
export function initialField(seed: number) {
  const r = new RNG(seed ^ 0x7133),
    data = new Float32Array(FIELD_CELLS * 12);
  for (let i = 0; i < FIELD_CELLS; i++)
    data.set(
      [
        r.signed() * 0.03,
        -7 + r.signed() * 0.03,
        r.signed() * 0.03,
        0.35 + r.signed() * 0.01,
        0.3 + r.signed() * 0.01,
        0.5 + r.signed() * 0.01,
        1.5,
        2,
        1,
        0,
        0,
        0,
      ],
      i * 12,
    );
  return data;
}
