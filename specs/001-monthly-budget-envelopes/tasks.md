---
description: "Liste de tâches — Enveloppes budgétaires mensuelles"
---

# Tâches : Enveloppes budgétaires mensuelles

**Entrée** : documents de conception de `specs/001-monthly-budget-envelopes/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests** : **obligatoires**, par application du principe III. `envelopes.ts` agrège des montants ; la
migration 2 → 3 persiste des données. Les composants de présentation sans calcul en sont dispensés.

**Ordre tests / implémentation** : les tests précèdent l'implémentation pour `envelopes.ts` et la
migration.

**État du code au démarrage** : 002, 003 et 004 sont livrées. 250 tests passent. Le document est en
version 2, le format d'export aussi. `Expense`, `expensesInMonth`, `sumCents`, `parseDocument`,
`migrer`, `BudgetProvider` et `MonthNavigator` existent et sont testés.

**Écarts signalés avec la spécification** : cette spécification a été écrite avant que la saisie des
dépenses n'existe, sur un modèle de transaction plus riche que celui qui a été construit. **EF-009
est inapplicable** (les montants de dépense sont strictement positifs) et **EF-008 est vacante** (le
modèle ne comporte que des dépenses). T003 et T004 les amendent **avant toute écriture de code**,
pour que spécification et implémentation ne divergent jamais — leçon tirée de l'analyse de la
fonctionnalité 003.

**Organisation** : tâches groupées par récit utilisateur.

## Format : `[ID] [P?] [Récit] Description`

- **[P]** : parallélisable (fichiers distincts, aucune dépendance sur une tâche non terminée)
- **[US1]…[US4]** : récit utilisateur de rattachement
- Chaque description porte le chemin exact du fichier concerné

---

## Phase 1 : Mise en place et réconciliation de la spécification

**Objectif** : faire dire à la spécification ce que l'implémentation fera, **puis** déclarer l'entité.

Les amendements viennent en premier. Tant qu'ils ne sont pas faits, la spécification décrit un
comportement que le code ne produira pas, et quiconque l'ouvre pendant l'implémentation y lit une
exigence violée sans savoir s'il s'agit d'un défaut ou d'une décision.

- [ ] T001 Confirmer que `npm run test` passe sur la base existante (250 tests) avant toute modification, afin de pouvoir attribuer toute régression ultérieure
- [ ] T002 [P] Ajouter dans `src/features/budget/messages.ts` les libellés des quatre états d'enveloppe, le message du regroupement non budgété et celui du report sans source, conformément à [contracts/interface.md](./contracts/interface.md)
- [ ] T003 **Avant toute écriture de code** : amender EF-009 dans `specs/001-monthly-budget-envelopes/spec.md` pour placer les remboursements et montants négatifs **hors périmètre**, en indiquant que `Expense.amountCents` est strictement positif depuis la fonctionnalité 003 et qu'un remboursement relèverait d'une fonctionnalité dédiée
- [ ] T004 **Avant toute écriture de code** : amender EF-008 dans `specs/001-monthly-budget-envelopes/spec.md` pour dire que les enveloppes ne mesurent que des dépenses, le modèle ne comportant ni virement ni écriture de revenu — ou retirer l'exigence, devenue sans objet
- [ ] T005 [P] Corriger l'hypothèse des catégories dans `specs/001-monthly-budget-envelopes/spec.md` : elles sont du texte libre et facultatif, non une liste gérée ; le cas limite du renommage devient le cas courant et le regroupement non budgété absorbe aussi les dépenses sans catégorie (décision D3)
- [ ] T006 Déclarer le type `Envelope` et porter `DOCUMENT_VERSION` de 2 à 3 dans `src/features/budget/types.ts`, en ajoutant `envelopes: Envelope[]` à `BudgetDocument` et à `emptyDocument()`, ainsi que les types dérivés `EnvelopeState`, `EnvelopeStatus`, `UnbudgetedGroup` et `MonthlyEnvelopes` de [data-model.md](./data-model.md)

**Point de contrôle** : la spécification et la conception disent la même chose. `npm run build`
échouera tant que la phase 2 n'aura pas étendu l'analyseur — c'est attendu.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : la migration, l'analyseur, la logique de calcul, et la vérification que l'export suit.

**⚠️ CRITIQUE** : aucun récit utilisateur ne peut démarrer avant la fin de cette phase.

### Migration et persistance

- [ ] T007 [P] Écrire les tests de migration dans `src/lib/storage.test.ts` : un document v2 comportant des dépenses migre en v3 **sans en perdre une seule** ; `envelopes` initialisée à `[]` ; un document v1 traverse les deux migrations jusqu'en v3 sans perte ; un document v4 part en quarantaine
- [ ] T008 [P] Écrire les tests de l'analyseur d'enveloppe dans `src/lib/storage.test.ts` : plafond négatif refusé ; **plafond nul accepté** (décision D7) ; plafond non entier refusé ; catégorie vide ou trop longue refusée ; mois mal formé refusé ; **doublon du couple catégorie/mois refusé** (EF-005) ; identifiant en doublon avec une dépense refusé
- [ ] T009 Implémenter `analyserEnveloppe()` dans `src/lib/storage.ts` sur le motif des analyseurs existants, avec la règle `limitCents >= 0` — seule exception du projet à la règle du montant strictement positif, et délibérée
- [ ] T010 Implémenter la migration 2 → 3 dans la fonction `migrer()` de `src/lib/storage.ts` : `envelopes` initialisée à `[]`, `version` portée à 3, le reste repris tel quel. Le chemin 1 → 2 → 3 doit se composer sans traitement particulier
- [ ] T011 Étendre `parseDocument()` dans `src/lib/storage.ts` : analyse des enveloppes, unicité des identifiants sur le document entier, et **unicité du couple catégorie/mois**

### Logique de calcul

- [ ] T012 [P] Écrire les tests d'état et de seuil dans `src/features/budget/envelopes.test.ts` : plafond 400,00 € avec 0 → `unused`, 200,00 € → `onTrack`, **340,00 € exactement → `nearingLimit`**, 339,99 € → `onTrack`, 400,00 € → `nearingLimit`, 400,01 € → `overBudget` ; plafond nul sans dépense → `unused`, avec dépense → `overBudget`
- [ ] T013 [P] Écrire les tests de `consumedRatio` dans `src/features/budget/envelopes.test.ts` : plafonné à 1 en dépassement ; jamais `NaN` ni `Infinity`, plafond nul compris
- [ ] T014 [P] Écrire les tests de `computeMonthlyEnvelopes` dans `src/features/budget/envelopes.test.ts` : dépensé exact au centime sur au moins 200 dépenses (CS-003) ; dépense d'un autre mois exclue ; enveloppe sans dépense conservée avec un dépensé nul ; `overBudgetCount` et `overBudgetTotalCents` exacts ; ventilation triée de façon déterministe à montants égaux
- [ ] T015 [P] Écrire les tests du regroupement non budgété dans `src/features/budget/envelopes.test.ts` : une dépense **sans catégorie** et une dépense d'une **catégorie sans plafond** y figurent toutes deux ; elles sont exclues des totaux budgétés ; la ventilation distingue `null` des catégories nommées
- [ ] T016 [P] Écrire les tests d'isolation des mois dans `src/features/budget/envelopes.test.ts` : un plafond défini pour un mois n'apparaît pas dans un autre ; modifier le plafond d'un mois ne change aucun montant des trois mois précédents (CS-007, EF-022)
- [ ] T017 [P] Écrire les tests de report dans `src/features/budget/envelopes.test.ts` : `copyEnvelopesToMonth` duplique tous les plafonds avec de **nouveaux identifiants** ; copier depuis un mois vide renvoie une liste vide ; les copies sont indépendantes de leurs originaux
- [ ] T018 Implémenter `src/features/budget/envelopes.ts` : `envelopesForMonth()`, `findEnvelope()`, `envelopeState()`, `consumedRatio()`, `computeMonthlyEnvelopes()` et `copyEnvelopesToMonth()` selon [contracts/calculs-enveloppes.md](./contracts/calculs-enveloppes.md). Le seuil se compare **par multiplication entière** (`dépensé × 100 >= plafond × 85`), jamais par division
- [ ] T019 Ajouter les actions `setEnvelopeLimit`, `removeEnvelope` et `copyEnvelopesFromPreviousMonth` au réducteur de `src/features/budget/budget-provider.tsx` ; `setEnvelopeLimit` crée ou met à jour, sans jamais produire de doublon (EF-005)

### Non-régression de la fonctionnalité 004

- [ ] T020 Porter `FORMAT_VERSION` de 2 à 3 dans `src/features/budget/transfer.ts`
- [ ] T021 Porter les témoins de `src/features/budget/transfer.test.ts` et `src/features/budget/data-transfer.test.tsx` en version 3, et vérifier que les tests d'export passent **sans autre modification**. Un échec signalerait que l'extension du document n'est plus additive : s'arrêter alors pour comprendre pourquoi, plutôt que d'adapter les tests

**Point de contrôle** : `npm run test` passe, migration comprise. Toute la logique est prouvée avant
qu'aucune interface n'existe, et les données existantes sont en sécurité.

---

## Phase 3 : Récit 1 — Définir un plafond mensuel pour une catégorie (Priorité : P1) 🎯 MVP

**Objectif** : consigner une intention de dépense par catégorie et par mois.

**Test indépendant** : définir des plafonds sur deux ou trois catégories, recharger l'application,
vérifier qu'ils persistent et que le total prévu est leur somme.

- [ ] T022 [US1] Créer `src/features/budget/components/envelope-form.tsx` : champ de catégorie, champ de plafond avec `inputMode="decimal"`, et enregistrement pour le mois consulté (EF-001)
- [ ] T023 [US1] Implémenter dans `envelope-form.tsx` les refus d'EF-004 — plafond négatif ou non numérique — avec message textuel rattaché au champ, et **l'acceptation explicite du plafond nul** en indiquant ce qu'il signifie
- [ ] T024 [US1] Implémenter dans `envelope-form.tsx` la réinitialisation après validation, pour que définir cinq plafonds tienne en moins de deux minutes (CS-001)
- [ ] T025 [US1] Créer `src/features/budget/components/envelope-list.tsx` : liste des enveloppes du mois avec plafond, modification et suppression (EF-002), la suppression indiquant que les dépenses concernées basculeront en non budgété
- [ ] T026 [US1] Câbler `<EnvelopeList />` après le journal des dépenses dans `src/features/budget/components/budget-view.tsx`, conformément à l'emplacement fixé par [contracts/interface.md](./contracts/interface.md)

**Point de contrôle** : le récit 1 fonctionne seul — l'application consigne un plan mensuel de
dépense, ce qui a déjà une valeur autonome.

---

## Phase 4 : Récit 2 — Voir la dépense réelle face à chaque plafond (Priorité : P2)

**Objectif** : transformer un plan figé en budget vivant.

**Test indépendant** : définir un plafond, saisir des dépenses dans la catégorie, vérifier que les
montants dépensé et restant correspondent à leur somme ; vérifier qu'une dépense datée hors du mois
n'a aucun effet.

- [ ] T027 [US2] Afficher dans `src/features/budget/components/envelope-list.tsx` le plafond, le montant dépensé et le montant restant de chaque enveloppe (EF-011)
- [ ] T028 [US2] Ajouter à `envelope-list.tsx` une barre de progression **décorative** (`aria-hidden`), plafonnée au tour complet et sans animation sous `prefers-reduced-motion`
- [ ] T029 [US2] Créer `src/features/budget/components/envelope-summary.tsx` : total prévu, total dépensé au titre des enveloppes, total restant (EF-013), placé **en tête de section** pour être lisible sans défilement (CS-002)
- [ ] T030 [US2] Implémenter le regroupement « Non budgété » dans `envelope-summary.tsx` : total et ventilation, en indiquant qu'il couvre les catégories non plafonnées **et** les dépenses sans catégorie (EF-012, décision D3)
- [ ] T031 [US2] Câbler `<EnvelopeSummary />` en tête de la section des enveloppes dans `src/features/budget/components/envelope-list.tsx`

**Point de contrôle** : les récits 1 et 2 forment un budget par enveloppes utilisable.

---

## Phase 5 : Récit 3 — Être alerté avant et pendant le dépassement (Priorité : P2)

**Objectif** : que le dépassement se remarque pendant qu'il se produit, pas à la fin du mois.

**Test indépendant** : ajouter des dépenses qui font franchir le seuil d'alerte puis le plafond, et
vérifier que l'état change à chaque franchissement, signalé par du texte autant que visuellement.

- [ ] T032 [US3] Afficher dans `src/features/budget/components/envelope-list.tsx` les quatre états d'EF-014 avec leur **libellé textuel** (EF-017), de sorte que retirer la couleur ne fasse perdre aucune information (CS-006)
- [ ] T033 [US3] Implémenter dans `envelope-list.tsx` la présentation du dépassement d'EF-016 : montant du dépassement affiché, jamais un reste négatif brut
- [ ] T034 [US3] Afficher dans `src/features/budget/components/envelope-summary.tsx` le nombre d'enveloppes en dépassement **et** le montant total du dépassement (EF-018)
- [ ] T035 [US3] Vérifier dans `envelope-list.tsx` que l'état « proche du plafond » apparaît bien au seuil exact de 85 % et pas avant, en cohérence avec `envelopeState()`

**Point de contrôle** : les trois premiers récits fonctionnent ; l'alerte est la partie qui change le
comportement.

---

## Phase 6 : Récit 4 — Reporter un plan sur le mois suivant (Priorité : P3)

**Objectif** : ne pas ressaisir chaque enveloppe tous les mois.

**Test indépendant** : définir des plafonds sur un mois, passer au suivant, déclencher le report, et
vérifier que les plafonds sont copiés tandis que les dépensés repartent de zéro.

- [ ] T036 [US4] Ajouter l'action de report dans `src/features/budget/components/envelope-list.tsx`, appelant `copyEnvelopesFromPreviousMonth` du fournisseur (EF-020)
- [ ] T037 [US4] Implémenter la confirmation avant remplacement dans `envelope-list.tsx` lorsque le mois cible comporte déjà des plafonds (EF-021), actionnable au clavier
- [ ] T038 [US4] Implémenter dans `envelope-list.tsx` l'indisponibilité de l'action quand le mois précédent n'a aucun plafond, avec un message expliquant qu'il n'y a rien à copier

**Point de contrôle** : les quatre récits fonctionnent ; la fonctionnalité est complète.

---

## Phase 7 : Finition et exigences transverses

- [ ] T039 [P] Écrire les tests d'intégration dans `src/features/budget/envelopes.integration.test.tsx` : définir un plafond met à jour la synthèse sans rafraîchissement ; saisir une dépense met à jour l'enveloppe correspondante (EF-010) ; refus de saisie sans écriture ; une dépense sans catégorie apparaît en non budgété
- [ ] T040 [P] Ajouter la ligne de la version 3 à la table des versions de `specs/004-data-export-import/contracts/fichier-export.md` et porter son en-tête et son exemple en version 3
- [ ] T041 [P] Vérifier l'accessibilité au clavier de `src/features/budget/components/envelope-form.tsx` et `envelope-list.tsx` : ordre de tabulation cohérent, focus visible, confirmation de report actionnable au clavier
- [ ] T042 [P] Vérifier l'adaptabilité de `src/features/budget/components/envelope-list.tsx` et `envelope-summary.tsx` : utilisables dès 360 px sans défilement horizontal, lisibles à 200 % de zoom, contraste WCAG 2.1 AA dans les thèmes de `src/app/globals.css`
- [ ] T043 Vérifier sur l'ensemble de `src/features/budget/envelopes.ts` et des composants ajoutés qu'aucun montant n'est formaté hors de `formatCents()` et qu'aucune division n'est introduite hors du taux de consommation
- [ ] T044 Mettre à jour `README.md` : enveloppes budgétaires par catégorie, alerte au seuil de 85 %, regroupement non budgété, report des plafonds ; ajouter `envelopes.ts` à l'arborescence et mentionner le passage du document en version 3
- [ ] T045 Relire les fichiers ajoutés dans `src/` : commentaires en français, suppression de tout code mort, commenté ou en attente
- [ ] T046 Exécuter les douze scénarios manuels de `specs/001-monthly-budget-envelopes/quickstart.md` et consigner le résultat, en particulier le scénario 1 qui vérifie qu'aucune donnée existante n'a été perdue à la migration
- [ ] T047 Passer les barrières de clôture : `npm run build`, `npm run lint` et `npm run test` sans aucune erreur ni règle neutralisée

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Phase 1** : aucune dépendance. Les amendements (T003 à T005) précèdent tout code.
- **Phase 2** : dépend de la phase 1. **Bloque tous les récits.**
- **Phases 3 à 6** : dépendent de la fin de la phase 2.
- **Phase 7** : dépend des récits livrés.

### Dépendances entre récits

- **Récit 1 (P1)** : démarre après la phase 2. Aucune dépendance — il crée les plafonds que les
  autres exploitent.
- **Récit 2 (P2)** : dépend du récit 1, qui fournit les enveloppes à mesurer. Son calcul se teste
  seul sur un document construit à la main.
- **Récit 3 (P2)** : dépend du récit 2, dont il enrichit l'affichage d'un état et d'une alerte.
- **Récit 4 (P3)** : dépend du récit 1 seulement — copier des plafonds ne suppose pas de les mesurer.

Cette fonctionnalité est **plus séquentielle** que les précédentes : les quatre récits enrichissent
successivement les deux mêmes composants. Il y a peu à gagner à les paralléliser.

### À l'intérieur d'un récit

- Les tests d'`envelopes.ts` et de la migration sont écrits d'abord et doivent échouer avant
  l'implémentation.
- La migration précède tout : elle conditionne la lecture du document.
- Les composants précèdent leur câblage dans la vue.

### Occasions de parallélisation

- T007, T008 et T012 à T017 : huit blocs de tests sur deux fichiers, largement indépendants.
- T039 à T042 en phase 7.
- Peu d'occasions entre récits, pour la raison exposée ci-dessus.

---

## Exemple de parallélisation : phase 2

```bash
Piste A : T007 → T008 → T009 → T010 → T011   # migration et persistance
Piste B : T012 → T017 → T018                 # logique de calcul
# T019 (fournisseur) et T020 à T021 (non-régression de 004) après jonction des deux pistes.
```

---

## Stratégie de mise en œuvre

### MVP d'abord

1. Phase 1 — réconciliation de la spécification et mise en place
2. Phase 2 — fondations (**critique, porte le risque de perte de données**)
3. Phase 3 — récit 1
4. **S'arrêter et valider** : l'application consigne un plan mensuel de dépense
5. Livrer ou démontrer

### Livraison incrémentale

1. Phases 1 et 2 → migration sûre, logique prouvée
2. Récit 1 → plafonds définis et persistés (MVP)
3. Récit 2 → **le cœur** : la dépense réelle face au plan
4. Récit 3 → l'alerte, qui change le comportement
5. Récit 4 → le report, confort à partir du deuxième mois
6. Phase 7 → finition et clôture

### Recommandation de portée

Viser **les phases 1 à 5 incluses** (T001 à T035). C'est le point où les enveloppes servent à quelque
chose : un plan, sa consommation réelle, et une alerte quand on s'en écarte.

S'arrêter après le récit 1 laisserait des plafonds que rien ne confronte à la réalité — un plan sans
suivi, moins utile que pas de plan du tout.

---

## Notes

- Les tâches marquées [P] portent sur des fichiers distincts.
- **La phase 2 porte le seul risque irréversible** : une migration défaillante détruirait les données
  de 002 et 003. T007 la teste avant qu'elle n'existe.
- **Ne rien « nettoyer » pendant la migration.** Son additivité est ce qui la rend sûre.
- **T021 n'est pas une formalité** : c'est la deuxième vérification que l'export de la fonctionnalité
  004 est indifférent au contenu. Si les tests exigent plus qu'une mise à jour de leurs témoins,
  s'arrêter pour comprendre plutôt que d'adapter.
- **Le plafond nul est valide.** C'est la seule exception du projet à la règle du montant strictement
  positif, et elle est délibérée : zéro est une intention, l'absence d'intention se traduisant par
  l'absence d'enveloppe.
- Committer après chaque tâche ou groupe cohérent, message en français (principe VIII).
- `envelope-list.tsx` est touché par les quatre récits : c'est le principal point de contention.
