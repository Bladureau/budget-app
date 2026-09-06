# Contrat — Interface utilisateur

**Fonctionnalité** : `001-monthly-budget-envelopes`

Fixe les états et les invariants, sans préjuger du parti pris graphique.

## Emplacement

Une section « Enveloppes » placée **après le journal des dépenses** et **avant le budget
prévisionnel**. Elle suit le mois consulté par le sélecteur déjà en place, sans en introduire un
second.

```text
Anneau · Allocation du jour            (fonctionnalité 003)
Saisie d'une dépense                   (003)
Journal des dépenses                   (003)
Enveloppes ← ICI                       (001)
Budget prévisionnel (repli)            (002)
Vos données                            (004)
```

Cette place traduit la fréquence d'usage : on consulte ses enveloppes après avoir saisi et regardé
ses dépenses, mais plus souvent que son prévisionnel mensuel.

## États de la vue

| État | Déclencheur | Attendu |
| --- | --- | --- |
| Aucune enveloppe | Le mois n'a aucun plafond | Invitation à en définir un, et **total non budgété** si des dépenses existent (EF-012). Pas un état d'erreur. |
| Enveloppes définies | Au moins un plafond | Liste avec plafond, dépensé, restant, progression et état. |
| Enveloppe non entamée | Aucune dépense | Progression nulle, libellé « non entamée ». |
| Proche du plafond | Dépensé ≥ 85 % du plafond | Libellé « proche du plafond » (EF-015). |
| En dépassement | Dépensé > plafond | **Montant du dépassement** affiché, jamais un reste négatif (EF-016). Progression plafonnée au tour complet. |
| Mois précédent vide | Report demandé sans source | Action indisponible, message expliquant qu'il n'y a rien à copier. |
| Remplacement en cours | Report sur un mois déjà pourvu | Avertissement et confirmation avant écrasement (EF-021). |

## Invariants de la liste

1. Chaque enveloppe affiche **plafond, dépensé et restant** (EF-011).
2. L'état est porté par un **libellé textuel** en plus de la couleur et de la progression (EF-017) :
   retirer la couleur ne doit rien faire perdre (CS-006).
3. La barre de progression est **décorative** (`aria-hidden`), plafonnée au tour complet, et sans
   animation sous `prefers-reduced-motion`.
4. Un dépassement s'affiche comme un **montant de dépassement libellé**, jamais comme un reste
   négatif.
5. Le regroupement **« Non budgété »** affiche son total et sa ventilation, en indiquant qu'il couvre
   les catégories non plafonnées **et** les dépenses sans catégorie.

## Invariants de la synthèse

1. Total prévu, total dépensé au titre des enveloppes, total restant (EF-013).
2. Le nombre d'enveloppes en dépassement **et** le montant total du dépassement (EF-018).
3. Repérable en moins de cinq secondes, sans défilement au-delà de la synthèse (CS-002) : elle est
   donc placée en tête de section.

## Invariants de saisie

1. Le champ de plafond porte une étiquette et `inputMode="decimal"`.
2. Un plafond négatif ou non numérique est refusé par un message textuel rattaché au champ, sans
   écriture (EF-004).
3. **Un plafond de zéro est accepté**, et l'interface indique ce qu'il signifie.
4. Définir cinq plafonds doit tenir en moins de deux minutes (CS-001) : la saisie enchaîne sans
   rechargement ni navigation.
5. La suppression d'une enveloppe indique que ses dépenses basculeront en non budgété.

## Invariants d'accessibilité

1. Tout est atteignable au clavier, focus visible.
2. Les quatre états restent distinguables en niveaux de gris.
3. Utilisable dès 360 px de large, sans défilement horizontal, et à 200 % de zoom.
4. Contraste WCAG 2.1 AA dans les deux thèmes.
5. La confirmation de remplacement lors d'un report est actionnable au clavier.

## Contrat de réactivité

Toute mutation — plafond défini, modifié, supprimé, mais aussi **dépense créée, modifiée ou
supprimée** — met à jour les enveloppes sans action de rafraîchissement (EF-010). Elle en découle :
tout est dérivé, rien n'est stocké en double.

Cas particulier explicite : changer la **date** d'une dépense recalcule les enveloppes de l'ancien
**et** du nouveau mois. Aucune invalidation n'est nécessaire, puisqu'aucun total n'est mémorisé.
