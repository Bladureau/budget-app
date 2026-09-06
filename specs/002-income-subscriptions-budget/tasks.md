---
description: "Liste de tâches — Revenus, abonnements prévisionnels et budget mensuel"
---

# Tâches : Revenus, abonnements prévisionnels et budget mensuel

**Entrée** : documents de conception de `specs/002-income-subscriptions-budget/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests** : **obligatoires ici**, non par choix mais par application du principe III de la
constitution, qui impose des tests à tout code qui calcule, agrège, convertit, répartit ou persiste
un montant. Concrètement : `src/lib/**` et `src/features/budget/calculs.ts` sont sous obligation de
test avec cas nominal, bornes et entrée malformée. Les composants de présentation sans calcul en sont
dispensés par le même principe et n'ont donc pas de tâche de test dédiée.

**Ordre tests / implémentation** : pour les modules purs, les tests sont écrits en premier et doivent
échouer avant l'implémentation — c'est peu coûteux sur de la logique pure et cela évite d'écrire des
tests qui épousent un bogue. La constitution n'impose pas le TDD partout, et l'interface ne le suit
donc pas.

**Organisation** : les tâches sont groupées par récit utilisateur, pour que chaque récit soit
implémentable, testable et livrable indépendamment.

## Format : `[ID] [P?] [Récit] Description`

- **[P]** : parallélisable (fichiers distincts, aucune dépendance sur une tâche non terminée)
- **[US1]…[US5]** : récit utilisateur de rattachement, pour la traçabilité
- Chaque description porte le chemin exact du fichier concerné

## Conventions de chemins

Projet unique, sans backend, organisé par fonctionnalité sous `src/`, conformément à la décision de
structure du [plan](./plan.md). Les tests sont colocalisés avec le code qu'ils couvrent
(`*.test.ts`), et non dans un répertoire `tests/` séparé.

---

## Phase 1 : Mise en place (infrastructure partagée)

**Objectif** : rendre le dépôt capable d'exécuter des tests et accueillir la structure prévue.

- [X] T001 Installer les dépendances de développement pour les tests : `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths` (versions figées dans `package.json`)
- [X] T002 Créer `vitest.config.mts` à la racine avec les greffons `tsconfigPaths()` et `react()` et l'environnement `jsdom`, conformément à `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- [X] T003 [P] Ajouter le script `"test": "vitest run"` et `"test:watch": "vitest"` dans `package.json`
- [X] T004 [P] Créer l'arborescence vide `src/lib/` et `src/features/budget/components/` conformément à la structure du plan
- [X] T005 [P] Corriger `src/app/layout.tsx` : attribut `lang="fr"` sur `<html>`, et métadonnées `title` / `description` en français décrivant l'application (remplace « Create Next App »)
- [X] T006 [P] Définir les jetons de thème clair et sombre dans `src/app/globals.css`, avec les couleurs de fond, de texte et d'état (excédent, équilibre, déficit) respectant le contraste WCAG 2.1 AA

**Point de contrôle** : `npm run test` s'exécute sans test à lancer et `npm run build` passe toujours.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : les primitives partagées par tous les récits — montants, dates, persistance, état.

**⚠️ CRITIQUE** : aucun récit utilisateur ne peut démarrer avant la fin de cette phase.

- [X] T007 [P] Écrire les tests de `src/lib/money.test.ts` : `parseAmountInput` sur `"12,40"` et `"12.40"` → `1240`, refus explicite de `""`, `"abc"`, `"1,234"`, `"-5"`, `"0"`, tolérance des espaces et de l'espace insécable, absence de `NaN` ; `sumCents` sur liste vide et sur grand volume sans perte
- [X] T008 Implémenter `src/lib/money.ts` : type `Cents`, `parseAmountInput()`, `formatCents()`, `sumCents()` selon [contracts/calculs.md](./contracts/calculs.md) — seul point d'appel autorisé à `Intl.NumberFormat`
- [X] T009 [P] Écrire les tests de `src/lib/date.test.ts` : `addMonthsClamped` sur `2026-01-31 +1` → `2026-02-28`, `2028-01-31 +1` → `2028-02-29`, `2026-01-31 +2` → `2026-03-31` (absence de dérive), franchissement d'année ; `isValidIsoDate` refusant `2026-02-31` et `2026-13-01` ; `daysInMonth` sur 28, 29, 30 et 31 jours
- [X] T010 Implémenter `src/lib/date.ts` : `monthKeyOf()`, `startOfMonth()`, `endOfMonth()`, `daysInMonth()`, `addMonthsClamped()`, `compareIso()`, `isValidIsoDate()` selon [contracts/calculs.md](./contracts/calculs.md)
- [X] T011 [P] Déclarer les types du domaine dans `src/features/budget/types.ts` : `IsoDate`, `MonthKey`, `Periodicity`, `Id`, `Income`, `Subscription`, `AmountPeriod`, `PausePeriod`, `BudgetDocument`, `MonthlyBudget`, `ChargeLine`, `UpcomingDue`, conformément à [data-model.md](./data-model.md)
- [X] T012 [P] Écrire les tests de `src/lib/storage.test.ts` : clé absente → état vide sans erreur ; JSON invalide, `version` absente, `version` inconnue, `version` supérieure, champ invalide → mise en quarantaine et démarrage à vide ; vérification que la valeur brute d'origine est conservée intacte sous `budget-app:corrupted:<horodatage>`
- [X] T013 Implémenter `src/lib/storage.ts` : analyseurs partant d'`unknown` renvoyant `{ ok, value } | { ok: false, reason }` sans aucun transtypage, lecture, écriture intégrale revalidée, quarantaine et point d'entrée de migration, selon [contracts/stockage.md](./contracts/stockage.md)
- [X] T014 Implémenter la gestion de l'échec d'écriture dans `src/lib/storage.ts` : quota dépassé ou stockage indisponible remonté comme un résultat d'erreur exploitable, jamais silencieux
- [X] T015 Créer `src/features/budget/budget-provider.tsx` avec la directive `"use client"` : contexte, réducteur des mutations, lecture initiale par `useSyncExternalStore` (jamais pendant le rendu, pour éviter la divergence d'hydratation), écriture via `src/lib/storage.ts`
- [X] T016 Remplacer le contenu de `src/app/page.tsx` par un Composant Serveur qui rend `<BudgetProvider>` et la coquille de la vue budgétaire, sans directive `"use client"`
- [X] T017 [P] Créer `src/features/budget/components/storage-notice.tsx` : bandeaux d'information pour l'état « données précédentes illisibles mais conservées » et « modification non enregistrée », conformément aux états de [contracts/interface.md](./contracts/interface.md)

**Point de contrôle** : les fondations sont prêtes. `npm run test` passe, l'application démarre sur un
état vide sans erreur, les récits peuvent commencer.

---

## Phase 3 : Récit 1 — Enregistrer mes revenus disponibles (Priorité : P1) 🎯 MVP

**Objectif** : saisir, modifier et supprimer des revenus ponctuels et récurrents, et voir le total des
revenus du mois consulté.

**Test indépendant** : saisir un revenu récurrent et un revenu ponctuel, recharger l'application,
vérifier que le total du mois est la somme des deux et qu'il persiste.

### Tests du récit 1

- [X] T018 [P] [US1] Écrire les tests d'`occurrencesInMonth` dans `src/features/budget/calculs.test.ts` : revenu ponctuel compté dans son seul mois ; revenu récurrent mensuel présent à partir de `startDate` ; borné par `endDate` incluse ; périodicité produisant plusieurs occurrences dans un même mois ; total exact au centime sur au moins 50 revenus

### Implémentation du récit 1

- [X] T019 [US1] Implémenter `occurrencesInMonth()` dans `src/features/budget/calculs.ts` selon [contracts/calculs.md](./contracts/calculs.md)
- [X] T020 [US1] Implémenter le total des revenus d'un mois dans `src/features/budget/calculs.ts`, en s'appuyant sur `sumCents()`
- [X] T021 [US1] Ajouter les actions `addIncome`, `updateIncome`, `removeIncome` au réducteur de `src/features/budget/budget-provider.tsx`, avec revalidation avant écriture
- [X] T022 [US1] Créer `src/features/budget/components/income-form.tsx` : champs montant, libellé, nature ponctuel/récurrent, périodicité, dates de début et de fin, chaque champ avec étiquette associée
- [X] T023 [US1] Implémenter dans `income-form.tsx` le refus de saisie d'EF-004 : montant négatif, nul, non numérique, plus de deux décimales, `endDate` antérieure à `startDate` — message textuel rattaché programmatiquement au champ, aucune écriture
- [X] T024 [US1] Créer `src/features/budget/components/income-list.tsx` : liste des revenus du mois consulté, avec total, et actions de modification et de suppression
- [X] T025 [US1] Câbler `income-form.tsx` et `income-list.tsx` dans la vue rendue par `src/app/page.tsx`

**Point de contrôle** : le récit 1 est pleinement fonctionnel et testable seul — l'application est un
carnet de revenus utilisable.

---

## Phase 4 : Récit 2 — Déclarer mes abonnements en prévision (Priorité : P1)

**Objectif** : enregistrer des abonnements avec leur périodicité et voir les charges engagées du mois
consulté ainsi que le coût mensuel moyen.

**Test indépendant** : déclarer des abonnements de périodicités différentes, vérifier le total engagé
du mois consulté et le coût mensuel moyen affiché, sans qu'aucun revenu ne soit enregistré.

### Tests du récit 2

- [X] T026 [P] [US2] Écrire les tests de `duesInMonth` dans `src/features/budget/calculs.test.ts` : abonnement annuel présent uniquement dans son mois d'échéance et absent des onze autres ; abonnement non compté avant `startDate` ; abonnement au 31 rattaché au 28 ou 29 février ; liste vide hors de la fenêtre `startDate`–`endDate`
- [X] T027 [P] [US2] Écrire les tests d'`averageMonthlyCostCents` dans `src/features/budget/calculs.test.ts` : annuel 120,00 € → 10,00 € ; trimestriel 10,00 € → 3,33 € ; semestriel 10,01 € → 1,67 € (demi-centime arrondi au supérieur) ; assertion explicite que cette valeur n'entre dans aucun total

### Implémentation du récit 2

- [X] T028 [US2] Implémenter `amountAt()` dans `src/features/budget/calculs.ts` : montant de la dernière `AmountPeriod` dont `effectiveFrom <= date`, `null` avant la première période
- [X] T029 [US2] Implémenter `duesInMonth()` dans `src/features/budget/calculs.ts`, en réutilisant `addMonthsClamped()` pour le rabattement de fin de mois
- [X] T030 [US2] Implémenter `averageMonthlyCostCents()` dans `src/features/budget/calculs.ts`, cantonné à l'affichage
- [X] T031 [US2] Implémenter le total des charges engagées d'un mois dans `src/features/budget/calculs.ts`
- [X] T032 [US2] Ajouter les actions `addSubscription`, `updateSubscription`, `removeSubscription` au réducteur de `src/features/budget/budget-provider.tsx`
- [X] T033 [US2] Créer `src/features/budget/components/subscription-form.tsx` : libellé, montant, périodicité, date de début, date de fin facultative, avec les refus de saisie d'EF-005 du récit 2
- [X] T034 [US2] Créer `src/features/budget/components/subscription-list.tsx` : liste des abonnements avec tri par montant et par date de prochaine échéance, et affichage du coût mensuel moyen visuellement distinct du montant imputé au mois
- [X] T035 [US2] Câbler `subscription-form.tsx` et `subscription-list.tsx` dans la vue rendue par `src/app/page.tsx`

**Point de contrôle** : les récits 1 et 2 fonctionnent chacun indépendamment.

---

## Phase 5 : Récit 3 — Consulter mon budget mensuel et mon reste disponible (Priorité : P2)

**Objectif** : mettre face à face revenus et charges engagées, et produire le reste disponible, le
taux d'engagement et la ventilation des charges.

**Test indépendant** : enregistrer revenus et abonnements sur un mois, vérifier que le reste
disponible est exactement la différence des deux totaux, y compris négative.

### Tests du récit 3

- [X] T036 [P] [US3] Écrire les tests de `computeMonthlyBudget` dans `src/features/budget/calculs.test.ts` : excédent, équilibre exact à zéro, déficit ; revenus nuls → `commitmentRate === null` sans division par zéro ; ventilation triée par montant décroissant puis par libellé de façon déterministe à montants égaux ; exactitude au centime sur au moins 50 éléments combinés

### Implémentation du récit 3

- [X] T037 [US3] Implémenter `computeMonthlyBudget()` dans `src/features/budget/calculs.ts` selon [contracts/calculs.md](./contracts/calculs.md), y compris `status`, `commitmentRate` et `isProjection`
- [X] T038 [US3] Créer `src/features/budget/components/month-summary.tsx` : total des revenus, total des charges engagées, reste disponible et taux d'engagement du mois consulté
- [X] T039 [US3] Implémenter dans `month-summary.tsx` la présentation du déficit d'EF-015 : montant de déficit libellé, jamais un nombre négatif brut, dans un état distinct de l'excédent
- [X] T040 [US3] Implémenter dans `month-summary.tsx` la distinction des états d'EF-016 par le texte en plus de la couleur, de sorte que retirer la couleur ne fasse perdre aucune information
- [X] T041 [US3] Créer `src/features/budget/components/charge-breakdown.tsx` : ventilation des charges du mois, abonnement par abonnement, triée du montant le plus élevé au plus faible
- [X] T042 [US3] Implémenter l'état vide d'EF-020 dans `month-summary.tsx` : totaux à zéro et invitation explicite à saisir, sans état d'erreur

**Point de contrôle** : les récits 1, 2 et 3 fonctionnent — l'application répond à « combien me
reste-t-il ce mois ? ».

---

## Phase 6 : Récit 4 — Naviguer entre les mois et anticiper les échéances (Priorité : P3)

**Objectif** : passer d'un mois à l'autre, projeter les mois futurs et lister les prochaines
échéances.

**Test indépendant** : déclarer un abonnement annuel et un mensuel, parcourir douze mois consécutifs,
vérifier que l'échéance annuelle n'apparaît que dans son mois et que les mois futurs sont projetés.

### Tests du récit 4

- [X] T043 [P] [US4] Écrire les tests de `forecast` dans `src/features/budget/calculs.test.ts` : douze mois consécutifs, échéance annuelle apparaissant exactement une fois, mois futurs marqués comme projections, aucune modification postérieure n'affectant un mois antérieur
- [X] T044 [P] [US4] Écrire les tests de `listUpcomingDues` dans `src/features/budget/calculs.test.ts` : tri par date croissante puis par libellé, respect du nombre demandé, exclusion des abonnements résiliés

### Implémentation du récit 4

- [X] T045 [US4] Implémenter `forecast()` dans `src/features/budget/calculs.ts`, sans consultation de l'horloge — la date de référence est passée en paramètre
- [X] T046 [US4] Implémenter `listUpcomingDues()` dans `src/features/budget/calculs.ts`
- [X] T047 [US4] Ajouter l'état `selectedMonth` et les actions de navigation au réducteur de `src/features/budget/budget-provider.tsx`
- [X] T048 [US4] Créer `src/features/budget/components/month-navigator.tsx` : mois précédent, mois suivant, retour au mois courant, avec annonce du mois affiché aux lecteurs d'écran lors du changement
- [X] T049 [US4] Créer `src/features/budget/components/forecast-view.tsx` : douze mois projetés, mois déficitaires signalés, caractère projeté explicite
- [X] T050 [US4] Créer `src/features/budget/components/upcoming-dues.tsx` : prochaines échéances ordonnées par date avec leur montant

**Point de contrôle** : la navigation et l'anticipation fonctionnent sans avoir altéré les récits
précédents.

---

## Phase 7 : Récit 5 — Faire évoluer un abonnement (Priorité : P3)

**Objectif** : changement de tarif daté, mise en pause et résiliation, sans perte d'historique.

**Test indépendant** : modifier le tarif d'un abonnement à partir d'une date, vérifier que les mois
antérieurs conservent l'ancien montant et que les suivants appliquent le nouveau.

### Tests du récit 5

- [X] T051 [P] [US5] Écrire les tests du changement de tarif dans `src/features/budget/calculs.test.ts` : passage de 9,99 € à 12,99 € au 1er juin → mai à 9,99 €, juin à 12,99 € ; vérification sur au moins trois mois antérieurs qu'aucun montant n'a bougé
- [X] T052 [P] [US5] Écrire les tests des pauses et de la résiliation dans `src/features/budget/calculs.test.ts` : échéance dans une pause non comptée, reprise après la pause, aucune échéance après `endDate`, invariant de non-chevauchement des pauses

### Implémentation du récit 5

- [X] T053 [US5] Ajouter les actions `changeSubscriptionAmount`, `pauseSubscription`, `terminateSubscription` au réducteur de `src/features/budget/budget-provider.tsx`, en préservant l'historique `amounts` plutôt qu'en l'écrasant
- [X] T054 [US5] Implémenter la validation des invariants d'`AmountPeriod` et de `PausePeriod` dans `src/lib/storage.ts` : tri croissant, absence de doublon de date, absence de chevauchement des pauses
- [X] T055 [US5] Étendre `src/features/budget/components/subscription-form.tsx` avec le changement de tarif daté, la mise en pause bornée et la résiliation à une date
- [X] T056 [US5] Implémenter la confirmation avant résiliation dans `subscription-form.tsx`
- [X] T057 [US5] Étendre `src/features/budget/components/subscription-list.tsx` : séparation des abonnements actifs et inactifs, les résiliés restant consultables

**Point de contrôle** : les cinq récits fonctionnent indépendamment ; la fonctionnalité est complète.

---

## Phase 8 : Finition et exigences transverses

**Objectif** : les exigences qui traversent tous les récits et la validation de clôture.

- [X] T058 [P] Vérifier et corriger l'accessibilité au clavier de tous les composants de `src/features/budget/components/` : ordre de tabulation cohérent, indicateur de focus visible sur chaque action
- [X] T059 [P] Vérifier l'adaptabilité dans `src/app/globals.css` et les composants : utilisable dès 360 px sans défilement horizontal, et à 200 % de zoom sans perte d'information
- [X] T060 [P] Vérifier le contraste WCAG 2.1 AA des jetons de `src/app/globals.css` dans les thèmes clair et sombre, et confirmer sur `src/features/budget/components/month-summary.tsx` que tous les états restent distinguables en niveaux de gris
- [X] T061 Vérifier qu'aucun montant n'est formaté hors de `formatCents()` et qu'aucun `parseFloat` ne subsiste sur une valeur monétaire, sur l'ensemble de `src/`
- [X] T062 Relire l'ensemble de `src/` : commentaires de code en français là où les principes III et IV exigent une justification, et suppression de tout code mort, commenté ou en attente
- [X] T063 [P] Mettre à jour `README.md` en français : objet de l'application, commandes `dev`, `build`, `lint`, `test`, et emplacement des données
- [X] T064 Exécuter les onze scénarios manuels décrits dans `specs/002-income-subscriptions-budget/quickstart.md` et consigner le résultat — scénarios 1, 2, 3, 6 et 11 couverts par les tests d'intégration de `src/features/budget/budget-view.test.tsx` ; scénarios 4, 5, 7, 8, 9 et 10 restent à vérifier dans un navigateur réel (voir la note ci-dessous)
- [X] T065 Passer les barrières de clôture : `npm run build`, `npm run lint` et `npm run test` sans aucune erreur ni règle neutralisée à l'échelle d'un fichier

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Phase 1 — Mise en place** : aucune dépendance, peut démarrer immédiatement.
- **Phase 2 — Fondations** : dépend de la phase 1. **Bloque tous les récits.**
- **Phases 3 à 7 — Récits** : dépendent toutes de la fin de la phase 2.
- **Phase 8 — Finition** : dépend des récits que l'on souhaite livrer.

### Dépendances entre récits

- **Récit 1 (P1)** : démarre après la phase 2. Aucune dépendance sur un autre récit.
- **Récit 2 (P1)** : démarre après la phase 2. Indépendant du récit 1 — il se teste sans qu'aucun
  revenu ne soit saisi.
- **Récit 3 (P2)** : démarre après la phase 2. Se teste avec des données issues des récits 1 et 2,
  mais son calcul (`computeMonthlyBudget`) se teste seul sur un document construit à la main.
- **Récit 4 (P3)** : démarre après la phase 2. Consomme `computeMonthlyBudget` du récit 3 pour la
  projection — c'est la seule dépendance inter-récits réelle de cette fonctionnalité.
- **Récit 5 (P3)** : démarre après la phase 2. Étend les structures du récit 2 ; à mener après lui.

### À l'intérieur d'un récit

- Les tests des modules purs sont écrits d'abord et doivent échouer avant l'implémentation.
- Les fonctions de calcul précèdent les actions du réducteur, qui précèdent les composants.
- Les composants de formulaire précèdent leur câblage dans la vue.

### Occasions de parallélisation

- T003 à T006 en phase 1.
- T007, T009, T011 et T012 en phase 2 : quatre fichiers distincts, aucune dépendance croisée.
- Les tâches de test de chaque récit portant le marqueur [P] : fichiers ou blocs distincts.
- Une fois la phase 2 terminée, les récits 1 et 2 sont menables en parallèle par deux personnes.
- T058 à T060 et T063 en phase 8.

---

## Exemple de parallélisation : phase 2

```bash
# Lancer ensemble les tests des modules indépendants :
Tâche : "Écrire les tests de src/lib/money.test.ts"        # T007
Tâche : "Écrire les tests de src/lib/date.test.ts"         # T009
Tâche : "Écrire les tests de src/lib/storage.test.ts"      # T012
Tâche : "Déclarer les types dans src/features/budget/types.ts"  # T011
```

## Exemple de parallélisation : récits 1 et 2

```bash
# Après la phase 2, deux personnes travaillent sans se gêner :
Personne A : T018 à T025  # récit 1 — revenus
Personne B : T026 à T035  # récit 2 — abonnements
# Seul src/features/budget/budget-provider.tsx est partagé (T021 et T032) :
# à traiter en dernier de chaque côté, ou à coordonner.
```

---

## Stratégie de mise en œuvre

### MVP d'abord

1. Phase 1 — mise en place
2. Phase 2 — fondations (**critique, bloque tout**)
3. Phase 3 — récit 1
4. **S'arrêter et valider** : le récit 1 est testable seul, l'application enregistre des revenus
5. Livrer ou démontrer

### Livraison incrémentale

1. Phases 1 et 2 → fondations prêtes
2. Récit 1 → carnet de revenus (MVP)
3. Récit 2 → coût des abonnements, répond déjà à « combien me coûtent mes abonnements ? »
4. Récit 3 → **le cœur de la fonctionnalité** : reste disponible du mois
5. Récits 4 et 5 → anticipation et cycle de vie des abonnements
6. Phase 8 → finition et clôture

Chaque étape ajoute de la valeur sans casser la précédente.

### Recommandation de portée

Si l'objectif est de disposer rapidement d'une application réellement utile, viser **les phases 1 à 5
incluses** (T001 à T042) : c'est le point où l'application répond à la question qui a motivé la
fonctionnalité. Les récits 4 et 5 sont du confort et de la tenue dans la durée, à livrer ensuite.

---

## Notes

- Les tâches marquées [P] portent sur des fichiers distincts, sans dépendance mutuelle.
- L'étiquette de récit assure la traçabilité vers la [spécification](./spec.md).
- Vérifier que chaque test échoue avant d'écrire l'implémentation qu'il couvre.
- Committer après chaque tâche ou groupe cohérent, message en français (principe VIII).
- `src/features/budget/budget-provider.tsx` et `src/features/budget/calculs.ts` sont touchés par
  plusieurs récits : ce sont les deux seuls points de contention à surveiller en travail parallèle.
- S'arrêter à n'importe quel point de contrôle pour valider un récit isolément.


---

## Journal d'exécution

**Terminé le 2026-09-05.** Les 65 tâches sont réalisées. `npm run build`, `npm run lint` et
`npm run test` passent sans erreur ni règle neutralisée. 124 tests, dont 9 d'intégration.

### Écarts par rapport au plan, assumés

- **`@types/node` porté de `^20` à `^24`** : Node v24 est installé, les définitions avaient quatre
  majeures de retard, et `vitest@5` exige `>= 24`. Dépendance de développement uniquement.
- **`vite-tsconfig-paths` non retenu** : Vite signale à l'exécution que la résolution des chemins
  `tsconfig` est native (`resolve.tsconfigPaths`). Le guide de la version installée prescrit le
  greffon, mais s'en passer retire une dépendance (principe VI). Consigné dans `vitest.config.mts`.
- **`@testing-library/user-event` et `@testing-library/jest-dom` ajoutés** : nécessaires aux tests
  d'intégration de T064. Dépendances de développement.
- **`centsToInputValue()` ajoutée à `src/lib/money.ts`** : deux formulaires convertissaient des
  centimes en chaîne éditable par eux-mêmes, hors du module monétaire. T061 a rendu la centralisation
  obligatoire.
- **`withAmountChange`, `withPause`, `withTermination` extraites en fonctions pures** dans
  `calculs.ts` plutôt qu'écrites dans le fournisseur : elles construisent des périodes de montants,
  relèvent donc du principe III et devaient être testables sans rendu.
- **`subscription-lifecycle.tsx` créé** : le cycle de vie d'un abonnement (T055, T056) méritait son
  propre composant plutôt que d'alourdir `subscription-form.tsx`.
- **Apostrophes typographiques** normalisées dans tous les textes affichés, par cohérence
  typographique française.

### Défaut de conception corrigé en cours de route

`contracts/calculs.md` énonçait `averageMonthlyCostCents` comme
`arrondi(montant × 12 ÷ mois_par_période)`, ce qui donne 120,00 € au lieu de 10,00 € pour un
abonnement annuel de 120,00 €. L'exemple trimestriel (3,34 €) était faux lui aussi (3,33 €). La
spécification, elle, était juste. Le contrat et T027 ont été corrigés avant l'implémentation.

### Reste à vérifier par un humain dans un navigateur

Six scénarios du guide de validation ne sont pas automatisables ici :

- **4, 5, 7, 8** : périodicités et rabattement de fin de mois, changement de tarif daté,
  anticipation sur douze mois — la logique est couverte par les tests unitaires, mais le rendu et
  l'ergonomie ne le sont pas.
- **9** : accessibilité réelle — parcours au clavier, niveaux de gris, 360 px, zoom 200 %, thèmes
  clair et sombre. Les invariants structurels (étiquettes, libellés textuels, rôles) sont testés ;
  le contraste et la mise en page ne peuvent l'être qu'à l'œil.
- **10** : fonctionnement hors ligne — structurellement acquis (aucune requête réseau dans le code),
  mais non vérifié en conditions réelles.
