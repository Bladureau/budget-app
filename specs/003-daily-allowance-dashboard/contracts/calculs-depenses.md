# Contrat — Module de calcul des dépenses

**Fonctionnalité** : `003-daily-allowance-dashboard`

Tout ce qui figure ici relève de la **logique monétaire** au sens du principe III : tests
obligatoires, avec cas nominal, bornes et entrée malformée.

Module **pur** : ne lit ni `localStorage`, ni le DOM, ni l'horloge. La date de référence est toujours
passée en paramètre — c'est ce qui rend l'allocation quotidienne testable sans simuler le temps, ce
qui serait autrement le point le plus pénible de la fonctionnalité.

---

## `src/features/budget/expenses.ts`

```ts
expensesInMonth(expenses: readonly Expense[], month: MonthKey): Expense[]
totalSpentCentsForMonth(expenses: readonly Expense[], month: MonthKey): Cents
spentOnDayCents(expenses: readonly Expense[], date: IsoDate): Cents
spentBeforeDayCents(expenses: readonly Expense[], date: IsoDate): Cents

computeMonthlySpending(doc: BudgetDocument, month: MonthKey, today: IsoDate): MonthlySpending
computeDailyAllowance(doc: BudgetDocument, date: IsoDate): DailyAllowance

groupByDay(expenses: readonly Expense[]): JournalDay[]
searchExpenses(expenses: readonly Expense[], query: string): Expense[]
normalizeForSearch(text: string): string
```

| Fonction | Comportement contractuel |
| --- | --- |
| `expensesInMonth` | Dépenses dont la date tombe dans le mois, ordonnées de la plus récente à la plus ancienne. |
| `totalSpentCentsForMonth` | Somme par `sumCents`. `0` sans dépense. |
| `spentOnDayCents` | Dépenses de la journée exactement. |
| `spentBeforeDayCents` | Dépenses **du même mois** strictement antérieures à la date. Le cantonnement au mois est essentiel : l'allocation répartit le budget d'un mois, pas d'une vie. |
| `computeMonthlySpending` | Produit l'entité dérivée du modèle. `availableCents` provient de `computeMonthlyBudget().remainingCents` (EF-009). `consumedRatio` est plafonné à 1 (EF-012) et vaut `0` si `availableCents <= 0`. `overspentCents` est exposé pour que la vue n'affiche jamais un reste négatif. |
| `computeDailyAllowance` | Applique la formule ci-dessous. Ne consulte pas l'horloge. |
| `groupByDay` | Regroupe par journée avec sous-total (EF-025), journées de la plus récente à la plus ancienne. |
| `searchExpenses` | Filtre sur libellé et catégorie, insensible à la casse et aux accents (EF-026). Requête vide → liste inchangée. |
| `normalizeForSearch` | `NFD`, retrait des diacritiques, minuscules. Exposée pour être testée seule. |

### Formule de l'allocation, normative

```text
jours_restants(J) = jours_du_mois(J) − quantième(J) + 1
disponible        = computeMonthlyBudget(doc, mois(J), J).remainingCents
dépensé_avant(J)  = spentBeforeDayCents(doc.expenses, J)
reste(J)          = disponible − dépensé_avant(J)

allocation(J)     = reste(J) <= 0  ?  0
                                   :  tronque_centime( reste(J) ÷ jours_restants(J) )

report(J)         = J est le 1er du mois  ?  null
                                          :  allocation(J−1) − dépensé(J−1)
```

**La troncature est normative, pas une commodité.** Elle garantit que la somme des allocations
restantes n'excède jamais le disponible (CS-004) : arrondir au plus proche permettrait de promettre
de l'argent qui n'existe pas. Les centimes non répartis restent dans le reste et reviennent au
dernier jour, où `jours_restants = 1`.

---

## Extensions de `src/features/budget/budget-provider.tsx`

```ts
addExpense: (expense: Omit<Expense, "id">) => void;
updateExpense: (expense: Expense) => void;
removeExpense: (id: string) => void;
```

Mêmes garanties que les actions existantes : revalidation avant écriture, échec d'écriture remonté et
jamais silencieux.

---

## Extensions de `src/lib/storage.ts`

```ts
// interne
analyserDepense(brut: unknown): Expense | null
migrer(brut, depuis): Record<string, unknown> | null   // reçoit son premier vrai cas : 1 → 2
```

`analyserDepense` suit exactement le motif des analyseurs existants : part d'`unknown`, renvoie `null`
en cas de violation, aucun transtypage. L'unicité des identifiants est contrôlée **sur le document
entier**, dépenses comprises.

---

## Cas de test obligatoires

**Allocation quotidienne — le cœur**

- Les quatre scénarios chiffrés du récit 3 : 300,00 € sur 10 jours → 30,00 € ; 10,00 € dépensés →
  32,22 € le lendemain ; 80,00 € dépensés → 24,44 € ; dernier jour → totalité du reste.
- **Propriété CS-004** : sur un mois complet, la somme des allocations restantes n'excède jamais le
  reste, quel que soit le profil de dépense. À vérifier sur plusieurs longueurs de mois.
- **Propriété CS-005** : sous-dépenser d'un écart E augmente l'allocation du lendemain de
  `E ÷ jours_restants`, sur au moins cinq journées consécutives.
- Reste nul, reste négatif → allocation `0` avec `daysRemaining` correct (EF-021).
- Premier jour du mois → `carryOverCents` à `null`, pas `0` : l'absence de veille n'est pas un report
  nul.
- Report positif (gain) et négatif (perte), aux valeurs exactes.
- **CS-006** : aucun reliquat de fin de mois ne se reporte sur le premier jour du mois suivant, sur
  deux changements de mois consécutifs.
- Février 28 et 29 jours, mois de 30 et 31 jours.

**Anneau**

- États `untouched`, `inProgress`, `exhausted`, `overspent`.
- `consumedRatio` plafonné à 1 en dépassement ; `overspentCents` exact.
- `availableCents` nul ou négatif → `consumedRatio` à 0, aucune division par zéro.
- **CS-003** : exactitude au centime sur un mois d'au moins 200 dépenses.

**Journal**

- Regroupement par jour, journées de la plus récente à la plus ancienne, sous-totaux exacts.
- Recherche insensible à la casse et aux accents : « cafe » trouve « Café ».
- Requête vide → liste inchangée ; requête sans résultat → liste vide.
- Dépense d'un autre mois absente de l'anneau mais présente au journal.

**Migration et persistance**

- Un document v1 réaliste migre en v2 **sans perdre un seul revenu ni un seul abonnement**.
- Un document déjà en v2 passe inchangé.
- Un document v2 contenant une dépense invalide (montant négatif, date impossible, identifiant en
  doublon avec un revenu) part en quarantaine sans import partiel.
- **Non-régression de la fonctionnalité 004** : les 43 tests d'export et d'import passent sans
  modification, hormis la version de format attendue.
