---

description: "Liste de tâches — Réserve d'épargne et report entre les mois"
---

# Tâches : Réserve d'épargne et report entre les mois

**Entrée** : documents de conception de `specs/008-savings-reserve/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests** : **exigés**, et non optionnels. Le principe III impose des tests pour « tout code qui
calcule, agrège, convertit, répartit ou persiste un montant ». La cascade, la part, la migration
v5 et l'export tombent tous sous cette obligation : cas nominal, cas limites (zéro, négatif, plus
grand montant réaliste) et entrée malformée. Le jeu de référence est celui du
[contrat de calcul](./contracts/calcul-reserve.md) §4, à reproduire **au centime**.

**Organisation** : par récit utilisateur. Le calcul lui-même (cascade) est en fondations : les
quatre récits en dépendent.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichier distinct, aucune dépendance sur une tâche inachevée)
- **[Story]** : récit auquel la tâche se rattache (US1 à US4)
- Chaque description porte un chemin de fichier exact

## Conventions de chemins

Application Next.js existante : code sous `src/`, tests à côté du code. La réserve vit dans le
domaine `src/features/budget/`. `reserve.ts` est une **feuille** : il n'importe jamais
`expenses.ts`, qui porte la cascade (R5).

> **Règle monétaire** : centimes entiers partout ; `Math.floor` pour la seule division, jamais
> appliqué à un montant négatif ; aucun `parseFloat`, aucun `toFixed` sur un montant ; affichage
> par `formatCents` uniquement.

> **Onglets (007)** : les tests qui rendent `<BudgetView />` ouvrent l'onglet voulu avec
> `ouvrirOnglet` (`src/test/navigation.ts`) et appellent `reinitialiserAdresse()` en `afterEach`.

---

## Phase 1 : Préparation

- [X] T001 Enregistrer la référence de non-régression : exécuter `npm run build`, `npm run lint`
      et `npm test` sur la branche vierge, et consigner le nombre de tests au vert dans
      `specs/008-savings-reserve/quickstart.md` (nouvelle section « Référence » sous « Contrôles
      automatiques »).

---

## Phase 2 : Fondations (bloquantes)

**Objet** : le document en version 5 et le calcul de la réserve. À la fin de cette phase,
l'application se comporte **exactement comme avant** tant qu'aucune réserve n'est déclarée.

**⚠️ CRITIQUE** : aucun récit ne commence avant la fin de cette phase.

### Document et stockage

- [X] T002 Dans `src/features/budget/types.ts` : ajouter `ReserveDeclaration` (union `open` /
      `closed`, voir [data-model.md](./data-model.md) §1) et `ReserveState` (§3) ; ajouter
      `reserve: ReserveDeclaration[]` à `BudgetDocument` ; passer `DOCUMENT_VERSION` à 5 ;
      `emptyDocument()` rend `reserve: []`. JSDoc en français renvoyant à R1 et R2. Les champs
      ajoutés à `MonthlySpending` viennent en T010, avec le calcul qui les remplit, pour que le
      projet compile à chaque étape.
- [X] T003 [P] Dans `src/lib/date.ts`, ajouter `monthsBetween(from: MonthKey, to: MonthKey):
      number` (nombre de mois de `from` à `to`, négatif si `to` précède `from`), par
      arithmétique entière sur l'année et le mois. Tests dans `src/lib/date.test.ts` : même mois
      (0), mois suivant (1), passage d'année (`2026-12` → `2027-01` = 1), 24 mois, ordre inversé
      (négatif).
- [X] T004 Dans `src/lib/budget-document.ts` : étape de migration 4 → 5 (`reserve: []`,
      purement additive, avec le même commentaire de prudence que les étapes précédentes) ;
      `analyserDeclarationReserve` et validation de la liste selon le
      [contrat de stockage](./contracts/stockage.md) §2 (mois valide, `kind`, bornes de
      `balanceCents` 0 à `MAX_CENTS` et de `months` 1 à 120, `fromMonth` strictement croissants) ;
      inclure `reserve` dans la valeur rendue par `parseDocument`. Dépend de T002.
- [X] T005 Dans `src/lib/budget-document.test.ts` : migration d'un document v4 (réserve vide,
      tout le reste identique) et d'un document v1 (traverse toutes les étapes) ; document v5
      valide avec une ouverture et un retrait ; **un test par ligne** du tableau de refus du
      contrat de stockage §2 ; solde zéro accepté ; solde `MAX_CENTS` accepté ; version 6 →
      `futureVersion`.
- [X] T006 [P] Dans `src/features/budget/transfer.ts`, passer `FORMAT_VERSION` à 5. Dans
      `src/features/budget/transfer.test.ts` : aller-retour export → import d'un document avec
      réserve, restituée à l'identique (FR-024) ; import d'un export de format 4 (réserve vide,
      FR-025) ; format 6 refusé.
- [X] T007 Lancer `npm test` et adapter les fichiers de test qui fixent la version en dur
      (`src/lib/storage.test.ts`, `src/lib/storage.security.test.ts`,
      `src/app/api/budget/route.test.ts`, `src/features/budget/sync.test.ts`,
      `src/features/budget/data-transfer.test.tsx`, `src/features/budget/dashboard.test.tsx`) :
      une attente sur la version **courante** passe à 5 ; un jeu d'essai volontairement ancien
      (v3, v4) reste tel quel, puisqu'il prouve la migration. Ne modifier aucune attente de
      montant.

### Calcul

- [X] T008 Créer `src/features/budget/reserve.ts` (feuille, fonctions pures) selon le
      [contrat de calcul](./contracts/calcul-reserve.md) §1 :
      `activeDeclaration(reserve, month)`, `monthsRemaining(declaration, month)`,
      `horizonReached(declaration, month)`, `shareCents(openingCents, monthsRemaining)`,
      `withDeclaration(reserve, month, balanceCents, months)`, `withoutReserve(reserve, month)`
      (transitions de [data-model.md](./data-model.md) §1), et
      `parseMonthsInput(raw): { ok: true; months: number } | { ok: false; reason: "empty" |
      "notAnInteger" | "outOfRange" }` (entier strict `/^\d+$/`, 1 à 120). Constantes exportées
      `RESERVE_MIN_MONTHS = 1`, `RESERVE_MAX_MONTHS = 120`. Commenter la règle d'arrondi (R4) à
      l'endroit de la division. Dépend de T002 et T003.
- [X] T009 Créer `src/features/budget/reserve.test.ts` : déclaration applicable (aucune, mois
      antérieur à la première, entre deux, après un retrait) ; mois restants (premier mois =
      `months`, décroissance, plancher à 1) ; durée atteinte ; part — tous les « cas isolés » du
      contrat §4 qui ne demandent pas de cascade (troncature, dernier mois, zéro, négatif, plus
      grand montant) et invariants I3, I4 sur une grille de soldes et de durées ;
      `withDeclaration` (ajout, remplacement dans le même mois, déclarations antérieures
      intactes, liste rendue triée, entrée non mutée) ; `withoutReserve` (avec et sans
      déclaration antérieure) ; `parseMonthsInput` (`""`, `"0"`, `"1"`, `"120"`, `"121"`,
      `"1,5"`, `"-3"`, `"abc"`, `" 12 "`).
- [X] T010 Dans `src/features/budget/types.ts`, ajouter à `MonthlySpending` les champs
      `incomeNetCents: Cents` et `reserve: ReserveState | null`, et mettre à jour le commentaire
      d'`availableCents` (« revenus nets + part d'épargne »). Dans
      `src/features/budget/expenses.ts` :
      - `computeReserveState(doc, month, today): ReserveState | null` — cascade de R3 depuis
        `activeDeclaration`. **La récurrence et la clôture utilisent les sorties nettes non
        bornées** (dépenses − remboursements, peut être négatif) ; `drawnCents` utilise le
        dépensé borné existant. Commenter cette différence à l'endroit du calcul ;
      - `availableCentsForMonth(doc, month, today)` ;
      - `openingBalanceFor(doc, today, balanceTodayCents): Cents` selon le contrat §2 bis ;
      - faire lire ce disponible à `computeMonthlySpending`, `computeDailyAllowance` et
        `reportDeLaVeille`, à la place de `computeMonthlyBudget(...).remainingCents` ; renseigner
        `incomeNetCents` et `reserve` dans `MonthlySpending`.
      Mettre à jour les JSDoc concernés. Dépend de T008.
- [X] T011 Dans `src/features/budget/expenses.test.ts` : le **jeu de référence** du contrat §4,
      ligne par ligne (ouverture, restants, part, disponible, entamée, dépassement, clôture) ;
      les cas isolés à cascade (durée écoulée, revenus nets négatifs, recalage, retrait,
      correction tardive) ; invariants I1, I2, I5, I6 ; SC-003 et SC-004 sur un parcours de
      12 mois à dépenses variées ; allocation du jour et report de la veille calculés sur le
      disponible avec part ; **sans réserve**, `computeMonthlySpending` et
      `computeDailyAllowance` rendent les mêmes valeurs qu'avant (SC-006) ; remboursement qui
      augmente la clôture ; **excédent de remboursement** (cas isolé du contrat : dépensé 0,
      disponible inchangé, clôture 720 000) ; mois futur calculé sans dépense ; les quatre cas
      « saisie du jour » de `openingBalanceFor` ; I7 (deux calculs identiques, SC-007).

**Point de contrôle** : `npm test` au vert ; aucun composant modifié ; aucun montant affiché
n'a changé.

---

## Phase 3 : Récit 1 — Déclarer ma réserve et la voir répartie (Priorité : P1) 🎯 MVP

**Objectif** : saisir solde et durée dans « Réglages » ; l'anneau et le montant par jour
intègrent la part d'épargne.

**Test indépendant** : 900,00 € de revenus nets, déclarer 6 000,00 € sur 12 mois → disponible
1 400,00 €, détaillé ([quickstart](./quickstart.md), récit 1).

- [X] T012 [P] [US1] Dans `src/features/budget/messages.ts`, ajouter les textes de la réserve :
      erreurs du solde (réutiliser celles des plafonds si elles existent) et du nombre de mois
      (`empty`, `notAnInteger`, `outOfRange`), rappel « revenu ponctuel ce mois-ci » (FR-004),
      aide du formulaire. Aucun renvoi de position vers un autre onglet (007, FR-013).
- [X] T013 [US1] Dans `src/features/budget/budget-provider.tsx`, ajouter la mutation
      `declareReserve(balanceTodayCents: Cents, months: number): "ok" | "tooLarge" |
      "writeFailed"` : lit l'instantané, calcule la réserve de début de mois par
      `openingBalanceFor` (solde du jour + épargne déjà entamée, FR-002), refuse `tooLarge` si
      elle dépasse le plafond, applique `withDeclaration` pour le mois de `today`, passe par
      `appliquer()`. L'exposer dans `BudgetContextValue` et dans les dépendances du `useMemo`.
      Dépend de T008 et T010.
- [X] T014 [US1] Créer `src/features/budget/components/reserve-settings.tsx` : section
      `aria-labelledby="titre-reserve"`, titre « Réserve d'épargne », formulaire à deux champs
      (`FormField`, `inputClassName`) — « Solde de l'épargne aujourd'hui » (analysé par
      `parseLimitInput` ; l'erreur `tooLarge` de `declareReserve` s'affiche sur ce champ) et
      « À répartir sur (mois) » (`parseMonthsInput`, `inputMode="numeric"`) —, erreurs
      textuelles rattachées, bouton « Enregistrer ». Sous le formulaire, quand une réserve est
      active pour le mois en cours : « Réserve en début de mois », « Mois restants », « Part de
      ce mois ». Rappel FR-004 affiché si le mois en cours contient un revenu `oneOff`. Réserve
      absente : texte d'explication en une phrase. Dépend de T012, T013.
- [X] T015 [US1] Dans `src/features/budget/components/budget-ring.tsx` : quand
      `bilan.reserve !== null`, ajouter au détail deux lignes, « Revenus du mois »
      (`incomeNetCents`) et « Part d'épargne » (`reserve.shareCents`, ou « Découvert de la
      réserve » avec `shortfallCents` si elle est négative — jamais de négatif brut, FR-018).
      Sans réserve, rendu strictement identique à l'actuel (FR-019). Revoir `sansBudget`
      (FR-026) : dès que `bilan.reserve !== null`, ne **jamais** afficher l'invitation
      `NO_BUDGET_YET`, même si le disponible est nul ou négatif (réserve à zéro ou en découvert) ;
      afficher le détail de la réserve à la place.
- [X] T016 [US1] Dans `src/features/budget/components/budget-view.tsx`, placer
      `<ReserveSettings />` en tête du panneau « Réglages », avant `<BankPanel />`.
- [X] T017 [US1] Créer `src/features/budget/reserve.integration.test.tsx` (montage de
      `<BudgetProvider><BudgetView /></BudgetProvider>` sur `localStorage`, comme
      `dashboard.test.tsx`) :
      (a) sans réserve, l'anneau ne mentionne pas d'épargne ;
      (b) déclarer 6 000 sur 12 mois avec 900,00 € de revenus nets → anneau 1 400,00 €,
      « Revenus du mois 900,00 € », « Part d'épargne 500,00 € », montant par jour recalculé ;
      (c) le document stocké contient `reserve: [{ fromMonth: <mois courant>, kind: "open",
      balanceCents: 600000, months: 12 }]` et `version: 5` ;
      (d) chaque saisie invalide du quickstart (récit 1, point 3) affiche son message, marque le
      champ `aria-invalid`, et n'écrit rien ;
      (e) 1 000 sur 3 mois → part 333,33 € ;
      (f) rappel FR-004 présent avec un revenu ponctuel du mois, absent sinon ;
      (g) solde 0 accepté : l'anneau n'affiche pas l'invitation à renseigner ses revenus
      (FR-026) ;
      (h) déclaration après dépassement des revenus : 900,00 € de revenus nets, 1 100,00 € déjà
      dépensés, solde saisi 5 800 → `balanceCents` stocké 600000.

**Point de contrôle** : MVP — la réserve se déclare et se voit ; le report (récit 2) est déjà
calculé mais pas encore lisible dans « Mois ».

---

## Phase 4 : Récit 2 — Le reste et le dépassement passent au mois suivant (Priorité : P1)

**Objectif** : en changeant de mois, voir la réserve repartir du solde de fin du mois précédent.

**Test indépendant** : exemple du « Modèle de calcul » — mois suivant : 5 800,00 €, 11 mois,
527,27 € ([quickstart](./quickstart.md), récit 2).

- [X] T018 [US2] Créer `src/features/budget/components/reserve-summary.tsx` : section
      `aria-labelledby="titre-reserve-mois"`, titre « Réserve d'épargne », liste de définitions
      (`<dl>`) pour le mois **sélectionné** : « Réserve en début de mois » (ou « Réserve épuisée
      — découvert de … »), « Mois restants », « Part du mois », « Disponible avec la part
      d'épargne » (`availableCents`, qui fait le lien avec le « Reste disponible » du bilan
      juste au-dessus, FR-017). Ne rend rien quand
      `computeMonthlySpending(...).reserve === null`. Les lignes « Épargne entamée » et
      « Réserve prévue en fin de mois » viennent en US3 (T022).
- [X] T019 [US2] Dans `src/features/budget/components/budget-view.tsx`, placer
      `<ReserveSummary />` dans le panneau « Mois », juste après `<MonthSummary />`.
- [X] T020 [US2] Ajouter à `src/features/budget/reserve.integration.test.tsx` :
      (a) déclaration 6 000 / 12, 900,00 € de revenus nets, 1 100,00 € dépensés ce mois ;
      « Mois suivant » → onglet « Mois » : 5 800,00 €, 11 mois, 527,27 € ;
      (b) supprimer 100,00 € de dépenses du mois courant → mois suivant : 5 900,00 € (FR-011) ;
      (c) mois précédant la déclaration : aucune section « Réserve d'épargne » dans « Mois »,
      anneau sans mention d'épargne (FR-013) ;
      (d) mois moins dépensé que les revenus (700,00 €) → la réserve du mois suivant a augmenté
      de 200,00 € ;
      (e) document dont la déclaration date de quatre mois, application ouverte aujourd'hui : la
      réserve du mois courant tient compte des quatre mois (récit 2, scénario 5).

**Point de contrôle** : les récits 1 et 2 répondent à la demande initiale — l'argent passe d'un
mois à l'autre.

---

## Phase 5 : Récit 3 — Voir quand je touche à mon épargne (Priorité : P2)

**Objectif** : l'application dit si l'épargne est entamée, de combien, et ce qu'il adviendra d'un
dépassement.

**Test indépendant** : 900,00 € de revenus nets, 500,00 € de part, dépenses de 800,00 € puis
1 100,00 € ([quickstart](./quickstart.md), récit 3).

- [X] T021 [US3] Dans `src/features/budget/components/budget-ring.tsx`, sous le détail, une
      phrase d'état (FR-016), en texte :
      - épargne intacte : « Épargne non entamée — encore X de revenus avant d'y toucher »
        (`incomeNetCents − spentCents`, si positif) ;
      - épargne entamée : « Épargne entamée : X sur Y » (`drawnCents` sur `shareCents`) ;
      - dépassement : compléter l'état existant par « Ce dépassement sera retiré de la
        réserve. ».
      Textes dans `src/features/budget/messages.ts` (fonctions de composition recevant des
      montants déjà formatés).
- [X] T022 [US3] Dans `src/features/budget/components/reserve-summary.tsx`, ajouter les lignes
      « Épargne entamée ce mois » (`drawnCents`) et « Réserve prévue en fin de mois »
      (`closingCents`, ou « Réserve épuisée — découvert de … » si négative).
- [X] T023 [US3] Ajouter à `src/features/budget/reserve.integration.test.tsx` :
      (a) 800,00 € dépensés → « non entamée », « 100,00 € de revenus » ;
      (b) 1 100,00 € → « Épargne entamée : 200,00 € sur 500,00 € » ;
      (c) 1 500,00 € → dépassement de 100,00 € affiché comme montant positif, avec la mention du
      retrait de la réserve ; aucun texte ne contient de montant précédé d'un signe moins ;
      (d) onglet « Mois » : les six lignes de FR-017, avec les valeurs de la ligne 2026-10 du
      jeu de référence ;
      (e) réserve négative (document préparé) : « Réserve épuisée », découvert positif.

---

## Phase 6 : Récit 4 — Recaler, modifier ou retirer ma réserve (Priorité : P2)

**Objectif** : ressaisir le solde réel, changer la durée, retirer la réserve, sans toucher aux
mois passés.

**Test indépendant** : après deux mois, ressaisir un solde ; le mois courant repart de là, les
mois passés gardent leurs chiffres ([quickstart](./quickstart.md), récit 4).

- [X] T024 [US4] Dans `src/features/budget/budget-provider.tsx`, ajouter
      `removeReserve(): boolean` (`withoutReserve` pour le mois de `today`, via `appliquer()`),
      exposée comme `declareReserve`.
- [X] T025 [US4] Dans `src/features/budget/components/reserve-settings.tsx` :
      - réserve active : le bouton devient « Mettre à jour », avec une aide « Saisissez le solde
        réel de votre épargne aujourd'hui. Le mois en cours repartira de ce solde ; les mois
        passés ne changent pas. » ; les champs restent vides (on saisit le solde **réel**, pas
        le solde calculé) ;
      - bouton « Retirer la réserve », puis confirmation en deux temps (« Confirmer le retrait »
        / « Annuler »), sur le modèle de la restauration dans `data-transfer.tsx` ;
      - avis « La durée prévue est atteinte » quand `horizonReached` (FR-023).
- [X] T026 [US4] Dans `src/features/budget/components/reserve-summary.tsx`, quand
      `horizonReached` : avis textuel avec un
      `TabLink tab="settings" section="titre-reserve"` « Choisir une nouvelle durée ».
- [X] T027 [US4] Ajouter à `src/features/budget/reserve.integration.test.tsx` :
      (a) recalage au mois courant d'un document dont la déclaration date du mois précédent : le
      mois courant repart du nouveau solde et de la nouvelle durée ; « Mois précédent » affiche
      les mêmes montants qu'avant le recalage (FR-021) ; le document stocké contient **deux**
      déclarations ;
      (b) recalage dans le mois même de la déclaration : une seule déclaration, remplacée ;
      (c) retrait : confirmation exigée, « Annuler » ne change rien ; après confirmation, le
      mois courant revient aux revenus nets seuls et le mois précédent garde ses montants ;
      (d) durée atteinte : avis dans « Mois », le lien ouvre « Réglages » ;
      (e) recalage en cours de mois après dépassement (récit 4, scénario 4) : 900,00 € de
      revenus nets, 1 100,00 € dépensés, solde saisi 5 800 → « Réserve prévue en fin de mois »
      5 800,00 €, et non 5 600,00 €.

---

## Phase 7 : Finitions et contrôles transverses

- [X] T028 Rechercher dans `src/` tous les usages de `availableCents` et de
      `computeMonthlyBudget(` : chaque lecteur du premier doit vouloir « ce qui est dépensable ce
      mois », chaque lecteur du second « revenus − abonnements » (point de vigilance du plan).
      Corriger tout lecteur qui aurait dû changer de source ; consigner le résultat dans les
      notes de ce fichier.
- [X] T029 [P] Relire les commentaires, JSDoc et messages ajoutés : en français, sans code mort,
      sans renvoi de position entre onglets.
- [X] T030 Exécuter `npm run lint`, `npm run build` et `npm test` : aucune erreur. Comparer le
      nombre de tests à la référence de T001. Vérifier que le test de volume de
      `src/features/budget/dashboard.test.tsx` (5 000 dépenses) passe aussi avec une réserve
      déclarée 24 mois plus tôt (l'ajouter s'il n'existe pas).
- [ ] T031 Dérouler le [quickstart](./quickstart.md) dans l'application en fonctionnement, sur
      un budget d'essai : récits 1 à 4, données (export / import), 360 px, niveaux de gris,
      clavier seul.
- [ ] T032 Commits par modification logique, messages en français. Rappeler à l'utilisateur
      d'exporter une sauvegarde de son budget réel avant de déployer (document en version 5).

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Fondations (phase 2)** : après la phase 1 ; **bloque tous les récits**.
- **Récit 1 (phase 3)** : après la phase 2. MVP.
- **Récit 2 (phase 4)** : après T016 (une réserve doit pouvoir être déclarée). Son calcul est
  déjà livré par T010.
- **Récit 3 (phase 5)** : après T015 (anneau) et T018 (résumé du mois).
- **Récit 4 (phase 6)** : après T014 et T018.
- **Finitions (phase 7)** : après les récits retenus.

### Dépendances internes

- T002 → T004, T008 ; T003 → T008 ; T004 → T005, T007 ; T008 → T009, T010 ; T010 → T011.
- T012, T013 → T014 → T016 → T017.
- `budget-ring.tsx` : T015 puis T021. `reserve-summary.tsx` : T018, T022, T026.
  `reserve-settings.tsx` : T014 puis T025. `budget-provider.tsx` : T013 puis T024.
  `reserve.integration.test.tsx` : T017, T020, T023, T027, dans cet ordre.

### Parallélisme

- **Phase 2** : T003 et T006 en parallèle de T002 → T004 ; T009 en parallèle de T010 une fois
  T008 faite.
- **Phase 3** : T012 en parallèle de T013 ; T015 en parallèle de T014.
- Les récits 3 et 4 peuvent avancer en parallèle après le récit 2, hors `reserve-summary.tsx`
  et le fichier de tests d'intégration, à enchaîner.

### Exemple de lancement parallèle — Phase 2

```text
T003 monthsBetween dans src/lib/date.ts (+ tests)
T006 FORMAT_VERSION 5 dans src/features/budget/transfer.ts (+ tests)
```

---

## Stratégie de mise en œuvre

### MVP d'abord

1. Phases 1 et 2 : le document et le calcul, prouvés par le jeu de référence, sans aucun
   changement visible.
2. Phase 3 (récit 1) : la réserve se déclare et entre dans le disponible.
3. Phase 4 (récit 2) : le report devient lisible. **S'arrêter et valider** : c'est la réponse à
   la demande initiale ; les récits 1 et 2, tous deux P1, se livrent ensemble.

### Livraison incrémentale

4. Récit 3 : état de l'épargne.
5. Récit 4 : recalage et retrait.

---

## Notes

- **Écarts à l'implémentation** :
  - les tests de la cascade (T011) sont dans `src/features/budget/reserve-cascade.test.ts`
    plutôt que dans `expenses.test.ts`, déjà très long ;
  - `reserve-settings.tsx` et `reserve-summary.tsx` ont été écrits en une fois : T014 porte déjà
    le recalage, le retrait et l'avis de durée (T025), T018 les lignes de T022 et le lien de
    T026 ; `removeReserve` (T024) a été ajouté au fournisseur avec `declareReserve` (T013) ;
  - `MAX_CENTS` est désormais exporté de `src/lib/money.ts`, pour le refus `tooLarge` ;
  - dans `budget-document.test.ts`, `documentV4()` clone ses constantes partagées : des tests
    d'invariants existants les modifiaient, ce qui rendait les tests suivants dépendants de
    l'ordre.
- **T028 — lecteurs du disponible** (vérifié) : `availableCents` n'est lu que par
  `budget-ring.tsx` et `reserve-summary.tsx` ; `computeMonthlyBudget(` par `calculs.ts`
  (prévisions), `charge-breakdown.tsx`, `month-summary.tsx` et `expenses.ts` (revenus nets de la
  cascade). Aucun lecteur n'a dû changer de source.
- **T031** : vérifié par captures à 360 px (anneau, onglet « Mois », « Réglages ») sur un budget
  d'essai ; restent à faire à la main le clavier seul, les niveaux de gris, l'export / import
  dans le navigateur, et l'essai sur le budget réel.

- Un test existant dont une attente de **montant** doit changer signale une régression, pas une
  adaptation : sans réserve, aucun montant ne doit bouger (SC-006).
- La vue « Douze prochains mois » et `MonthSummary` ne sont pas modifiées (hors périmètre).
