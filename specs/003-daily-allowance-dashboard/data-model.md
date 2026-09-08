# Phase 1 — Modèle de données

**Fonctionnalité** : `003-daily-allowance-dashboard` | **Date** : 2026-09-06

Cette fonctionnalité ajoute **une seule** entité persistée, et en **retire une** par rapport à la
spécification : la journée budgétaire devient dérivée (décision D1).

Conventions inchangées : montants en **centimes entiers** (`Cents`), dates en `AAAA-MM-JJ`
(`IsoDate`), mois en `AAAA-MM` (`MonthKey`).

---

## Entité persistée : `Expense` (dépense)

Couvre EF-001 à EF-006. C'est la seule structure que cette fonctionnalité ajoute au document.

| Champ | Type | Obligatoire | Règles de validation |
| --- | --- | --- | --- |
| `id` | `Id` | oui | Unique dans le document entier, revenus et abonnements compris. |
| `amountCents` | `Cents` | oui | Entier `> 0`. Refus si vide, nul, négatif, non numérique ou à plus de deux décimales (EF-004). |
| `date` | `IsoDate` | oui | Date calendaire valide. La date du jour par défaut à la saisie (EF-001). |
| `label` | `string` | non | 1 à 80 caractères après nettoyage. Absent, un libellé par défaut est affiché — jamais stocké, pour ne pas figer une valeur d'affichage. |
| `category` | `string \| null` | non | 1 à 80 caractères, ou `null`. Facultative pour ne pas ralentir la saisie. |

**Ce qui n'y figure pas, délibérément** : aucun type d'écriture. Cette fonctionnalité ne gère que des
**dépenses** ; les revenus restent l'affaire de la fonctionnalité 002 et les virements sont hors
périmètre. Ajouter un champ `type` aujourd'hui serait de la généralité spéculative (principe VI).

---

## Document persisté : version 2

```text
BudgetDocument (version 2)
├── incomes: Income[]              inchangé
├── subscriptions: Subscription[]  inchangé
└── expenses: Expense[]            AJOUTÉ
```

L'ajout est **purement additif** : aucun champ existant n'est modifié, renommé ou supprimé. C'est ce
qui rend la migration incapable de perdre des données — elle ne touche pas ce qu'elle reprend.

### Migration 1 → 2

| De | Vers | Règle |
| --- | --- | --- |
| 1 | 2 | `incomes` et `subscriptions` repris tels quels ; `expenses` initialisée à `[]` ; `version` portée à 2. |

Contraintes déjà en vigueur et héritées sans effort : validation totale avant écriture, quarantaine
d'un document illisible, refus d'une version supérieure. Un document v2 ouvert par une version
antérieure de l'application part en quarantaine plutôt que d'être écrasé.

---

## Entités dérivées

Aucune n'est persistée. Toutes se recalculent à partir du document et d'une date de référence.

### `MonthlySpending` — l'anneau (EF-007 à EF-014)

| Champ | Type | Définition |
| --- | --- | --- |
| `month` | `MonthKey` | Mois concerné. |
| `availableCents` | `Cents` | Montant disponible du mois, repris de `computeMonthlyBudget().remainingCents` de la fonctionnalité 002 : revenus moins charges engagées. |
| `spentCents` | `Cents` | Somme des dépenses datées dans le mois. |
| `remainingCents` | `Cents` | `availableCents − spentCents`. Peut être négatif. |
| `consumedRatio` | `number` | Proportion consommée, **plafonnée à 1** pour que l'anneau ne déborde pas (EF-012). `0` si `availableCents <= 0`, jamais de division par zéro. |
| `overspentCents` | `Cents` | Montant du dépassement, `0` s'il n'y en a pas. Exposé séparément pour que la vue n'ait jamais à présenter un reste négatif (EF-012). |
| `status` | `'untouched' \| 'inProgress' \| 'exhausted' \| 'overspent'` | Les quatre états d'EF-011. |

### `DailyAllowance` — l'allocation du jour (EF-015 à EF-022)

**Entièrement dérivée** (décision D1). Aucune donnée n'est stockée pour la produire.

| Champ | Type | Définition |
| --- | --- | --- |
| `date` | `IsoDate` | Jour concerné. |
| `allowanceCents` | `Cents` | `tronque((disponible − dépensé_avant) ÷ jours_restants)`. `0` si le reste est nul ou négatif (EF-021). |
| `spentTodayCents` | `Cents` | Dépenses datées de ce jour. |
| `remainingTodayCents` | `Cents` | `allowanceCents − spentTodayCents`. Peut être négatif. |
| `carryOverCents` | `Cents \| null` | Report de la veille : `allocation(J−1) − dépensé(J−1)`. Positif = gain, négatif = perte. `null` le premier jour du mois, où il n'y a pas de veille dans ce budget. |
| `daysRemaining` | `number` | `jours_du_mois − quantième + 1`. Vaut 1 le dernier jour, d'où l'allocation égale à la totalité du reste (EF-008 du récit 3). |

**Formule, énoncée une fois pour toutes** :

```text
jours_restants(J) = jours_du_mois(J) − quantième(J) + 1
dépensé_avant(J)  = Σ dépenses du mois dont la date < J
allocation(J)     = tronque_centime( (disponible − dépensé_avant(J)) ÷ jours_restants(J) )
report(J)         = allocation(J−1) − dépensé(J−1)
```

La troncature garantit que la somme des allocations restantes n'excède jamais le disponible (CS-004),
propriété vérifiée sur 20 000 tirages en phase 0.

### `JournalDay` — une journée du journal (EF-024, EF-025)

| Champ | Type | Définition |
| --- | --- | --- |
| `date` | `IsoDate` | Journée. |
| `expenses` | `Expense[]` | Dépenses du jour, de la plus récemment saisie à la plus ancienne. |
| `subtotalCents` | `Cents` | Somme des montants du jour. |

Les journées sont ordonnées de la plus récente à la plus ancienne. À montants et dates égaux, l'ordre
de saisie départage, ce qui rend l'affichage déterministe et donc testable.

---

## Relations

```text
BudgetDocument (v2)
├── incomes        ─┐
├── subscriptions  ─┴─▶ computeMonthlyBudget() ─▶ availableCents
└── expenses       ────▶ MonthlySpending
                        DailyAllowance      ← toutes dérivées, jamais stockées
                        JournalDay[]
```

Aucune clé étrangère : `Expense` ne référence ni un revenu ni un abonnement. La catégorie est une
chaîne libre, pas un identifiant — la gestion d'une liste de catégories reste hors périmètre, comme
l'annonce la spécification.

---

## Règles de validation transverses

Appliquées à la saisie comme à la relecture (EF-004, principe IV) :

1. `amountCents` est un entier `> 0`. La saisie passe par `parseAmountInput()`, qui accepte
   indifféremment virgule et point (EF-003) et refuse plus de deux décimales.
2. `date` est syntaxiquement et **calendairement** valide : le 31 février est refusé.
3. `label`, s'il est fourni, fait de 1 à 80 caractères après suppression des espaces de bordure.
4. `category`, si elle est fournie, suit la même règle ; sinon `null`.
5. Un `id` en doublon **dans le document entier** invalide le document.

Toute violation à la saisie produit un message textuel en français à côté du champ, et aucune
écriture. Toute violation à la relecture déclenche la quarantaine.

---

## Cas limites et leur traitement

| Cas limite de la spécification | Traitement |
| --- | --- |
| Dépense saisie juste avant minuit | Rattachée au jour de sa `date`. Le calcul du lendemain la compte comme dépense de la veille — conséquence directe de la dérivation. |
| Dépense datée d'un autre mois | Exclue de l'anneau et de l'allocation, visible dans le journal à son mois. |
| Un seul jour restant | `daysRemaining = 1`, l'allocation vaut la totalité du reste. Aucun reliquat perdu. |
| Reste non divisible | La troncature laisse les centimes dans le reste ; ils se redistribuent les jours suivants et reviennent au dernier jour. |
| Changement de mois, application ouverte | Bascule automatique (décision D9). |
| Mois de 28 à 31 jours | `daysInMonth()` de la fonctionnalité 002, déjà testé sur les quatre longueurs et les années séculaires. |
| Changement d'heure saisonnier | Sans effet : les dates sont calendaires, sans heure ni fuseau. |
| Disponible négatif dès le départ | `status = 'overspent'`, allocation nulle, aucun état d'erreur. |
| Beaucoup de dépenses le même jour | Sous-total exact par `sumCents` ; le regroupement reste lisible. |
| Montant à plus de deux décimales | Refusé par `parseAmountInput` avec un message explicite, jamais tronqué en silence. |

---

## Réévaluation du contrôle de conformité après conception

- **Principe II** — tenu : `Cents` reste le seul type monétaire ; la division de l'allocation a sa
  règle énoncée et vérifiée ; `consumedRatio` et `availableCents <= 0` protègent de la division par
  zéro.
- **Principe III** — surface sous obligation de test identifiée : `expenses.ts` en entier, plus la
  migration 1 → 2 et l'analyseur d'`Expense`.
- **Principe IV** — `Expense` est validée à l'exécution depuis `unknown`, comme les entités
  existantes.
- **Principe VI** — le modèle ajoute une entité et **en retire une** : la journée budgétaire de la
  spécification est dérivée. Aucun champ n'anticipe les virements, les justificatifs ou la gestion des
  catégories.
- **Principe VII** — `status` et `overspentCents` sont conçus pour que la vue n'ait jamais à déduire
  un état d'une couleur ni à afficher un nombre négatif brut.

Aucune violation introduite. Le suivi de complexité du plan reste vide.
