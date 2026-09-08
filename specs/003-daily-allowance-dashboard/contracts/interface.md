# Contrat — Interface utilisateur

**Fonctionnalité** : `003-daily-allowance-dashboard`

Fixe les états et les invariants, sans préjuger du parti pris graphique. « Interface moderne » n'étant
pas vérifiable en soi, la spécification l'a traduit en exigences mesurables (EF-030 à EF-035), reprises
ici.

## Disposition

L'écran d'accueil est réordonné : **l'anneau et l'allocation du jour passent en tête**, avant le
budget mensuel prévisionnel de la fonctionnalité 002.

```text
┌──────────────────────────────────────┐
│  Anneau : reste du mois              │  ← élément principal (EF-007)
│  Allocation du jour · report veille  │  ← EF-015 à EF-019
├──────────────────────────────────────┤
│  Saisie rapide d'une dépense         │  ← EF-001, cible : moins de 10 s
├──────────────────────────────────────┤
│  Journal des dépenses                │  ← EF-024 à EF-029
├──────────────────────────────────────┤
│  Budget mensuel (fonctionnalité 002) │
│  Revenus · Abonnements · Ventilation │
│  Anticipation · Vos données          │
└──────────────────────────────────────┘
```

Ce réordonnancement traduit une hiérarchie d'usage : le prévisionnel se consulte une fois par mois,
l'anneau et l'allocation plusieurs fois par jour.

## États de la vue

| État | Déclencheur | Attendu |
| --- | --- | --- |
| Chargement | Avant hydratation | Ossature neutre. Aucune lecture de `localStorage` pendant le rendu. |
| Sans budget | Aucun revenu ni abonnement | Anneau à 0,00 €, invitation explicite à renseigner revenus et abonnements (EF-014). Pas un état d'erreur. |
| Intact | Budget défini, aucune dépense | Anneau plein, allocation calculée. |
| En cours | Dépenses inférieures au disponible | Portion consommée proportionnelle. |
| Épuisé | Reste exactement nul | Libellé « budget épuisé », anneau au tour complet. |
| Dépassement | Dépenses supérieures au disponible | **Montant du dépassement** affiché, jamais un reste négatif. Anneau plafonné au tour complet (EF-012). |
| Journal vide | Aucune dépense | Message expliquant comment en enregistrer une (EF-029). |
| Recherche sans résultat | Filtre sans correspondance | Message et action pour effacer la recherche. |

## Invariants de l'anneau

1. L'anneau est **décoratif** (`aria-hidden`) : toute l'information est portée par le texte adjacent.
   Le retirer entièrement ne doit rien faire perdre — c'est le critère de CS-009.
2. Le remplissage est **plafonné au tour complet**, y compris en dépassement (EF-012).
3. Le montant central est du **texte HTML**, pas du texte SVG : sélectionnable, correctement mis à
   l'échelle au zoom, lu sans traitement particulier par les lecteurs d'écran (CS-010).
4. L'état est signalé par un **libellé textuel** en plus de la couleur (EF-013).
5. La transition est supprimée sous `prefers-reduced-motion` (EF-035).

## Invariants de l'allocation quotidienne

1. Le montant du jour, le montant déjà dépensé aujourd'hui et le reste de la journée sont affichés
   distinctement (EF-018).
2. Le **report de la veille** est présenté comme un **gain** ou une **perte**, avec son montant
   (EF-019), et non comme un nombre signé brut.
3. Le premier jour du mois, l'absence de report est dite, et non affichée comme un report nul.
4. Reste du mois nul ou négatif : allocation à 0,00 € avec un libellé expliquant qu'il n'y a plus rien
   à répartir (EF-021).
5. Le franchissement de minuit met à jour l'allocation sans intervention (EF-023).

## Invariants du journal

1. Ordre antéchronologique, regroupement par journée, **sous-total par journée** (EF-024, EF-025).
2. Recherche insensible à la casse **et aux accents** (EF-026).
3. Filtre par mois avec son total (EF-027).
4. Chargement au fil du défilement, sans bouton de pagination (EF-028).
5. Ouvrir une dépense donne accès à son détail, sa modification et sa suppression, cette dernière
   après confirmation (EF-006).

## Invariants d'accessibilité

1. Le champ de montant est étiqueté et porte `inputMode="decimal"` pour appeler le pavé numérique sur
   mobile.
2. Les erreurs de saisie sont textuelles et rattachées programmatiquement à leur champ.
3. Cibles tactiles d'au moins **44 px** sur la saisie d'une dépense et l'ouverture du journal
   (EF-034).
4. Utilisable dès **360 px** de large sans défilement horizontal, et à **200 % de zoom** (EF-033,
   CS-010).
5. Contraste WCAG 2.1 AA dans les thèmes clair et sombre (EF-032).
6. Tout est atteignable au clavier, avec un focus visible.
7. Le chargement d'une tranche supplémentaire du journal ne déplace pas le focus.

## Invariants de présentation des montants

1. Tout montant affiché passe par `formatCents()`. Aucune concaténation manuelle de symbole.
2. Un dépassement s'affiche comme un **montant de dépassement libellé**, jamais comme un négatif brut.
3. Les dates s'affichent en `JJ/MM/AAAA`.
4. Les sous-totaux de journée sont visuellement distincts des montants individuels, pour qu'aucun
   lecteur ne confonde une ligne avec un total.

## Contrat de réactivité

Toute mutation — création, modification, suppression d'une dépense, mais aussi d'un revenu ou d'un
abonnement — met à jour l'anneau, l'allocation et le journal **sans action de rafraîchissement**
(EF-030). La mise en œuvre en découle : toutes ces valeurs sont dérivées de l'état par les fonctions
pures de [calculs-depenses.md](./calculs-depenses.md), jamais stockées en double.
