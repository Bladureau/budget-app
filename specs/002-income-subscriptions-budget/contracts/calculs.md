# Contrat — Modules de calcul

**Fonctionnalité** : `002-income-subscriptions-budget`

Ce contrat fixe la surface publique des modules purs. Tout ce qui figure ici relève de la **logique
monétaire** au sens du principe III de la constitution : les tests sont obligatoires, avec cas
nominal, bornes (zéro, négatif, montant maximal réaliste) et entrée malformée.

Aucune de ces fonctions ne lit `localStorage`, ne touche au DOM ni ne consulte l'horloge : la date de
référence est toujours passée en paramètre. C'est ce qui les rend testables sans simulation d'horloge.

---

## `src/lib/money.ts`

```ts
type Cents = number  // entier signé

parseAmountInput(raw: string): { ok: true; cents: Cents } | { ok: false; reason: AmountError }
formatCents(cents: Cents): string
sumCents(values: readonly Cents[]): Cents
```

| Fonction | Comportement contractuel |
| --- | --- |
| `parseAmountInput` | Accepte `"12,40"` et `"12.40"` de façon identique (EF-028). Tolère les espaces de bordure et l'espace insécable des milliers. Refuse : chaîne vide, non numérique, plus de deux décimales, valeur négative ou nulle. Ne renvoie jamais `NaN` : l'échec est explicite et porte un motif exploitable pour le message affiché. |
| `formatCents` | Seul appel à `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`. Un montant négatif est formaté avec son signe ; la présentation d'un déficit en valeur absolue relève de la vue, pas du formateur. |
| `sumCents` | Addition entière. Somme vide = `0`. |

**Interdit** : tout `parseFloat` ou arithmétique décimale sur un montant ailleurs que dans ce module.

---

## `src/lib/date.ts`

```ts
type IsoDate = string   // "AAAA-MM-JJ"
type MonthKey = string  // "AAAA-MM"

monthKeyOf(date: IsoDate): MonthKey
startOfMonth(month: MonthKey): IsoDate
endOfMonth(month: MonthKey): IsoDate
daysInMonth(month: MonthKey): number
addMonthsClamped(date: IsoDate, months: number): IsoDate
compareIso(a: IsoDate, b: IsoDate): number
isValidIsoDate(value: string): boolean
```

| Fonction | Comportement contractuel |
| --- | --- |
| `addMonthsClamped` | Ajoute des mois en **rabattant** sur le dernier jour du mois cible si le jour d'origine n'y existe pas (EF-013). Le jour de référence reste celui de la date d'origine, sans dérive : `2026-01-31 +1 mois → 2026-02-28`, puis `2026-01-31 +2 mois → 2026-03-31`. |
| `isValidIsoDate` | Vérifie la syntaxe **et** la validité calendaire : `2026-02-31` est refusé, `2028-02-29` accepté. |
| `compareIso` | Comparaison lexicographique, qui coïncide avec l'ordre chronologique pour ce format. |

Toutes les dates sont calendaires locales, sans heure ni fuseau, ce qui neutralise le changement
d'heure saisonnier mentionné en cas limite de la spécification.

---

## `src/features/budget/calculs.ts`

```ts
occurrencesInMonth(income: Income, month: MonthKey): IsoDate[]
duesInMonth(subscription: Subscription, month: MonthKey): { dueDate: IsoDate; amountCents: Cents }[]
amountAt(subscription: Subscription, date: IsoDate): Cents | null
averageMonthlyCostCents(subscription: Subscription, at: IsoDate): Cents
computeMonthlyBudget(doc: BudgetDocument, month: MonthKey, today: IsoDate): MonthlyBudget
listUpcomingDues(doc: BudgetDocument, from: IsoDate, count: number): UpcomingDue[]
forecast(doc: BudgetDocument, fromMonth: MonthKey, months: number, today: IsoDate): MonthlyBudget[]
```

| Fonction | Comportement contractuel |
| --- | --- |
| `occurrencesInMonth` | Occurrences d'un revenu dans le mois. Un revenu ponctuel en produit une si sa date y tombe, zéro sinon. Un revenu récurrent en produit une par échéance, bornée par `startDate` et `endDate` incluses (EF-005). Une périodicité peut produire plusieurs occurrences dans un même mois : le contrat renvoie donc une liste, jamais un booléen. |
| `duesInMonth` | Échéances d'un abonnement imputées au mois (EF-008). Exclut les échéances tombant dans une période de suspension (EF-011). Renvoie une liste vide hors de la fenêtre `startDate`–`endDate`. |
| `amountAt` | Montant applicable à une date : celui de la dernière `AmountPeriod` dont `effectiveFrom <= date` (EF-010). Renvoie `null` avant la première période — cas qui ne doit pas survenir si les invariants du modèle sont respectés, mais qui n'est pas masqué par une valeur par défaut. |
| `averageMonthlyCostCents` | `arrondi_au_plus_proche(montant ÷ mois_par_période)`, demi-centime arrondi au supérieur. **Indicateur d'affichage uniquement** (EF-009) : n'entre dans aucun total, ce qui empêche l'arrondi de se propager. |
| `computeMonthlyBudget` | Produit l'entité dérivée `MonthlyBudget` du modèle de données. `remainingCents = revenus − charges`. `commitmentRate` vaut `null` si les revenus sont nuls (jamais de division par zéro). `breakdown` est triée par montant décroissant puis par libellé. `isProjection` est vrai si `month` est postérieur au mois de `today`. |
| `listUpcomingDues` | Les `count` prochaines échéances à partir de `from` incluse, toutes fonctionnalités confondues, triées par date puis libellé (EF-024). |
| `forecast` | Applique `computeMonthlyBudget` sur `months` mois consécutifs (EF-023). Ne consulte pas l'horloge : `today` est fourni. |

---

## Cas de test obligatoires

Dérivés du principe III et des cas limites de la spécification. Chacun doit exister comme test.

**`money`**

- `parseAmountInput` : `"12,40"` et `"12.40"` → `1240` ; `""`, `"abc"`, `"1,234"`, `"-5"`, `"0"` →
  échec explicite ; espaces et espace insécable tolérés.
- `sumCents` : liste vide → `0` ; somme d'un grand nombre de montants sans perte de précision.

**`date`**

- `addMonthsClamped` : `2026-01-31 +1` → `2026-02-28` ; `2028-01-31 +1` → `2028-02-29` (bissextile) ;
  `2026-01-31 +2` → `2026-03-31` (absence de dérive) ; franchissement d'année `2026-12-15 +1` →
  `2027-01-15`.
- `isValidIsoDate` : `2026-02-31` refusé ; `2028-02-29` accepté ; `2026-13-01` refusé.
- `daysInMonth` : 28, 29, 30 et 31 jours.

**`calculs`**

- `duesInMonth` : abonnement annuel présent uniquement dans son mois d'échéance et absent des onze
  autres (scénario 2 du récit 2) ; abonnement démarré en cours de mois non compté avant `startDate` ;
  échéance dans une pause non comptée ; abonnement au 31 rattaché au dernier jour de février.
- `amountAt` : changement de tarif au 1er juin → mai à l'ancien montant, juin au nouveau (CS-006) ;
  date antérieure à la première période → `null`.
- `averageMonthlyCostCents` : annuel 120,00 € → 10,00 € (scénario 3 du récit 2) ; trimestriel
  10,00 € → 3,33 € ; semestriel 10,01 € → 1,67 € (demi-centime arrondi au supérieur) ; vérification
  qu'aucun total ne consomme cette valeur.
- `computeMonthlyBudget` : excédent, équilibre exact à zéro, déficit ; revenus nuls →
  `commitmentRate === null` ; ventilation triée de façon déterministe à montants égaux ; exactitude au
  centime sur au moins 50 éléments (CS-002).
- `forecast` : douze mois consécutifs, échéances annuelles apparaissant une seule fois (CS-003) ;
  aucun effet d'un plafond ou d'un changement postérieur sur les mois antérieurs.
