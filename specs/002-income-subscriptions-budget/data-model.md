# Phase 1 — Modèle de données

**Fonctionnalité** : `002-income-subscriptions-budget` | **Date** : 2026-09-05

Toutes les entités décrites ici sont persistées dans le document unique défini par
[contracts/stockage.md](./contracts/stockage.md). Les montants sont exprimés en **centimes entiers**
(`Cents`), les dates en chaînes `AAAA-MM-JJ` et les mois en clés `AAAA-MM`.

---

## Types de base

| Type | Représentation | Règles |
| --- | --- | --- |
| `Cents` | `number` entier signé | Entier strict. Un montant saisi est toujours `> 0` ; le signe négatif n'apparaît que sur des valeurs dérivées (reste disponible en déficit). |
| `IsoDate` | `string` | Format `AAAA-MM-JJ`, date calendaire locale, sans heure ni fuseau. |
| `MonthKey` | `string` | Format `AAAA-MM`. Sert de clé de regroupement et d'ordre (l'ordre lexicographique est l'ordre chronologique). |
| `Periodicity` | `'monthly' \| 'quarterly' \| 'biannual' \| 'annual'` | EF-007. La périodicité hebdomadaire est hors périmètre (hypothèse de la spécification). |
| `Id` | `string` | Identifiant opaque généré à la création via `crypto.randomUUID()`. Immuable. |

---

## Entité : `Income` (revenu)

Couvre EF-001 à EF-005.

| Champ | Type | Obligatoire | Règles de validation |
| --- | --- | --- | --- |
| `id` | `Id` | oui | Unique dans la collection. |
| `label` | `string` | oui | 1 à 80 caractères après suppression des espaces de bordure. |
| `amountCents` | `Cents` | oui | Entier `> 0`. Refus si négatif, nul ou non numérique (EF-004). |
| `kind` | `'oneOff' \| 'recurring'` | oui | Détermine quels champs de date s'appliquent. |
| `date` | `IsoDate` | si `kind = 'oneOff'` | Date de perception. |
| `periodicity` | `Periodicity` | si `kind = 'recurring'` | |
| `startDate` | `IsoDate` | si `kind = 'recurring'` | Première échéance. |
| `endDate` | `IsoDate \| null` | non | Si présente, doit être `>= startDate` (EF-004). `null` signifie sans terme. |

**Règles dérivées**

- Un revenu ponctuel appartient au mois de sa `date`.
- Un revenu récurrent produit une occurrence aux mois où une échéance tombe, à partir de
  `startDate`, selon `periodicity`, et jusqu'à `endDate` incluse si elle existe (EF-005, scénario 6
  du récit 1).
- Le total des revenus d'un mois est la somme des montants des occurrences de ce mois.

---

## Entité : `Subscription` (abonnement)

Couvre EF-006 à EF-013.

| Champ | Type | Obligatoire | Règles de validation |
| --- | --- | --- | --- |
| `id` | `Id` | oui | Unique dans la collection. |
| `label` | `string` | oui | 1 à 80 caractères après nettoyage. |
| `periodicity` | `Periodicity` | oui | Refus si absente (EF-005 du récit 2). |
| `startDate` | `IsoDate` | oui | Date de la première échéance ; en fixe aussi le jour de prélèvement. |
| `endDate` | `IsoDate \| null` | non | Date de résiliation incluse. Doit être `>= startDate`. |
| `amounts` | `AmountPeriod[]` | oui | Au moins un élément. Historique des montants (EF-010). |
| `pauses` | `PausePeriod[]` | non | Périodes de suspension (EF-011). Par défaut, tableau vide. |

### Sous-structure : `AmountPeriod`

| Champ | Type | Règles |
| --- | --- | --- |
| `amountCents` | `Cents` | Entier `> 0`. |
| `effectiveFrom` | `IsoDate` | Date à partir de laquelle ce montant s'applique. |

Invariants : les périodes sont triées par `effectiveFrom` croissant, sans doublon de date, et la
première a un `effectiveFrom` égal à `startDate` de l'abonnement. Le montant applicable à une
échéance est celui de la dernière période dont `effectiveFrom <= date de l'échéance` — c'est ce qui
garantit qu'un changement de tarif ne réécrit pas les mois antérieurs (EF-025, CS-006).

### Sous-structure : `PausePeriod`

| Champ | Type | Règles |
| --- | --- | --- |
| `from` | `IsoDate` | Début de suspension, inclus. |
| `to` | `IsoDate \| null` | Fin de suspension, incluse. `null` = suspension sans terme. |

Invariants : `to >= from` si présente ; les périodes ne se chevauchent pas.

**Règles dérivées**

- Une échéance est **imputée** au mois où elle tombe, jamais lissée (EF-008).
- Une échéance dont le jour n'existe pas dans le mois cible est rattachée au dernier jour de ce mois
  (EF-013). Le jour de référence reste celui de `startDate` : un abonnement au 31 janvier produit le
  28 février puis le 31 mars, sans dérive progressive.
- Une échéance tombant dans une période de suspension n'est pas comptée (EF-011).
- Un abonnement est **actif** si `endDate` est absente ou postérieure ou égale à la date du jour
  (EF-012) ; les abonnements inactifs restent consultables.

---

## Entité dérivée : `MonthlyBudget` (budget mensuel)

Jamais persistée. Recalculée à la demande par `computeMonthlyBudget()`. Couvre EF-014 à EF-018.

| Champ | Type | Définition |
| --- | --- | --- |
| `month` | `MonthKey` | Mois concerné. |
| `totalIncomeCents` | `Cents` | Somme des occurrences de revenus du mois. |
| `totalChargesCents` | `Cents` | Somme des échéances d'abonnement du mois. |
| `remainingCents` | `Cents` | `totalIncomeCents - totalChargesCents`. Peut être négatif. |
| `commitmentRate` | `number \| null` | `totalChargesCents / totalIncomeCents`, arrondi au dixième de point. `null` si les revenus sont nuls — jamais une division par zéro (EF-018). |
| `status` | `'surplus' \| 'balanced' \| 'deficit'` | `balanced` si `remainingCents === 0`. |
| `breakdown` | `ChargeLine[]` | Ventilation triée par montant décroissant (EF-017). |
| `isProjection` | `boolean` | Vrai si `month` est postérieur au mois courant (EF-022). |

### Sous-structure : `ChargeLine`

| Champ | Type | Définition |
| --- | --- | --- |
| `subscriptionId` | `Id` | Abonnement d'origine. |
| `label` | `string` | Libellé au moment du calcul. |
| `amountCents` | `Cents` | Montant de l'échéance imputée à ce mois. |
| `dueDate` | `IsoDate` | Date de l'échéance. |

En cas d'égalité de montant, le tri secondaire se fait par libellé, ordre alphabétique, pour que
l'affichage soit déterministe et testable.

---

## Entité dérivée : `UpcomingDue` (échéance à venir)

Jamais persistée. Alimente EF-024.

| Champ | Type | Définition |
| --- | --- | --- |
| `subscriptionId` | `Id` | |
| `label` | `string` | |
| `amountCents` | `Cents` | Montant applicable à cette date. |
| `dueDate` | `IsoDate` | |

Triées par `dueDate` croissante, puis par libellé.

---

## Relations

```text
BudgetDocument (racine persistée, version 1)
├── incomes: Income[]
└── subscriptions: Subscription[]
        ├── amounts: AmountPeriod[]   (1..n, triées)
        └── pauses:  PausePeriod[]    (0..n, disjointes)

MonthlyBudget  ← dérivé de (incomes, subscriptions, month)
UpcomingDue[]  ← dérivé de (subscriptions, fenêtre de dates)
```

Aucune relation n'est matérialisée par une clé étrangère : le document est un agrégat unique lu et
écrit en entier. `ChargeLine.subscriptionId` n'est qu'une référence d'affichage, recalculée à chaque
dérivation ; supprimer un abonnement fait donc simplement disparaître ses lignes des mois futurs
recalculés.

---

## Transitions d'état d'un abonnement

```text
        créé
          │
          ▼
      ┌────────┐   pause(from,to)    ┌──────────┐
      │ actif  │────────────────────▶│ suspendu │
      │        │◀────────────────────│          │
      └────────┘   fin de la pause   └──────────┘
          │
          │ résiliation(endDate)
          ▼
      ┌──────────┐
      │ résilié  │   (consultable, exclu de la liste des actifs — EF-012)
      └──────────┘
```

L'état n'est pas un champ stocké : il se déduit de `endDate`, de `pauses` et de la date de référence.
Cela évite tout risque d'incohérence entre un état enregistré et les dates qui le justifient.

---

## Règles de validation transverses

Appliquées à la saisie comme à la relecture du document (EF-004, principe IV) :

1. Tout montant est un entier `> 0` ; le résultat de `parseAmountInput()` est vérifié avant
   construction de l'entité.
2. Toute date est syntaxiquement `AAAA-MM-JJ` **et** sémantiquement valide (le 31 février est
   refusé).
3. `endDate >= startDate` partout où les deux existent.
4. `amounts` est non vide et trié ; `pauses` est sans chevauchement.
5. Un `id` en doublon dans une collection rend le document invalide.
6. Un document dont la `version` est inconnue n'est ni lu ni écrasé : il est mis en quarantaine.

Toute violation à la saisie produit un message textuel en français placé à côté du champ concerné, et
aucune écriture. Toute violation à la relecture déclenche la quarantaine décrite dans le contrat de
stockage.

---

## Réévaluation du contrôle de conformité après conception

- **Principe II** — tenu : `Cents` est le seul type monétaire du modèle ; la seule division du
  domaine (coût mensuel moyen) est cantonnée à l'affichage et n'entre dans aucun total.
  `commitmentRate` protège explicitement contre la division par zéro.
- **Principe III** — la surface sous obligation de test est identifiée : `lib/money`, `lib/date`,
  `lib/storage` et les dérivations `computeMonthlyBudget()` / `listUpcomingDues()`.
- **Principe IV** — aucune entité n'est obtenue par transtypage ; les analyseurs partent d'`unknown`.
- **Principe VI** — le modèle ne comporte ni champ de devise, ni champ d'utilisateur, ni état
  d'abonnement stocké : rien qui anticipe un besoin non spécifié.

Aucune violation introduite par la conception. Le tableau de suivi de complexité du plan reste vide.
