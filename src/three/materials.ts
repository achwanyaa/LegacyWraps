import * as THREE from 'three';
import type { Film } from '../lib/types';

let carbonTex: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null = null;
function carbon() {
  if (carbonTex) return carbonTex;
  const size = 256;
  const cells = 8;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const b = document.createElement('canvas');
  b.width = b.height = size;
  const gb = b.getContext('2d')!;
  const s = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const vertical = (x + y) % 4 < 2; // 2x2 twill
      const grad = vertical ? g.createLinearGradient(x * s, 0, x * s + s, 0) : g.createLinearGradient(0, y * s, 0, y * s + s);
      grad.addColorStop(0, '#0c0c0d');
      grad.addColorStop(0.5, vertical ? '#3a3a3e' : '#2a2a2d');
      grad.addColorStop(1, '#0c0c0d');
      g.fillStyle = grad;
      g.fillRect(x * s, y * s, s, s);
      const bg = vertical ? gb.createLinearGradient(x * s, 0, x * s + s, 0) : gb.createLinearGradient(0, y * s, 0, y * s + s);
      bg.addColorStop(0, '#000');
      bg.addColorStop(0.5, '#fff');
      bg.addColorStop(1, '#000');
      gb.fillStyle = bg;
      gb.fillRect(x * s, y * s, s, s);
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(b);
  for (const t of [map, bump]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 7);
    t.anisotropy = 8;
  }
  carbonTex = { map, bump };
  return carbonTex;
}

export interface PaintOpts {
  stealth?: boolean; // matte PPF over the top
}

/** Physically-based material that reads like the given film. */
export function filmMaterial(film: Film | undefined, opts: PaintOpts = {}) {
  const hex = film?.hex || '#888888';
  const m = new THREE.MeshPhysicalMaterial({ color: hex, envMapIntensity: 1.1 });
  switch (film?.finish) {
    case 'gloss':
      Object.assign(m, { roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
      break;
    case 'satin':
      Object.assign(m, { roughness: 0.42, metalness: 0.08, clearcoat: 0.35, clearcoatRoughness: 0.38, sheen: 0.4, sheenRoughness: 0.6 });
      m.sheenColor.set('#ffffff');
      break;
    case 'matte':
      Object.assign(m, { roughness: 0.82, metalness: 0, clearcoat: 0 });
      break;
    case 'metallic':
      Object.assign(m, { roughness: 0.32, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.03 });
      break;
    case 'chrome':
      Object.assign(m, { roughness: 0.04, metalness: 1, envMapIntensity: 1.6 });
      break;
    case 'carbon': {
      const t = carbon();
      Object.assign(m, { map: t.map, bumpMap: t.bump, bumpScale: 0.6, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
      m.color.set('#ffffff');
      break;
    }
    case 'shift': {
      Object.assign(m, {
        roughness: 0.22, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.03,
        iridescence: 0.85, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 620,
      });
      const shift = { value: new THREE.Color(film.hex2 || '#ffffff') };
      m.userData.shift = shift;
      m.onBeforeCompile = (shader) => {
        shader.uniforms.shiftColor = shift;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 shiftColor;')
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            float lwFres = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, shiftColor, smoothstep(0.08, 0.75, lwFres));`,
          );
      };
      m.customProgramCacheKey = () => 'lw-shift';
      break;
    }
    default:
      Object.assign(m, { roughness: 0.3, clearcoat: 0.6 });
  }
  if (opts.stealth && film?.finish !== 'chrome') {
    m.roughness = Math.max(m.roughness, 0.7);
    m.clearcoat = 0;
    m.sheen = 0.25;
  }
  return m;
}

export function solidMaterial(hex: string, finish: string) {
  return filmMaterial({ id: 'solid', brand: '', name: '', finish: finish as Film['finish'], hex, hex2: null, price: 0, in_stock: true, featured: false, sort: 0 });
}

export function plateTexture(text: string, rear = false) {
  const c = document.createElement('canvas');
  c.width = 520;
  c.height = 120;
  const g = c.getContext('2d')!;
  g.fillStyle = rear ? '#f5c518' : '#f4f3ee';
  g.fillRect(0, 0, 520, 120);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 508, 108);
  g.fillStyle = '#111';
  g.font = '800 74px "Archivo", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text || 'KDL 254W', 260, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
