# Contrat : calcul de la réserve

**Fonctionnalité** : `specs/008-savings-reserve` | **Date** : 2026-10-03

Ce contrat fixe les formules et le **jeu de référence** que les tests doivent reproduire au
centime. Les montants sont en centimes entiers.

## 1. Fonctions

| Fonction | Module | Rôle |
| --- | --- | --- |
| `activeDeclaration(reserve, month)` | `reserve.ts` | Dernière déclaration dont `fromMonth ≤ month`, ou `null`. |
| `monthsRemaining(declaration, month)` | `reserve.ts` | `max(1, months − écart(fromMonth, month))`. |
| `shareCents(openingCents, monthsRemaining)` | `reserve.ts` | `openingCents` si `≤ 0`, sinon `floor(openingCents / monthsRemaining)`. |
| `withDeclaration(reserve, month, balanceCents, months)` | `reserve.ts` | Nouvelle liste après déclaration ou recalage. |
| `withoutReserve(reserve, month)` | `reserve.ts` | Nouvelle liste après retrait. |
| `computeReserveState(doc, month, today)` | `expenses.ts` | Cascade ; `ReserveState \| null`. |
| `availableCentsForMonth(doc, month, today)` | `expenses.ts` | Revenus nets + part ; seul point de lecture du disponible. |
| `openingBalanceFor(doc, today, balanceTodayCents)` | `expenses.ts` | Réserve de début de mois à enregistrer pour un solde saisi aujourd'hui (§2 bis). |

Toutes sont **pures** : pas d'horloge, pas de stockage.

## 2. Formules

```text
ouverture(F)     = balanceCents                              F = fromMonth de la déclaration
ouverture(m + 1) = ouverture(m) + net(m) − sorties(m)
restants(M)      = max(1, months − écartEnMois(F, M))
part(M)          = ouverture(M)                     si ouverture(M) ≤ 0
                 = floor(ouverture(M) / restants(M)) sinon
disponible(M)    = net(M) + part(M)
entamée(M)       = max(0, dépensé(M) − net(M))
clôture(M)       = ouverture(M) + net(M) − sorties(M)
duréeAtteinte(M) = écartEnMois(F, M) ≥ months
```

- `net(m)` = `computeMonthlyBudget(doc, m, today).remainingCents`.
- `sorties(m)` = dépenses du mois − remboursements du mois, **sans borne** (peut être négatif).
- `dépensé(m)` = `max(0, sorties(m))` : le dépensé net **borné à zéro** que
  `computeMonthlySpending` calcule déjà (règle EF-032 de la fonctionnalité 006), inchangé.

La borne ne sert qu'à l'affichage du mois. La réserve suit `sorties` : un excédent de
remboursement y entre en fin de mois au lieu de disparaître (FR-010).

## 2 bis. Solde saisi en cours de mois

Le solde saisi est celui **du jour** (FR-002). La déclaration enregistre la réserve de **début**
du mois courant `C` :

```text
entaméeÀCeJour = max(0, sorties(C) − net(C))        avec les dépenses et remboursements connus
balanceCents   = soldeSaisi + entaméeÀCeJour
```

Conséquence vérifiable : aussitôt après l'enregistrement, et sans autre dépense,

```text
clôture(C) = soldeSaisi                         si les revenus du mois sont déjà épuisés
clôture(C) = soldeSaisi + net(C) − sorties(C)   sinon (le reste des revenus ira à la réserve)
```

Si `soldeSaisi + entaméeÀCeJour` dépasse 9 000 000 000, la saisie est refusée (`tooLarge`).

## 3. Invariants (à tester)

- **I1** — `clôture(M) = ouverture(M) + net(M) − sorties(M)`, pour tout mois.
- **I2** — `ouverture(M) = balanceCents + Σ net(m) − Σ sorties(m)` sur les mois `F ≤ m < M`
  (SC-003).
- **I3** — si `ouverture(M) > 0` : `0 ≤ part(M) ≤ ouverture(M)` et
  `part(M) × restants(M) ≤ ouverture(M)` (SC-004).
- **I4** — si `restants(M) = 1` et `ouverture(M) > 0` : `part(M) = ouverture(M)`.
- **I5** — sans déclaration applicable : `disponible(M) = net(M)` (SC-006).
- **I6** — une déclaration de `fromMonth > M` n'influence pas `M` (FR-021).
- **I7** — deux calculs sur le même document, le même mois et la même date rendent le même état
  (SC-007).

## 4. Jeu de référence

Déclaration : `{ fromMonth: "2026-10", kind: "open", balanceCents: 600000, months: 12 }`.
Revenus nets : 90 000 chaque mois.

| Mois | Ouverture | Restants | Part | Disponible | Dépensé | Entamée | Dépassement | Clôture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09 | — | — | — | 90 000 | 40 000 | — | 0 | — |
| 2026-10 | 600 000 | 12 | 50 000 | 140 000 | 110 000 | 20 000 | 0 | 580 000 |
| 2026-11 | 580 000 | 11 | 52 727 | 142 727 | 70 000 | 0 | 0 | 600 000 |
| 2026-12 | 600 000 | 10 | 60 000 | 150 000 | 200 000 | 110 000 | 50 000 | 490 000 |
| 2027-01 | 490 000 | 9 | 54 444 | 144 444 | 0 | 0 | 0 | 580 000 |

Septembre précède la déclaration : aucune réserve, disponible inchangé (FR-013).

### Cas isolés

| Cas | Entrée | Attendu |
| --- | --- | --- |
| Troncature | ouverture 100 000, restants 3 | part 33 333 ; le centime restant demeure |
| Dernier mois | ouverture 33 334, restants 1 | part 33 334 |
| Durée écoulée | `months: 3`, 5ᵉ mois | restants 1, `horizonReached: true`, part = ouverture |
| Solde zéro | ouverture 0, restants 12 | part 0 |
| Réserve négative | ouverture −5 000, restants 6 | part −5 000, `shortfallCents: 5 000`, disponible = net − 5 000 |
| Revenus nets négatifs | net −20 000, part 50 000, dépensé 10 000 | disponible 30 000, entamée 30 000 |
| Plus grand montant | ouverture 9 000 000 000, restants 1 | part 9 000 000 000, sans perte de précision |
| Recalage | ajout de `{ "2026-12", open, 300 000, 6 }` au jeu de référence | oct. et nov. inchangés ; déc. : ouverture 300 000, restants 6, part 50 000 |
| Retrait | ajout de `{ "2026-12", closed }` | oct. et nov. inchangés ; déc. : pas de réserve, disponible 90 000 |
| Correction tardive | dépensé d'octobre porté de 110 000 à 100 000 | ouverture de novembre 590 000 |
| Excédent de remboursement | octobre : dépenses 50 000, remboursements 80 000 | dépensé 0, disponible 140 000, reste 140 000 (inchangés par l'excédent), entamée 0, **clôture 720 000** (600 000 + 90 000 + 30 000) |
| Saisie du jour, revenus épuisés | net 90 000, sorties à ce jour 110 000, solde saisi 580 000 | `balanceCents` enregistré 600 000 ; clôture 580 000 |
| Saisie du jour, revenus non épuisés | net 90 000, sorties à ce jour 40 000, solde saisi 600 000 | `balanceCents` enregistré 600 000 ; clôture 650 000 |
| Saisie du jour, revenus nets négatifs | net −20 000, sorties à ce jour 10 000, solde saisi 500 000 | `balanceCents` enregistré 530 000 ; clôture 500 000 |
| Saisie du jour, plafond | solde saisi 9 000 000 000, entamée à ce jour 1 | refus `tooLarge` |
