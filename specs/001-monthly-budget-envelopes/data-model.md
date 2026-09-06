# Phase 1 — Modèle de données

**Fonctionnalité** : `001-monthly-budget-envelopes` | **Date** : 2026-09-06

Une seule entité persistée est ajoutée : le **plafond**. Tout le reste est dérivé (décision D1).

Conventions inchangées : montants en **centimes entiers** (`Cents`), mois en `MonthKey` (`AAAA-MM`).

---

## Entité persistée : `Envelope` (enveloppe)

Couvre EF-001 à EF-006.

| Champ | Type | Obligatoire | Règles de validation |
| --- | --- | --- | --- |
| `id` | `Id` | oui | Unique dans le document entier, dépenses et revenus compris. |
| `category` | `string` | oui | 1 à 80 caractères après nettoyage. Correspond au texte de `Expense.category`, sensible à la casse et aux accents (décision D3). |
| `month` | `MonthKey` | oui | `AAAA-MM` valide. |
| `limitCents` | `Cents` | oui | Entier `>= 0`. **Zéro est valide** et signifie « ne rien dépenser ici » (décision D7). Négatif refusé (EF-004). |

**Invariant** : au plus une enveloppe par couple (`category`, `month`) — EF-005. Un doublon rend le
document invalide, au même titre qu'un identifiant en double.

**Ce qui n'y figure pas** : aucun montant dépensé, aucun restant, aucun état. Ce sont des dérivés
(décision D1), et les stocker permettrait à un total de contredire ses composantes.

**Noter l'exception** : `limitCents >= 0` alors que tous les autres montants du projet sont
strictement positifs. Elle est délibérée — zéro est ici une intention, pas une absence. L'absence se
traduit par l'absence d'enveloppe.

---

## Document persisté : version 3

```text
BudgetDocument (version 3)
├── incomes: Income[]              inchangé
├── subscriptions: Subscription[]  inchangé
├── expenses: Expense[]            inchangé
└── envelopes: Envelope[]          AJOUTÉ
```

### Migrations

| De | Vers | Règle |
| --- | --- | --- |
| 1 | 2 | `expenses` initialisée à `[]` (fonctionnalité 003) |
| 2 | 3 | `envelopes` initialisée à `[]` |

Un document en version 1 traverse **les deux étapes** : le chemin se compose. Purement additive à
chaque étape, la migration ne peut pas perdre ce qu'elle ne modifie pas.

---

## Entités dérivées

Aucune n'est persistée.

### `EnvelopeStatus` — une enveloppe et sa consommation (EF-011, EF-014 à EF-016)

| Champ | Type | Définition |
| --- | --- | --- |
| `envelopeId` | `Id` | Enveloppe d'origine. |
| `category` | `string` | Catégorie plafonnée. |
| `limitCents` | `Cents` | Plafond du mois. |
| `spentCents` | `Cents` | Somme des dépenses du mois dont la catégorie correspond. |
| `remainingCents` | `Cents` | `limitCents − spentCents`. Peut être négatif. |
| `overspentCents` | `Cents` | Montant du dépassement, `0` sinon. Exposé pour que la vue n'affiche jamais un reste négatif (EF-016). |
| `consumedRatio` | `number` | Plafonné à 1. Vaut `0` si le plafond est nul et rien n'est dépensé, `1` si le plafond est nul et qu'une dépense existe — jamais de division par zéro. |
| `state` | `'unused' \| 'onTrack' \| 'nearingLimit' \| 'overBudget'` | Les quatre états d'EF-014. |

**Règle des états** (EF-014, EF-015), évaluée dans cet ordre :

```text
dépensé > plafond                      → overBudget
dépensé × 100 >= plafond × 85          → nearingLimit
dépensé > 0                            → onTrack
sinon                                  → unused
```

La comparaison du seuil se fait **par multiplication entière**, pas par division : une alerte ne doit
pas dépendre d'un flottant (décision D2).

### `MonthlyEnvelopes` — la synthèse du mois (EF-012, EF-013, EF-018)

| Champ | Type | Définition |
| --- | --- | --- |
| `month` | `MonthKey` | Mois concerné. |
| `envelopes` | `EnvelopeStatus[]` | Enveloppes du mois, triées par montant dépensé décroissant puis par catégorie. |
| `totalPlannedCents` | `Cents` | Somme des plafonds. |
| `totalSpentBudgetedCents` | `Cents` | Somme des dépenses relevant d'une enveloppe. |
| `totalRemainingCents` | `Cents` | `totalPlannedCents − totalSpentBudgetedCents`. |
| `unbudgeted` | `UnbudgetedGroup` | Dépenses hors enveloppe (EF-012). |
| `overBudgetCount` | `number` | Nombre d'enveloppes en dépassement (EF-018). |
| `overBudgetTotalCents` | `Cents` | Montant total du dépassement (EF-018). |

### `UnbudgetedGroup` — le hors-enveloppe (EF-012)

| Champ | Type | Définition |
| --- | --- | --- |
| `totalCents` | `Cents` | Total des dépenses ne relevant d'aucune enveloppe du mois. |
| `byCategory` | `{ category: string \| null; totalCents: Cents }[]` | Ventilation, `null` regroupant les dépenses sans catégorie. Triée par montant décroissant. |

Ce regroupement absorbe **deux populations** : les catégories non plafonnées et les dépenses sans
catégorie. La spécification n'envisageait que la première ; la seconde existe parce que 003 a rendu
la catégorie facultative. Dans les deux cas la dépense n'était pas prévue, le regroupement reste donc
cohérent (décision D3).

---

## Relations

```text
BudgetDocument (v3)
├── expenses   ──┐
└── envelopes  ──┴─▶ computeMonthlyEnvelopes(doc, month)
                     ├── EnvelopeStatus[]     ← dérivés
                     └── UnbudgetedGroup      ← dérivé
```

Aucune clé étrangère : `Envelope.category` est un texte, pas un identifiant. Une enveloppe et une
dépense se rejoignent par **égalité de chaîne**, ce qui rend le lien explicite et fragile au
renommage — conséquence assumée en décision D3.

---

## Règles de validation transverses

1. `limitCents` est un entier `>= 0` et ne dépasse pas le plafond monétaire du domaine (EF-004).
2. `category` fait de 1 à 80 caractères après nettoyage.
3. `month` est un `AAAA-MM` valide.
4. Au plus une enveloppe par (`category`, `month`) — EF-005.
5. `id` unique dans le document entier.

Toute violation à la saisie produit un message textuel en français à côté du champ, et aucune
écriture. Toute violation à la relecture déclenche la quarantaine.

---

## Cas limites et leur traitement

| Cas limite de la spécification | Traitement |
| --- | --- |
| Catégorie renommée ou supprimée | L'enveloppe subsiste avec un dépensé nul ; les dépenses renommées basculent en non budgété. Cas courant, pas exceptionnel (décision D3). |
| Date ou catégorie d'une dépense modifiée | Rien à invalider : tout est dérivé, les deux mois concernés sont recalculés à la lecture (EF-010). |
| Dépenses sans aucun plafond dans le mois | La vue affiche le total non budgété et invite à définir des plafonds (EF-012). |
| Plafond exactement à zéro | Valide. Toute dépense place l'enveloppe en dépassement (décision D7). |
| Plafonds et montants très élevés | Additions entières, exactes jusqu'au plafond du domaine. |
| Limites de mois | La dépense compte dans le mois de **sa date**, jamais de sa saisie. Hérité d'`expensesInMonth`, déjà testé. |
| Mois futur | Les plafonds peuvent être définis à l'avance ; le dépensé reste nul tant qu'aucune dépense n'existe. |
| Revenus et virements | Sans objet : le modèle ne comporte que des dépenses. Voir l'écart n° 2 du plan. |

---

## Réévaluation du contrôle de conformité après conception

- **Principe II** — tenu : aucune division n'est introduite dans le domaine. Le seuil d'alerte est
  comparé par multiplication entière, et le taux de consommation, seul quotient, est cantonné à
  l'affichage avec le plafond nul traité avant tout calcul.
- **Principe III** — surface sous obligation de test : `envelopes.ts` en entier, la migration 2 → 3,
  l'analyseur d'`Envelope` et l'invariant d'unicité par couple.
- **Principe IV** — `Envelope` validée depuis `unknown`, comme les entités existantes.
- **Principe VI** — une entité ajoutée, aucun dérivé stocké, aucun champ anticipant le report
  d'enveloppe, les périodes personnalisées ou une gestion de catégories.
- **Principe VII** — `state` et `overspentCents` sont conçus pour que la vue n'ait jamais à déduire un
  état d'une couleur ni à afficher un nombre négatif brut.

Aucune violation introduite. Le suivi de complexité du plan reste vide.
