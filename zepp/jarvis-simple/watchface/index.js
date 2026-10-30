/*
 * Cadran « Jarvis Simple » (Amazfit T-Rex 3, 480 × 480 rond, Zepp OS 4, API 3.0 minimum) : version de secours.
 *
 * Construit sur le modèle de l'exemple officiel zeppos-samples/watchface/3.0/timer :
 *   import ui from '@zos/ui', WatchFace({ build() }), ui.createWidget(ui.widget.X, …), constantes lues directement.
 * Le moins de risques possible :
 * - d'abord un FILL_RECT de couleur et un TEXT « JARVIS » (preuve de vie, sans aucune image) ;
 * - puis une seule image de fond (décor HUD et sphère pré-dessinés, sans animation, transparente ailleurs) ;
 * - heure, date en français et batterie en TEXT, mis à jour par @zos/sensor (Time.onPerMinute, Battery.onChange)
 *   et au retour sur le cadran (WIDGET_DELEGATE) ;
 * - AOD : fond noir et heure (IMG_TIME dessiné par le système, sinon TEXT).
 * Chaque bloc est dans son propre try/catch : un élément qui échoue n'empêche jamais les autres de s'afficher.
 * Les constantes (widget, show_level, prop) ne sont JAMAIS copiées (Object.assign, spread) : sur la montre ce sont
 * souvent des propriétés natives non énumérables, et une copie donnerait un objet vide, donc un écran noir.
 */
import ui from '@zos/ui'
import { Time, Battery } from '@zos/sensor'
import { COUL, DISPOSITION as D, lireHeure, texteHeure, texteDate, texteBatterie } from '../shared/simple'

const globalHmUI = () => (typeof hmUI !== 'undefined' ? hmUI : null)

/** Module d'interface : @zos/ui (API 2.0 et plus), sinon le global historique hmUI */
function interfaceUI() {
  if (ui && typeof ui.createWidget === 'function') return ui
  const h = globalHmUI()
  return h && typeof h.createWidget === 'function' ? h : null
}

/** Constante lue directement (ui.widget.IMG…), jamais par copie ; undefined si absente */
function cst(groupe, nom) {
  const sources = [ui, globalHmUI()]
  for (let i = 0; i < sources.length; i++) {
    try {
      const g = sources[i] && sources[i][groupe]
      if (g && g[nom] !== undefined) return g[nom]
    } catch (e) {}
  }
  return undefined
}

/** Crée un widget ; null s'il est inconnu ou si la création échoue (sans arrêter le cadran) */
function creer(nom, o) {
  const u = interfaceUI(), type = cst('widget', nom)
  if (!u || type === undefined) return null
  try { return u.createWidget(type, o) || null } catch (e) { return null }
}

/** Niveau d'affichage : { show_level } si la constante existe, sinon {} (affichage normal par défaut) */
function niveau(nom) {
  const v = cst('show_level', nom)
  return v === undefined ? {} : { show_level: v }
}

function ecrire(w, s) {
  if (!w) return
  const p = cst('prop', 'TEXT')
  try {
    if (p !== undefined) { w.setProperty(p, s); return }
  } catch (e) {}
  try { w.setProperty(cst('prop', 'MORE'), { text: s }) } catch (e) {}
}

function essai(f) { try { return f() } catch (e) { return null } }

function texte(b, couleur, valeur, show) {
  const o = { x: b.x, y: b.y, w: b.w, h: b.h, color: couleur, text_size: b.taille, text: valeur }
  const ah = cst('align', 'CENTER_H'), av = cst('align', 'CENTER_V')
  if (ah !== undefined) o.align_h = ah
  if (av !== undefined) o.align_v = av
  return creer('TEXT', Object.assign(o, show))
}

const img = (p) => 'images/' + p
let batterie = null, majBatterie = null

WatchFace({
  onInit() {},

  build() {
    const NORMAL = niveau('ONLY_NORMAL'), AOD = niveau('ONAL_AOD')
    const aodPossible = AOD.show_level !== undefined
    let capteur = null, wHeure = null, wDate = null, wBat = null

    // 1. preuve de vie : couleur pleine et texte, avant toute image
    essai(() => creer('FILL_RECT', Object.assign({ x: 0, y: 0, w: 480, h: 480, color: COUL.fond }, NORMAL)))
    essai(() => texte(D.titre, COUL.titre, 'JARVIS', NORMAL))

    // 2. fond : décor HUD et sphère pré-dessinés (transparent ailleurs, la couleur reste visible)
    essai(() => creer('IMG', Object.assign({ x: 0, y: 0, w: 480, h: 480, src: img('fond.png') }, NORMAL)))

    // 3. heure, date, batterie en texte
    essai(() => { capteur = new Time() })
    const t0 = essai(() => lireHeure(capteur)) || { h: 0, m: 0, jour: 1, mois: 1, semaine: 1 }
    essai(() => { wHeure = texte(D.heure, COUL.heure, texteHeure(t0), NORMAL) })
    essai(() => { wDate = texte(D.date, COUL.date, texteDate(t0), NORMAL) })
    essai(() => { batterie = new Battery() })
    majBatterie = () => essai(() => ecrire(wBat, texteBatterie(batterie ? batterie.getCurrent() : undefined)))
    essai(() => { wBat = texte(D.batterie, COUL.batterie, texteBatterie(batterie ? batterie.getCurrent() : undefined), NORMAL) })

    // 4. AOD : fond noir et heure
    let wHeureAod = null
    if (aodPossible) {
      essai(() => creer('FILL_RECT', Object.assign({ x: 0, y: 0, w: 480, h: 480, color: COUL.noir }, AOD)))
      essai(() => {
        const b = D.heureAod, ch = Array.from({ length: 10 }, (_, i) => img('aod/' + i + '.png')), dp = img('aod/dp.png')
        const o = {
          hour_zero: 1, hour_startX: b.x + Math.round((b.w - 4 * b.chiffre - b.deuxPoints) / 2), hour_startY: b.y,
          hour_array: ch, hour_space: 0, hour_unit_sc: dp, hour_unit_tc: dp, hour_unit_en: dp,
          minute_zero: 1, minute_follow: 1, minute_array: ch, minute_space: 0,
        }
        const al = cst('align', 'LEFT')
        if (al !== undefined) o.hour_align = al
        return creer('IMG_TIME', Object.assign(o, AOD))
      }) || essai(() => { wHeureAod = texte(D.heureAod, COUL.aod, texteHeure(t0), AOD) })
    }

    // 5. mises à jour
    const maj = () => {
      const t = essai(() => lireHeure(capteur))
      if (!t) return
      essai(() => ecrire(wHeure, texteHeure(t)))
      essai(() => ecrire(wDate, texteDate(t)))
      essai(() => ecrire(wHeureAod, texteHeure(t)))
    }
    essai(() => capteur.onPerMinute(maj))
    essai(() => batterie.onChange(majBatterie))
    essai(() => creer('WIDGET_DELEGATE', { resume_call: () => { maj(); majBatterie() }, pause_call: () => {} }))
  },

  onDestroy() {
    essai(() => { if (batterie && majBatterie) batterie.offChange(majBatterie) })
  },
})
