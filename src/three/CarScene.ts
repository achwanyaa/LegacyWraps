import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCar, type CarParts } from './car';
import { filmMaterial, solidMaterial, plateTexture } from './materials';
import { WHEELS, CALIPERS, TINT, modelById } from '../../shared/catalog.js';
import type { BuildConfig, EnvName, Film } from '../lib/types';

export const ENVS: Record<EnvName, { label: string; bg: [string, string]; exposure: number; env: number; key: string; fill: string; rim: [string, string] | null; ink: 'dark' | 'light' }> = {
  studio: { label: 'Studio', bg: ['#f3f1ec', '#d8d5ce'], exposure: 1.0, env: 1.0, key: '#ffffff', fill: '#dfe6ff', rim: null, ink: 'dark' },
  dusk: { label: 'Golden hour', bg: ['#f6c79a', '#7a4b6a'], exposure: 0.95, env: 0.8, key: '#ffb37a', fill: '#7d6bff', rim: ['#ff7a3d', '#6a5cff'], ink: 'dark' },
  night: { label: 'Night garage', bg: ['#16171c', '#050506'], exposure: 0.85, env: 0.45, key: '#c9d6ff', fill: '#2a3550', rim: ['#00e0ff', '#ff2bd6'], ink: 'light' },
};

export type ViewName = 'hero' | 'front' | 'side' | 'rear' | 'top';
const VIEWS: Record<ViewName, [number, number, number]> = {
  hero: [6.4, 2.1, 7.4],
  front: [9.8, 1.5, 2.4],
  side: [0.2, 1.3, 10.4],
  rear: [-7.2, 2.4, 6.6],
  top: [0.01, 11.5, 0.6],
};

interface Opts {
  interactive?: boolean;
  turntable?: boolean;
  manual?: boolean; // no RAF loop; caller renders (offscreen snapshots)
}

export class CarScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 100);
  controls?: OrbitControls;
  car?: CarParts;
  films: Record<string, Film> = {};
  config?: BuildConfig;
  private envName: EnvName = 'studio';
  private matCache = new Map<string, THREE.Material>();
  private base: Record<string, THREE.Material>;
  private lights: { key: THREE.DirectionalLight; hemi: THREE.HemisphereLight; rimA: THREE.SpotLight; rimB: THREE.SpotLight };
  private raf = 0;
  private visible = true;
  private turntable: boolean;
  private tween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private clock = new THREE.Timer();
  private plateText = '';
  private fit = 1;
  private prevFit = 0;
  targetY = 0.55;

  constructor(public canvas: HTMLCanvasElement, private opts: Opts = {}) {
    this.turntable = !!opts.turntable;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.manual });
    const phone = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.manual ? 1 : phone ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25 });
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.5);
    const rimA = new THREE.SpotLight('#00e0ff', 0, 30, 0.6, 0.8);
    rimA.position.set(-6, 3, -5);
    const rimB = new THREE.SpotLight('#ff2bd6', 0, 30, 0.6, 0.8);
    rimB.position.set(6, 3, -5);
    this.scene.add(key, hemi, rimA, rimB, rimA.target, rimB.target);
    this.lights = { key, hemi, rimA, rimB };

    // Ground: real soft shadow + painted contact shadow
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.003;
    blob.name = 'blob';
    this.scene.add(blob);

    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
    this.base = {
      glass: new THREE.MeshPhysicalMaterial({ color: '#0b0d10', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.6, clearcoat: 1, envMapIntensity: 1.6 }),
      interior: std({ color: '#0a0a0b', roughness: 0.9, side: THREE.BackSide }),
      headlight: std({ color: '#ffffff', emissive: '#eaf3ff', emissiveIntensity: 2.2, roughness: 0.2 }),
      taillight: std({ color: '#ff1a2a', emissive: '#ff0018', emissiveIntensity: 1.8, roughness: 0.25 }),
      black: new THREE.MeshPhysicalMaterial({ color: '#08080a', roughness: 0.35, clearcoat: 0.6 }),
      well: std({ color: '#050505', roughness: 1 }),
      tire: std({ color: '#141415', roughness: 0.92, side: THREE.DoubleSide }),
      disc: std({ color: '#8a8c90', roughness: 0.35, metalness: 0.9 }),
      chrome: new THREE.MeshPhysicalMaterial({ color: '#e6e8ec', roughness: 0.05, metalness: 1 }),
      plate: std({ color: '#ffffff', roughness: 0.5 }),
      plateRear: std({ color: '#ffffff', roughness: 0.5 }),
    };

    this.camera.position.set(...VIEWS.hero);
    if (opts.interactive) {
      const c = new OrbitControls(this.camera, canvas);
      c.target.set(0, 0.55, 0);
      c.enableDamping = true;
      c.dampingFactor = 0.07;
      c.enablePan = false;
      c.minDistance = 6;
      c.maxDistance = 16;
      c.maxPolarAngle = Math.PI * 0.49;
      c.autoRotateSpeed = 0.6;
      c.addEventListener('start', () => (this.tween = null));
      this.controls = c;
    }
    this.camera.lookAt(0, 0.55, 0);
    this.setEnv('studio');

    if (!opts.manual) {
      const parent = canvas.parentElement!;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
      this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
      this.io.observe(canvas);
      this.resize();
      this.loop();
    }
  }

  setFilms(list: Film[]) {
    this.films = Object.fromEntries(list.map((f) => [f.id, f]));
    this.matCache.clear();
    if (this.config) this.apply(this.config, true);
  }

  setConfig(cfg: BuildConfig) {
    this.apply(cfg, false);
  }

  private mat(key: string, make: () => THREE.Material) {
    let m = this.matCache.get(key);
    if (!m) {
      m = make();
      this.matCache.set(key, m);
    }
    return m;
  }

  private apply(cfg: BuildConfig, force: boolean) {
    const prev = this.config;
    this.config = cfg;
    const stealth = cfg.ppf !== 'none' && cfg.ppfFinish === 'stealth';
    const paint = (id: string | null) => {
      const fid = id || cfg.zones.body;
      return this.mat(`film:${fid}:${stealth}`, () => filmMaterial(this.films[fid], { stealth }));
    };
    const wheel = WHEELS.find((w) => w.id === cfg.wheels) || WHEELS[0];
    const cal = CALIPERS.find((c) => c.id === cfg.calipers) || CALIPERS[0];
    const mats: Record<string, THREE.Material> = {
      ...this.base,
      body: paint(cfg.zones.body),
      roof: paint(cfg.zones.roof),
      hood: paint(cfg.zones.hood),
      mirrors: paint(cfg.zones.mirrors),
      rim: this.mat(`wheel:${wheel.id}`, () => solidMaterial(wheel.hex, wheel.finish)),
      barrel: this.mat(`barrel:${wheel.id}`, () => {
        const m = solidMaterial(wheel.hex, wheel.finish) as THREE.MeshPhysicalMaterial;
        m.color.multiplyScalar(0.55);
        return m;
      }),
      caliper: this.mat(`cal:${cal.id}`, () => new THREE.MeshPhysicalMaterial({ color: cal.hex, roughness: 0.3, clearcoat: 1 })),
      trim: cfg.chromeDelete ? this.base.black : this.base.chrome,
      stripe: this.mat(`film:${cfg.stripeFilm}:${stealth}`, () => filmMaterial(this.films[cfg.stripeFilm], { stealth })),
    };

    if (force || !this.car || !prev || prev.model !== cfg.model) {
      if (this.car) {
        this.scene.remove(this.car.group);
        this.car.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      }
      this.car = buildCar(modelById(cfg.model), mats);
      this.scene.add(this.car.group);
      const blob = this.scene.getObjectByName('blob')!;
      blob.scale.set(this.car.params.L * 1.12, 1, this.car.params.W * 2.5);
      const P = this.car.params;
      this.fit = Math.max(P.L / 4.7, P.H / 1.75, 0.9);
      this.targetY = P.H * 0.36;
      if (this.controls) this.controls.target.y = this.targetY;
      if (prev && this.prevFit) this.camera.position.multiplyScalar(this.fit / this.prevFit);
      else this.camera.position.set(...this.view('hero'));
      this.prevFit = this.fit;
      this.camera.lookAt(0, this.targetY, 0);
      this.plateText = '';
    }
    const c = this.car;
    c.paint.body.material = mats.body;
    c.paint.roof.material = mats.roof;
    c.paint.hood.material = mats.hood;
    c.paint.mirrors.forEach((m) => (m.material = mats.mirrors));
    c.rims.forEach((m) => (m.material = mats.rim));
    c.wheels.forEach((g) => g.children[1] && ((g.children[1] as THREE.Mesh).material = mats.barrel));
    c.calipers.forEach((m) => (m.material = mats.caliper));
    c.trim.material = mats.trim;
    c.stripes.single.material = mats.stripe;
    c.stripes.twin.material = mats.stripe;
    c.stripes.single.visible = cfg.stripes === 'single';
    c.stripes.twin.visible = cfg.stripes === 'twin';
    const glass = this.base.glass as THREE.MeshPhysicalMaterial;
    glass.opacity = (TINT[cfg.tint] || TINT[0]).opacity;

    if (this.plateText !== cfg.plate) {
      this.plateText = cfg.plate;
      // Kenyan plates: white at the front, yellow at the rear
      for (const [key, rear] of [['plate', false], ['plateRear', true]] as const) {
        const pm = this.base[key] as THREE.MeshStandardMaterial;
        pm.map?.dispose();
        pm.map = plateTexture(cfg.plate, rear);
        pm.needsUpdate = true;
      }
    }
    if (cfg.env !== this.envName) this.setEnv(cfg.env);
  }

  setEnv(name: EnvName) {
    this.envName = name;
    const e = ENVS[name];
    this.renderer.toneMappingExposure = e.exposure;
    this.scene.environmentIntensity = e.env;
    this.lights.key.color.set(e.key);
    this.lights.key.intensity = name === 'night' ? 1.1 : 2.2;
    this.lights.hemi.color.set(e.fill);
    this.lights.hemi.intensity = name === 'night' ? 0.25 : 0.5;
    const rimOn = !!e.rim;
    this.lights.rimA.intensity = rimOn ? 60 : 0;
    this.lights.rimB.intensity = rimOn ? 60 : 0;
    if (e.rim) {
      this.lights.rimA.color.set(e.rim[0]);
      this.lights.rimB.color.set(e.rim[1]);
    }
    const shadow = this.scene.children.find((o) => (o as THREE.Mesh).material instanceof THREE.ShadowMaterial) as THREE.Mesh | undefined;
    if (shadow) (shadow.material as THREE.ShadowMaterial).opacity = name === 'night' ? 0.45 : 0.2;
  }

  view(name: ViewName): [number, number, number] {
    const [x, y, z] = VIEWS[name];
    return [x * this.fit, y * this.fit, z * this.fit];
  }

  setView(name: ViewName) {
    this.tween = { from: this.camera.position.clone(), to: new THREE.Vector3(...this.view(name)), t: 0 };
  }

  setAutoRotate(on: boolean) {
    if (this.controls) this.controls.autoRotate = on;
    else this.turntable = on;
  }

  resize() {
    const p = this.canvas.parentElement;
    if (!p) return;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the car framed on narrow screens
    this.camera.fov = w / h < 1 ? 31 : w / h < 1.4 ? 28 : 26;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.visible || document.hidden) return;
    this.tick(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private tick(dt: number) {
    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.9);
      const k = 1 - Math.pow(1 - this.tween.t, 3);
      // interpolate on a sphere-ish path to avoid cutting through the car
      const a = this.tween.from.clone();
      const b = this.tween.to.clone();
      const len = THREE.MathUtils.lerp(a.length(), b.length(), k);
      this.camera.position.copy(a.normalize().lerp(b.normalize(), k).normalize().multiplyScalar(len));
      if (this.tween.t >= 1) this.tween = null;
      if (!this.controls) this.camera.lookAt(0, this.targetY, 0);
    }
    if (this.controls) this.controls.update(dt);
    else if (this.turntable && this.car) this.car.group.rotation.y += dt * 0.18;
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Render a still of the current car, composited onto the environment gradient. */
  snapshot(width = 1280, height = 720, type: 'image/webp' | 'image/jpeg' | 'image/png' = 'image/webp', transparent = false) {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const prevAspect = this.camera.aspect;
    const prevFov = this.camera.fov;
    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = 26;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const g = out.getContext('2d')!;
    const e = ENVS[this.envName];
    if (!transparent) {
      const grad = g.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, e.bg[0]);
      grad.addColorStop(1, e.bg[1]);
      g.fillStyle = grad;
      g.fillRect(0, 0, width, height);
    }
    g.drawImage(this.renderer.domElement, 0, 0, width, height);
    const url = out.toDataURL(type, 0.82);

    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(size.x, size.y, false);
    this.camera.aspect = prevAspect;
    this.camera.fov = prevFov;
    this.camera.updateProjectionMatrix();
    return url;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.controls?.dispose();
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.matCache.forEach((m) => m.dispose());
    this.renderer.dispose();
  }
}

function contactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(0.45, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ---------- offscreen renders for gallery cards / admin thumbnails ----------
let shared: CarScene | null = null;
const cache = new Map<string, string>();
let queue = Promise.resolve();

export function renderStill(cfg: BuildConfig, films: Film[], view: ViewName = 'hero', w = 960, h = 600): Promise<string> {
  const key = JSON.stringify([cfg, view, w, h, films.length]);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(() => {
    if (!shared) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      shared = new CarScene(canvas, { manual: true });
    }
    if (Object.keys(shared.films).length !== films.length) shared.setFilms(films);
    shared.setConfig(cfg);
    shared.camera.position.set(...shared.view(view));
    shared.camera.lookAt(0, shared.targetY, 0);
    const url = shared.snapshot(w, h, 'image/jpeg');
    cache.set(key, url);
    return url;
  });
  queue = job.then(() => undefined, () => undefined);
  return job;
}
