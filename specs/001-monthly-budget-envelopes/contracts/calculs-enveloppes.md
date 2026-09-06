# Contrat — Module de calcul des enveloppes

**Fonctionnalité** : `001-monthly-budget-envelopes`

Logique monétaire au sens du principe III : tests obligatoires, cas nominal, bornes, entrée
malformée. Module **pur** — ni `localStorage`, ni DOM, ni horloge.

---

## `src/features/budget/envelopes.ts`

```ts
const NEARING_LIMIT_PERCENT = 85;

envelopesForMonth(envelopes: readonly Envelope[], month: MonthKey): Envelope[]
findEnvelope(envelopes: readonly Envelope[], category: string, month: MonthKey): Envelope | null

envelopeState(spentCents: Cents, limitCents: Cents): EnvelopeState
consumedRatio(spentCents: Cents, limitCents: Cents): number

computeMonthlyEnvelopes(doc: BudgetDocument, month: MonthKey): MonthlyEnvelopes
copyEnvelopesToMonth(envelopes: readonly Envelope[], from: MonthKey, to: MonthKey): Envelope[]
```

| Fonction | Comportement contractuel |
| --- | --- |
| `envelopesForMonth` | Enveloppes du mois, triées par catégorie pour un ordre déterministe. |
| `findEnvelope` | L'enveloppe du couple, ou `null`. Comparaison de catégorie **sensible à la casse et aux accents** (décision D3). |
| `envelopeState` | Applique la règle des quatre états ci-dessous. |
| `consumedRatio` | Plafonné à 1. Plafond nul : `0` sans dépense, `1` avec. **Aucune division n'est effectuée quand le plafond est nul** — le cas est traité avant. |
| `computeMonthlyEnvelopes` | Produit l'entité dérivée du modèle, ventilation non budgétée comprise. |
| `copyEnvelopesToMonth` | Duplique les plafonds du mois source vers le mois cible, avec de **nouveaux identifiants**. Ne crée aucun lien entre les mois (décision D6). |

### Règle des états, normative

```text
dépensé > plafond               → overBudget
dépensé == 0                    → unused
dépensé × 100 >= plafond × 85   → nearingLimit
sinon                           → onTrack
```

Évaluée **dans cet ordre**, et par **multiplication entière** plutôt que par division : une alerte ne
doit pas dépendre d'un flottant. Un plafond nul avec une dépense tombe dans le premier cas, ce qui est
le comportement attendu (décision D7).

> **Corrigée le 2026-09-06 pendant l'implémentation.** La rédaction initiale plaçait le test du seuil
> avant celui du dépensé nul. Un plafond nul **et** un dépensé nul satisfaisaient alors trivialement
> la comparaison `0 >= 0` et l'enveloppe était annoncée « proche du plafond » alors que rien n'avait
> été dépensé. Tester le dépensé nul en second corrige le cas sans rien changer aux autres : une
> enveloppe où rien n'a été dépensé n'est jamais proche de son plafond.

### Règle d'affectation d'une dépense

Une dépense du mois relève d'une enveloppe si `expense.category` est une chaîne **exactement égale** à
`envelope.category`. Sinon — catégorie différente, ou `null` — elle alimente le regroupement non
budgété.

---

## Extensions de `src/features/budget/budget-provider.tsx`

```ts
setEnvelopeLimit: (category: string, month: MonthKey, limitCents: Cents) => void;
removeEnvelope: (id: string) => void;
copyEnvelopesFromPreviousMonth: (month: MonthKey) => boolean;
```

| Action | Comportement contractuel |
| --- | --- |
| `setEnvelopeLimit` | Crée l'enveloppe du couple, ou met à jour son plafond si elle existe — jamais de doublon (EF-005). |
| `removeEnvelope` | Retire l'enveloppe. Ses dépenses basculent en non budgété (EF-002, scénario 3 du récit 1). |
| `copyEnvelopesFromPreviousMonth` | Renvoie `false` si le mois précédent n'a aucun plafond. **Ne demande pas la confirmation** : c'est l'interface qui la recueille, ce module ne fait qu'appliquer. |

---

## Extensions de `src/lib/storage.ts`

```ts
analyserEnveloppe(brut: unknown): Envelope | null      // interne
migrer(brut, depuis)                                    // reçoit son deuxième cas : 2 → 3
```

`analyserEnveloppe` suit le motif des analyseurs existants. L'unicité par couple
(`category`, `month`) est vérifiée au niveau du document, comme celle des identifiants.

---

## Cas de test obligatoires

**États et seuil**

- Plafond 400,00 € : 0 dépensé → `unused` ; 200,00 € → `onTrack` ; **340,00 € exactement → `nearingLimit`**
  (85 %) ; 339,99 € → `onTrack` ; 400,00 € → `nearingLimit` ; 400,01 € → `overBudget`.
- Plafond nul : 0 dépensé → `unused` ; toute dépense → `overBudget` (décision D7).
- `consumedRatio` plafonné à 1 en dépassement ; jamais `NaN` ni `Infinity`.

**Calcul du mois**

- Le dépensé d'une enveloppe est la somme exacte des dépenses du mois de sa catégorie, au centime,
  sur au moins 200 dépenses (CS-003).
- Une dépense datée d'un autre mois n'entre pas dans le calcul.
- Une dépense sans catégorie va au non budgété.
- Une dépense d'une catégorie sans enveloppe va au non budgété.
- Une enveloppe sans dépense reste affichée, dépensé nul.
- `overBudgetCount` et `overBudgetTotalCents` exacts (EF-018).
- Ventilation triée de façon déterministe à montants égaux.

**Isolation des mois (CS-007)**

- Un plafond défini en mars n'apparaît pas en avril.
- Modifier le plafond d'avril ne change aucun montant de mars, vérifié sur trois mois consécutifs.

**Report des plafonds**

- `copyEnvelopesToMonth` duplique tous les plafonds avec de nouveaux identifiants.
- Copier depuis un mois vide renvoie une liste vide.
- Les enveloppes copiées sont indépendantes : modifier la copie ne touche pas l'original.

**Migration et persistance**

- Un document v2 migre en v3 **sans perdre une seule dépense** ; `envelopes` initialisée à `[]`.
- Un document v1 traverse les deux migrations jusqu'en v3, sans perte.
- Plafond négatif, catégorie vide, mois mal formé, doublon de couple → document refusé.
- **Non-régression de la fonctionnalité 004** : les tests d'export passent sans autre modification
  que leurs témoins portés en version 3.
