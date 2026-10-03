# Modèle de données : Réserve d'épargne et report entre les mois

**Fonctionnalité** : `specs/008-savings-reserve` | **Date** : 2026-10-03

## 1. Document budgétaire — version 5

Un seul champ ajouté à `BudgetDocument` :

```ts
interface BudgetDocument {
  version: 5;
  // … champs existants inchangés …
  reserve: ReserveDeclaration[];
}
```

### `ReserveDeclaration` (persistée)

```ts
type ReserveDeclaration =
  | { fromMonth: MonthKey; kind: "open"; balanceCents: Cents; months: number }
  | { fromMonth: MonthKey; kind: "closed" };
```

| Champ | Règle |
| --- | --- |
| `fromMonth` | Mois d'effet (`AAAA-MM`), valide. C'est le mois en cours au moment de la saisie (FR-002). |
| `kind` | `"open"` : déclaration ou recalage. `"closed"` : retrait (FR-022). |
| `balanceCents` | Réserve **en début** du mois `fromMonth`. Entier, de 0 à 9 000 000 000 (le plafond des montants de l'application). **Zéro accepté** : report simple. Ce n'est pas forcément le montant saisi : voir « Saisie ». |
| `months` | Entier, de 1 à 120 (FR-001). |

**Invariants de la liste** (vérifiés par `parseDocument`) :

- triée par `fromMonth` **strictement** croissant — donc au plus une déclaration par mois ;
- aucune autre contrainte d'enchaînement : un `closed` sans `open` précédent est inoffensif (pas
  de réserve avant comme après).

Les déclarations n'ont pas d'identifiant : `fromMonth` les identifie.

### Transitions

| Action de l'utilisateur, au mois courant `C` | Effet sur la liste |
| --- | --- |
| Déclarer ou recaler (solde, durée) | Retirer la déclaration de `fromMonth = C` si elle existe ; ajouter `{ C, open, solde, durée }`. |
| Retirer | Retirer la déclaration de `fromMonth = C` si elle existe ; ajouter `{ C, closed }` — **sauf** s'il n'existe aucune déclaration antérieure à `C`, auquel cas rien n'est ajouté (la liste redevient ce qu'elle était avant). |

Les déclarations antérieures à `C` ne sont **jamais** modifiées ni supprimées (FR-021).

### Migration 4 → 5

Purement additive : `{ ...document, version: 5, reserve: [] }`. Un document v1 à v4 traverse les
étapes existantes puis celle-ci. Aucune donnée existante n'est transformée.

## 2. Export / import — format 5

`FORMAT_VERSION` passe à 5. L'export porte le document v5 tel quel, donc `reserve`. Un export de
format 1 à 4 s'importe par la même migration (réserve vide). Un format supérieur à 5 est refusé
comme aujourd'hui (« version postérieure »).

## 3. Entités dérivées (jamais persistées)

### `ReserveState` — la réserve vue d'un mois

```ts
interface ReserveState {
  openingCents: Cents;        // réserve en début de mois ; peut être négative
  shortfallCents: Cents;      // max(0, −openingCents) : découvert à afficher
  monthsRemaining: number;    // ≥ 1
  horizonReached: boolean;    // la durée déclarée est écoulée
  shareCents: Cents;          // part du mois ; négative si la réserve l'est
  drawnCents: Cents;          // épargne entamée ce mois : max(0, dépensé borné − revenus nets)
  closingCents: Cents;        // ouverture + revenus nets − sorties nettes (non bornées)
}
```

`null` lorsqu'aucune déclaration `open` ne s'applique au mois (aucune déclaration, mois antérieur
à la première, ou dernière déclaration applicable `closed`).

### `MonthlySpending` — champs ajoutés

| Champ | Sens |
| --- | --- |
| `incomeNetCents` | Revenus − abonnements du mois (l'ancien `availableCents`). |
| `reserve` | `ReserveState \| null`. |
| `availableCents` | **Redéfini** : `incomeNetCents + (reserve?.shareCents ?? 0)`. Identique à avant sans réserve. |

`remainingCents`, `overspentCents`, `consumedRatio` et `status` gardent leur définition, calculés
sur le nouveau `availableCents`.

### `DailyAllowance`

Structure inchangée. `allowanceCents` et `carryOverCents` sont calculés sur le nouveau disponible.

## 4. Saisie

| Champ du formulaire | Analyse | Erreurs |
| --- | --- | --- |
| Solde | `parseLimitInput` (existant : virgule ou point, deux décimales, zéro accepté) | vide, non numérique, trop de décimales, négatif, trop grand |
| Nombre de mois | Entier strict (`/^\d+$/`), de 1 à 120 | vide, non entier, hors bornes |

Le champ « Solde » est libellé **« Solde de l'épargne aujourd'hui »**. La valeur enregistrée dans
`balanceCents` est ce solde augmenté de l'épargne déjà entamée ce mois-ci
([contrat de calcul](./contracts/calcul-reserve.md) §2 bis) ; si la somme dépasse le plafond, la
saisie est refusée avec l'erreur « trop grand ».
