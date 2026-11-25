import * as THREE from 'three';

/**
 * A procedural, stylised car. Bodies are lofted from superellipse cross-sections
 * along the length (x = front, y = up, z = side). No external model files needed.
 */

type Pts = [number, number][];

export interface BodyParams {
  L: number; // overall length (m)
  W: number; // half width
  H: number;
  wheelbase: number;
  wheelR: number;
  tireW: number;
  bottom: number;
  noseLift: number;
  tailLift: number;
  top: Pts; // lower-body top line, (u, y metres), u in [-1 rear, 1 front]
  cabin: { from: number; to: number; roof: Pts; width: number; panel: [number, number]; n: number };
  pwFront: number;
  pwRear: number;
  haunch: number;
  n: number; // superellipse exponent for the lower body
  bed: [number, number] | null; // pickup load bed (u range)
  spare: boolean; // tailgate-mounted spare wheel
  head: [number, number]; // headlight band, relative section height
  tail: [number, number];
}

/** Silhouette templates. Heights are fractions of overall vehicle height. */
interface Shape extends Omit<BodyParams, 'L' | 'W' | 'H' | 'wheelbase' | 'wheelR' | 'tireW'> {}
const SHAPES: Record<string, Shape> = {
  sedan: {
    bottom: 0.15, noseLift: 0.08, tailLift: 0.08, pwFront: 2.4, pwRear: 3.6, haunch: 0.025, n: 5.5, bed: null, spare: false, head: [0.42, 0.55], tail: [0.5, 0.62],
    top: [[-1, 0.45], [-0.93, 0.63], [-0.78, 0.665], [-0.5, 0.67], [0.15, 0.655], [0.42, 0.625], [0.75, 0.575], [0.93, 0.5], [1, 0.37]],
    cabin: { from: -0.56, to: 0.38, width: 0.7, n: 4, panel: [-0.32, 0.1],
      roof: [[-0.56, 0.66], [-0.44, 0.79], [-0.3, 0.935], [-0.12, 1], [0.06, 0.99], [0.18, 0.935], [0.28, 0.8], [0.38, 0.65]] },
  },
  wagon: {
    bottom: 0.15, noseLift: 0.08, tailLift: 0.06, pwFront: 2.4, pwRear: 5, haunch: 0.02, n: 5.5, bed: null, spare: false, head: [0.42, 0.55], tail: [0.55, 0.68],
    top: [[-1, 0.47], [-0.95, 0.64], [-0.8, 0.665], [-0.5, 0.67], [0.15, 0.655], [0.42, 0.625], [0.75, 0.575], [0.93, 0.5], [1, 0.37]],
    cabin: { from: -0.9, to: 0.38, width: 0.72, n: 4.5, panel: [-0.76, 0.08],
      roof: [[-0.9, 0.66], [-0.885, 0.85], [-0.8, 0.97], [-0.4, 1], [0.06, 0.99], [0.18, 0.935], [0.28, 0.8], [0.38, 0.65]] },
  },
  suv: {
    bottom: 0.2, noseLift: 0.07, tailLift: 0.06, pwFront: 2.6, pwRear: 4.5, haunch: 0.03, n: 6, bed: null, spare: false, head: [0.45, 0.57], tail: [0.55, 0.67],
    top: [[-1, 0.48], [-0.96, 0.61], [-0.82, 0.64], [0.25, 0.63], [0.5, 0.6], [0.8, 0.57], [0.95, 0.52], [1, 0.41]],
    cabin: { from: -0.88, to: 0.44, width: 0.74, n: 4.5, panel: [-0.74, 0.16],
      roof: [[-0.88, 0.63], [-0.84, 0.82], [-0.76, 0.95], [-0.5, 1], [0, 1], [0.16, 0.975], [0.3, 0.84], [0.44, 0.615]] },
  },
  boxy: {
    bottom: 0.24, noseLift: 0.06, tailLift: 0.05, pwFront: 4, pwRear: 6, haunch: 0.035, n: 7, bed: null, spare: false, head: [0.5, 0.62], tail: [0.45, 0.6],
    top: [[-1, 0.5], [-0.97, 0.62], [-0.9, 0.64], [0.3, 0.635], [0.6, 0.625], [0.9, 0.6], [0.98, 0.55], [1, 0.45]],
    cabin: { from: -0.93, to: 0.36, width: 0.78, n: 5.5, panel: [-0.84, 0.14],
      roof: [[-0.93, 0.63], [-0.92, 0.85], [-0.87, 0.98], [-0.5, 1], [0.1, 1], [0.2, 0.97], [0.29, 0.8], [0.36, 0.63]] },
  },
  pickup: {
    bottom: 0.24, noseLift: 0.06, tailLift: 0.04, pwFront: 3.2, pwRear: 8, haunch: 0.03, n: 7, bed: [-0.95, -0.33], spare: false, head: [0.5, 0.62], tail: [0.5, 0.7],
    top: [[-1, 0.5], [-0.97, 0.58], [-0.9, 0.6], [0, 0.6], [0.4, 0.595], [0.8, 0.565], [0.95, 0.5], [1, 0.42]],
    cabin: { from: -0.3, to: 0.36, width: 0.76, n: 5, panel: [-0.24, 0.12],
      roof: [[-0.3, 0.6], [-0.29, 0.85], [-0.25, 0.98], [0, 1], [0.15, 0.98], [0.26, 0.82], [0.36, 0.6]] },
  },
  suvcoupe: {
    bottom: 0.2, noseLift: 0.07, tailLift: 0.07, pwFront: 2.6, pwRear: 3.8, haunch: 0.035, n: 6, bed: null, spare: false, head: [0.45, 0.57], tail: [0.52, 0.64],
    top: [[-1, 0.5], [-0.95, 0.64], [-0.82, 0.665], [0.25, 0.635], [0.5, 0.6], [0.8, 0.57], [0.95, 0.52], [1, 0.41]],
    cabin: { from: -0.78, to: 0.44, width: 0.72, n: 4.5, panel: [-0.4, 0.14],
      roof: [[-0.78, 0.66], [-0.66, 0.79], [-0.48, 0.92], [-0.22, 0.995], [0.02, 1], [0.16, 0.975], [0.3, 0.84], [0.44, 0.615]] },
  },
  gwagon: {
    bottom: 0.27, noseLift: 0.05, tailLift: 0.03, pwFront: 9, pwRear: 12, haunch: 0.05, n: 11, bed: null, spare: true, head: [0.52, 0.66], tail: [0.4, 0.58],
    top: [[-1, 0.55], [-0.99, 0.62], [-0.97, 0.635], [0.5, 0.635], [0.95, 0.635], [0.99, 0.6], [1, 0.52]],
    cabin: { from: -0.965, to: 0.36, width: 0.86, n: 10, panel: [-0.93, 0.25],
      roof: [[-0.965, 0.63], [-0.96, 0.9], [-0.95, 0.99], [-0.5, 1], [0.2, 1], [0.26, 0.97], [0.31, 0.82], [0.36, 0.63]] },
  },
};

export interface ModelSpec {
  shape: string;
  dims: number[];
  wheel: number;
}

export function resolveBody(m: ModelSpec): BodyParams {
  const S = SHAPES[m.shape] || SHAPES.sedan;
  const [L, Wf, H, wheelbase] = m.dims;
  const sc = (p: Pts): Pts => p.map(([u, y]) => [u, y * H]);
  return {
    ...S,
    L, W: Wf / 2, H, wheelbase,
    wheelR: m.wheel,
    tireW: 0.17 + Wf * 0.045,
    top: sc(S.top),
    cabin: { ...S.cabin, roof: sc(S.cabin.roof) },
  };
}

/** 1D Catmull-Rom through (x, y) control points, clamped at the ends. */
function curve(pts: Pts) {
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    const last = pts.length - 1;
    if (x >= pts[last][0]) return pts[last][1];
    let i = 0;
    while (i < last - 1 && x > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)][1];
    const p1 = pts[i][1];
    const p2 = pts[i + 1][1];
    const p3 = pts[Math.min(last, i + 2)][1];
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
}

interface Section {
  yb: number;
  yt: number;
  w: number;
}
type SectionFn = (x: number) => Section;

const spow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** Point on a superellipse cross-section at angle a (0 = +z side, PI/2 = top). */
function ring(s: Section, a: number, n: number, tumble: number, out: THREE.Vector3, x: number) {
  const yc = (s.yt + s.yb) / 2;
  const h = (s.yt - s.yb) / 2;
  const yr = spow(Math.sin(a), 2 / n);
  const z = s.w * spow(Math.cos(a), 2 / n) * (1 - tumble * Math.max(0, yr) ** 2);
  return out.set(x, yc + h * yr, z);
}

interface LoftOpts {
  n: number;
  tumble: number;
  x0: number;
  x1: number;
  rows: number;
  a0?: number;
  a1?: number;
  segs: number;
  caps?: boolean;
  grow?: number; // push surface outward along normals-ish (scale about section centre)
  cluster?: boolean;
}

function loft(fn: SectionFn, o: LoftOpts) {
  const a0 = o.a0 ?? -Math.PI / 2;
  const a1 = o.a1 ?? (Math.PI * 3) / 2;
  const closed = o.a0 === undefined;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  const cols = o.segs + 1;
  const xs: number[] = [];
  for (let i = 0; i < o.rows; i++) {
    let t = i / (o.rows - 1);
    if (o.cluster) t = 0.5 - 0.5 * Math.cos(Math.PI * t) * 0.35 - (0.5 - t) * 0.65; // mild end clustering
    xs.push(o.x0 + (o.x1 - o.x0) * t);
  }
  for (const x of xs) {
    const s = fn(x);
    const g = o.grow ?? 0;
    const sec = g ? { yb: s.yb - g, yt: s.yt + g, w: s.w + g } : s;
    for (let j = 0; j < cols; j++) {
      const a = a0 + ((a1 - a0) * j) / o.segs;
      ring(sec, a, o.n, o.tumble, v, x);
      pos.push(v.x, v.y, v.z);
      uv.push(x, (j / o.segs) * 4);
    }
  }
  for (let i = 0; i < o.rows - 1; i++) {
    for (let j = 0; j < o.segs; j++) {
      const a = i * cols + j;
      const b = (i + 1) * cols + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  if (closed && o.caps) {
    for (const [row, dir] of [[0, -1], [o.rows - 1, 1]] as const) {
      const s = fn(xs[row]);
      const c = pos.length / 3;
      pos.push(xs[row], (s.yt + s.yb) / 2, 0);
      uv.push(xs[row], 0);
      for (let j = 0; j < o.segs; j++) {
        const p = row * cols + j;
        if (dir < 0) idx.push(c, p, p + 1);
        else idx.push(c, p + 1, p);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** angle on the superellipse for a target relative height in [-1, 1] */
const angleFor = (yr: number, n: number) => Math.asin(spow(yr, n / 2));

export interface CarParts {
  group: THREE.Group;
  paint: { body: THREE.Mesh; roof: THREE.Mesh; hood: THREE.Mesh; mirrors: THREE.Mesh[] };
  glass: THREE.Mesh;
  trim: THREE.Mesh;
  rims: THREE.Mesh[];
  calipers: THREE.Mesh[];
  plates: THREE.Mesh[];
  black: THREE.Mesh[];
  wheels: THREE.Group[];
  stripes: { single: THREE.Mesh; twin: THREE.Mesh };
  params: BodyParams;
}

export function buildCar(model: ModelSpec, mats: Record<string, THREE.Material>): CarParts {
  const P = resolveBody(model);
  const cn = P.cabin.n;
  const half = P.L / 2;
  const topY = curve(P.top);
  const roofY = curve(P.cabin.roof);
  const wheelX = [P.wheelbase / 2, -P.wheelbase / 2];
  const archR = P.wheelR + 0.055;

  const plan = (x: number) => {
    const u = x / half;
    const pw = u > 0 ? P.pwFront : P.pwRear;
    let w = P.W * Math.pow(Math.max(0, 1 - Math.abs(u) ** pw), 1 / pw);
    for (const wx of wheelX) w *= 1 + (wx < 0 ? P.haunch : P.haunch * 0.6) * Math.exp(-(((x - wx) / 0.6) ** 2));
    return Math.max(0.012, w);
  };

  const bodySec: SectionFn = (x) => {
    const u = x / half;
    let yb = P.bottom;
    if (u > 0.78) yb += ((u - 0.78) / 0.22) ** 1.5 * P.noseLift;
    if (u < -0.8) yb += ((-u - 0.8) / 0.2) ** 1.5 * P.tailLift;
    for (const wx of wheelX) {
      const dx = x - wx;
      if (Math.abs(dx) < archR) yb = Math.max(yb, P.wheelR + Math.sqrt(archR * archR - dx * dx) * 0.985 - 0.02);
    }
    const yt = topY(u);
    return { yb: Math.min(yb, yt - 0.06), yt, w: plan(x) };
  };

  const xc0 = P.cabin.from * half;
  const xc1 = P.cabin.to * half;
  const cabinSec: SectionFn = (x) => {
    const u = x / half;
    const belt = topY(u) - 0.015;
    const roof = Math.max(belt + 0.002, roofY(u));
    const h = roof - belt;
    return { yb: belt - h, yt: roof, w: plan(x) * P.cabin.width };
  };

  const group = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = false;
    group.add(m);
    return m;
  };

  // Lower body shell
  const body = mesh(loft(bodySec, { n: P.n, tumble: 0.1, x0: -half, x1: half, rows: 220, segs: 72, caps: true, cluster: true }), mats.body);

  // Hood panel overlay
  const hood = mesh(
    loft(bodySec, {
      n: P.n, tumble: 0.1, x0: xc1 + 0.06, x1: Math.max(xc1 + 0.12, half * 0.9), rows: 60, segs: 30,
      a0: angleFor(0.9, P.n), a1: Math.PI - angleFor(0.9, P.n), grow: 0.003,
    }),
    mats.hood,
    false,
  );
  hood.visible = half * 0.9 - xc1 > 0.25; // vans have no real bonnet

  // Glass greenhouse + dark interior shell seen through it
  const glass = mesh(loft(cabinSec, { n: cn, tumble: 0.14, x0: xc0, x1: xc1, rows: 90, segs: 56 }), mats.glass, true);
  glass.renderOrder = 2;
  const interiorSec: SectionFn = (x) => {
    const s = cabinSec(x);
    return { yb: s.yb, yt: s.yt - 0.03, w: s.w * 0.96 };
  };
  const interior = new THREE.Mesh(loft(interiorSec, { n: cn, tumble: 0.14, x0: xc0 + 0.03, x1: xc1 - 0.03, rows: 60, segs: 40 }), mats.interior);
  group.add(interior);

  // Roof panel
  const rp0 = P.cabin.panel[0] * half;
  const rp1 = P.cabin.panel[1] * half;
  const roof = mesh(
    loft(cabinSec, { n: cn, tumble: 0.14, x0: rp0, x1: rp1, rows: 40, segs: 30, a0: angleFor(0.86, cn), a1: Math.PI - angleFor(0.86, cn), grow: 0.004 }),
    mats.roof,
  );

  // Window surround trim (chrome or black)
  const trimSec: SectionFn = (x) => cabinSec(x);
  const trimGeo = mergeStrips([
    loft(trimSec, { n: cn, tumble: 0.14, x0: xc0 + 0.02, x1: xc1 - 0.02, rows: 70, segs: 3, a0: angleFor(0.0, cn), a1: angleFor(0.07, cn), grow: 0.004 }),
    loft(trimSec, { n: cn, tumble: 0.14, x0: xc0 + 0.02, x1: xc1 - 0.02, rows: 70, segs: 3, a0: Math.PI - angleFor(0.07, cn), a1: Math.PI - angleFor(0.0, cn), grow: 0.004 }),
  ]);
  const trim = mesh(trimGeo, mats.trim, false);

  // Pickup load bed with tonneau cover
  const bandZ = (fn: SectionFn, n: number, tumble: number, x0: number, x1: number, z0: number, z1: number, grow: number, rows = 50) =>
    loft(fn, { n, tumble, x0, x1, rows, segs: 6, a0: Math.acos(spow(z1, n / 2)), a1: Math.acos(spow(z0, n / 2)), grow });
  if (P.bed) mesh(bandZ(bodySec, P.n, 0.1, P.bed[0] * half, P.bed[1] * half, -0.88, 0.88, 0.004), mats.black, false);

  // Rally stripes (shown/hidden by the scene)
  const stripeSet = (bands: [number, number][]) => {
    const parts: THREE.BufferGeometry[] = [];
    for (const [z0, z1] of bands) {
      parts.push(bandZ(bodySec, P.n, 0.1, -half * 0.985, xc0 + 0.05, z0, z1, 0.007, 60));
      if (half * 0.985 - xc1 > 0.1) parts.push(bandZ(bodySec, P.n, 0.1, xc1 - 0.05, half * 0.985, z0, z1, 0.007, 60));
      parts.push(bandZ(cabinSec, cn, 0.14, rp0, rp1, z0, z1, 0.008, 40));
    }
    const m = mesh(mergeStrips(parts), mats.stripe, false);
    m.visible = false;
    return m;
  };
  const stripes = { single: stripeSet([[-0.13, 0.13]]), twin: stripeSet([[-0.24, -0.08], [0.08, 0.24]]) };

  // Light bars (wraparound) + lower intake + rear diffuser
  const band = (x0: number, x1: number, y0: number, y1: number, grow = 0.004) =>
    mergeStrips([
      loft(bodySec, { n: P.n, tumble: 0.1, x0, x1, rows: 40, segs: 4, a0: angleFor(y0, P.n), a1: angleFor(y1, P.n), grow }),
      loft(bodySec, { n: P.n, tumble: 0.1, x0, x1, rows: 40, segs: 4, a0: Math.PI - angleFor(y1, P.n), a1: Math.PI - angleFor(y0, P.n), grow }),
    ]);
  mesh(band(half - 0.42, half, P.head[0], P.head[1]), mats.headlight, false);
  mesh(band(-half, -half + 0.36, P.tail[0], P.tail[1]), mats.taillight, false);
  const black: THREE.Mesh[] = [
    mesh(band(half - 0.22, half, -0.75, -0.2, 0.003), mats.black, false),
    mesh(band(-half, -half + 0.2, -0.85, -0.35, 0.003), mats.black, false),
    // side skirts
    mesh(band(wheelX[1] + archR, wheelX[0] - archR, -0.9, -0.62, 0.003), mats.black, false),
  ];

  // Dark chassis/wheel-well filler so the arches read as wells, not holes
  const wellSec: SectionFn = (x) => {
    const s = bodySec(x);
    return { yb: P.bottom + 0.02, yt: Math.min(s.yt - 0.04, P.wheelR + archR - 0.015), w: plan(x) * 0.93 - 0.02 };
  };
  const chassis = new THREE.Mesh(loft(wellSec, { n: 8, tumble: 0, x0: -half * 0.86, x1: half * 0.84, rows: 60, segs: 32, caps: true }), mats.well);
  group.add(chassis);

  // Mirrors
  const mirrors: THREE.Mesh[] = [];
  const mx = xc1 - 0.12;
  const my = topY(mx / half) + 0.1;
  const mz = plan(mx) * P.cabin.width + 0.12;
  const mirrorGeo = new THREE.SphereGeometry(1, 24, 16);
  mirrorGeo.scale(0.08, 0.055, 0.12);
  const stalkGeo = new THREE.BoxGeometry(0.06, 0.025, 0.12);
  for (const side of [1, -1]) {
    const m = mesh(mirrorGeo, mats.mirrors);
    m.position.set(mx, my, side * mz);
    m.rotation.y = side * 0.12;
    mirrors.push(m);
    const st = mesh(stalkGeo, mats.black, false);
    st.position.set(mx + 0.01, my - 0.03, side * (mz - 0.1));
  }

  // Wheels
  const rims: THREE.Mesh[] = [];
  const calipers: THREE.Mesh[] = [];
  const wheels: THREE.Group[] = [];
  for (const wx of wheelX) {
    for (const side of [1, -1]) {
      const wz = plan(wx) * 0.985 - P.tireW / 2 - 0.015;
      const wg = buildWheel(P, mats);
      wg.group.position.set(wx, P.wheelR, side * wz);
      if (side < 0) wg.group.scale.z = -1;
      if (wx > 0) wg.group.rotation.y = -0.14; // slight steer, product-shot pose
      group.add(wg.group);
      rims.push(...wg.rims);
      calipers.push(wg.caliper);
      wheels.push(wg.group);
    }
  }

  if (P.spare) {
    const sp = buildWheel(P, mats);
    const rs = bodySec(-half * 0.995);
    sp.group.position.set(-half - P.tireW / 2 + 0.03, (rs.yb + rs.yt) / 2 + 0.12, 0);
    sp.group.rotation.y = -Math.PI / 2;
    group.add(sp.group);
    rims.push(...sp.rims);
    wheels.push(sp.group);
    sp.caliper.visible = false;
  }

  // Plates
  const plates: THREE.Mesh[] = [];
  const plateGeo = new THREE.PlaneGeometry(0.52, 0.12);
  const fy = (bodySec(half * 0.99).yb + bodySec(half * 0.99).yt) / 2 - 0.06;
  const ry = P.spare ? bodySec(-half * 0.99).yb + 0.09 : (bodySec(-half * 0.99).yb + bodySec(-half * 0.99).yt) / 2 + 0.02;
  const fp = new THREE.Mesh(plateGeo, mats.plate);
  fp.position.set(half + 0.004, fy, 0);
  fp.rotation.y = Math.PI / 2;
  const rpM = new THREE.Mesh(plateGeo, mats.plateRear);
  rpM.position.set(-half - 0.004, ry, 0);
  rpM.rotation.y = -Math.PI / 2;
  group.add(fp, rpM);
  plates.push(fp, rpM);

  return { group, paint: { body, roof, hood, mirrors }, glass, trim, rims, calipers, plates, black, wheels, stripes, params: P };
}

function mergeStrips(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

function buildWheel(P: BodyParams, mats: Record<string, THREE.Material>) {
  const g = new THREE.Group();
  const R = P.wheelR;
  const tw = P.tireW;
  const rimR = R * 0.7;

  // Tire: lathe of a rounded rectangle cross-section around the wheel axis
  const prof: THREE.Vector2[] = [];
  const cr = 0.045;
  prof.push(new THREE.Vector2(rimR, -tw / 2 + 0.01));
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      prof.push(new THREE.Vector2(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr));
    }
  };
  corner(R - cr, -tw / 2 + cr, -Math.PI / 2);
  corner(R - cr, tw / 2 - cr, 0);
  prof.push(new THREE.Vector2(rimR, tw / 2 - 0.01));
  const tireGeo = new THREE.LatheGeometry(prof, 48);
  tireGeo.rotateX(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, mats.tire);
  tire.castShadow = true;
  g.add(tire);

  // Rim barrel + lip
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, tw * 0.9, 40, 1, true).rotateX(Math.PI / 2), mats.barrel);
  g.add(barrel);
  const rims: THREE.Mesh[] = [];
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.006, 0.012, 8, 48), mats.rim);
  lip.position.z = tw / 2 - 0.02;
  g.add(lip);
  rims.push(lip);

  // Spokes: 5 split spokes
  const spokeLen = rimR - 0.06;
  const spokeGeo = new THREE.BoxGeometry(0.032, spokeLen, 0.028);
  spokeGeo.translate(0, 0.05 + spokeLen / 2, 0);
  for (let i = 0; i < 10; i++) {
    const a = (Math.floor(i / 2) / 5) * Math.PI * 2 + (i % 2 ? 0.13 : -0.13);
    const s = new THREE.Mesh(spokeGeo, mats.rim);
    s.rotation.z = a;
    s.position.z = tw / 2 - 0.045;
    s.rotation.x = -0.12; // dish
    g.add(s);
    rims.push(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.05, 24).rotateX(Math.PI / 2), mats.rim);
  hub.position.z = tw / 2 - 0.05;
  g.add(hub);
  rims.push(hub);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20).rotateX(Math.PI / 2), mats.black);
  cap.position.z = tw / 2 - 0.022;
  g.add(cap);

  // Brake disc + caliper (caliper does not rotate with the wheel in real life; fine here, wheels are static)
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.86, rimR * 0.86, 0.022, 40).rotateX(Math.PI / 2), mats.disc);
  disc.position.z = tw / 2 - 0.11;
  g.add(disc);
  const caliper = new THREE.Mesh(new THREE.TorusGeometry(rimR * 0.78, 0.034, 10, 18, 0.95), mats.caliper);
  caliper.scale.z = 1.4;
  caliper.position.z = tw / 2 - 0.085;
  caliper.rotation.z = Math.PI * 0.55;
  g.add(caliper);

  return { group: g, rims, caliper };
}
