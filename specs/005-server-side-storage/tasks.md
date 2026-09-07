---

description: "Liste de tâches — Stockage centralisé et synchronisation entre appareils"
---

# Tâches : Stockage centralisé et synchronisation entre appareils

**Entrée** : documents de conception de `specs/005-server-side-storage/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests** : **exigés**, et non optionnels. Le principe III de la constitution impose des tests
automatisés pour « tout code qui calcule, agrège, convertit, répartit ou persiste un montant, ainsi
que tout code qui analyse des données financières ». Le magasin serveur, le protocole de
synchronisation et l'analyseur partagé tombent tous les trois sous cette obligation.

**Organisation** : par récit utilisateur, pour que chacun soit implémentable et testable
indépendamment.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichier distinct, aucune dépendance sur une tâche inachevée)
- **[Story]** : récit auquel la tâche se rattache (US1 à US5)
- Chaque description porte un chemin de fichier exact

## Conventions de chemins

Projet unique, application Next.js existante : tout le code vit sous `src/`, les tests à côté du
code qu'ils couvrent (`*.test.ts`, `*.test.tsx`), conformément à l'usage déjà en place dans le dépôt.

> **Environnement de test** : `vitest.config.mts` fixe `jsdom` globalement. Les tests touchant
> `node:fs` (magasin serveur) doivent porter le bloc `// @vitest-environment node` en tête de
> fichier. Aucune modification de la configuration n'est nécessaire.

---

## Phase 1 : Préparation

**Objet** : empêcher une fuite de données avant que la moindre ligne ne s'exécute, et figer une
référence de non-régression.

- [ ] T001 Ajouter `data/` à `.gitignore` — vérifié à la planification : `.env*` y figure, `data/`
      **non**, et le répertoire contiendra les données financières réelles. **À faire avant toute
      autre tâche** : c'est la seule dont l'oubli est irréversible une fois poussé.
- [ ] T002 [P] Documenter `BUDGET_ACCESS_TOKEN` et `BUDGET_DATA_DIR` dans `README.md`, en signalant
      que `.gitignore` couvre `.env*` en entier — un fichier `.env.example` serait donc ignoré lui
      aussi et ne peut pas servir de documentation.
- [ ] T003 [P] Enregistrer la référence de non-régression exigée par CS-004 : exécuter
      `npm run build`, `npm run lint` et `npm test`, et consigner le nombre de tests au vert dans
      `specs/005-server-side-storage/quickstart.md` (section 3).

**Point de contrôle** : le dépôt ne peut plus versionner de données financières.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objet** : le substrat que tous les récits partagent — analyseur commun, magasin serveur,
autorisation, point d'entrée HTTP.

**⚠️ CRITIQUE** : aucun travail de récit ne peut commencer avant la fin de cette phase.

> **Pourquoi l'autorisation est ici et non dans le récit 4.** Le point d'entrée est **fermé par
> défaut** (D7) : sans jeton valide, il répond `401`. Aucun autre récit ne peut donc être exercé tant
> que le mécanisme n'existe pas. Il est écrit ici **complet et durci dès la première version** —
> comparaison à temps constant, non-divulgation, fermeture par défaut — plutôt que naïvement puis
> corrigé. Le récit 4 (phase 6) en délivre la **garantie vérifiée** : les tests adverses qui prouvent
> CS-007.

### Analyseur partagé

- [ ] T004 Extraire l'analyseur pur de `src/lib/storage.ts` vers `src/lib/budget-document.ts` —
      `parseDocument`, `migrer`, `ParseResult`, `ParseFailure` et les constantes de validation ;
      `src/lib/storage.ts` conserve les seuls accès `localStorage` et réexporte ce qu'il exposait,
      afin qu'aucun appelant existant ne change (R5).
- [ ] T005 Confirmer la non-régression de l'extraction : `src/lib/storage.test.ts` et
      `src/lib/storage.security.test.ts` passent sans modification autre que le chemin d'import.

### Métadonnées de synchronisation, côté client

- [ ] T006 [P] Créer `src/lib/sync-metadata.ts` — type `SyncMetadata`, lecture et écriture sous la
      clé `budget-app:sync:v1`, **distincte** de celle du budget (D5), avec replis prudents
      `baseRevision = 0` et `pendingChanges = true`.
- [ ] T007 [P] Créer `src/lib/sync-metadata.test.ts` — cas nominal, contenu absent, contenu
      corrompu, et vérification que les replis choisis vont bien dans le sens prudent.

### Magasin serveur

- [ ] T008 Créer `src/lib/server/budget-store.ts` — enveloppe `StoredBudget`, lecture, écriture
      atomique (fichier `.tmp` puis `rename`), verrou en mémoire sérialisant les écritures, chemin
      dérivé de `BUDGET_DATA_DIR` (défaut `./data`) ; un fichier absent vaut révision `0`.
- [ ] T009 Créer `src/lib/server/budget-store.test.ts` sur répertoire temporaire réel, en
      `// @vitest-environment node` — cas nominal, fichier absent, montants aux bornes (zéro,
      négatif refusé, montant maximal), contenu malformé, écritures concurrentes sérialisées.

### Autorisation

- [ ] T010 [P] Créer `src/lib/server/authorization.ts` — `isAuthorized()` lisant le cookie
      `budget_access` via `await cookies()`, comparaison `crypto.timingSafeEqual` précédée du
      contrôle d'égalité des longueurs, **fermeture par défaut** si `BUDGET_ACCESS_TOKEN` est absent,
      vide ou plus court que 32 caractères, et aucune journalisation du jeton.
- [ ] T011 [P] Créer `src/lib/server/authorization.test.ts` — jeton correct, jeton erroné, cookie
      absent, variable non configurée, jeton trop court.

### Point d'entrée HTTP

- [ ] T012 Créer `src/app/api/budget/route.ts` avec `GET` — contrôle d'autorisation en premier,
      `200` avec `{ revision, updatedAt, document }`, et `200` à la révision `0` avec un document
      vide lorsqu'aucun fichier n'existe. **Aucun `export const runtime` ni `dynamic`** (R1, R2).
- [ ] T013 Ajouter `PUT` à `src/app/api/budget/route.ts` — validation de l'enveloppe reçue puis du
      document par l'analyseur partagé, verrou optimiste sur `baseRevision`, `409` portant l'état
      courant en cas de divergence, `400` sur document refusé, `500` sur échec d'écriture.
- [ ] T014 Créer `src/app/authorize/page.tsx` — formulaire d'échange du jeton contre le cookie
      `httpOnly` / `sameSite=strict`, étiquette associée au champ, redirection vers `/` en cas de
      succès (voir [contracts/authorization.md](./contracts/authorization.md)).
- [ ] T015 [P] Ajouter les libellés des états de synchronisation à `src/features/budget/messages.ts`
      — un message par valeur de `SyncState`, en français et en toutes lettres (principe VII).
- [ ] T016 Créer `src/app/api/budget/route.test.ts` — tests de contrat des deux méthodes : codes de
      retour, forme des corps, et vérification qu'un `PUT` refusé n'a rien écrit.

**Point de contrôle** : le serveur stocke, valide et refuse. Les récits peuvent commencer.

---

## Phase 3 : Récit 1 — Retrouver mon budget sur un autre appareil (Priorité : P1) 🎯 MVP

**Objectif** : une écriture saisie sur un appareil se retrouve sur un autre, identique au centime.

**Test indépendant** : saisir une écriture depuis un appareil, ouvrir l'application depuis un
second, et vérifier que l'écriture et tous les totaux dérivés correspondent au centime (V1 du
[quickstart](./quickstart.md)).

### Tests du récit 1

- [ ] T017 [P] [US1] Créer `src/features/budget/sync.test.ts` — correspondance des codes HTTP vers
      `FetchOutcome` / `PushOutcome`, y compris le cas `invalidResponse` (un `200` dont le corps ne
      passe pas l'analyseur), et vérification qu'aucune des deux fonctions ne touche `localStorage`.
- [ ] T018 [P] [US1] Créer `src/features/budget/sync.integration.test.tsx` — deux clients partageant
      un serveur simulé : une dépense saisie sur l'un apparaît sur l'autre après relecture, avec les
      totaux du mois recalculés.

### Implémentation du récit 1

- [ ] T019 [P] [US1] Créer `src/features/budget/sync.ts` — `fetchRemote()` et `pushLocal()`, pures
      vis-à-vis du stockage, validant toute réponse par l'analyseur partagé avant de la rendre
      (principe IV).
- [ ] T020 [US1] Ajouter l'état de synchronisation à `src/features/budget/budget-provider.tsx` —
      `SyncState`, exposition dans le contexte, et lecture initiale au montage.
- [ ] T021 [US1] Déclencher la poussée après mutation dans
      `src/features/budget/budget-provider.tsx`, **après** l'écriture locale et la notification de
      l'interface, avec coalescence des poussées en vol (R6) — aucune mutation ne doit attendre le
      réseau.
- [ ] T022 [US1] Implémenter la réconciliation à la lecture dans
      `src/features/budget/budget-provider.tsx` — les trois cas de
      [contracts/synchronisation.md](./contracts/synchronisation.md), dont le passage en état
      `conflict` **sans jamais écraser** lorsque le serveur a bougé.
- [ ] T023 [P] [US1] Créer `src/features/budget/components/sync-status.tsx` — état de
      synchronisation en texte, jamais par la couleur ou une icône seule (principe VII, EF-018).
- [ ] T024 [US1] Poser `<SyncStatus />` dans `src/features/budget/components/budget-view.tsx`, à un
      emplacement visible sans défilement à partir d'une fenêtre de 360 px.

**Point de contrôle** : le budget est partagé entre appareils. **C'est le MVP livrable.**

---

## Phase 4 : Récit 2 — Reprendre mes données existantes sans en perdre une (Priorité : P1)

**Objectif** : transférer le budget détenu par le navigateur vers le stockage central, sans ressaisie
et sans perte d'un centime.

**Test indépendant** : exporter depuis le navigateur détenteur du budget, importer dans
l'application reliée au serveur, et comparer le compte de chaque collection et la somme de tous les
montants avant et après (V2 du [quickstart](./quickstart.md)).

### Tests du récit 2

- [ ] T025 [P] [US2] Ajouter à `src/features/budget/data-transfer.test.tsx` un cas prouvant qu'un
      import confirmé atteint le stockage central, avec compte par collection et somme des montants
      identiques avant et après (CS-002).
- [ ] T026 [P] [US2] Ajouter à `src/features/budget/data-transfer.test.tsx` un cas prouvant que
      l'export reflète le contenu central et non un état local périmé (EF-013).
- [ ] T027 [P] [US2] Ajouter à `src/features/budget/data-transfer.test.tsx` la préservation intégrale
      des champs les plus exposés — historique de tarifs et périodes de pause d'un abonnement —
      après un aller-retour complet par le serveur (EF-003).

### Implémentation du récit 2

- [ ] T028 [US2] Vérifier dans `src/features/budget/budget-provider.tsx` que `confirmImport()` et
      `undoImport()` empruntent le chemin de poussée du récit 1 sans code propre, et que la
      confirmation préalable au remplacement ainsi que l'annulation en session sont intactes
      (EF-014).
- [ ] T029 [US2] Traiter le premier lancement dans
      `src/features/budget/components/budget-view.tsx` — une révision `0` avec document vide est un
      **budget neuf**, pas une erreur : inviter à la saisie ou à l'import, sans message d'échec.

**Point de contrôle** : le budget existant vit sur le serveur, vérifié au centime.

---

## Phase 5 : Récit 3 — Continuer à saisir quand le stockage central est injoignable (Priorité : P2)

**Objectif** : consulter et saisir sans réseau, puis rejoindre le serveur sans doublon et sans perte
silencieuse.

**Test indépendant** : couper l'accès au serveur, saisir une dépense, vérifier qu'elle s'affiche et
se conserve, puis rétablir l'accès et vérifier qu'elle rejoint le stockage central (V3 et V6 du
[quickstart](./quickstart.md)).

### Tests du récit 3

- [ ] T030 [P] [US3] Ajouter à `src/features/budget/sync.integration.test.tsx` le cas hors
      connexion : la dépense est enregistrée, affichée et signalée non synchronisée ; la saisie
      n'attend à aucun moment le réseau (EF-017, EF-011).
- [ ] T031 [P] [US3] Ajouter à `src/features/budget/sync.integration.test.tsx` le cas de reprise :
      au retour du réseau, les saisies rejoignent le serveur sans action de l'utilisateur, et deux
      synchronisations successives ne créent **aucun doublon** (EF-019).
- [ ] T032 [P] [US3] Ajouter à `src/features/budget/sync.integration.test.tsx` le cas de conflit :
      rien n'est écrasé, les deux choix sont proposés, et chacun produit l'état attendu (EF-024,
      EF-025).
- [ ] T033 [P] [US3] Ajouter à `src/features/budget/sync.integration.test.tsx` la garantie centrale
      de EF-025 : **aucun échec de poussée, quelle qu'en soit la cause, ne remet `pendingChanges` à
      `false`**.

### Implémentation du récit 3

- [ ] T034 [US3] Ajouter les déclencheurs `online` et `visibilitychange` dans
      `src/features/budget/budget-provider.tsx` (R6) — le second traite l'onglet resté ouvert
      plusieurs jours.
- [ ] T035 [US3] Gérer le cycle de vie de `pendingChanges` dans
      `src/features/budget/budget-provider.tsx` selon le tableau de
      [contracts/synchronisation.md](./contracts/synchronisation.md), en écrivant **le budget avant
      les métadonnées**.
- [ ] T036 [P] [US3] Créer `src/features/budget/components/conflict-dialog.tsx` — deux actions
      énonçant chacune ce qu'elle fait perdre, plus l'accès à l'export avant de trancher ;
      utilisable au clavier, focus visible (principe VII).
- [ ] T037 [US3] Câbler les deux résolutions de conflit dans
      `src/features/budget/budget-provider.tsx` et poser `<ConflictDialog />` dans
      `src/features/budget/components/budget-view.tsx`.
- [ ] T038 [US3] Étendre `BudgetNotice` et
      `src/features/budget/components/storage-notice.tsx` aux motifs de synchronisation, plutôt que
      d'ouvrir un second mécanisme d'alerte — tout échec d'enregistrement doit être visible (EF-012).

**Point de contrôle** : l'application est utilisable sans réseau et ne perd jamais une saisie en
silence. Le principe I est tenu.

---

## Phase 6 : Récit 4 — Empêcher un tiers d'accéder à mon budget (Priorité : P2)

**Objectif** : prouver que le mécanisme posé en phase 2 tient réellement.

**Test indépendant** : depuis un appareil non autorisé du même réseau, tenter de lire et de modifier
le budget, et vérifier que les deux échouent (V4 du [quickstart](./quickstart.md)).

> Cette phase ne construit presque rien : elle **vérifie**. C'est délibéré — le mécanisme est
> bloquant pour tous les autres récits et vit donc en phase 2. Ce qui reste à livrer ici est la
> garantie elle-même, seule chose qui distingue « du code d'autorisation existe » de « CS-007 est
> vrai ».

### Tests du récit 4

- [ ] T039 [P] [US4] Créer `src/lib/server/authorization.security.test.ts`, sur le modèle de
      `src/lib/storage.security.test.ts` — `GET` et `PUT` sans cookie, avec cookie erroné, avec
      cookie tronqué : tous refusés, et le `PUT` n'a rien modifié.
- [ ] T040 [P] [US4] Ajouter à `src/lib/server/authorization.security.test.ts` la fermeture par
      défaut : `BUDGET_ACCESS_TOKEN` absent, vide ou trop court ⇒ `401`, jamais un accès ouvert
      (D7).
- [ ] T041 [P] [US4] Ajouter à `src/lib/server/authorization.security.test.ts` la non-divulgation :
      le corps d'un `401` vaut exactement `{ "error": "unauthorized" }` — ni montant, ni révision,
      ni horodatage, ni indice de l'existence d'un budget (EF-021) — et « cookie absent » et
      « cookie erroné » sont indiscernables.

### Implémentation du récit 4

- [ ] T042 [US4] Reprendre l'accessibilité de `src/app/authorize/page.tsx` — message d'erreur
      textuel ne révélant ni longueur ni forme attendue, contraste AA dans les deux thèmes,
      utilisable à partir de 360 px.
- [ ] T043 [US4] Documenter l'isolation réseau dans `README.md` en renvoyant à la section 1 de
      [quickstart.md](./quickstart.md) — le jeton ne dispense pas de cette seconde couche.

**Point de contrôle** : CS-007 est prouvé par des tests, pas promis par une configuration.

---

## Phase 7 : Récit 5 — Ne pas perdre mes données si le serveur s'arrête (Priorité : P3)

**Objectif** : redémarrer, mettre à jour ou déplacer la machine sans perdre le budget.

**Test indépendant** : arrêter puis relancer le stockage central, et vérifier que le budget est
intact et complet (V5 du [quickstart](./quickstart.md)).

### Tests du récit 5

- [ ] T044 [P] [US5] Ajouter à `src/lib/server/budget-store.test.ts` l'intégrité après arrêt et
      relance : document identique au centime, révision conservée (CS-006).
- [ ] T045 [P] [US5] Ajouter à `src/lib/server/budget-store.test.ts` la quarantaine : un fichier
      illisible est renommé `budget.corrupted-<horodatage>.json` et **jamais écrasé** (EF-008).
- [ ] T046 [P] [US5] Ajouter à `src/lib/server/budget-store.test.ts` l'atomicité : une écriture
      interrompue laisse l'état antérieur intact, jamais un fichier tronqué.
- [ ] T047 [P] [US5] Ajouter à `src/lib/server/budget-store.test.ts` la migration à la lecture d'un
      fichier en version antérieure, et le **refus sans écrasement** d'un fichier en version
      postérieure (EF-006, EF-007, EF-016).

### Implémentation du récit 5

- [ ] T048 [US5] Implémenter la quarantaine et la migration à la lecture dans
      `src/lib/server/budget-store.ts`, en transposant exactement le comportement éprouvé de
      `mettreEnQuarantaine()` de `src/lib/storage.ts` (D9).
- [ ] T049 [US5] Signaler le motif `storageUnreadable` jusqu'à l'interface via
      `src/features/budget/components/storage-notice.tsx` — l'utilisateur doit savoir que son
      contenu central a été mis de côté.
- [ ] T050 [US5] Documenter la sauvegarde dans `README.md` — copie de `data/budget.json` et export
      manuel, en précisant que l'export reste le filet de référence.

**Point de contrôle** : les cinq récits sont fonctionnels.

---

## Phase 8 : Finition et sujets transverses

- [ ] T051 Rejouer les scénarios de validation des fonctionnalités 001 à 004 —
      `specs/001-monthly-budget-envelopes/quickstart.md`,
      `specs/002-income-subscriptions-budget/quickstart.md`,
      `specs/003-daily-allowance-dashboard/quickstart.md` et
      `specs/004-data-export-import/quickstart.md` — et vérifier qu'aucun comportement existant ne
      régresse (CS-004), en comparant à la référence prise en T003.
- [ ] T052 [P] Vérifier CS-005 dans `src/features/budget/dashboard.test.tsx` avec un budget de
      5 000 dépenses — chargement et affichage sans figement, saisie d'une dépense en moins de dix
      secondes (CS-003).
- [ ] T053 [P] Vérifier l'accessibilité de `src/features/budget/components/sync-status.tsx`,
      `src/features/budget/components/conflict-dialog.tsx` et `src/app/authorize/page.tsx` —
      clavier seul, focus visible, contraste AA dans les deux thèmes, 360 px sans défilement
      horizontal, lisibilité à 200 % de zoom (principe VII).
- [ ] T054 [P] Auditer qu'aucun module de `src/lib/server/` n'est importé depuis un fichier du
      graphe client — à partir de `src/features/budget/budget-provider.tsx`, seul porteur de
      `"use client"` — et qu'aucun jeton n'apparaît dans un journal ; ce sont les deux fuites que la
      structure de répertoires vise à rendre visibles.
- [ ] T055 Exécuter `npm run build` et `npm run lint` (scripts de `package.json`) : aucune erreur,
      aucune règle désactivée à l'échelle d'un fichier (principe IV, points de contrôle 1 et 2).
- [ ] T056 Dérouler intégralement V1 à V7 de
      `specs/005-server-side-storage/quickstart.md` sur deux appareils réels (point de contrôle 4 :
      comportement vérifié dans l'application en fonctionnement).
- [ ] T057 Vérifier le principe VIII sur tout ce qui a été produit sous
      `specs/005-server-side-storage/` et `src/` — artefacts et commentaires en français,
      identifiants et chemins en anglais — et qu'aucun code mort ou commenté ne subsiste
      (points de contrôle 5 et 6).

---

## Dépendances et ordre d'exécution

### Dépendances de phase

- **Phase 1 (Préparation)** : aucune dépendance. **T001 passe avant tout le reste.**
- **Phase 2 (Fondations)** : dépend de la phase 1. **Bloque tous les récits.**
- **Phases 3 à 7 (Récits)** : dépendent toutes de la phase 2.
- **Phase 8 (Finition)** : dépend des récits que l'on souhaite livrer.

### Dépendances entre récits

- **US1 (P1)** — ne dépend d'aucun autre récit. C'est le MVP.
- **US2 (P1)** — s'appuie sur le chemin de poussée d'US1 (T021). À enchaîner après US1.
- **US3 (P2)** — indépendant d'US2. Enrichit le fournisseur touché par US1, donc à séquencer après
  US1 pour éviter les conflits d'édition sur `budget-provider.tsx`.
- **US4 (P2)** — **entièrement indépendant** des autres récits : il vérifie du code livré en
  phase 2. Peut être mené en parallèle d'US2 ou d'US3, par une autre personne, sans coordination.
- **US5 (P3)** — **entièrement indépendant** lui aussi : il ne touche que
  `src/lib/server/budget-store.ts` et sa remontée d'alerte.

### À l'intérieur d'un récit

- Les tests sont écrits **avant** l'implémentation et doivent échouer d'abord.
- Analyseur avant magasin, magasin avant route, route avant client.
- Toute tâche touchant `src/features/budget/budget-provider.tsx` est **sérielle** : T020, T021, T022,
  T034, T035 et T037 modifient le même fichier et ne portent donc jamais `[P]`.

### Occasions de parallélisme

- **Phase 1** : T002 et T003, après T001.
- **Phase 2** : trois groupes indépendants — {T006, T007}, {T010, T011} et {T015} — avancent en
  parallèle. T008/T009 dépendent de T004.
- **Phase 3** : T017, T018 et T019 en parallèle ; T023 en parallèle du travail sur le fournisseur.
- **Phase 4** : T025, T026 et T027 en parallèle, fichier de test commun mais cas disjoints.
- **Phase 5** : T030 à T033 en parallèle ; T036 en parallèle du fournisseur.
- **Phase 6** : T039, T040 et T041 en parallèle.
- **Phase 7** : T044 à T047 en parallèle.
- **Phase 8** : T052, T053 et T054 en parallèle.
- **Entre récits** : US4 et US5 sont menables en parallèle d'US2 et d'US3, aucun fichier partagé.

---

## Exemple de parallélisme : phase 2

```bash
# Trois groupes sans fichier commun, lançables ensemble une fois T004 terminée :
Tâche : "Créer src/lib/sync-metadata.ts"              # T006
Tâche : "Créer src/lib/server/authorization.ts"       # T010
Tâche : "Ajouter les libellés à src/features/budget/messages.ts"  # T015
```

## Exemple de parallélisme : récit 1

```bash
# Les deux fichiers de test et le module client ne se recouvrent pas :
Tâche : "Créer src/features/budget/sync.test.ts"                  # T017
Tâche : "Créer src/features/budget/sync.integration.test.tsx"     # T018
Tâche : "Créer src/features/budget/sync.ts"                       # T019
```

---

## Stratégie de mise en œuvre

### D'abord le MVP (récit 1 seul)

1. Phase 1 — préparation (T001 en premier, sans exception).
2. Phase 2 — fondations. **Bloquante.**
3. Phase 3 — récit 1.
4. **S'ARRÊTER ET VALIDER** : dérouler V1 du quickstart sur deux appareils.
5. À ce stade, la raison d'être de la fonctionnalité est livrée : le budget est synchronisé.

### Livraison incrémentale

| Incrément | Ce qu'il apporte |
| --- | --- |
| Phases 1 + 2 | Le serveur stocke, valide et refuse. Rien de visible. |
| **+ US1** | **Le budget suit l'utilisateur d'un appareil à l'autre. MVP.** |
| + US2 | Le budget existant est repris, vérifié au centime. |
| + US3 | L'application redevient utilisable hors connexion — le principe I est tenu. |
| + US4 | CS-007 est prouvé, et non plus supposé. |
| + US5 | Le point de défaillance unique créé par la centralisation est couvert. |

### Un ordre de livraison qu'il ne faut pas suivre

Livrer US1 en production **sans US3** laisse l'application en violation du principe I : elle
exigerait le réseau pour saisir une dépense. US1 seul est un **jalon de validation**, pas un état
dans lequel installer l'application pour un usage réel. La spécification classe d'ailleurs US3 en P2
non par confort mais parce que « le principe I de la constitution l'impose en toutes lettres ».

De même, exposer le service au-delà de la machine locale avant US4 revient à publier son historique
financier : le récit 4 « gate toute exposition au-delà de la machine locale », selon les termes de la
spécification.

### Travail à plusieurs

Une fois la phase 2 terminée, trois pistes avancent sans se gêner :

- Personne A : US1 puis US2 puis US3 — toutes touchent `budget-provider.tsx`, donc une seule main.
- Personne B : US4 — uniquement des tests et `authorize/page.tsx`.
- Personne C : US5 — uniquement `budget-store.ts` et sa remontée d'alerte.

---

## Notes

- `[P]` = fichier distinct, aucune dépendance sur une tâche inachevée.
- `[Story]` rattache la tâche à un récit, pour la traçabilité.
- Les tests doivent échouer avant d'être satisfaits.
- Commiter par modification logique unique, message en français (principe VIII).
- Chaque point de contrôle est une occasion de valider un récit isolément.
- `budget-provider.tsx` est le point de contention du plan : six tâches le modifient. Les mener dans
  l'ordre indiqué évite des conflits que le parallélisme ne ferait pas gagner.
