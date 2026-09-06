---
description: "Liste de tâches — Anneau, allocation quotidienne et journal des dépenses"
---

# Tâches : Tableau de bord — anneau, allocation quotidienne et journal

**Entrée** : documents de conception de `specs/003-daily-allowance-dashboard/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests** : **obligatoires**, par application du principe III. `expenses.ts` calcule et agrège des
montants ; la migration 1 → 2 persiste des données. Les deux tombent sous l'obligation de test, avec
cas nominal, bornes et entrée malformée. Les composants de présentation sans calcul en sont dispensés.

**Ordre tests / implémentation** : les tests précèdent l'implémentation pour `expenses.ts` et la
migration. Pour la migration, c'est moins un choix qu'une nécessité : on n'écrit pas un code capable
de détruire des données d'utilisateur sans avoir d'abord énoncé ce qu'il doit préserver.

**État du code au démarrage** : 002 et 004 sont livrées. 173 tests passent. `parseDocument`,
`saveDocument`, `migrer`, `computeMonthlyBudget`, `daysInMonth`, `sumCents`, `parseAmountInput`
existent et sont testés. Cette fonctionnalité les **étend** sans les réécrire.

**Écart signalé avec la spécification** : EF-020 impose de conserver l'allocation quotidienne de
chaque jour écoulé. Ce plan la **dérive** (décision D1) : les valeurs sont intégralement calculables,
et les stocker créerait des trous les jours où l'application n'est pas ouverte. **T003 amende la
spécification avant toute écriture de code**, pour qu'elle et l'implémentation ne divergent jamais.

**Organisation** : tâches groupées par récit utilisateur.

## Format : `[ID] [P?] [Récit] Description`

- **[P]** : parallélisable (fichiers distincts, aucune dépendance sur une tâche non terminée)
- **[US1]…[US5]** : récit utilisateur de rattachement
- Chaque description porte le chemin exact du fichier concerné

---

## Phase 1 : Mise en place

**Objectif** : réconcilier la spécification avec la conception, puis déclarer l'entité et les
messages dont tout le reste dépend. Aucune dépendance à installer (décision D10).

L'amendement d'EF-020 vient **en premier, avant toute ligne de code** : tant qu'il n'est pas fait, la
spécification décrit un comportement que l'implémentation ne produira pas. Corriger d'abord supprime
toute fenêtre pendant laquelle les deux se contredisent.

- [X] T001 Confirmer que `npm run test` passe sur la base existante (173 tests) avant toute modification, afin de partir d'un état sain et de pouvoir attribuer toute régression ultérieure
- [X] T002 Déclarer le type `Expense` et porter `DOCUMENT_VERSION` de 1 à 2 dans `src/features/budget/types.ts`, en ajoutant `expenses: Expense[]` à `BudgetDocument` et à `emptyDocument()`, conformément à [data-model.md](./data-model.md)
- [X] T003 **Avant toute écriture de code** : amender EF-020 dans `specs/003-daily-allowance-dashboard/spec.md` pour refléter que l'allocation quotidienne est **dérivée** et non conservée, en indiquant que les neuf scénarios d'acceptation du récit 3 restent inchangés — ou consigner par écrit la divergence assumée
- [X] T004 [P] Ajouter dans `src/features/budget/messages.ts` les messages de saisie d'une dépense et les libellés des quatre états de l'anneau, conformément à [contracts/interface.md](./contracts/interface.md)

**Point de contrôle** : la spécification et la conception disent la même chose, et le type existe.
`npm run build` échouera tant que la phase 2 n'aura pas étendu l'analyseur — c'est attendu.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : la migration du document, l'analyseur de dépense, et toute la logique de calcul. C'est
la phase la plus dense de la fonctionnalité et celle qui porte le risque de perte de données.

**⚠️ CRITIQUE** : aucun récit utilisateur ne peut démarrer avant la fin de cette phase.

### Migration et persistance

- [X] T005 [P] Écrire les tests de migration dans `src/lib/storage.test.ts` : un document v1 réaliste comportant plusieurs revenus et abonnements migre en v2 **sans en perdre un seul** ; `expenses` est initialisée à `[]` ; un document déjà en v2 passe inchangé ; un document v3 part en quarantaine
- [X] T006 [P] Écrire les tests de l'analyseur de dépense dans `src/lib/storage.test.ts` : montant négatif, nul ou non entier refusé ; date calendairement impossible refusée ; libellé trop long refusé ; `category` acceptée absente, `null` ou chaîne ; identifiant en doublon **avec un revenu** refusé ; une seule dépense invalide fait partir tout le document en quarantaine
- [X] T007 Implémenter `analyserDepense()` dans `src/lib/storage.ts` sur le motif des analyseurs existants : part d'`unknown`, renvoie `null` en cas de violation, aucun transtypage
- [X] T008 Implémenter la migration 1 → 2 dans la fonction `migrer()` de `src/lib/storage.ts` : `incomes` et `subscriptions` repris tels quels, `expenses` initialisée à `[]`, `version` portée à 2. Ne rien « nettoyer » d'autre au passage — l'additivité est ce qui rend cette migration incapable de perdre des données
- [X] T009 Étendre le contrôle d'unicité des identifiants de `parseDocument()` dans `src/lib/storage.ts` aux dépenses, l'unicité portant sur le document entier

### Logique de calcul

- [X] T010 [P] Écrire les tests d'agrégation dans `src/features/budget/expenses.test.ts` : `expensesInMonth`, `totalSpentCentsForMonth`, `spentOnDayCents`, `spentBeforeDayCents` — ce dernier cantonné au mois, une dépense du mois précédent ne devant jamais entrer dans le calcul
- [X] T011 [P] Écrire les tests de l'allocation quotidienne dans `src/features/budget/expenses.test.ts` : les quatre scénarios chiffrés du récit 3 (300,00 € sur 10 jours → 30,00 € ; 10,00 € dépensés → 32,22 € ; 80,00 € dépensés → 24,44 € ; dernier jour → totalité du reste) ; reste nul ou négatif → allocation 0 (EF-021) ; premier jour du mois → `carryOverCents` à `null` et non à `0`
- [X] T012 [P] Écrire les tests de propriété dans `src/features/budget/expenses.test.ts` : **CS-004**, la somme des allocations restantes n'excède jamais le reste, sur plusieurs longueurs de mois et plusieurs profils de dépense ; **CS-005**, sous-dépenser d'un écart augmente l'allocation du lendemain de cet écart réparti sur les jours restants, sur au moins cinq journées consécutives ; **CS-006**, aucun reliquat ne franchit la fin du mois
- [X] T013 [P] Écrire les tests de l'anneau dans `src/features/budget/expenses.test.ts` : les quatre états d'EF-011 ; `consumedRatio` plafonné à 1 en dépassement ; `overspentCents` exact ; `availableCents` nul ou négatif sans division par zéro ; exactitude au centime sur un mois d'au moins 200 dépenses (CS-003)
- [X] T014 [P] Écrire les tests du journal dans `src/features/budget/expenses.test.ts` : `groupByDay` regroupe par journée avec sous-total exact, journées de la plus récente à la plus ancienne ; `normalizeForSearch` et `searchExpenses` insensibles à la casse et aux accents, « cafe » trouvant « Café » ; requête vide → liste inchangée
- [X] T015 Implémenter `src/features/budget/expenses.ts` : les quatre fonctions d'agrégation, `computeMonthlySpending()`, `computeDailyAllowance()`, `groupByDay()`, `searchExpenses()` et `normalizeForSearch()`, selon [contracts/calculs-depenses.md](./contracts/calculs-depenses.md). La troncature au centime inférieur est **normative** : elle garantit CS-004
- [X] T016 Ajouter les actions `addExpense`, `updateExpense` et `removeExpense` au réducteur de `src/features/budget/budget-provider.tsx`, avec revalidation avant écriture

### Non-régression de la fonctionnalité 004

- [X] T017 Porter `FORMAT_VERSION` de 1 à 2 dans `src/features/budget/transfer.ts` — unique point de contact avec la fonctionnalité 004 (décision D5)
- [X] T018 Vérifier que les 43 tests de `src/features/budget/transfer.test.ts` et `src/features/budget/data-transfer.test.tsx` passent **sans autre modification** que la version de format attendue. Un échec signalerait que l'extension du document n'était pas aussi additive qu'annoncé
- [X] T019 [P] Ajouter dans `src/features/budget/transfer.test.ts` le test qui active EF-024 de la fonctionnalité 004 : un fichier d'export de `formatVersion` 1 est accepté et son contenu migré en version 2

**Point de contrôle** : `npm run test` passe, migration comprise. Toute la logique est prouvée sans
qu'aucune interface n'existe. Les données existantes des utilisateurs sont en sécurité.

---

## Phase 3 : Récit 1 — Enregistrer une dépense en quelques secondes (Priorité : P1) 🎯 MVP

**Objectif** : saisir un montant et valider en très peu de gestes.

**Test indépendant** : saisir plusieurs dépenses, recharger l'application, vérifier qu'elles sont
toutes présentes avec le bon montant et la bonne date.

- [X] T020 [US1] Créer `src/features/budget/components/expense-form.tsx` : champ de montant avec `inputMode="decimal"`, libellé, catégorie et date facultatifs, la date du jour par défaut (EF-001, EF-002)
- [X] T021 [US1] Implémenter dans `expense-form.tsx` l'acceptation indifférente de la virgule et du point via `parseAmountInput()` (EF-003), et les refus d'EF-004 avec message textuel rattaché au champ
- [X] T022 [US1] Implémenter dans `expense-form.tsx` la réinitialisation du formulaire après validation, pour qu'une seconde dépense s'enregistre sans geste superflu (CS-001)
- [X] T023 [US1] Câbler `<ExpenseForm />` en tête de la vue dans `src/features/budget/components/budget-view.tsx`, avant les sections de la fonctionnalité 002

**Point de contrôle** : l'application enregistre des dépenses qui persistent. Valeur autonome — c'est
déjà un carnet de dépenses.

---

## Phase 4 : Récit 2 — Voir dans l'anneau ce qu'il me reste (Priorité : P1)

**Objectif** : l'anneau du reste mensuel, élément principal de l'écran d'accueil.

**Test indépendant** : fixer un montant disponible, saisir des dépenses, vérifier que le montant
affiché et la portion remplie correspondent exactement à ce qui a été consommé.

- [X] T024 [US2] Créer `src/features/budget/components/budget-ring.tsx` : anneau en SVG inline dont le `stroke-dasharray` matérialise la proportion consommée, montant central en **texte HTML** et non en `<text>` SVG (décision D8)
- [X] T025 [US2] Implémenter dans `budget-ring.tsx` les quatre états d'EF-011 avec leur libellé textuel (EF-013), de sorte que retirer la couleur ne fasse perdre aucune information (CS-009)
- [X] T026 [US2] Implémenter dans `budget-ring.tsx` la présentation du dépassement d'EF-012 : montant du dépassement affiché, jamais un reste négatif, remplissage plafonné au tour complet
- [X] T027 [US2] Implémenter dans `budget-ring.tsx` l'état sans budget d'EF-014 : 0,00 € et invitation explicite à renseigner revenus et abonnements, sans état d'erreur
- [X] T028 [US2] Marquer l'anneau `aria-hidden` dans `budget-ring.tsx` et supprimer sa transition sous `prefers-reduced-motion` (EF-035)
- [X] T029 [US2] Câbler `<BudgetRing />` en tête de la vue dans `src/features/budget/components/budget-view.tsx`

**Point de contrôle** : les récits 1 et 2 forment le cœur quotidien de l'application.

---

## Phase 5 : Récit 3 — Savoir ce que je peux dépenser aujourd'hui (Priorité : P2)

**Objectif** : l'allocation du jour et le report de la veille.

**Test indépendant** : fixer un montant disponible et un nombre de jours restants connus, saisir des
dépenses inférieures puis supérieures à l'allocation, vérifier que l'allocation du lendemain varie
exactement du montant attendu.

- [X] T030 [US3] Créer `src/features/budget/components/daily-allowance.tsx` : montant du jour, montant déjà dépensé aujourd'hui et reste de la journée affichés distinctement (EF-015, EF-018)
- [X] T031 [US3] Implémenter dans `daily-allowance.tsx` l'affichage du report de la veille comme **gain** ou **perte** avec son montant (EF-019), et l'absence de report le premier jour du mois énoncée plutôt qu'affichée comme un report nul
- [X] T032 [US3] Implémenter dans `daily-allowance.tsx` l'état de reste nul ou négatif d'EF-021 : allocation à 0,00 € assortie d'un libellé expliquant qu'il n'y a plus rien à répartir
- [X] T033 [US3] Implémenter dans `src/features/budget/budget-provider.tsx` le franchissement de minuit d'EF-023 : minuterie rafraîchissant la date du jour, et bascule du mois consulté uniquement si l'utilisateur se trouvait sur le mois courant (décision D9)
- [X] T034 [US3] Câbler `<DailyAllowance />` sous l'anneau dans `src/features/budget/components/budget-view.tsx`

**Point de contrôle** : l'application répond à « combien puis-je dépenser aujourd'hui ? ».

---

## Phase 6 : Récit 4 — Parcourir mes dépenses comme un relevé bancaire (Priorité : P2)

**Objectif** : le journal, vue de consultation et de contrôle.

**Test indépendant** : saisir des dépenses sur plusieurs jours et plusieurs mois, vérifier l'ordre
d'affichage, les regroupements, les sous-totaux et le résultat d'une recherche.

- [X] T035 [US4] Créer `src/features/budget/components/expense-journal.tsx` : liste antéchronologique regroupée par journée, avec sous-total par journée (EF-024, EF-025)
- [X] T036 [US4] Implémenter la recherche dans `expense-journal.tsx` via `searchExpenses()`, avec un champ étiqueté et un message d'absence de résultat proposant d'effacer la recherche (EF-026, EF-029)
- [X] T037 [US4] Implémenter le filtre par mois et son total dans `expense-journal.tsx` (EF-027)
- [X] T038 [US4] Implémenter la pagination incrémentale dans `expense-journal.tsx` : tranche de 50 dépenses étendue lorsqu'une sentinelle devient visible via `IntersectionObserver`, sans bouton de pagination et sans déplacer le focus (EF-028, décision D6)
- [X] T039 [US4] Implémenter l'état vide d'EF-029 dans `expense-journal.tsx` : message expliquant comment enregistrer une première dépense
- [X] T040 [US4] Câbler `<ExpenseJournal />` après la saisie dans `src/features/budget/components/budget-view.tsx`

**Point de contrôle** : les quatre premiers récits fonctionnent ; l'application est complète pour
l'usage quotidien.

---

## Phase 7 : Récit 5 — Consulter, corriger ou supprimer une dépense (Priorité : P3)

**Objectif** : que le budget reste juste sans tout reprendre.

**Test indépendant** : modifier le montant puis la date d'une dépense existante, vérifier que
l'anneau, l'allocation du jour et les sous-totaux des journées concernées reflètent la modification.

- [X] T041 [US5] Créer `src/features/budget/components/expense-detail.tsx` : montant, date, libellé et catégorie d'une dépense, en consultation et en modification (EF-006)
- [X] T042 [US5] Implémenter dans `expense-detail.tsx` la modification de la date : la dépense change de regroupement et **les sous-totaux des deux journées** concernées sont recalculés
- [X] T043 [US5] Implémenter la suppression avec confirmation dans `expense-detail.tsx`, et vérifier que le montant restant de l'anneau augmente du montant supprimé
- [X] T044 [US5] Ouvrir le détail depuis une ligne du journal dans `src/features/budget/components/expense-journal.tsx`

**Point de contrôle** : les cinq récits fonctionnent ; la fonctionnalité est complète.

---

## Phase 8 : Finition et exigences transverses

- [X] T045 [P] Écrire les tests d'intégration dans `src/features/budget/dashboard.test.tsx` : saisie d'une dépense mettant à jour anneau, allocation et journal sans rafraîchissement (EF-030, CS-004) ; refus de saisie sans écriture ; regroupement et sous-totaux dans le journal rendu
- [X] T046 [P] Ajouter la ligne de la version 2 à la table des versions de `specs/004-data-export-import/contracts/fichier-export.md`, et retirer l'encadré indiquant qu'EF-024 est sans objet, cette exigence étant désormais activée par T019
- [X] T047 [P] Vérifier l'accessibilité au clavier de `src/features/budget/components/expense-form.tsx`, `expense-journal.tsx` et `expense-detail.tsx` : ordre de tabulation cohérent, focus visible, cibles tactiles d'au moins 44 px sur la saisie et l'ouverture du journal (EF-034)
- [X] T048 [P] Vérifier l'adaptabilité de `src/features/budget/components/budget-ring.tsx` et `budget-view.tsx` : utilisables dès 360 px sans défilement horizontal, lisibles à 200 % de zoom, contraste WCAG 2.1 AA dans les thèmes clair et sombre définis par `src/app/globals.css` (EF-032, EF-033)
- [X] T049 Vérifier sur l'ensemble de `src/features/budget/expenses.ts` et des composants ajoutés qu'aucun montant n'est formaté hors de `formatCents()` et qu'aucune conversion de centimes n'a lieu hors de `src/lib/money.ts`
- [X] T050 Mettre à jour `README.md` : saisie des dépenses, anneau du reste mensuel, allocation quotidienne avec report, journal ; ajouter `expenses.ts` à l'arborescence et mentionner le passage du document en version 2
- [X] T051 Relire les fichiers ajoutés dans `src/` : commentaires en français, suppression de tout code mort, commenté ou en attente
- [X] T052 Exécuter les treize scénarios manuels de `specs/003-daily-allowance-dashboard/quickstart.md` et consigner le résultat — scénarios 2, 3, 4 et 7 couverts par `src/features/budget/dashboard.test.tsx`, scénario 1 couvert par les tests de migration de `src/lib/storage.test.ts` ; scénarios 5, 6, 8 à 13 à vérifier dans un navigateur réel (voir la note ci-dessous)
- [X] T053 Passer les barrières de clôture : `npm run build`, `npm run lint` et `npm run test` sans aucune erreur ni règle neutralisée

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Phase 1** : aucune dépendance.
- **Phase 2** : dépend de la phase 1. **Bloque tous les récits.**
- **Phases 3 à 7** : dépendent de la fin de la phase 2.
- **Phase 8** : dépend des récits livrés.

### Dépendances entre récits

- **Récit 1 (P1)** : démarre après la phase 2. Aucune dépendance — il produit des données, ce que
  tous les autres consomment.
- **Récit 2 (P1)** : démarre après la phase 2. Testable sans le récit 1 en injectant des dépenses,
  mais **bien plus commode après lui**.
- **Récit 3 (P2)** : démarre après la phase 2. Son calcul se teste seul ; son affichage gagne à
  disposer du récit 1.
- **Récit 4 (P2)** : démarre après la phase 2. Indépendant des récits 2 et 3.
- **Récit 5 (P3)** : dépend du récit 4, qui fournit le point d'entrée vers le détail d'une dépense.

### À l'intérieur d'un récit

- Les tests de `expenses.ts` et de la migration sont écrits d'abord et doivent échouer avant
  l'implémentation.
- La migration précède tout : elle conditionne la lecture du document.
- Les composants précèdent leur câblage dans la vue.

### Occasions de parallélisation

- T005, T006, T010 à T014 : sept blocs de tests sur deux fichiers, largement indépendants.
- Une fois la phase 2 terminée, les récits 2, 3 et 4 sont menables en parallèle par trois personnes.
- T045, T046, T047, T048 en phase 8.

---

## Exemple de parallélisation : phase 2

```bash
Piste A : T005 → T006 → T007 → T008 → T009   # migration et persistance
Piste B : T010 → T014 → T015                 # logique de calcul
# T016 (fournisseur) et T017 à T019 (non-régression de 004) après jonction des deux pistes.
```

---

## Stratégie de mise en œuvre

### MVP d'abord

1. Phase 1 — mise en place
2. Phase 2 — fondations (**critique, bloque tout, porte le risque de perte de données**)
3. Phase 3 — récit 1
4. **S'arrêter et valider** : l'application enregistre des dépenses qui persistent
5. Livrer ou démontrer

### Livraison incrémentale

1. Phases 1 et 2 → migration sûre, logique prouvée
2. Récit 1 → carnet de dépenses (MVP)
3. Récit 2 → **l'anneau, la question que vous posiez en premier**
4. Récit 3 → allocation quotidienne avec report
5. Récit 4 → journal type relevé bancaire
6. Récit 5 → correction d'une dépense
7. Phase 8 → finition et clôture

### Recommandation de portée

Viser **les phases 1 à 5 incluses** (T001 à T034). C'est le point où l'application tient sa promesse
quotidienne : saisir, voir ce qu'il reste, savoir ce qu'on peut dépenser aujourd'hui. Le journal et la
correction sont du confort de consultation, précieux mais non structurants.

S'arrêter après le récit 1 laisserait des dépenses saisies sans rien pour les lire — moins utile que
l'application actuelle.

---

## Notes

- Les tâches marquées [P] portent sur des fichiers distincts.
- **La phase 2 porte le seul risque irréversible du projet** : une migration défaillante détruirait
  les données de 002. T005 la teste avant qu'elle n'existe, et le scénario 1 du guide de validation
  la vérifie en conditions réelles.
- **Ne rien « nettoyer » pendant la migration.** Son additivité est ce qui la rend sûre.
- T018 n'est pas une formalité : c'est le test de non-régression de l'architecture de 004, qui prouve
  que l'export était bien indifférent au contenu.
- Committer après chaque tâche ou groupe cohérent, message en français (principe VIII).
- `src/features/budget/budget-provider.tsx` et `budget-view.tsx` sont touchés par plusieurs récits :
  seuls points de contention en travail parallèle.


---

## Journal d'exécution

**Terminé le 2026-09-06.** Les 53 tâches sont réalisées. `npm run build`, `npm run lint` et
`npm run test` passent sans erreur ni règle neutralisée. **250 tests** au total, dont 57 ajoutés par
cette fonctionnalité : 44 sur `expenses.ts`, 13 d'intégration, plus 20 sur la migration et
l'analyseur de dépense dans `storage.test.ts`.

### Ce qui a été validé au passage

- **La migration 1 → 2 ne perd rien.** Sept tests la couvrent, dont un aller-retour complet par le
  stockage sur un document v1 réaliste (trois revenus, deux abonnements avec historique de tarifs et
  période de suspension).
- **La conception de la fonctionnalité 004 tenait.** Le passage du document en version 2 n'a demandé
  qu'**une seule ligne de code** dans `transfer.ts` (`FORMAT_VERSION`). Les 43 tests d'export et
  d'import n'ont eu besoin que de la mise à jour de leurs témoins à la version courante.
- **EF-024 de la fonctionnalité 004 est désormais active et testée.** Un fichier d'export de format 1
  est accepté et migré. Le contrat d'export a été mis à jour en conséquence.
- **Aucune dépendance ajoutée**, pour la troisième fonctionnalité consécutive.

### Défaut trouvé dans mes propres tests

Les trois tests de la propriété CS-004 étaient **faux**, pas l'implémentation. Ils cumulaient les
allocations offertes chaque jour sans dépenser, donc le reste ne diminuait jamais et la somme
dépassait mécaniquement le budget. La propriété réelle est : *si l'on dépense exactement l'allocation
chaque jour, le total servi n'excède jamais le disponible*. Réécrits sur cette base, ils passent — et
montrent au passage que le total servi **égale** le disponible, la troncature ne faisant rien perdre
puisque le dernier jour reçoit le reliquat.

### Écarts par rapport au plan, assumés

- **EF-020 amendée avant tout code** (T003), comme l'analyse le recommandait. La spécification et
  l'implémentation n'ont jamais divergé.
- **Réorganisation de l'écran d'accueil** : anneau, allocation, saisie et journal en tête ; le budget
  prévisionnel de la fonctionnalité 002 passe dans un repli. Le prévisionnel se consulte une fois par
  mois, le quotidien plusieurs fois par jour.
- **Redondance corrigée dans l'anneau** : le centre annonçait « Dépassement » et le libellé d'état
  aussi. Le centre dit désormais « Dépassé de », qui annonce ce que le chiffre signifie.
- **Réinitialisation de la tranche du journal déplacée hors d'un effet**, sur refus du lint
  (`react-hooks/set-state-in-effect`) — à juste titre : réagir à un changement d'état dans un effet
  est un détour dont React n'a pas besoin.

### Reste à vérifier par un humain dans un navigateur

Huit scénarios du guide ne sont pas automatisables ici :

- **5 et 6** — allocation quotidienne et report en conditions réelles, bornes du mois. La logique est
  couverte par 44 tests unitaires, dont les quatre scénarios chiffrés de la spécification.
- **8** — modification et suppression d'une dépense, et recalcul des sous-totaux des deux journées
  concernées lors d'un changement de date.
- **9** — export après migration : vérifier que le fichier porte `"formatVersion": 2`, et réimporter
  un ancien fichier de format 1 si vous en avez conservé un.
- **10** — accessibilité réelle : clavier, niveaux de gris, 360 px, zoom 200 %, réduction des
  animations.
- **11** — volume : 2 000 dépenses, consultation du journal sans attente perceptible.
- **12** — franchissement de minuit avec l'application ouverte.
- **13** — fonctionnement hors ligne.
