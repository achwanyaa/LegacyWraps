# Renders one car as wrap-ready image layers for the Studio spin view. Runs inside headless Blender 4.2+:
#   blender -b -P scene.py -- --glb car.glb --recipe recipe.json --dims 4.87,1.98,1.97 --out /out
#
# For every camera angle it renders the car three times, with the wrap zones (paint, hood, roof, rims, trim)
# swapped to a white, a mirror and a black material, and writes two PNGs:
#   base_NN.png    colour + alpha: everything that is not wrapped, plus the ground shadow
#   layers_NN.png  greyscale atlas, 2 columns x 5 rows, one tile per channel (see TILES)
# The browser rebuilds any film from those: base + mask * finish(colour, diffuse, coat, mirror, facing).
import argparse
import json
import math
import os
import re
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

TILES = ['diffuse', 'coat', 'mirror', 'facing', 'paint', 'hood', 'roof', 'rims', 'trim', 'glass']
WRAP_ROLES = ['paint', 'hood', 'roof', 'rims', 'trim']
# Light channels are stored as sqrt(value / scale) so 8 bits cover the bright studio highlights.
SCALE = {'diffuse': 2.0, 'coat': 4.0, 'mirror': 4.0}
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

p = argparse.ArgumentParser()
p.add_argument('--glb', required=True)
p.add_argument('--recipe', required=True)
p.add_argument('--dims', required=True, help='length,width,height in metres')
p.add_argument('--out', required=True)
p.add_argument('--hdri', default='/opt/studio.hdr')
p.add_argument('--frames', type=int, default=24)
p.add_argument('--only', default='', help='comma-separated frame numbers; the top view is frame number <frames>')
p.add_argument('--width', type=int, default=1280)
p.add_argument('--height', type=int, default=720)
p.add_argument('--samples', type=int, default=256)
p.add_argument('--light', type=float, default=1.0)
p.add_argument('--device', default='OPTIX,CUDA', help='GPU backends to try, in order')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
L, W, H = [float(v) for v in a.dims.split(',')]
recipe = json.load(open(a.recipe))
os.makedirs(a.out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.glb)
scene = bpy.context.scene
layer = scene.view_layers[0]
for o in list(scene.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o)
meshes = [o for o in scene.objects if o.type == 'MESH']

# ---- 1. strip junk -------------------------------------------------------------------------------------------
remove = set(recipe.get('remove', []))
for o in meshes:
    idx = {i for i, s in enumerate(o.material_slots) if s.material and s.material.name in remove}
    if not idx:
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES')
    bm.to_mesh(o.data)
    bm.free()


# ---- 2. find the wrap zones ----------------------------------------------------------------------------------
def base_hex(mat):
    if not mat.use_nodes:
        return None
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or bsdf.inputs['Base Color'].is_linked:
        return None
    return [round(pow(max(c, 0.0), 1 / 2.2) * 255) for c in bsdf.inputs['Base Color'].default_value[:3]]


def role_of(mat):
    # Blender's glTF importer copies a material per vertex-colour use ("bodypaint.001"), so also match without the suffix.
    plain = re.sub(r'\.\d{3}$', '', mat.name)
    for role, rules in recipe['roles'].items():
        for r in rules:
            if isinstance(r, str):
                if mat.name == r or plain == r:
                    return role
            else:
                h = base_hex(mat)
                t = [int(r['near'][i:i + 2], 16) for i in (1, 3, 5)]
                if h and all(abs(h[i] - t[i]) <= 3 for i in range(3)):
                    return role
    return None


slots = []  # (object, slot index, role)
glass_mats = set()
for o in meshes:
    for i, s in enumerate(o.material_slots):
        if not s.material:
            continue
        role = role_of(s.material)
        if role == 'glass':
            glass_mats.add(s.material)
        elif role:
            slots.append((o, i, role))
unmatched = sorted({s.material.name for o in meshes for s in o.material_slots if s.material and not role_of(s.material)})
print('LW unmatched materials:', unmatched, flush=True)
found = sorted({r for _, _, r in slots} | ({'glass'} if glass_mats else set()))
missing = sorted(set(recipe['roles']) - set(found))
print('LW zones found:', found, '| missing:', missing, flush=True)

# ---- 3. orient (front -> +X), real-world length, centred, on the ground ---------------------------------------
root = bpy.data.objects.new('LW_fit', None)
scene.collection.objects.link(root)
for o in [o for o in scene.objects if o.parent is None and o is not root]:
    o.parent = root
# glTF +Z (towards the viewer) lands on Blender -Y after import.
root.rotation_euler.z = {'+x': 0.0, '-x': math.pi, '+z': math.pi / 2, '-z': -math.pi / 2}[recipe['front']]


def bounds():
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(q[i] for q in pts) for i in range(3)])
    hi = Vector([max(q[i] for q in pts) for i in range(3)])
    return lo, hi


lo, hi = bounds()
s = L / (hi.x - lo.x)
root.scale = (s, s, s)
lo, hi = bounds()
root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
lo, hi = bounds()
print('LW size  L %.3f  W %.3f (spec %.3f)  H %.3f (spec %.3f)' % (hi.x - lo.x, hi.y - lo.y, W, hi.z - lo.z, H), flush=True)


# ---- 4. materials --------------------------------------------------------------------------------------------
def aov(mat, name, source=None):
    n = mat.node_tree.nodes.new('ShaderNodeOutputAOV')
    n.aov_name = name
    if source:
        mat.node_tree.links.new(source, n.inputs['Value'])
    else:
        n.inputs['Value'].default_value = 1.0


def zone_material(role, kind):
    m = bpy.data.materials.new('LW_%s_%s' % (role, kind))
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    if kind == 'white':  # diffuse light + clearcoat reflection, and the masks
        b.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
        b.inputs['Roughness'].default_value = 0.5
        b.inputs['Specular IOR Level'].default_value = 0.0
        b.inputs['Coat Weight'].default_value = 1.0
        b.inputs['Coat Roughness'].default_value = 0.03
        aov(m, 'z_' + role)
        lw = m.node_tree.nodes.new('ShaderNodeLayerWeight')
        lw.inputs['Blend'].default_value = 0.5
        aov(m, 'facing', lw.outputs['Facing'])
    elif kind == 'matte':  # diffuse light only: Combined / 0.8, denoised
        b.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
        b.inputs['Roughness'].default_value = 1.0
        b.inputs['Specular IOR Level'].default_value = 0.0
    elif kind == 'mirror':
        b.inputs['Base Color'].default_value = (1, 1, 1, 1)
        b.inputs['Metallic'].default_value = 1.0
        b.inputs['Roughness'].default_value = 0.06
    else:  # black: contributes nothing, so the film can be added on top
        b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        b.inputs['Roughness'].default_value = 1.0
        b.inputs['Specular IOR Level'].default_value = 0.0
    return m


variants = {k: {r: zone_material(r, k) for r in WRAP_ROLES} for k in ('white', 'matte', 'mirror', 'black')}
for m in glass_mats:
    m.use_nodes = True
    aov(m, 'z_glass')
for name in ['z_' + r for r in WRAP_ROLES] + ['z_glass', 'facing']:
    v = layer.aovs.add()
    v.name = name
    v.type = 'VALUE'


def use_variant(kind):
    for o, i, role in slots:
        o.material_slots[i].material = variants[kind][role]


# ---- 5. studio ------------------------------------------------------------------------------------------------
world = bpy.data.worlds.new('LW_world')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
env = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(a.hdri)
world.node_tree.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = a.light

bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
floor = bpy.context.active_object
floor.is_shadow_catcher = True
fm = bpy.data.materials.new('LW_floor')
fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.55, 0.55, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
floor.data.materials.append(fm)

cam_data = bpy.data.cameras.new('LW_cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(26)
cam = bpy.data.objects.new('LW_cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
# Same framing as the 3D view (src/three/CarScene.ts): three.js (x, y, z) is Blender (x, -z, y).
fit = max(L / 4.7, H / 1.75, 0.9)
target = Vector((0, 0, H * 0.42))


def aim(frame):
    if frame == a.frames:  # top view
        pos = Vector((0.01, -0.6, 11.5)) * fit
    else:
        t = 2 * math.pi * frame / a.frames
        pos = Vector((9.78 * math.cos(t), -9.78 * math.sin(t), 2.1)) * fit
    cam.location = pos
    cam.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()


# ---- 6. renderer ----------------------------------------------------------------------------------------------
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
device = 'CPU'
for kind in [k for k in a.device.upper().split(',') if k in ('OPTIX', 'CUDA')]:
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            device = kind
            break
    except Exception as e:  # noqa: BLE001
        print('LW device', kind, 'unavailable:', e, flush=True)
scene.cycles.device = 'CPU' if device == 'CPU' else 'GPU'
print('LW rendering on', device, flush=True)
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.01
scene.cycles.sample_clamp_indirect = 10
scene.cycles.denoiser = 'OPENIMAGEDENOISE'
scene.render.film_transparent = True
scene.render.resolution_x = a.width
scene.render.resolution_y = a.height
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'ZIP'
layer.use_pass_diffuse_direct = True
layer.use_pass_diffuse_indirect = True
layer.use_pass_diffuse_color = True

import OpenImageIO as oiio  # bundled with Blender  # noqa: E402

tmp = os.path.join(a.out, '_tmp')
logged = False


def render(kind, samples, denoise):
    """Render the current angle with one zone variant; returns {channel name: HxW float array}."""
    global logged
    use_variant(kind)
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    path = tmp + '.exr'
    chans = {}
    inp = oiio.ImageInput.open(path)
    if not inp:
        raise RuntimeError('cannot open %s: %s' % (path, oiio.geterror()))
    sub = 0
    while inp.seek_subimage(sub, 0):
        spec = inp.spec()
        px = inp.read_image(oiio.FLOAT)
        if px is None:
            raise RuntimeError('cannot read %s: %s' % (path, inp.geterror()))
        px = np.asarray(px).reshape(spec.height, spec.width, spec.nchannels)
        for i, name in enumerate(spec.channelnames):
            chans[name] = px[:, :, i]
        sub += 1
    inp.close()
    if not chans:
        raise RuntimeError('no channels in %s' % path)
    if not logged:
        print('LW channels:', sorted(chans), flush=True)
        logged = True
    return chans


def rgb(ch, name):
    return np.stack([next(v for k, v in ch.items() if k.endswith('.%s.%s' % (name, c)) or k == '%s.%s' % (name, c)) for c in 'RGB'], axis=-1)


def val(ch, name):
    return next((v for k, v in ch.items() if ('.' + name + '.') in ('.' + k)), None)


def write(path, arr):
    arr = np.ascontiguousarray(np.clip(arr, 0, 1), dtype=np.float32)
    if arr.ndim == 2:
        arr = arr[:, :, None]
    h, w, c = arr.shape
    out = oiio.ImageBuf(oiio.ImageSpec(w, h, c, oiio.UINT8))
    out.set_pixels(oiio.ROI(0, w, 0, h), arr)
    if not out.write(path):
        raise RuntimeError(out.geterror())


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


todo = [int(v) for v in a.only.split(',') if v] or list(range(a.frames + 1))
for n, frame in enumerate(todo):
    t0 = time.time()
    aim(frame)

    # Lighting comes from denoised Combined renders: the separate light passes are not denoised and come out grainy.
    matte = rgb(render('matte', a.samples, True), 'Combined') @ LUMA
    w = render('white', a.samples, True)  # same panels with a clear coat on top; also carries the masks (AOVs)
    tile = {
        'diffuse': matte / 0.8,
        'coat': np.maximum(rgb(w, 'Combined') @ LUMA - matte, 0),
        'facing': val(w, 'facing'),
    }
    for r in WRAP_ROLES + ['glass']:
        m = val(w, 'z_' + r)
        tile[r] = m if m is not None else np.zeros_like(tile['diffuse'])
    tile['mirror'] = rgb(render('mirror', a.samples // 2, True), 'Combined') @ LUMA
    for k, sc in SCALE.items():
        tile[k] = np.sqrt(np.clip(tile[k] / sc, 0, 1))
    rows = [np.concatenate([tile[TILES[i]], tile[TILES[i + 1]]], axis=1) for i in range(0, len(TILES), 2)]
    write(os.path.join(a.out, 'layers_%02d.png' % frame), np.concatenate(rows, axis=0))

    b = render('black', a.samples // 2, True)
    col = rgb(b, 'Combined')
    alpha = np.clip(next(v for k, v in b.items() if k.endswith('Combined.A')), 0, 1)
    straight = np.where(alpha[:, :, None] > 1e-4, col / np.maximum(alpha[:, :, None], 1e-4), 0)
    write(os.path.join(a.out, 'base_%02d.png' % frame), np.concatenate([srgb(straight), alpha[:, :, None]], axis=-1))
    print('LW frame %d (%d/%d) %.1fs' % (frame, n + 1, len(todo), time.time() - t0), flush=True)

for f in (tmp + '.exr',):
    if os.path.exists(f):
        os.remove(f)
json.dump(
    {'frames': a.frames, 'top': True, 'width': a.width, 'height': a.height, 'tiles': TILES, 'cols': 2, 'scale': SCALE, 'zones': found, 'missing': missing, 'device': device},
    open(os.path.join(a.out, 'meta.json'), 'w'),
)
print('LW done', flush=True)
