---
description: "Liste de tâches — Export et import des données budgétaires"
---

# Tâches : Export et import des données budgétaires

**Entrée** : documents de conception de `specs/004-data-export-import/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests** : **obligatoires**, par application du principe III de la constitution. `transfer.ts`
analyse et persiste des montants : il tombe sous l'obligation de test avec cas nominal, bornes et
entrée malformée. Les composants de présentation sans calcul en sont dispensés.

**Ordre tests / implémentation** : pour `transfer.ts`, les tests sont écrits en premier et doivent
échouer avant l'implémentation. C'est peu coûteux sur un module pur, et ici particulièrement
justifié : la garantie d'aller-retour est plus facile à énoncer comme test qu'à vérifier après coup.

**État du code au démarrage** : la fonctionnalité 002 est livrée. `parseDocument()`,
`saveDocument()`, `DOCUMENT_VERSION` et `BudgetProvider` existent et sont testés. Cette
fonctionnalité **réutilise** ces éléments et n'en réimplémente aucun (décision D2).

**Organisation** : tâches groupées par récit utilisateur, pour que chacun soit implémentable,
testable et livrable indépendamment.

## Format : `[ID] [P?] [Récit] Description`

- **[P]** : parallélisable (fichiers distincts, aucune dépendance sur une tâche non terminée)
- **[US1]…[US4]** : récit utilisateur de rattachement
- Chaque description porte le chemin exact du fichier concerné

## Conventions de chemins

Projet unique sans backend, organisé par fonctionnalité sous `src/`. Tests colocalisés
(`*.test.ts`), conformément à ce qui a été posé par 002.

---

## Phase 1 : Mise en place

**Objectif** : préparer l'accueil du module de transfert. Aucune dépendance à installer — c'est
l'un des résultats de la conception (décision D9).

- [ ] T001 Vérifier qu'aucune dépendance n'est requise : confirmer que `npm run test` passe sur la base existante avant toute modification, afin de partir d'un état sain
- [ ] T002 [P] Ajouter les messages de refus et de compte rendu d'import dans `src/features/budget/messages.ts` : les trois libellés distincts d'`ImportRefusal`, plus les messages d'échec d'export et d'écriture, conformément à [contracts/interface.md](./contracts/interface.md)

**Point de contrôle** : la base est saine, les messages sont disponibles pour les phases suivantes.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objectif** : le module de transfert pur et l'isolement de l'API de téléchargement. C'est là que se
joue l'essentiel de la correction de la fonctionnalité.

**⚠️ CRITIQUE** : aucun récit utilisateur ne peut démarrer avant la fin de cette phase.

- [ ] T003 [P] Écrire les tests de sérialisation dans `src/features/budget/transfer.test.ts` : `serializeExport` produit une enveloppe portant `application`, `formatVersion`, `exportedAt` en ISO 8601 UTC et `data` ; JSON indenté de deux espaces ; export d'un document vide produisant un fichier valide
- [ ] T004 [P] Écrire les tests de `buildExportFilename` dans `src/features/budget/transfer.test.ts` : format `budget-AAAA-MM-JJ-HHmm.json`, remplissage à deux chiffres des mois, jours, heures et minutes, heure locale
- [ ] T005 [P] Écrire les tests de refus de `parseImport` dans `src/features/budget/transfer.test.ts` : JSON illisible, fichier vide, `application` absent ou différent → `notAnExport` ; `formatVersion` supérieure et `data.version` supérieure → `futureVersion` ; marqueur correct avec montant négatif, montant non entier, date impossible, identifiant en double, périodicité inconnue → `corrupted`
- [ ] T006 [P] Écrire les tests d'acceptation de `parseImport` dans `src/features/budget/transfer.test.ts` : document valide accepté ; collections vides acceptées ; `exportedAt` absent ou illisible toléré avec `exportedAt` à `null` sans refus du fichier
- [ ] T007 [P] Écrire le test d'aller-retour dans `src/features/budget/transfer.test.ts` : export puis import puis export donnent des champs `data` **identiques** (CS-003) ; un fichier dont les clés sont dans un ordre différent produit le même export normalisé ; deux imports successifs du même fichier donnent le même résultat sans doublon
- [ ] T008 [P] Écrire les tests d'exactitude et de fidélité dans `src/features/budget/transfer.test.ts` : aller-retour sur au moins 200 éléments de tous types, 100 % restitués (CS-002) ; montants exacts au centime, montant maximal réaliste inclus (CS-004) ; libellés avec accents et emoji restitués à l'identique (CS-010)
- [ ] T009 Implémenter `src/features/budget/transfer.ts` : constantes `FORMAT_VERSION` et `APPLICATION_MARKER`, types `ImportRefusal` et `ImportResult`, puis `serializeExport()`, `buildExportFilename()` et `parseImport()` selon [contracts/transfert.md](./contracts/transfert.md). `parseImport` **doit** déléguer la validation du contenu à `parseDocument()` de `src/lib/storage.ts` et ne réimplémenter aucune règle du document (décision D2)
- [ ] T010 [P] Écrire les tests de `src/lib/download.test.ts` : l'URL d'objet est révoquée après usage ; un environnement ne permettant pas le téléchargement fait renvoyer `false` au lieu de lever
- [ ] T011 Implémenter `src/lib/download.ts` : `triggerDownload()` créant un `Blob`, obtenant une URL d'objet, déclenchant une ancre synthétique portant `download`, puis révoquant l'URL ; renvoie `false` en cas d'impossibilité plutôt que de lever

**Point de contrôle** : `npm run test` passe. Le format d'échange est implémenté et prouvé, y compris
sa garantie d'aller-retour, sans qu'aucune interface n'existe encore.

---

## Phase 3 : Récit 1 — Exporter toutes mes données (Priorité : P1) 🎯 MVP

**Objectif** : obtenir en une action un fichier contenant l'intégralité des données.

**Test indépendant** : saisir des données, déclencher l'export, ouvrir le fichier obtenu et vérifier
qu'il contient tous les éléments enregistrés et qu'il est lisible.

### Implémentation du récit 1

- [ ] T012 [US1] Ajouter l'action `exportData()` au fournisseur `src/features/budget/budget-provider.tsx` : sérialise le document courant via `serializeExport()`, déclenche `triggerDownload()`, renvoie `false` en cas d'échec sans rien écrire
- [ ] T013 [US1] Créer `src/features/budget/components/data-transfer.tsx` : section « Vos données » avec le bouton d'export et la phrase rappelant que les données ne quittent pas l'appareil
- [ ] T014 [US1] Implémenter dans `data-transfer.tsx` l'état d'échec d'export (EF-007) : message textuel expliquant que la sauvegarde n'a pas pu être produite, jamais d'échec silencieux
- [ ] T015 [US1] Câbler `<DataTransfer />` en pied de la vue dans `src/features/budget/components/budget-view.tsx`

**Point de contrôle** : le récit 1 est pleinement fonctionnel seul — l'application sait produire une
sauvegarde, ce qui a déjà une valeur autonome.

---

## Phase 4 : Récit 2 — Restaurer mes données depuis un fichier (Priorité : P1)

**Objectif** : recharger un fichier exporté et retrouver l'état exact d'avant l'export.

**Test indépendant** : exporter un jeu de données, vider l'application, importer le fichier, vérifier
que chaque élément est revenu à l'identique — montants au centime, dates, libellés et périodicités.

### Implémentation du récit 2

- [ ] T016 [US2] Ajouter l'action `prepareImport(raw)` au fournisseur `src/features/budget/budget-provider.tsx` : analyse le contenu par `parseImport()` **sans rien écrire**, et renvoie le résultat
- [ ] T017 [US2] Ajouter l'action `confirmImport(doc)` au fournisseur `src/features/budget/budget-provider.tsx` : écrit le document validé par `saveDocument()` et renvoie `false` en cas d'échec d'écriture, l'état antérieur restant en place (EF-021)
- [ ] T018 [US2] Ajouter l'état `ImportReport` de [data-model.md](./data-model.md) au fournisseur `src/features/budget/budget-provider.tsx`, renseigné après un import réussi avec le nombre d'éléments restaurés par type
- [ ] T019 [US2] Ajouter le sélecteur de fichier dans `src/features/budget/components/data-transfer.tsx` : `<input type="file" accept="application/json,.json">` doté d'une étiquette associée, lecture par `File.text()`
- [ ] T020 [US2] Implémenter l'état « lecture en cours » dans `data-transfer.tsx` (EF-029) : indication de traitement visible et annoncée aux technologies d'assistance
- [ ] T021 [US2] Créer `src/features/budget/components/import-report.tsx` : compte rendu du nombre d'éléments restaurés par type après un import réussi (EF-014)

**Point de contrôle** : les récits 1 et 2 forment ensemble la porte de sortie exigée par la
constitution — l'aller-retour complet fonctionne.

---

## Phase 5 : Récit 3 — Ne jamais perdre mes données à cause d'un import (Priorité : P2)

**Objectif** : savoir ce qu'on charge et ce qu'on perd, pouvoir renoncer, disposer d'un filet.

**Test indépendant** : tenter un import dans une application contenant déjà des données, vérifier
qu'un résumé est présenté, que l'annulation ne change rien, et qu'après confirmation les données
remplacées restent récupérables.

### Implémentation du récit 3

- [ ] T022 [US3] Ajouter l'état `RestorePoint` au fournisseur `src/features/budget/budget-provider.tsx` : capture du document antérieur **avant** l'écriture dans `confirmImport`, en mémoire uniquement (décision D5)
- [ ] T023 [US3] Ajouter l'action `undoImport()` et l'indicateur `canUndoImport` au fournisseur `src/features/budget/budget-provider.tsx` : réécrit le document du point de restauration par le chemin normal, renvoie `false` s'il n'y en a pas
- [ ] T024 [US3] Créer `src/features/budget/components/import-preview.tsx` : résumé présenté **avant tout remplacement** avec le nombre d'éléments par type dans le fichier **et** dans l'application, ainsi que la date d'export ou la mention qu'elle est inconnue (EF-016)
- [ ] T025 [US3] Implémenter dans `import-preview.tsx` l'avertissement de remplacement et la confirmation délibérée (EF-017) : case à cocher ou bouton distinct, jamais la simple sélection du fichier
- [ ] T026 [US3] Implémenter dans `import-preview.tsx` l'annulation qui ne modifie rien (EF-018), et l'avertissement particulier du fichier valide mais vide, indiquant que l'application se retrouvera sans données
- [ ] T027 [US3] Ajouter l'action de retour arrière dans `src/features/budget/components/import-report.tsx` : atteignable en une seule action tant que la session dure (EF-020, CS-006)
- [ ] T028 [US3] Vérifier dans `src/features/budget/components/data-transfer.tsx` qu'aucun chemin ne mène de la sélection d'un fichier à une écriture sans passage par l'aperçu et confirmation

**Point de contrôle** : un import ne peut plus détruire de données par inadvertance.

---

## Phase 6 : Récit 4 — Comprendre pourquoi un fichier est refusé (Priorité : P3)

**Objectif** : trois messages distincts, chacun menant à une action corrective différente.

**Test indépendant** : soumettre un fichier d'un autre type, un fichier tronqué, un fichier d'une
version postérieure, et vérifier que chaque refus porte un message distinct et exploitable.

### Implémentation du récit 4

- [ ] T029 [US4] Implémenter l'affichage des trois messages de refus dans `src/features/budget/components/data-transfer.tsx`, en reprenant les libellés de `src/features/budget/messages.ts` selon le motif `ImportRefusal` renvoyé
- [ ] T030 [US4] Rattacher programmatiquement les messages de refus à la zone d'import dans `data-transfer.tsx`, avec un rôle d'alerte, sans reposer sur la couleur (principe VII)
- [ ] T031 [US4] Vérifier dans `src/features/budget/components/data-transfer.tsx`, pour chacun des trois motifs, que l'état de l'application est strictement inchangé après un refus (EF-026, CS-005)

**Point de contrôle** : les quatre récits fonctionnent ; la fonctionnalité est complète.

---

## Phase 7 : Finition et exigences transverses

**Objectif** : les exigences qui traversent les récits et la clôture.

- [ ] T032 [P] Écrire les tests d'intégration de la section de transfert dans `src/features/budget/data-transfer.test.tsx` : aperçu présenté avant écriture, annulation sans effet, confirmation puis retour arrière, et vérification qu'un refus ne modifie pas le stockage
- [ ] T033 [P] Vérifier l'accessibilité au clavier de `src/features/budget/components/data-transfer.tsx`, `import-preview.tsx` et `import-report.tsx` : sélecteur, confirmation et retour arrière atteignables, focus visible, ordre de tabulation cohérent
- [ ] T034 [P] Vérifier l'adaptabilité de `src/features/budget/components/data-transfer.tsx` et `import-preview.tsx` : utilisables dès 360 px de large sans défilement horizontal et à 200 % de zoom, dans les thèmes clair et sombre définis par `src/app/globals.css`
- [ ] T035 Vérifier sur l'ensemble de `src/features/budget/transfer.ts` qu'aucune règle de validation du document n'a été réimplémentée et que `parseDocument()` reste le seul validateur (décision D2)
- [ ] T036 Mettre à jour `README.md` : retirer la mention « il n'y a pas encore d'export ni de sauvegarde », la remplacer par la marche à suivre et un renvoi vers le format documenté
- [ ] T037 Relire l'ensemble des fichiers ajoutés dans `src/` : commentaires en français, suppression de tout code mort, commenté ou en attente
- [ ] T038 Exécuter les douze scénarios manuels de `specs/004-data-export-import/quickstart.md` et consigner le résultat, en particulier le scénario 7 et ses trois cas de refus, et le scénario 12 qui vérifie l'absence de toute requête réseau
- [ ] T039 Passer les barrières de clôture : `npm run build`, `npm run lint` et `npm run test` sans aucune erreur ni règle neutralisée à l'échelle d'un fichier

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Phase 1 — Mise en place** : aucune dépendance.
- **Phase 2 — Fondations** : dépend de la phase 1. **Bloque tous les récits.**
- **Phases 3 à 6 — Récits** : dépendent de la fin de la phase 2.
- **Phase 7 — Finition** : dépend des récits livrés.

### Dépendances entre récits

- **Récit 1 (P1)** : démarre après la phase 2. Aucune dépendance sur un autre récit — il produit un
  fichier, ce qui a une valeur autonome.
- **Récit 2 (P1)** : démarre après la phase 2. Techniquement indépendant du récit 1, mais **se teste
  bien plus facilement une fois celui-ci livré**, puisqu'il faut un fichier à importer. À mener
  après lui, sauf à fabriquer un fichier à la main.
- **Récit 3 (P2)** : dépend du récit 2 — il enrichit le chemin d'import d'un aperçu et d'un filet.
  C'est la seule dépendance inter-récits forte de cette fonctionnalité.
- **Récit 4 (P3)** : dépend du récit 2 pour l'affichage, mais les motifs de refus eux-mêmes sont déjà
  produits et testés dès la phase 2.

### À l'intérieur d'un récit

- Les tests de `transfer.ts` sont écrits d'abord et doivent échouer avant l'implémentation.
- Les actions du fournisseur précèdent les composants qui les appellent.
- Les composants précèdent leur câblage dans la vue.

### Occasions de parallélisation

- T003 à T008 : six blocs de tests indépendants dans le même fichier — parallélisables entre
  personnes, à fusionner ensuite.
- T010 et T011 (`download.ts`) sont indépendants de T003 à T009 (`transfer.ts`) : deux fichiers
  distincts, aucune dépendance croisée.
- T033, T034 et T032 en phase 7.

---

## Exemple de parallélisation : phase 2

```bash
# Deux pistes réellement indépendantes, sur deux fichiers différents :
Piste A : T003 → T009   # transfer.ts : format, aller-retour, refus
Piste B : T010 → T011   # download.ts : API navigateur isolée
```

---

## Stratégie de mise en œuvre

### MVP d'abord

1. Phase 1 — mise en place
2. Phase 2 — fondations (**critique, bloque tout**)
3. Phase 3 — récit 1
4. **S'arrêter et valider** : l'application sait produire une sauvegarde complète
5. Livrer ou démontrer

### Livraison incrémentale

1. Phases 1 et 2 → le format d'échange est implémenté et prouvé
2. Récit 1 → export : une sauvegarde existe (MVP)
3. Récit 2 → import : **la porte de sortie de la constitution est ouverte**
4. Récit 3 → l'import cesse d'être dangereux
5. Récit 4 → les refus deviennent compréhensibles
6. Phase 7 → finition et clôture

### Recommandation de portée

Viser **les phases 1 à 5 incluses** (T001 à T028). C'est le point où la fonctionnalité satisfait
réellement l'obligation constitutionnelle : exporter, restaurer, **et ne pas risquer de tout perdre
en se trompant de fichier**. Le récit 4 améliore le diagnostic, il ne conditionne pas la sécurité.

S'arrêter après le récit 2 serait un mauvais compromis : on disposerait d'un import capable de tout
remplacer sans avertissement ni retour arrière. Le récit 3 n'est pas un confort, c'est ce qui rend
l'import utilisable sans crainte.

---

## Notes

- Les tâches marquées [P] portent sur des fichiers distincts, sans dépendance mutuelle.
- L'étiquette de récit assure la traçabilité vers la [spécification](./spec.md).
- Vérifier que chaque test de `transfer.ts` échoue avant d'écrire l'implémentation qu'il couvre.
- Committer après chaque tâche ou groupe cohérent, message en français (principe VIII).
- `src/features/budget/budget-provider.tsx` et `data-transfer.tsx` sont touchés par plusieurs récits :
  ce sont les deux seuls points de contention en travail parallèle.
- **Ne jamais réimplémenter une règle de validation du document** : `parseDocument()` est le seul
  validateur. T035 le vérifie explicitement en fin de parcours.
