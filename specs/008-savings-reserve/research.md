# Recherche : Réserve d'épargne et report entre les mois

**Fonctionnalité** : `specs/008-savings-reserve` | **Date** : 2026-10-03

Aucune inconnue de framework : la fonctionnalité n'ajoute ni route, ni dépendance, ni API Next.js.
Les décisions portent sur le modèle de données et sur l'endroit où le calcul s'insère dans
l'existant (`calculs.ts`, `expenses.ts`, `budget-document.ts`, `budget-provider.tsx`).

---

## R1 — On enregistre des déclarations, jamais des soldes mensuels

**Décision** : le document ne stocke qu'une liste de **déclarations** (`reserve`), chacune datée
du mois où elle prend effet : une ouverture (solde + durée) ou un retrait. La réserve d'un mois
quelconque est **recalculée** à chaque affichage, par une cascade partant de la dernière
déclaration qui précède ce mois.

**Justification** :

- FR-011 l'exige : corriger une dépense de septembre doit changer la réserve d'octobre sans
  action. Un solde mensuel enregistré serait faux dès la première correction.
- C'est le principe déjà suivi par l'allocation quotidienne (« entièrement dérivée », décision D1
  de la fonctionnalité 003) : un instantané stocké crée des trous les mois où l'application
  n'est pas ouverte (récit 2, scénario 5).
- Deux appareils qui partagent le même document obtiennent le même résultat par construction
  (SC-007) : il n'y a rien à synchroniser en plus.

**Alternative écartée** : une « clôture » écrite en fin de mois. Elle demanderait une tâche de
fond ou une écriture à l'ouverture, deux appareils pourraient clôturer en concurrence, et une
correction tardive laisserait la clôture périmée.

---

## R2 — Une liste de déclarations plutôt qu'une seule

**Décision** : `reserve` est une liste, triée par mois strictement croissant, au plus une
déclaration par mois. Recaler ou retirer **ajoute** une déclaration pour le mois en cours (ou
remplace celle du mois en cours s'il y en a déjà une). Un mois utilise la dernière déclaration
dont le mois est inférieur ou égal au sien.

**Justification** : FR-021 — un recalage fait en novembre ne doit pas changer ce qu'affiche
octobre. Avec une déclaration unique, la remplacer effacerait la réserve de tous les mois
antérieurs. La liste coûte un tableau et une recherche ; elle a un besoin présent et démontré
(principe VI).

**Alternative écartée** : une déclaration unique remplacée à chaque recalage — viole FR-021.

---

## R3 — La cascade

**Décision** : pour un mois `M` et sa déclaration applicable `D` (ouverture au mois `D.fromMonth`) :

```text
ouverture(D.fromMonth) = D.balanceCents
ouverture(m + 1)       = ouverture(m) + revenusNets(m) − dépenséNet(m)
moisRestants(M)        = max(1, D.months − écartEnMois(D.fromMonth, M))
part(M)                = ouverture(M)                           si ouverture(M) ≤ 0
                       = floor(ouverture(M) / moisRestants(M))  sinon
disponible(M)          = revenusNets(M) + part(M)
entamée(M)             = max(0, dépenséNet(M) − revenusNets(M))
clôture(M)             = ouverture(M) + revenusNets(M) − dépenséNet(M)
```

`revenusNets` est `computeMonthlyBudget().remainingCents` (inchangé).

**Deux « dépensé », à ne pas confondre** (correction issue de l'analyse) :

- pour `entamée` et pour l'affichage du mois, `dépenséNet` est le net **borné à zéro** que
  `computeMonthlySpending` calcule déjà (règle EF-032 de 006 : un excédent de remboursement
  n'augmente pas le disponible du mois) ;
- pour la **récurrence** (`ouverture(m + 1)` et `clôture`), on utilise les **sorties nettes non
  bornées**, dépenses − remboursements. Sans cela, un remboursement supérieur aux dépenses du
  mois disparaîtrait à jamais, alors que c'est de l'argent réel (FR-010).

**Justification** : c'est le « Modèle de calcul » de la spécification, écrit sans ambiguïté. La
part n'entre **pas** dans la récurrence : la part non utilisée reste dans la réserve d'elle-même,
puisque seule la dépense réelle la fait baisser.

**Coût** : la cascade parcourt les mois écoulés depuis la déclaration, et pour chacun somme les
dépenses du mois. Avec 5 000 dépenses et 24 mois, c'est de l'ordre de 10⁵ opérations par calcul,
négligeable. Aucune mémoïsation n'est ajoutée (principe VI) ; le test de volume existant
(`dashboard.test.tsx`, CS-005 de 005) sert de garde-fou.

---

## R4 — Arrondi : troncature, le reste demeure dans la réserve

**Décision** : `Math.floor` sur des centimes entiers positifs. Aucun reste n'est redistribué
explicitement : il n'a jamais quitté la réserve.

**Justification** : principe II — « toute logique de proratisation DOIT redistribuer le reste
plutôt que le perdre ». Ici le reste est conservé par construction : `clôture` ne dépend pas de
`part`. Au dernier mois (`moisRestants = 1`), la part est la réserve entière (SC-004). C'est la
même règle que l'allocation quotidienne (troncature normative, reste au dernier jour).

**Réserve négative** : pas de division. `floor` d'un négatif arrondirait vers le bas, c'est-à-dire
*augmenterait* la dette répartie ; et FR-012 demande d'imputer toute la dette au mois.

---

## R5 — Où le calcul s'insère : un seul point, le « disponible »

**Décision** : `computeMonthlySpending`, `computeDailyAllowance` et le report de la veille
lisent aujourd'hui tous trois `computeMonthlyBudget(...).remainingCents`. Ils liront désormais une
fonction unique, `availableCentsForMonth(doc, month, today)` = revenus nets + part. `MonthlySpending`
gagne `incomeNetCents` et `reserve: ReserveState | null`.

**Organisation des modules** (pour éviter un import circulaire) :

- `src/features/budget/reserve.ts` — **feuille**, sans dépendance vers `expenses.ts` :
  recherche de la déclaration applicable, mois restants, part, ajout d'une déclaration,
  validation de saisie.
- `src/features/budget/expenses.ts` — porte la **cascade** (`computeReserveState`), parce qu'elle
  a besoin du dépensé net, qui y vit déjà, et que l'anneau et l'allocation, qui y vivent aussi,
  en ont besoin.

`computeMonthlyBudget` (`calculs.ts`) et `MonthSummary` ne changent pas : le « budget
prévisionnel » reste revenus − abonnements. La vue « Douze prochains mois » non plus (hors
périmètre).

**Sans réserve** : `computeReserveState` rend `null`, la part vaut 0, tous les montants sont
identiques à aujourd'hui (FR-019, SC-006) — vérifié par la suite de tests existante, inchangée.

---

## R6 — Document en version 5, migration additive

**Décision** : `DOCUMENT_VERSION` et `FORMAT_VERSION` passent à 5. Migration 4 → 5 : ajout de
`reserve: []`, sans toucher au reste. `parseDocument` valide la liste (voir
[contrat de stockage](./contracts/stockage.md)).

**Justification** : constitution, « Contraintes » — tout changement de schéma est versionné et
accompagné d'une migration qui ne perd rien. Une migration purement additive ne peut rien perdre,
comme les trois précédentes. Le serveur lit par le même `parseDocument` : aucun changement côté
route.

**Conséquence connue** : un onglet resté ouvert sur l'ancienne version refusera un document v5
(« version postérieure »), comportement existant et voulu ; il suffit de le recharger.

---

## R7 — Mutations : le chemin ordinaire

**Décision** : deux mutations au fournisseur, `declareReserve(balanceTodayCents, months)` et
`removeReserve()`, qui passent par `appliquer()` comme toutes les autres. Le mois d'effet est
celui de `today`, tenu par le fournisseur.

**Le solde saisi est celui du jour** (FR-002, correction issue de l'analyse). La déclaration
enregistre la réserve de *début* de mois ; saisir le solde réel le 20, après avoir déjà puisé
200 €, ferait retirer ces 200 € une seconde fois en fin de mois. `declareReserve` enregistre donc
`soldeSaisi + max(0, sorties à ce jour − revenus nets)`, calculé par la fonction pure
`openingBalanceFor` ([contrat de calcul](./contracts/calcul-reserve.md) §2 bis). Le calcul est
fait **une fois, à l'enregistrement** : la déclaration reste une donnée simple, et la cascade
n'a pas à connaître le jour de la saisie.

**Alternative écartée** : enregistrer le jour de la saisie et le solde du jour, puis reconstituer
l'ouverture à chaque calcul. Plus « pur », mais une dépense antérieure à la saisie, corrigée
après coup, déplacerait alors le solde que l'utilisateur a constaté à sa banque — l'inverse du
but d'un recalage.

**Justification** : FR-024 — synchronisation, conflit et export viennent gratuitement du chemin
existant. Aucun protocole nouveau.

---

## R8 — Interface

| Élément | Emplacement | Contenu |
| --- | --- | --- |
| `ReserveSettings` | Onglet « Réglages », avant « Mes banques » | Formulaire solde + nombre de mois ; rappel « revenu ponctuel ce mois-ci » (FR-004) ; état actuel ; retrait avec confirmation en deux temps, comme la restauration de sauvegarde. |
| `ReserveSummary` | Onglet « Mois », sous le bilan | Réserve en début de mois, mois restants, part, épargne entamée, réserve prévue en fin de mois ; avis « durée atteinte » (FR-023). |
| `BudgetRing` | Onglet « Aujourd'hui » | Détail « Revenus du mois » / « Part d'épargne » ; phrase d'état de l'épargne (FR-016) ; dépassement précisé « sera retiré de la réserve ». |
| `DailyAllowance` | Onglet « Aujourd'hui » | Aucun changement de composant : le montant suit le disponible. |

Les montants négatifs ne sont jamais affichés bruts (FR-018) : `ReserveState` expose
`shortfallCents` (découvert, positif) à côté de `openingCents`, comme `overspentCents` le fait déjà
pour l'anneau.

Les liens entre onglets passent par `TabLink` (fonctionnalité 007) : l'avis « durée atteinte » et
l'anneau renvoient vers `settings` / `titre-reserve`.

---

## R9 — Tests (principe III : exigés)

Toute la logique est monétaire. Sont exigés, chacun avec cas nominal, cas limites (zéro, négatif,
plus grand montant réaliste) et entrée malformée :

- **`reserve.test.ts`** : déclaration applicable, mois restants (dont plancher à 1), part
  (troncature, zéro, négatif, dernier mois), ajout et remplacement de déclaration, validation de
  saisie.
- **`expenses.test.ts`** : cascade sur le [jeu de référence](./contracts/calcul-reserve.md) ;
  invariants SC-003 et SC-004 sur 12 mois ; correction d'un mois passé ; recalage et retrait
  (FR-021) ; mois antérieurs inchangés ; revenus nets négatifs ; sans réserve, résultats
  identiques.
- **`budget-document.test.ts`** : migration 4 → 5 ; refus des déclarations malformées.
- **`transfer.test.ts`** : aller-retour export/import avec réserve ; import d'un export v4.
- **Intégration** (`reserve.integration.test.tsx`) : déclarer depuis « Réglages » → anneau et
  montant par jour ; état de l'épargne ; recalage ; retrait ; saisie invalide.

Les fichiers de test qui fixent `version: 4` ou `formatVersion: 4` en dur sont mis à jour.
