# Conversion d'un avatar Microsoft Rocketbox (FBX avec expressions du visage, licence MIT) en GLB allégé pour Majordome.
# Lancé par Blender en mode module (bpy) : python convertir.py <fichier.fbx> <dossier Textures> <sortie.glb> <taille texture>
import bpy, sys, os, json, glob

fbx, texdir, out, tsz = sys.argv[-4], sys.argv[-3], sys.argv[-2], int(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_custom_normals=True, ignore_leaf_bones=True, use_image_search=False)
work = os.path.join(os.path.dirname(out), 'tmp_' + os.path.basename(out).replace('.glb', ''))
os.makedirs(work, exist_ok=True)
info = {'meshes': [], 'materials': [], 'bones': []}

def find_tex(kind, part):
    l = [f for f in glob.glob(os.path.join(texdir, '*.tga')) if part in os.path.basename(f).lower() and kind in os.path.basename(f).lower()]
    return l[0] if l else None

def load_scaled(path, alpha):
    img = bpy.data.images.load(path)
    w, h = img.size
    k = min(1.0, tsz / max(w, h))
    if k < 1: img.scale(int(w * k), int(h * k))
    ext = 'png' if alpha else 'jpg'
    dst = os.path.join(work, os.path.splitext(os.path.basename(path))[0] + '.' + ext)
    img.filepath_raw = dst
    img.file_format = 'PNG' if alpha else 'JPEG'
    if not alpha: bpy.context.scene.render.image_settings.quality = 86
    img.save()
    bpy.data.images.remove(img)
    return bpy.data.images.load(dst)

for mat in bpy.data.materials:
    n = mat.name.lower()
    part = 'head' if 'head' in n else 'opacity' if ('opacity' in n or 'hair' in n or 'lash' in n) else 'body'
    col = find_tex('color', part)
    nrm = find_tex('normal', part) if part != 'opacity' else None
    if nrm and 'wrinkle' in os.path.basename(nrm): nrm = None
    info['materials'].append({'name': mat.name, 'part': part, 'color': col and os.path.basename(col), 'normal': nrm and os.path.basename(nrm)})
    mat.use_nodes = True
    nt = mat.node_tree
    for nd in list(nt.nodes): nt.nodes.remove(nd)
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
    bsdf.inputs['Roughness'].default_value = 0.55 if part == 'head' else 0.75
    if col:
        alpha = part == 'opacity'
        im = load_scaled(col, alpha)
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
            try: mat.blend_method = 'BLEND'
            except Exception: pass
    if nrm:
        im2 = load_scaled(nrm, False); im2.colorspace_settings.name = 'Non-Color'
        tn2 = nt.nodes.new('ShaderNodeTexImage'); tn2.image = im2
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(tn2.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

for ob in bpy.data.objects:
    if ob.type == 'MESH':
        keys = [k.name for k in ob.data.shape_keys.key_blocks] if ob.data.shape_keys else []
        info['meshes'].append({'name': ob.name, 'verts': len(ob.data.vertices), 'materials': [m.name for m in ob.data.materials if m], 'shapes': keys})
    if ob.type == 'ARMATURE':
        info['bones'] = [b.name for b in ob.data.bones]

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_morph=True, export_morph_normal=False, export_skins=True,
                          export_animations=False, export_image_format='AUTO', export_yup=True, export_apply=False)
json.dump(info, open(out.replace('.glb', '.json'), 'w'), ensure_ascii=False, indent=1)
print('OK', out, os.path.getsize(out))
