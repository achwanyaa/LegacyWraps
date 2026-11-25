import { SPINS } from '../../shared/spins.js';
import { TINT, WHEELS } from '../../shared/catalog.js';
import { ENVS } from '../lib/envs';
import { paintFor, type ZonePaint } from './finish';
import type { BuildConfig, EnvName, Film, Finish } from '../lib/types';

/**
 * Spin view: the car is a set of pre-rendered angles (see render/scene.py), each split into a colour "base" image and a
 * grey atlas of light and mask layers. A fragment shader rebuilds any film on top of them, so there is no 3D engine to
 * download and nothing heavy for the phone to draw.
 */
export type SpinView = 'hero' | 'front' | 'side' | 'rear' | 'top';
export interface StageStatus {
  loading: boolean;
  progress: number;
  error?: string;
  missing?: boolean;
}
interface SpinInfo {
  path: string;
  frames: number;
  top: boolean;
  sizes: number[];
  aspect: number;
  tiles: string[];
  cols: number;
  scale: { diffuse: number; coat: number; mirror: number };
  zones: string[];
}
const info = (id: string) => (SPINS as Record<string, SpinInfo>)[id];
export const hasSpin = (id: string) => !!info(id);
export const spinZones = (id: string) => info(id)?.zones || [];

const WRAP = ['paint', 'hood', 'roof', 'rims', 'trim'] as const;
const VIEW_ANGLE: Record<Exclude<SpinView, 'top'>, number> = { hero: 49, front: 0, side: 90, rear: 137 };
const GRADE: Record<EnvName, [number, number, number]> = { studio: [1, 1, 1], dusk: [1.06, 0.9, 0.76], night: [0.46, 0.52, 0.7] };

const VERT = `#version 300 es
in vec2 aPos; uniform vec2 uRect; out vec2 vUv;
void main() { vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); gl_Position = vec4(aPos * uRect, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uBase, uLayers;
uniform vec2 uGrid, uPad;
uniform vec3 uScale, uGrade;
uniform float uLod, uGlass;
uniform vec3 uColor[5], uColor2[5];
uniform vec4 uMix[5];
uniform float uShift[5];
float tile(int i, float lod) {
  vec2 cell = vec2(mod(float(i), uGrid.x), floor(float(i) / uGrid.x));
  return textureLod(uLayers, (cell + clamp(vUv, uPad, 1.0 - uPad)) / uGrid, lod).r;
}
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 neutral(vec3 c) { // Khronos PBR Neutral: keeps film colours true
  float x = min(c.r, min(c.g, c.b));
  c -= x < 0.08 ? x - 6.25 * x * x : 0.04;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float np = 1.0 - 0.0576 / (peak + 0.24 - 0.76);
  c *= np / peak;
  return mix(c, vec3(np), 1.0 - 1.0 / (0.15 * (peak - np) + 1.0));
}
void main() {
  vec4 b = textureLod(uBase, vUv, uLod);
  vec3 lin = toLinear(b.rgb) * mix(1.0, uGlass, tile(9, uLod));
  float facing = tile(3, uLod);
  float d = tile(0, uLod); d = d * d * uScale.x;
  for (int z = 0; z < 5; z++) {
    float m = tile(4 + z, uLod);
    if (m < 0.003) continue;
    float lod = uLod + uMix[z].w;
    float c = tile(1, lod); c = c * c * uScale.y;
    float r = tile(2, lod); r = r * r * uScale.z;
    vec3 col = mix(uColor[z], uColor2[z], uShift[z] * smoothstep(0.08, 0.75, facing));
    lin += m * (col * d * uMix[z].x + vec3(c) * uMix[z].y + col * r * uMix[z].z);
  }
  o = vec4(toSrgb(neutral(lin * uGrade)) * b.a, b.a);
}`;

interface Frame {
  base: WebGLTexture;
  layers: WebGLTexture;
  width: number;
}

export class SpinStage {
  onStatus?: (s: StageStatus) => void;
  films: Record<string, Film> = {};
  config?: BuildConfig;
  frame = 0;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private id: string | null = null;
  private spin?: SpinInfo;
  private token = 0;
  private low = new Map<number, Frame>();
  private high = new Map<number, Frame>();
  private pending = new Set<string>();
  private loading = false;
  private dirty = false;
  private raf = 0;
  private settle = 0;
  private stepper = 0;
  private spinner = 0;
  private ro?: ResizeObserver;
  private drag: { x: number; rem: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(public canvas: HTMLCanvasElement, private opts: { interactive?: boolean; manual?: boolean } = {}) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: !!opts.manual });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = (this.prog = gl.createProgram()!);
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    gl.useProgram(p);
    for (const n of ['uRect', 'uBase', 'uLayers', 'uGrid', 'uPad', 'uScale', 'uGrade', 'uLod', 'uGlass', 'uColor', 'uColor2', 'uMix', 'uShift']) this.u[n] = gl.getUniformLocation(p, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(this.u.uBase, 0);
    gl.uniform1i(this.u.uLayers, 1);
    gl.clearColor(0, 0, 0, 0);

    if (!opts.manual) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas.parentElement!);
      this.resize();
    }
    if (opts.interactive) this.bindDrag();
  }

  setFilms(list: Film[]) {
    this.films = Object.fromEntries(list.map((f) => [f.id, f]));
    this.invalidate();
  }

  setConfig(cfg: BuildConfig) {
    this.config = cfg;
    if (cfg.model !== this.id) this.loadCar(cfg.model);
    else this.invalidate();
  }

  // ---- loading -------------------------------------------------------------------------------------------------

  private async loadCar(id: string) {
    const token = ++this.token;
    this.id = id;
    this.spin = info(id);
    this.dropAll();
    if (!this.spin) {
      this.loading = false;
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.onStatus?.({ loading: false, progress: 0, missing: true });
      return;
    }
    this.loading = true;
    this.onStatus?.({ loading: true, progress: 0 });
    if (this.frame > this.spin.frames - (this.spin.top ? 0 : 1)) this.frame = this.viewFrame('hero');
    try {
      await this.fetchFrame(this.frame, this.spin.sizes[0], token);
      if (token !== this.token) return;
      this.loading = false;
      this.onStatus?.({ loading: false, progress: 1 });
      this.invalidate();
      this.sharpen();
      // The rest of the spin set, nearest angles first, a few at a time.
      const n = this.spin.frames;
      const order = [...Array(n + (this.spin.top ? 1 : 0)).keys()]
        .filter((f) => f !== this.frame)
        .sort((a, b) => this.distance(a) - this.distance(b));
      const work = async () => {
        for (let f = order.shift(); f !== undefined && token === this.token; f = order.shift()) await this.fetchFrame(f, this.spin!.sizes[0], token).catch(() => {});
      };
      await Promise.all([work(), work(), work()]);
    } catch (e) {
      if (token !== this.token) return;
      this.loading = false;
      this.onStatus?.({ loading: false, progress: 0, error: (e as Error).message || 'Could not load this car' });
    }
  }

  private distance(f: number) {
    const n = this.spin!.frames;
    if (f >= n || this.frame >= n) return f === this.frame ? 0 : n; // the top view sits outside the ring
    const d = Math.abs(f - this.frame);
    return Math.min(d, n - d);
  }

  private image(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load this car'));
      img.src = url;
    });
  }

  private async fetchFrame(f: number, size: number, token: number) {
    const store = size === this.spin!.sizes[0] ? this.low : this.high;
    const key = `${size}:${f}`;
    if (store.has(f) || this.pending.has(key)) return;
    this.pending.add(key);
    try {
      const n = String(f).padStart(2, '0');
      const [b, l] = await Promise.all([this.image(`${this.spin!.path}/${size}/b-${n}.webp`), this.image(`${this.spin!.path}/${size}/l-${n}.webp`)]);
      if (token !== this.token) return;
      const gl = this.gl;
      const tex = (img: HTMLImageElement, grey: boolean) => {
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (grey) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      store.set(f, { base: tex(b, false), layers: tex(l, true), width: b.naturalWidth });
      if (store === this.high) {
        // Sharp frames are big: keep only the latest few on the GPU.
        for (const k of [...this.high.keys()].slice(0, -3)) this.drop(this.high, k);
      }
      if (f === this.frame) this.invalidate();
    } finally {
      this.pending.delete(key);
    }
  }

  private drop(store: Map<number, Frame>, f: number) {
    const fr = store.get(f);
    if (!fr) return;
    this.gl.deleteTexture(fr.base);
    this.gl.deleteTexture(fr.layers);
    store.delete(f);
  }

  private dropAll() {
    for (const s of [this.low, this.high]) for (const k of [...s.keys()]) this.drop(s, k);
  }

  /** Once the car stops turning, swap in the sharp image for this angle. */
  private sharpen() {
    clearTimeout(this.settle);
    this.settle = window.setTimeout(() => {
      const s = this.spin;
      if (!s) return;
      const want = Math.min(this.canvas.width, s.sizes[s.sizes.length - 1]) * 0.85;
      const size = s.sizes.find((v) => v >= want) || s.sizes[s.sizes.length - 1];
      if (size !== s.sizes[0]) this.fetchFrame(this.frame, size, this.token).catch(() => {});
    }, 160);
  }

  // ---- angles --------------------------------------------------------------------------------------------------

  viewFrame(v: SpinView) {
    const n = this.spin?.frames || 24;
    if (v === 'top') return this.spin?.top ? n : 0;
    return Math.round((VIEW_ANGLE[v] / 360) * n) % n;
  }

  private show(f: number) {
    if (f === this.frame) return;
    this.frame = f;
    this.invalidate();
    this.sharpen();
  }

  private turn(by: number) {
    const n = this.spin?.frames;
    if (!n) return;
    this.show(this.frame >= n ? this.viewFrame('hero') : (((this.frame + by) % n) + n) % n);
  }

  setView(v: SpinView) {
    clearInterval(this.stepper);
    const n = this.spin?.frames;
    if (!n) return;
    const to = this.viewFrame(v);
    if (to >= n || this.frame >= n) return this.show(to);
    const dir = (to - this.frame + n) % n <= n / 2 ? 1 : -1;
    this.stepper = window.setInterval(() => {
      if (this.frame === to) return clearInterval(this.stepper);
      this.turn(dir);
    }, 34);
  }

  setAutoRotate(on: boolean) {
    clearInterval(this.spinner);
    if (on) this.spinner = window.setInterval(() => !this.drag && this.turn(1), 110);
  }

  private bindDrag() {
    const c = this.canvas;
    c.style.touchAction = 'pan-y';
    c.style.cursor = 'grab';
    const down = (e: PointerEvent) => {
      clearInterval(this.stepper);
      this.drag = { x: e.clientX, rem: 0 };
      c.setPointerCapture(e.pointerId);
      c.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!this.drag || !this.spin) return;
      const perFrame = c.clientWidth / (this.spin.frames * 0.6);
      this.drag.rem += e.clientX - this.drag.x;
      this.drag.x = e.clientX;
      const steps = Math.trunc(this.drag.rem / perFrame);
      if (steps) {
        this.drag.rem -= steps * perFrame;
        this.turn(steps);
      }
    };
    const up = () => {
      this.drag = null;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this.cleanup.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    });
  }

  // ---- drawing -------------------------------------------------------------------------------------------------

  private zonePaints(): ZonePaint[] {
    const cfg = this.config!;
    const stealth = cfg.ppf !== 'none' && cfg.ppfFinish === 'stealth';
    const film = (id: string | null) => paintFor(this.films[id || cfg.zones.body], stealth);
    const wheel = WHEELS.find((w) => w.id === cfg.wheels) || WHEELS[0];
    return [
      film(cfg.zones.body),
      film(cfg.zones.hood),
      film(cfg.zones.roof),
      paintFor({ finish: wheel.finish as Finish, hex: wheel.hex, hex2: null }),
      paintFor(cfg.chromeDelete ? { finish: 'gloss', hex: '#08080a', hex2: null } : { finish: 'chrome', hex: '#e6e8ec', hex2: null }),
    ];
  }

  private invalidate() {
    if (this.opts.manual) return this.draw();
    if (this.dirty) return;
    this.dirty = true;
    this.raf = requestAnimationFrame(() => {
      this.dirty = false;
      this.draw();
    });
  }

  private draw() {
    const { gl, canvas, spin, config } = this;
    const fr = this.high.get(this.frame) || this.low.get(this.frame);
    if (!spin || !config || !fr) return; // keep the previous angle on screen until this one arrives
    const cw = canvas.width;
    const ch = canvas.height;
    gl.viewport(0, 0, cw, ch);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Fit by height; on narrow (portrait) stages let the empty sides crop so the car stays large.
    const ih = 1;
    const iw = spin.aspect;
    const scale = cw / ch >= spin.aspect ? ch / ih : Math.min(ch / ih, cw / (0.62 * iw));
    gl.uniform2f(this.u.uRect, (iw * scale) / cw, (ih * scale) / ch);
    const shown = iw * scale; // on-screen width of the image in pixels
    gl.uniform1f(this.u.uLod, Math.max(0, Math.log2(fr.width / shown)));
    const rows = spin.tiles.length / spin.cols;
    gl.uniform2f(this.u.uGrid, spin.cols, rows);
    gl.uniform2f(this.u.uPad, 0.75 / fr.width, 0.75 / (fr.width / spin.aspect));
    gl.uniform3f(this.u.uScale, spin.scale.diffuse, spin.scale.coat, spin.scale.mirror);
    const e = ENVS[config.env];
    gl.uniform3fv(this.u.uGrade, GRADE[config.env].map((v) => v * e.exposure));
    const tint = (TINT[config.tint] || TINT[0]).opacity;
    gl.uniform1f(this.u.uGlass, Math.max(0.12, 1 - (tint - TINT[0].opacity) * 1.55));
    const z = this.zonePaints();
    gl.uniform3fv(this.u.uColor, z.flatMap((p) => p.color));
    gl.uniform3fv(this.u.uColor2, z.flatMap((p) => p.color2));
    gl.uniform4fv(this.u.uMix, z.flatMap((p) => [p.mix.kd, p.mix.kc, p.mix.km, p.mix.blur]));
    gl.uniform1fv(this.u.uShift, z.map((p) => p.mix.shift));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fr.base);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fr.layers);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  resize() {
    const p = this.canvas.parentElement;
    if (!p || !p.clientWidth || !p.clientHeight) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(p.clientWidth * dpr);
    this.canvas.height = Math.round(p.clientHeight * dpr);
    this.draw();
    this.sharpen();
  }

  /** Resolves once the current angle is on screen at full sharpness (or there is nothing to load). */
  async whenReady() {
    for (let i = 0; i < 600; i++) {
      const s = this.spin;
      if (!s || (!this.loading && !this.pending.size && (this.high.has(this.frame) || s.sizes.length === 1))) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** A still of the current angle, composited onto the environment gradient. */
  snapshot(width = 1280, height = 720, type: 'image/webp' | 'image/jpeg' | 'image/png' = 'image/webp', transparent = false) {
    const { canvas } = this;
    const prev = [canvas.width, canvas.height];
    canvas.width = width;
    canvas.height = height;
    this.draw();
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const g = out.getContext('2d')!;
    if (!transparent && this.config) {
      const e = ENVS[this.config.env];
      const grad = g.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, e.bg[0]);
      grad.addColorStop(1, e.bg[1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, width, height);
    }
    g.drawImage(canvas, 0, 0, width, height);
    const url = out.toDataURL(type, 0.82);
    [canvas.width, canvas.height] = prev;
    this.draw();
    return url;
  }

  dispose() {
    this.token++;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.settle);
    clearInterval(this.stepper);
    clearInterval(this.spinner);
    this.ro?.disconnect();
    this.cleanup.forEach((f) => f());
    this.dropAll();
    this.gl.deleteProgram(this.prog);
  }
}
