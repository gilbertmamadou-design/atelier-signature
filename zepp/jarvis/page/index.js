/*
 * Jarvis · écran principal (Amazfit T-Rex 3, 480 × 480 rond, Zepp OS 4).
 * Sphère, heure, météo et vent (couleur du seuil chantier), prochain rendez-vous, lumières, « Parler » ;
 * en faisant défiler : Éteindre les lumières, 3 pièces favorites, Bonjour, Bonne nuit, Ouvrir la clim.
 * Bouton physique du haut à droite (SELECT) : un appui démarre l'écoute, un second l'arrête.
 * Toutes les demandes passent par le Side Service (appli Zepp du téléphone) puis Majordome.
 */
import { onKey, offKey, KEY_SELECT, KEY_EVENT_CLICK, showToast } from '@zos/interaction'
import { push } from '@zos/router'
import { LocalStorage } from '@zos/storage'
import { codec } from '@zos/media'
import { setPageBrightTime } from '@zos/display'
import { BasePage } from '@zeppos/zml/base-page'
import { resume, disposition, bref, heure } from '../shared/vue'
import { dessiner, effacer, texte, vibrer, micro, enregistreur, oublier, lireFichier, paquetAudio } from '../utils/montre'

const FICHIER = 'jarvis.opus'
const DUREE_MAX = 8000
const stock = new LocalStorage()
const BIN = { contentType: 'bin', dataType: 'json', timeout: 60000 }   // zml : un ArrayBuffer part en binaire seulement ainsi

Page(
  BasePage({
    state: { w: {}, etat: null, ecoute: null, minuterie: null, horloge: null, occupe: false, voix: true },

    onInit() {
      try { this.state.etat = JSON.parse(stock.getItem('etat') || 'null') } catch (e) { this.state.etat = null }
      try { setPageBrightTime({ brightTime: 30000 }) } catch (e) {}
    },

    build() {
      this.dessiner()
      this.actualiser()
      this.state.horloge = setInterval(() => texte(this.state.w.heure, heure(Date.now())), 20000)
      onKey({
        callback: (key, ev) => {
          if (key === KEY_SELECT && ev === KEY_EVENT_CLICK) { if (this.state.ecoute) this.finEcoute(); else this.debutEcoute(); return true }
          return false
        },
      })
    },

    onDestroy() {
      clearInterval(this.state.horloge)
      clearTimeout(this.state.minuterie)
      try { offKey() } catch (e) {}
      if (this.state.ecoute) { try { enregistreur().stop() } catch (e) {} }
    },

    dessiner() {
      effacer(this.state.w)
      const v = resume(this.state.etat || { ok: false, texte: 'Connexion à Majordome…' }, Date.now())
      this.state.w = dessiner(disposition(v, { ecoute: !!this.state.ecoute, voix: this.state.voix }), (s) => this.agir(s.action), { down: () => this.debutEcoute(), up: () => this.finEcoute() })
    },
    // redessiner hors du rappel du bouton touché (on ne supprime pas un widget pendant son propre rappel)
    plusTard() { setTimeout(() => this.dessiner(), 0) },

    actualiser() {
      this.request({ method: 'etat' }, { timeout: 30000 })
        .then((e) => { this.state.etat = e; if (e && e.ok !== false) stock.setItem('etat', JSON.stringify(e)); this.plusTard() })
        .catch(() => { this.state.etat = { ok: false, texte: 'Téléphone injoignable : appli Zepp ouverte, Bluetooth actif ?' }; this.plusTard() })
    },

    agir(a) {
      if (!a || this.state.occupe) return
      this.state.occupe = true
      const fin = () => { this.state.occupe = false }
      const req = a.a === 'lumieres' ? { method: 'lumieres', params: { action: a.action, id: a.id, nom: a.nom } }
        : a.a === 'routine' ? { method: 'routine', params: { id: a.id } }
        : a.a === 'clim' ? { method: 'clim', params: {} } : null
      if (!req) { fin(); return }
      if (a.a !== 'lumieres') showToast({ content: '…' })
      this.request(req, { timeout: 60000 })
        .then((r) => {
          fin(); vibrer()
          if (a.a === 'routine') this.montrer(r)
          else { showToast({ content: bref(r) }); setTimeout(() => this.actualiser(), 1200) }
        })
        .catch(() => { fin(); showToast({ content: 'Téléphone injoignable' }) })
    },

    montrer(r) { push({ url: 'page/reponse', params: JSON.stringify(r || {}) }) },

    // ---------- Voix : enregistrement Opus sur la montre, reconnaissance par Majordome (Vosk) ----------
    debutEcoute() {
      if (this.state.ecoute || this.state.occupe) return
      micro(() => {
        try {
          oublier(FICHIER)
          const r = enregistreur()
          r.setFormat(codec.OPUS, { target_file: 'data://' + FICHIER })
          r.start()
          this.state.ecoute = { t0: Date.now() }
          vibrer()
          this.state.minuterie = setTimeout(() => this.finEcoute(), DUREE_MAX)
          this.plusTard()
        } catch (e) {
          this.state.voix = false
          showToast({ content: 'Micro indisponible : ' + (e && e.message ? e.message : e) })
          this.plusTard()
        }
      }, (t) => showToast({ content: t }))
    },

    finEcoute() {
      const ec = this.state.ecoute
      if (!ec) return
      this.state.ecoute = null
      clearTimeout(this.state.minuterie)
      try { enregistreur().stop() } catch (e) {}
      this.plusTard()
      if (Date.now() - ec.t0 < 700) { showToast({ content: 'Maintenez « Parler » pendant que vous parlez' }); return }
      this.state.occupe = true
      showToast({ content: 'Envoi à Jarvis…' })
      setTimeout(() => {
        const buf = lireFichier(FICHIER)
        if (!buf || buf.byteLength < 16) { this.state.occupe = false; showToast({ content: 'Rien n\'a été enregistré' }); return }
        this.request(paquetAudio(buf), BIN)
          .then((r) => { this.state.occupe = false; vibrer(); this.montrer(r) })
          .catch(() => { this.state.occupe = false; showToast({ content: 'Téléphone injoignable' }) })
      }, 450)
    },
  }),
)
