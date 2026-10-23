# Contrat : interface de l'assistant

**Fonctionnalité** : [spec.md](../spec.md) · **Modèle** : [data-model.md](../data-model.md) ·
**Décisions** : [research.md](../research.md) (R9, R10)

Ce document fixe ce que l'utilisateur voit et ce que les technologies d'assistance annoncent. Les
textes entre guillemets sont normatifs (les tests les vérifient) ; la disposition fine reste libre.

---

## 1. Navigation

Cinquième entrée du menu, entre « Mois » et « Réglages » :

| Onglet | Paramètre d'adresse | Libellé | Contenu |
|---|---|---|---|
| `assistant` | `?onglet=assistant` | « Assistant » | Panneau de conversation |

- `TABS` gagne une entrée ; `parseTab("?onglet=assistant")` rend `"assistant"` ; toute autre valeur
  continue de ramener à « Aujourd'hui » (FR-016 de la 007).
- Le panneau reste monté quand un autre onglet est actif (`hidden`), comme les quatre autres.
- Remonté (`key={selectedMonth}`) à chaque changement de mois : la conversation repart de zéro (EF-014).
- Pictogramme : bulle de conversation tracée à la main, décorative (`aria-hidden`), comme les autres.

---

## 2. Disposition du panneau

```
┌ Assistant ──────────────────────────────────────────┐
│ Questions sur le budget d'octobre 2026.             │  ← indique le mois interrogé (EF-007)
│ [Bandeau : modifications non synchronisées] (si besoin)
│                                                     │
│  Vous                                    [Modifier] │
│  Combien ai-je dépensé en courses ?                 │
│  Assistant                                          │
│  Vous avez dépensé 312,47 € en courses…             │
│  Attention : ce montant n'a pas pu être vérifié : … │  ← EF-024, seulement si besoin
│                                                     │
│  ┌ Votre question ────────────────────────┐         │
│  │                                         │  0/500  │
│  └─────────────────────────────────────────┘         │
│  [Envoyer]   [Annuler]   [Nouvelle conversation]    │
└─────────────────────────────────────────────────────┘
```

- Conversation vide : un texte d'accueil avec **trois exemples de questions** sous forme de boutons
  (« Combien ai-je dépensé en courses ? », « Combien puis-je dépenser aujourd'hui ? », « Quels sont mes
  abonnements ? »). Un exemple remplit le champ et **n'envoie pas** : l'utilisateur garde la main.
- Hors mois courant, la ligne d'en-tête le dit : « Mois affiché : septembre 2026 (passé) ».
- Budget vide : l'assistant répond, mais le panneau n'ajoute aucun faux chiffre ; le cas est porté par
  la réponse (spec, cas limites).

---

## 3. États et textes

| Situation | Texte affiché | Contrôles |
|---|---|---|
| Aucune réponse en cours | — | Champ et « Envoyer » actifs ; « Annuler » absent ; « Modifier » présent sur chaque question |
| Envoi, aucun morceau reçu | « L'assistant réfléchit… » | Champ, « Envoyer » et « Modifier » **désactivés** ; « Annuler » présent |
| Le modèle se charge | « Chargement de l'assistant… » (peut durer ~30 s) | idem |
| Réponse en flux | le texte, au fil de l'eau | idem |
| Pendant une réponse, texte d'explication | « Vous pourrez poser une autre question quand la réponse sera terminée, ou en l'annulant. » | relié au champ par `aria-describedby` |
| Réponse terminée | — | retour à l'état initial |
| Réponse annulée | « Réponse annulée » sous le texte reçu (ou sous la question seule) | champ et « Modifier » à nouveau actifs |
| Flux coupé | « Réponse interrompue » sous le texte reçu | idem |
| IA indisponible (503, `unavailable`, `timeout`) | « Assistant indisponible » + « L'IA du serveur ne répond pas pour le moment. Le reste du budget fonctionne normalement. » + bouton « Réessayer » | « Réessayer » renvoie la même question |
| Non autorisé (401) | « Accès refusé. Autorisez à nouveau cet appareil. » | — |
| Autre erreur | « Une erreur est survenue. Réessayez. » | « Réessayer » |
| Montants non vérifiés | « Attention : ce montant n'a pas pu être vérifié : 123,45 €. » (un par montant, ou une liste) | — |
| Modifications en attente de synchronisation | « Des modifications ne sont pas encore synchronisées : l'assistant répond d'après la dernière version enregistrée sur le serveur. » | non bloquant |
| Question vide | « Saisissez une question. » (message de champ) | « Envoyer » n'envoie rien |
| Question trop longue | « La question dépasse 500 caractères. » | « Envoyer » désactivé |

L'interface **n'invente jamais** un message d'erreur technique : pas de code HTTP, pas de trace.

---

## 4. Modification d'un message (EF-025)

- « Modifier » est présent sur chaque question tant qu'aucune réponse n'est en cours.
- Il transforme la question en champ pré-rempli, avec « Envoyer la modification » et « Annuler la
  modification ».
- Valider une question **identique** à l'originale ne relance rien et ferme l'édition.
- Valider remplace l'échange **et tous les suivants** (ils disparaissent à l'écran, sans confirmation :
  c'est l'effet attendu, annoncé par le libellé du bouton « Envoyer la modification »).
- « Nouvelle conversation » est désactivé tant qu'une réponse est en cours (comme « Envoyer ») ; il vide tout ; avec des échanges présents, il demande confirmation
  (« Effacer la conversation ? ») car l'effacement est irréversible.

---

## 5. Accessibilité (principe VII, EF-021)

| Besoin | Réalisation |
|---|---|
| Nom du panneau | `section` étiquetée « Onglet Assistant », comme les autres |
| Structure | `<ol>` étiquetée « Conversation » ; chaque échange : « Vous » puis « Assistant » en texte visible |
| Annonces | région `role="status"` masquée visuellement : « L'assistant répond… », « Réponse terminée », « Réponse annulée », « Assistant indisponible » ; la liste elle-même n'est **pas** `aria-live` |
| Occupé | `aria-busy="true"` sur l'échange en cours |
| Champ | `<textarea>` avec `<label>` « Votre question » ; compteur « n/500 » relié par `aria-describedby` |
| Clavier | Entrée envoie, Maj+Entrée saute une ligne ; Échap annule la réponse en cours |
| Focus | À l'envoi, le focus va sur « Annuler » ; à la fin ou à l'annulation, il retourne dans le champ |
| Contrôles désactivés | Utilisent `disabled`, mais l'explication reste du texte visible relié au champ (pas un simple grisé) |
| Couleur | Aucun état porté par la seule couleur ; avertissement précédé de « Attention : » |
| Thèmes / zoom / largeur | Jetons de couleur existants (`var(--…)`), lisible à 200 %, sans défilement horizontal dès 360 px, texte long renvoyé à la ligne |
| Cible tactile | ≥ 44 px de haut pour les boutons, comme la barre d'onglets |

---

## 6. Ce que le panneau ne fait pas

Pas de rendu Markdown (texte simple, retours à la ligne conservés via `white-space: pre-wrap`), pas
d'historique persisté, pas d'envoi pendant une réponse, pas de file d'attente, pas d'action sur le
budget.
