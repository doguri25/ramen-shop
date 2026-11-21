# 마음 골목 물리 굽기 (블렌더)
# 게임이 정한 소품 자리(spec.json)를 받아서
#  1) 강체: 돌·사과·통·상자·장작·공을 중력으로 떨어뜨려 땅(소품 발밑 높이표)과 수레 위에 자리 잡게 하고
#  2) 천: 빨래 세 장을 바람에 날려 몇 장면을 구워
# 게임이 읽는 village-bake.json으로 내보내요. 좌표는 게임(three.js, y 위) 기준으로 주고받아요.
import bpy, bmesh, json, math, sys, time
from mathutils import Matrix, Vector, Quaternion

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SPEC, OUT = args[0], args[1]
SIM = int(args[2]) if len(args) > 2 else 160
spec = json.load(open(SPEC))
t0 = time.time()

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
sc = bpy.context.scene
sc.render.fps = 24
sc.frame_start, sc.frame_end = 1, SIM

# three(x, y, z) ↔ 블렌더(x, -z, y)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
Ci = C.inverted()
def tb(m_three): return C @ m_three @ Ci
def bt(m_b): return Ci @ m_b @ C
def m3(p, q, s=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(p), Quaternion((q[3], q[0], q[1], q[2])), Vector(s))

col = sc.collection
def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); return o
def box_obj(name, sx, sy, sz):  # 블렌더 로컬 크기
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    return new_obj(name, bm)
def cyl_obj(name, r, h, seg=16):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    return new_obj(name, bm)
def sph_obj(name, r, u=12, v=8):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    return new_obj(name, bm)

bpy.ops.rigidbody.world_add()
rbw = sc.rigidbody_world
rbw.point_cache.frame_start = 1; rbw.point_cache.frame_end = SIM
rbw.substeps_per_frame = 12; rbw.solver_iterations = 30
def rb(o, kind, shape, mass=1.0, fr=0.7, rest=0.05, ld=0.1, ad=0.3, margin=0.004):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
        bpy.ops.rigidbody.object_add(type=kind)
    r = o.rigid_body
    r.collision_shape = shape; r.friction = fr; r.restitution = rest
    r.use_margin = True; r.collision_margin = margin
    if kind == 'ACTIVE':
        r.mass = mass; r.linear_damping = ld; r.angular_damping = ad
        r.use_deactivation = True; r.deactivate_linear_velocity = 0.06; r.deactivate_angular_velocity = 0.12

# ── 땅 조각 (소품 발밑) ──
for k, pt in enumerate(spec['patches']):
    n, st = pt['n'], pt['step']
    bm = bmesh.new()
    vs = [bm.verts.new((pt['x0'] + i * st, -(pt['z0'] + j * st), pt['h'][j * n + i])) for j in range(n) for i in range(n)]
    for j in range(n - 1):
        for i in range(n - 1):
            a = j * n + i
            bm.faces.new((vs[a], vs[a + 1], vs[a + n + 1], vs[a + n]))
    o = new_obj(f'patch{k}', bm)
    rb(o, 'PASSIVE', 'MESH', fr=0.9, margin=0.02)

# ── 손수레 (움직이지 않는 틀) ──
cart = spec['cart']
bx, by, bz = cart['base']
for k, ct in enumerate(spec['carts']):
    M = m3(ct['p'], ct['q'])
    def part(name, lp, size=None, cyl=None, rot_x=False):
        # lp, size: 수레 로컬(three) 좌표
        if size: o = box_obj(name, size[0], size[2], size[1])
        else:
            o = cyl_obj(name, cyl[0], cyl[1])
        L = Matrix.Translation(Vector(lp))
        if rot_x: L = L @ Matrix.Rotation(math.pi / 2, 4, 'X')
        o.matrix_world = tb(M @ L) if not cyl else tb(M @ L) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
        rb(o, 'PASSIVE', 'BOX' if size else 'CYLINDER', fr=0.6)
        return o
    part(f'cart{k}_base', (0, cart['baseY'], 0), size=(bx, by, bz))
    top = cart['baseY'] + by / 2 + cart['wallH'] / 2
    for s in (-1, 1):
        part(f'cart{k}_wz{s}', (0, top, s * (bz / 2 - cart['wallT'] / 2)), size=(bx, cart['wallH'], cart['wallT']))
        part(f'cart{k}_wx{s}', (s * (bx / 2 - cart['wallT'] / 2), top, 0), size=(cart['wallT'], cart['wallH'], bz))
        part(f'cart{k}_wheel{s}', (-0.15, cart['wheelR'], s * cart['wheelZ']), size=(cart['wheelR'] * 2, cart['wheelR'] * 2, 0.08))

# ── 움직이는 소품 ──
bodies = []
for k, b in enumerate(spec['bodies']):
    kind, s = b['k'], b['s']
    M = m3(b['p'], b['q'])
    if kind == 'apple':
        o = sph_obj(f'apple{k}', s[0], 10, 6); shape, mass, fr, rest, ld, ad = 'SPHERE', 0.15, 0.6, 0.2, 0.1, 0.5
    elif kind == 'ball':
        o = sph_obj(f'ball{k}', s[0], 14, 8); shape, mass, fr, rest, ld, ad = 'SPHERE', 0.4, 0.8, 0.4, 0.5, 2.5
    elif kind == 'crate':
        o = box_obj(f'crate{k}', s[0], s[2], s[1]); shape, mass, fr, rest, ld, ad = 'BOX', 4.0, 0.8, 0.05, 0.1, 0.3
    elif kind in ('barrel', 'log'):
        o = cyl_obj(f'{kind}{k}', s[0], s[1], 14); shape, mass, fr, rest, ld, ad = 'CYLINDER', (8.0 if kind == 'barrel' else 3.0), 0.7, 0.05, 0.1, 0.35
    else:  # rock: 납작한 타원 돌
        o = sph_obj(f'rock{k}', 1.0, 9, 6); shape, fr, rest, ld, ad = 'CONVEX_HULL', 1.0, 0.02, 0.5, 2.0
        mass = 30 * s[0] * s[1] * s[2]
    if kind == 'rock':
        o.matrix_world = tb(M) @ Matrix.Diagonal((s[0], s[2], s[1], 1))
    elif kind in ('barrel', 'log'):
        o.matrix_world = tb(M @ Matrix.Rotation(-math.pi / 2, 4, 'X')) if False else tb(M) @ Matrix.Identity(4)
    else:
        o.matrix_world = tb(M)
    if kind == 'rock':
        bpy.context.view_layer.update()
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    rb(o, 'ACTIVE', shape, mass=mass, fr=fr, rest=rest, ld=ld, ad=ad)
    bodies.append((o, kind))
print('setup', round(time.time() - t0, 1), 's, bodies', len(bodies))

# 블렌더 원기둥은 z축, three 원기둥은 y축 → three y가 블렌더 z라서 그대로 맞아요 (tb가 축을 바꿔 줘요)
for f in range(1, SIM + 1):
    sc.frame_set(f)
print('sim', round(time.time() - t0, 1), 's')

out_bodies = []
fell = 0
for (o, kind), b in zip(bodies, spec['bodies']):
    Mt = bt(o.matrix_world.copy())
    loc, rot, scl = Mt.decompose()
    if loc.y < b['p'][1] - 6: fell += 1
    out_bodies.append([round(loc.x, 4), round(loc.y, 4), round(loc.z, 4), round(rot.x, 5), round(rot.y, 5), round(rot.z, 5), round(rot.w, 5)])
print('fell far', fell)

# ── 빨래 (천 + 바람) ──
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
if sc.rigidbody_world: bpy.ops.rigidbody.world_remove()
LINE = spec['line']
COLS, ROWS = 7, 9
SHEETS = [{'w': 0.7, 'h': 0.8, 'x': -0.95}, {'w': 0.85, 'h': 0.7, 'x': 0.05}, {'w': 0.6, 'h': 0.75, 'x': 0.95}]
cl = []
for k, sh in enumerate(SHEETS):
    bm = bmesh.new()
    vs = []
    for j in range(ROWS):
        for i in range(COLS):
            x = sh['x'] - sh['w'] / 2 + sh['w'] * i / (COLS - 1)
            y = LINE['h'] - sh['h'] * j / (ROWS - 1)
            vs.append(bm.verts.new((x, 0.0, y)))  # three (x, y, 0) → 블렌더 (x, 0, y)
    for j in range(ROWS - 1):
        for i in range(COLS - 1):
            a = j * COLS + i
            bm.faces.new((vs[a], vs[a + 1], vs[a + COLS + 1], vs[a + COLS]))
    o = new_obj(f'sheet{k}', bm)
    vg = o.vertex_groups.new(name='pin'); vg.add(list(range(COLS)), 1.0, 'REPLACE')
    m = o.modifiers.new('cloth', 'CLOTH'); cs = m.settings
    cs.vertex_group_mass = 'pin'; cs.quality = 8; cs.mass = 0.12; cs.air_damping = 1.0
    cs.tension_stiffness = 12; cs.compression_stiffness = 12; cs.bending_stiffness = 0.3
    m.point_cache.frame_start = 1; m.point_cache.frame_end = SIM
    cl.append(o)
# 바람: 빨래 면에 거의 수직으로 불고, 세기가 오르내려요 (돌풍)
bpy.ops.object.effector_add(type='WIND', location=(0, 5, 1.4), rotation=(math.pi / 2 - 0.12, 0, 0.18))
wind = bpy.context.active_object; wind.field.strength = 60; wind.field.noise = 0.9; wind.field.flow = 0.2
for f, sv in [(1, 25), (25, 70), (45, 35), (70, 85), (95, 30), (120, 75), (145, 40), (SIM, 60)]:
    wind.field.strength = sv; wind.field.keyframe_insert('strength', frame=f)
F0, STEP, NF = 70, 2, 24
frames = [[] for _ in SHEETS]
for f in range(1, SIM + 1):
    sc.frame_set(f)
    if f >= F0 and (f - F0) % STEP == 0 and len(frames[0]) < NF:
        dg = bpy.context.evaluated_depsgraph_get()
        for k, o in enumerate(cl):
            e = o.evaluated_get(dg)
            mw = e.matrix_world
            arr = []
            for v in e.data.vertices:
                w = mw @ v.co
                arr += [round(w.x * 1000), round(w.z * 1000), round(-w.y * 1000)]
            frames[k].append(arr)
sw = [max(abs(fr[i + 2]) for fr in frames[k] for i in range(0, len(fr), 3)) for k in range(len(SHEETS))]
print('cloth frames', len(frames[0]), 'max swing mm', sw)

out = {'sig': spec['sig'], 'bodies': out_bodies,
       'cloth': {'cols': COLS, 'rows': ROWS, 'frames': len(frames[0]), 'sheets': [dict(SHEETS[k], f=frames[k]) for k in range(len(SHEETS))]}}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('DONE', OUT, round(time.time() - t0, 1), 's')
