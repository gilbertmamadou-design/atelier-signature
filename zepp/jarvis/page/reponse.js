/*
 * Jarvis · réponse en texte (la montre n'a pas de haut-parleur) avec une vibration.
 * Question de Jarvis (« Appeler Paul ? ») : boutons Oui / Non, envoyés comme une nouvelle commande.
 */
import { back } from '@zos/router'
import { BasePage } from '@zeppos/zml/base-page'
import { reponse } from '../shared/vue'
import { dessiner, effacer, vibrer } from '../utils/montre'

Page(
  BasePage({
    state: { r: {}, w: {}, occupe: false },
    onInit(params) {
      try { this.state.r = typeof params === 'string' ? JSON.parse(params || '{}') : (params || {}) } catch (e) { this.state.r = { ok: false, texte: 'Réponse illisible.' } }
    },
    build() { vibrer(); this.dessiner() },
    dessiner() {
      effacer(this.state.w)
      this.state.w = dessiner(reponse(this.state.r), (s) => this.agir(s.action))
    },
    agir(a) {
      if (!a) return
      if (a.a === 'retour') { back(); return }
      if (a.a !== 'commande' || this.state.occupe) return
      this.state.occupe = true
      this.request({ method: 'commande', params: { texte: a.texte } }, { timeout: 60000 })
        .then((r) => { this.state.occupe = false; this.state.r = r || {}; vibrer(); setTimeout(() => this.dessiner(), 0) })
        .catch(() => { this.state.occupe = false; this.state.r = { ok: false, texte: 'Téléphone injoignable.' }; setTimeout(() => this.dessiner(), 0) })
    },
  }),
)
