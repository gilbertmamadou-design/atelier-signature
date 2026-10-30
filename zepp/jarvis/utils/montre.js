/*
 * Outils de la montre partagés par les pages : dessin des widgets décrits par shared/vue.js, vibration,
 * micro (autorisation device:os.mic + enregistreur Opus de @zos/media), lecture du fichier enregistré.
 * Constats repris du projet public SDarioosh/odysseus-sound (T-Rex 3 Pro) : sans « device:os.mic » dans app.json
 * ET une demande d'autorisation, l'enregistreur répond « PERMISSION DENIED device:os.mic ».
 */
import { createWidget, deleteWidget, widget, align, text_style, event, prop } from '@zos/ui'
import { Vibrator } from '@zos/sensor'
import { create, id } from '@zos/media'
import { statSync, openSync, readSync, closeSync, rmSync, O_RDONLY } from '@zos/fs'
import { queryPermission, requestPermission } from '@zos/app'

/** Crée les widgets ; actions(spec) est appelé au toucher d'un bouton ; hold = { down, up } pour « Parler » */
export function dessiner(liste, actions, hold) {
  const w = {}
  liste.forEach((s) => {
    let x = null
    if (s.type === 'CIRCLE') x = createWidget(widget.CIRCLE, { center_x: s.center_x, center_y: s.center_y, radius: s.radius, color: s.color, alpha: s.alpha })
    else if (s.type === 'TEXT') {
      x = createWidget(widget.TEXT, { x: s.x, y: s.y, w: s.w, h: s.h, text: s.text, text_size: s.text_size, color: s.color, align_h: align.CENTER_H, align_v: align.CENTER_V,
        text_style: s.wrap ? text_style.WRAP : (text_style.ELLIPSIS !== undefined ? text_style.ELLIPSIS : text_style.NONE) })
    } else if (s.type === 'BUTTON') {
      x = createWidget(widget.BUTTON, { x: s.x, y: s.y, w: s.w, h: s.h, radius: s.radius, normal_color: s.normal_color, press_color: s.press_color, text: s.text, text_size: s.text_size, color: 0xffffff,
        click_func: () => actions(s) })
    } else if (s.type === 'HOLD') {
      // « maintenir pour parler » : un rectangle arrondi qui reçoit appui et relâchement, le texte ne capte rien
      x = createWidget(widget.FILL_RECT, { x: s.x, y: s.y, w: s.w, h: s.h, radius: s.radius, color: s.normal_color })
      const t = createWidget(widget.TEXT, { x: s.x, y: s.y, w: s.w, h: s.h, text: s.text, text_size: s.text_size, color: 0xffffff, align_h: align.CENTER_H, align_v: align.CENTER_V })
      try { t.setEnable(false) } catch (e) {}
      if (hold) { x.addEventListener(event.CLICK_DOWN, () => hold.down()); x.addEventListener(event.CLICK_UP, () => hold.up()) }
      w[s.id + '_texte'] = t
    }
    if (x) w[s.id] = x
  })
  return w
}
export function effacer(w) { Object.keys(w || {}).forEach((k) => { try { deleteWidget(w[k]) } catch (e) {} }) }
export function texte(wd, t) { try { wd.setProperty(prop.TEXT, t) } catch (e) {} }

export function vibrer() { try { new Vibrator().start() } catch (e) {} }

const MIC = 'device:os.mic'
const ACCORDE = 2
/** ok() si le micro est autorisé ; sinon non(texte). Une invite peut s'afficher : il faudra réappuyer ensuite. */
export function micro(ok, non) {
  let st
  try { st = queryPermission({ permissions: [MIC] })[0] } catch (e) { ok(); return }   // micrologiciel sans autorisations : on essaie
  if (st === ACCORDE) { ok(); return }
  const r = requestPermission({ permissions: [MIC], callback: () => {} })
  if (r === ACCORDE) ok()
  else if (r === 1) non('Micro refusé : autorisez-le pour Jarvis dans les réglages de la montre.')
  else non('Autorisez le micro sur la montre, puis maintenez de nouveau « Parler ».')
}

let enr = null
export function enregistreur() { if (!enr) enr = create(id.RECORDER); return enr }
export function oublier(fichier) { try { rmSync({ path: fichier }) } catch (e) {} }
export function lireFichier(fichier) {
  let st
  try { st = statSync({ path: fichier }) } catch (e) { return null }
  if (!st || !st.size) return null
  const fd = openSync({ path: fichier, flag: O_RDONLY })
  if (typeof fd !== 'number' || fd < 0) return null
  try {
    const buf = new ArrayBuffer(st.size)
    const n = readSync({ fd, buffer: buf })
    if (typeof n === 'number' && n !== st.size) return null
    return buf
  } finally { closeSync(fd) }
}
/** « JVA1 » + Opus : reconnu par le Side Service (shared/proto.js, audioDe) */
export function paquetAudio(buf) {
  const a = new Uint8Array(buf), out = new Uint8Array(4 + a.length)
  out[0] = 0x4a; out[1] = 0x56; out[2] = 0x41; out[3] = 0x31
  out.set(a, 4)
  return out.buffer
}
