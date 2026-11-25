import type { Film, Finish } from '../lib/types';

/**
 * How a film finish is rebuilt from the rendered layers:
 * colour x diffuse light x kd  +  clearcoat reflection x kc  +  colour x mirror reflection x km.
 * blur softens the reflections (mip level) for satin and matte. Tuned to agree with src/three/materials.ts.
 */
export interface FinishMix {
  kd: number;
  kc: number;
  km: number;
  blur: number;
  shift: number;
}

const MIX: Record<Finish, FinishMix> = {
  gloss: { kd: 1, kc: 1, km: 0, blur: 0, shift: 0 },
  satin: { kd: 1, kc: 0.3, km: 0.05, blur: 3.5, shift: 0 },
  matte: { kd: 1, kc: 0.07, km: 0, blur: 5, shift: 0 },
  metallic: { kd: 0.5, kc: 1, km: 0.45, blur: 1.5, shift: 0 },
  chrome: { kd: 0, kc: 0.15, km: 1, blur: 0, shift: 0 },
  carbon: { kd: 1, kc: 1, km: 0.05, blur: 0, shift: 0 },
  shift: { kd: 0.5, kc: 1, km: 0.45, blur: 1, shift: 1 },
};

export interface ZonePaint {
  color: [number, number, number]; // linear
  color2: [number, number, number];
  mix: FinishMix;
}

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export function hexLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
}

export function paintFor(film: Pick<Film, 'finish' | 'hex' | 'hex2'> | undefined, stealth = false): ZonePaint {
  const finish = film?.finish || 'gloss';
  let mix = MIX[finish] || MIX.gloss;
  // Matte PPF over the top kills the sharp reflections.
  if (stealth && finish !== 'chrome') mix = { ...mix, kc: Math.min(mix.kc, 0.12), km: mix.km * 0.6, blur: Math.max(mix.blur, 4.5) };
  const hex = finish === 'carbon' ? '#1b1b1e' : film?.hex || '#888888';
  return { color: hexLinear(hex), color2: hexLinear(film?.hex2 || hex), mix };
}
