---

description: "Liste de tâches — Synchronisation bancaire automatique (LCL + Revolut)"
---

# Tâches : Synchronisation bancaire automatique (LCL + Revolut)

**Entrée** : documents de conception de `specs/006-bank-sync/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests** : **exigés**, et non optionnels. Le principe III impose des tests pour « tout code qui
calcule, agrège, convertit, répartit ou persiste un montant, ainsi que tout code qui analyse des
données financières importées ». La normalisation, le moteur de règles, la fusion des arrondis,
les calculs nets, la migration v4 et le magasin bancaire tombent tous sous cette obligation :
cas nominal, cas limite (zéro, négatif, plus grand montant réaliste) et entrée malformée.

**Données de test** : **synthétiques uniquement**. Elles reproduisent la forme exacte des
opérations de septembre 2026 (voir [normalisation.md](./contracts/normalisation.md)), sans nom,
IBAN, référence ni montant réels de l'utilisateur (R7).

**Organisation** : par récit utilisateur, pour que chacun soit implémentable et testable
indépendamment.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichier distinct, aucune dépendance sur une tâche inachevée)
- **[Story]** : récit auquel la tâche se rattache (US1 à US6)
- Chaque description porte un chemin de fichier exact

## Conventions de chemins

Application Next.js existante : code sous `src/`, tests à côté du code (`*.test.ts`,
`*.test.tsx`). Domaine bancaire côté navigateur sous `src/features/banking/`, code serveur sous
`src/lib/server/banking/` (jamais importé par un composant client).

> **Environnement de test** : `vitest.config.mts` fixe `jsdom` globalement. Les tests touchant
> `node:fs` ou `node:crypto` portent `// @vitest-environment node` en tête de fichier, comme
> `budget-store.test.ts`.

> **Documentation du framework** (principe V) : avant toute route, relire
> `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, et pour
> le retour de banque `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`.

---

## Phase 1 : Préparation

**Objet** : figer une référence de non-régression et s'assurer qu'aucun secret ni donnée réelle
ne peut fuiter avant la première ligne.

- [X] T001 Enregistrer la référence de non-régression : exécuter `npm run build`, `npm run lint`
      et `npm test`, et consigner le nombre de tests au vert dans
      `specs/006-bank-sync/quickstart.md` (section 3).
- [X] T002 [P] Contrôler que `.gitignore` couvre `*.pem` et `/data/`, et que `.dockerignore`
      couvre `data/` et `.env*` (vérifié au plan : aucune modification attendue). Consigner le
      résultat dans la description de la demande de fusion.
- [X] T003 [P] Créer les jeux d'essai synthétiques des transactions brutes Enable Banking dans
      `src/lib/server/banking/fixtures.ts` : une transaction LCL de chaque nature du tableau
      §2 de `contracts/normalisation.md`, les 28 formes Revolut de septembre (paiements,
      pré-autorisations à 0,00 €, recharges, arrondis), et les cas malformés (montant `"1,5"`,
      `entry_reference` absent, `status: "PDNG"`, sens inconnu). Noms et références fictifs.

**Point de contrôle** : référence de tests consignée, jeux d'essai disponibles.

---

## Phase 2 : Fondations (prérequis bloquants)

**Objet** : document v4, magasin serveur, accès au fournisseur et liaison minimale d'une banque.
Sans liaison, aucun récit ne peut être exercé de bout en bout.

**⚠️ CRITIQUE** : aucun travail de récit ne peut commencer avant la fin de cette phase.

> **Pourquoi la liaison est ici et non dans le récit 5.** Sans session bancaire, il n'existe
> aucune opération à importer, donc aucun récit testable. La liaison est écrite **complète et
> durcie** dès ici (`state` à usage unique, aucun secret renvoyé). Le récit 5 y ajoute
> l'expiration, le renouvellement et les messages d'erreur.

### Document budgétaire v4

- [X] T004 Étendre `src/features/budget/types.ts` : `Expense.source?` et `Expense.bankRef?`,
      types `Refund`, `BankSource`, `LedgerEntry`, `InboxItem`, `TreatmentRule`,
      `CategoryRule`, `BankingState`, ajout de `refunds` et `banking` à `BudgetDocument`,
      `DOCUMENT_VERSION = 4`, `emptyDocument()` complété (data-model §1).
- [X] T005 Créer `src/features/banking/types.ts` : `BankOperation`, `BankOperationKind`,
      `BankStatus` (forme de `GET /api/banking/status`), en réexportant les types bancaires du
      document depuis `src/features/budget/types.ts` plutôt qu'en les redéfinissant.
- [X] T006 Créer `src/features/banking/initial-rules.ts` : règles de traitement initiales
      (`LOYER` → ignorer, LCL ; `Bunq` → ignorer, Revolut ; `UMS-ULYS` → dépense, LCL) et règles
      de catégorie initiales (R11), sous forme de fonctions rendant de **nouvelles** copies
      avec identifiants stables (`initial:loyer`, `initial:cat-carrefour`…).
- [X] T007 Étendre `src/lib/budget-document.ts` : migration additive 3 → 4 (`refunds: []`,
      `banking` avec `importFrom: null`, registre et liste vides, règles initiales de T006),
      analyse de `refunds`, `banking`, `Expense.source` / `bankRef`, et invariants de
      data-model §1.5 (références uniques, `inbox` ⊂ registre en `inbox`, `bankRef` unique sur
      dépenses + remboursements, identifiants de règles dans le contrôle d'unicité global).
- [X] T008 Créer `src/lib/budget-document.test.ts` (les tests existants de l'analyseur vivent
      dans `src/lib/storage.test.ts` et `src/lib/storage.security.test.ts`, qui doivent
      continuer de passer) : document v3 migré sans perte au centime ; v1 → v4 ; règles initiales
      présentes après migration et **absentes** si l'utilisateur les a supprimées d'un document
      déjà v4 ; chaque invariant de §1.5 violé un à un → `invalidData` ; v5 → `futureVersion`.
- [X] T009 [P] Passer `FORMAT_VERSION` à 4 dans `src/features/budget/transfer.ts` et étendre
      `src/features/budget/transfer.test.ts` : un export v3 se réimporte et migre ; un export v4
      restitue registre, règles, « À classer » et remboursements ; un export v5 est refusé.

### Primitives de fichier atomique (D3)

- [X] T010 Extraire de `src/lib/server/budget-store.ts` vers `src/lib/server/atomic-file.ts` la
      sérialisation (`enSerie`, une chaîne **par fichier**), l'écriture atomique (temporaire puis
      `rename`) et la quarantaine horodatée compatible Windows. `budget-store.ts` s'appuie
      dessus sans changer de comportement.
- [X] T011 Confirmer la non-régression : `src/lib/server/budget-store.test.ts` et
      `src/app/api/budget/route.test.ts` passent sans modification ; ajouter
      `src/lib/server/atomic-file.test.ts` (écriture concurrente sérialisée, coupure simulée
      entre écriture et `rename`, quarantaine).

### Accès au fournisseur (serveur)

- [X] T012 [P] Créer `src/lib/server/banking/config.ts` : lecture à chaque appel de
      `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_KEY_PATH` et `BANKING_REDIRECT_URL` ; rend `null`
      si l'un manque, si la clé est illisible ou ne commence pas par `-----BEGIN` (fermeture par
      défaut, R6). Aucune journalisation de la clé.
- [X] T013 [P] Créer `src/lib/server/banking/config.test.ts` : configuration complète, chaque
      variable absente, clé illisible, clé vide.
- [X] T014 Créer `src/lib/server/banking/enable-banking.ts` : JWT RS256 par `node:crypto`
      (`kid` = identifiant d'application, `iss`, `aud`, durée 1 h, R5) ; fonctions
      `startAuthorization(bank, state, validUntil)`, `createSession(code)`,
      `fetchTransactions(accountUid, dateFrom, psuHeaders)` avec pagination par
      `continuation_key` et `transaction_status=BOOK`, `getAspspMaxValidity(bank)`. Erreurs du
      fournisseur traduites en `BankError` (`expired`, `revoked`, `rateLimited`,
      `unavailable`). Toute réponse part d'`unknown` et est validée (principe IV).
- [X] T015 Créer `src/lib/server/banking/enable-banking.test.ts` avec `fetch` simulé : JWT
      vérifiable avec la clé publique de test ; en-têtes `Psu-*` transmis ; pagination ;
      chaque erreur du fournisseur traduite ; réponse mal formée refusée.

### Magasin bancaire (serveur)

- [X] T016 Créer `src/lib/server/banking/banking-store.ts` : `banking.json` sous
      `BUDGET_DATA_DIR`, version 1, `BankConnection` (data-model §3), lecture, remplacement
      d'une connexion (identifiée par `ibanHash`, empreinte SHA-256 de l'IBAN normalisé), fusion
      d'opérations dans le cache **dédupliquée par `ref`**, mise à jour
      de `lastFetchAt` / `lastAttemptAt` / `lastError`, via `atomic-file.ts`. `sessionId` ne
      sort jamais de ce module autrement que vers `enable-banking.ts`.
- [X] T017 Créer `src/lib/server/banking/banking-store.test.ts` sur répertoire temporaire réel :
      fichier absent, contenu corrompu mis en quarantaine, fusion idempotente d'un même lot,
      remplacement d'une connexion **conservant** le cache d'opérations (contrat API §4).
- [X] T018 [P] Créer `src/lib/server/banking/pending-auth.ts` : `state` de 32 octets aléatoires,
      associé à la banque, en mémoire, expiré après 15 minutes, **consommé** à la lecture (R4).
- [X] T019 [P] Créer `src/lib/server/banking/pending-auth.test.ts` : consommation unique,
      expiration, `state` inconnu.

### Liaison minimale (points d'entrée)

- [X] T020 Créer `src/app/api/banking/status/route.ts` (contrat API §1) : `isAuthorized()`,
      `configured: false` si T012 rend `null`, aucune donnée sensible dans la réponse.
- [X] T021 Créer `src/app/api/banking/connect/route.ts` (contrat API §2) : `isAuthorized()`,
      validation de `bank`, durée = minimum de 180 jours et du maximum annoncé par la banque,
      `state` de T018.
- [X] T022 Créer `src/app/api/banking/callback/route.ts` (contrat API §4) : **sans**
      `isAuthorized()`, autorisé par `state` consommé ; création de session ; choix du compte
      selon `contracts/api-banking.md` §4 (renouvellement : compte dont l'empreinte d'IBAN égale
      `ibanHash` ; première liaison : **l'unique** compte en `EUR`, sinon `noAccount`) ;
      enregistrement de `ibanHash` et `ibanSuffix` seuls (jamais l'IBAN complet) ; `noAccount`
      si la session est vide ou sans compte retenu ; redirection `303` vers
      `/?banking=…` par `redirect()` de `next/navigation`.
- [X] T023 Créer `src/app/api/banking/routes.test.ts` : 401 sans cookie sur `status` et
      `connect` ; `503 notConfigured` ; retour avec `state` inconnu, expiré, rejoué ; retour avec
      `error=server_error` ; session sans compte ; première liaison avec deux comptes `EUR` ou
      aucun ; renouvellement renvoyant un autre IBAN que celui enregistré ; **aucune** réponse ne contient `sessionId`,
      un IBAN complet, `ibanHash` ou un JWT (recherche par motif sur le corps).
- [X] T024 Créer `src/features/banking/client.ts` : `fetchBankStatus()`, `startConnect(bank)`,
      chaque réponse validée champ par champ (principe IV), mêmes conventions que
      `src/features/budget/sync.ts` (`credentials: "same-origin"`, `cache: "no-store"`).
      Créer `src/features/banking/client.test.ts` avec `fetch` simulé : réponses valides, 401,
      503 `notConfigured`, réseau coupé, corps non JSON, champ manquant ou de mauvais type,
      URL de `connect` absente.
- [X] T025 Créer `src/features/banking/components/bank-panel.tsx` (version minimale) : état
      configuré / non configuré, bouton « Relier LCL » / « Relier Revolut », saisie de la date
      de début d'import proposée au 1ᵉʳ du mois courant et modifiable tant que le registre est
      vide (D12), lecture puis retrait du paramètre `?banking=` de l'URL. Le poser dans
      `src/features/budget/components/budget-view.tsx`.

**Point de contrôle** : depuis l'application déployée, LCL et Revolut peuvent être reliées ;
`banking.json` contient deux connexions ; le budget est en version 4 et tous les tests
antérieurs passent.

---

## Phase 3 : Récit 1 — Mes paiements apparaissent tout seuls (Priorité : P1) 🎯 MVP

**But** : chaque paiement carte LCL et Revolut entre au journal, au jour du paiement, au
centime, avec un libellé lisible, une catégorie et sa provenance.

**Test indépendant** : relier un compte, ouvrir l'application, vérifier que chaque paiement carte
de la période figure une et une seule fois au journal.

### Tests du récit 1

- [X] T026 [P] [US1] Créer `src/lib/server/banking/normalize-lcl.test.ts` : chaque nature du
      tableau §2 de `normalisation.md` ; extraction de `paymentDate` (`26/09/26` →
      `2026-09-26`) et du commerçant (`UBER   *EATS` → `UBER *EATS`) ; date invalide
      (`31/02/26`) → `null` ; montants `"35.8"` → 3580, `"50"` → 5000, `"0.00"` → 0,
      `"9000000.00"` (plus grand montant réaliste) ; montant `"1,5"` ou `"abc"`, `PDNG`,
      `entry_reference` absent → écartés et comptés.
- [X] T027 [P] [US1] Créer `src/lib/server/banking/normalize-revolut.test.ts` : natures du §3 ;
      **les 9 fusions** du tableau §3 (montants synthétiques de même forme) ; pré-autorisations
      à 0,00 € jamais candidates ; cas ambigu (2,30 € et 4,30 € pour un arrondi de 0,70 €) →
      arrondi conservé en `roundUp` ; arrondi de 100 centimes sur montant rond ; fusion
      idempotente si appliquée deux fois au même cache.
- [X] T028 [P] [US1] Créer `src/features/banking/rules.test.ts` (partie récit 1) : étapes 0, 1,
      10 et 11 du contrat des règles ; dépense produite (§2) avec `id = bank:<ref>`, montant
      arrondi inclus, date de paiement, catégorie par première règle correspondante,
      `source` / `bankRef` ; **idempotence** de `processBatch` ; **indépendance à l'appareil**
      (deux traitements du même lot sur le même document → documents égaux).

### Implémentation du récit 1

- [X] T029 [P] [US1] Créer `src/lib/server/banking/normalize-lcl.ts` selon `normalisation.md`
      §1 et §2. Conversion des montants depuis le texte, **sans `parseFloat`** (EF-036).
- [X] T030 [P] [US1] Créer `src/lib/server/banking/normalize-revolut.ts` selon §1 et §3, avec
      `mergeRoundUps(operations)` appliquée au cache entier (R8).
- [X] T031 [US1] Créer `src/app/api/banking/operations/route.ts` (contrat API §3) : validation de
      `since` ; par banque reliée, récupération si la dernière tentative dépasse 6 h (5 min avec
      `refresh=manual`) depuis `since − 7 jours` ou la dernière opération connue − 7 jours ;
      en-têtes `Psu-Ip-Address` / `Psu-User-Agent` repris de la requête ; normalisation ;
      fusion au cache ; échec d'une banque sans effet sur l'autre ; réponse triée par
      `bookingDate` puis `ref`.
- [X] T032 [US1] Étendre `src/app/api/banking/routes.test.ts` : bornes de 6 h et 5 min
      respectées (horloge injectée) ; cache servi entre deux récupérations ; une banque en
      erreur, l'autre rendue ; `since` invalide → 400.
- [X] T033 [US1] Créer `src/features/banking/rules.ts` : `decide(operation, document)` limité
      aux étapes 0, 1, 10, 11 et aux règles de catégorie ; `processBatch(operations, document)`
      qui rend **un seul** nouveau document, inscrit chaque sort au registre (avec
      `mergedRefs`) et ne renvoie rien de modifié si toutes les décisions sont `skip`.
      Comparaisons via `normalizeForSearch` (`src/features/budget/expenses.ts`).
- [X] T034 [US1] Étendre `src/features/banking/client.ts` : `fetchOperations(since, manual)` avec
      validation de chaque `BankOperation` (montant entier ≥ 0, dates valides, `kind` connu) ;
      une opération invalide est écartée, jamais devinée. Étendre
      `src/features/banking/client.test.ts` **avant** l'implémentation (principe III) : lot
      valide ; montant non entier (`5.45`), négatif, au-delà du plus grand montant réaliste,
      sous forme de texte ; date invalide ; `kind` inconnu ; `roundUpCents` sans `roundUpRef` ;
      une opération invalide au milieu d'un lot valide (seule elle est écartée) ; corps non
      JSON ; 401.
- [X] T035 [US1] Étendre `src/features/budget/budget-provider.tsx` : après une lecture réussie du
      budget, **seulement** si l'état est `idle` sans modification en attente ni conflit (R13)
      et si `banking.importFrom` est défini, appeler `fetchOperations` puis `processBatch`, et
      appliquer le résultat par **une seule** mutation `appliquer()`. Exposer `syncBanks()`
      (bouton manuel) et l'état bancaire au contexte. Aucun appel bancaire ne retarde
      l'affichage du budget local.
- [X] T036 [US1] Créer `src/features/banking/bank-sync.integration.test.tsx` : budget v4 vide,
      opérations simulées → dépenses visibles au journal et anneau mis à jour ; seconde
      ouverture → aucun doublon ; état `pending` ou `conflict` → aucun traitement.
- [X] T037 [P] [US1] Étendre `src/features/budget/components/expense-journal.tsx` : provenance
      affichée en texte (« LCL », « Revolut ») pour les dépenses importées, rien pour les
      saisies manuelles (EF-029).
- [X] T038 [US1] Étendre `src/features/banking/components/bank-panel.tsx` : bouton
      « Synchroniser maintenant », date de dernière récupération réussie par banque (EF-013).

**Point de contrôle** : avec des opérations simulées, les paiements carte apparaissent une seule
fois, au bon jour, au centime. Le récit est démontrable seul.

---

## Phase 4 : Récit 2 — Ne jamais compter deux fois le même argent (Priorité : P1)

**But** : recharges, abonnements, loyer, crédits et pré-autorisations ne gonflent jamais ni les
dépenses ni les revenus.

**Test indépendant** : traiter le jeu d'essai de septembre ; aucune recharge, aucun crédit,
aucun loyer, aucun Spotify n'apparaît en dépense.

- [X] T039 [P] [US2] Étendre `src/features/banking/rules.test.ts` : étapes 2, 4 à 9 et 9 bis du
      contrat, une par une ; ordre de priorité (une règle utilisateur ne s'applique pas à un
      crédit) ; règle `subscription` vers un abonnement supprimé → ignorée ; prélèvement
      `UMS-ULYS` importé par règle → dépense datée de `bookingDate` (pas de date de paiement) ; 9 bis ne se
      déclenche pas pour un libellé d'abonnement de moins de 3 caractères ; **jeu d'essai de
      référence** de `contracts/regles.md` §5 (comptes par sort, LCL et Revolut).
- [X] T040 [US2] Étendre `decide()` dans `src/features/banking/rules.ts` : étapes structurelles
      2, 4, 5, 6, 7, 8 ; étape 9 (première règle de traitement, insensible à la casse et aux
      accents, sur libellé lisible et libellé brut, filtrée par banque) ; étape 9 bis
      (`possibleSubscription`).
- [X] T041 [US2] Étendre `src/features/banking/bank-sync.integration.test.tsx` : septembre
      simulé de bout en bout → total dépensé égal à la somme des seules dépenses attendues,
      revenus du mois inchangés (EF-020, CS-002).

**Point de contrôle** : le jeu d'essai de septembre donne exactement les comptes du contrat §5.

---

## Phase 5 : Récit 3 — Décider moi-même de ce que les règles ne tranchent pas (Priorité : P1)

**But** : tout ce qui n'est pas tranché part « À classer », sans effet sur le budget, et
l'utilisateur classe en un geste.

**Test indépendant** : des virements inconnus apparaissent « À classer », le budget est
inchangé ; chaque choix produit l'effet attendu.

- [X] T042 [P] [US3] Étendre `src/features/banking/rules.test.ts` (classement, contrat §4) :
      « Dépense » avec et sans catégorie ; « Ignorer » ; « Toujours ignorer » ajoute une règle
      **en tête** et classe les autres éléments encore « À classer » qu'elle vise, sans toucher
      aux sorts déjà tranchés ; « Rattacher à l'abonnement » ; motif de moins de 2 caractères
      refusé.
- [X] T043 [US3] Ajouter à `src/features/banking/rules.ts` les fonctions pures
      `classifyAsExpense`, `classifyAsIgnored`, `classifyWithRule` (ignorer ou abonnement),
      selon le contrat §4.
- [X] T044 [US3] Exposer les actions de classement dans
      `src/features/budget/budget-provider.tsx`, chacune passant par `appliquer()`.
- [X] T045 [US3] Créer `src/features/banking/components/inbox.tsx` : liste « À classer » (date,
      montant, libellé lisible, libellé brut dépliable, motif `why` en texte) ; quatre choix par
      boutons libellés ; motif de règle proposé et modifiable avant validation ; choix de
      l'abonnement dans une liste ; utilisable au clavier et à 360 px (principe VII).
- [X] T046 [US3] Afficher le nombre d'éléments « À classer » à l'accueil dans
      `src/features/budget/components/budget-view.tsx`, avec lien vers la liste (EF-026).
- [X] T047 [US3] Tester la liste « À classer » : chaque choix au clavier ; liste vide ; élément
      `possibleSubscription` rattaché. *(Réalisé dans
      `src/features/banking/bank-sync.integration.test.tsx`, qui monte déjà l'application avec
      un serveur simulé : un second fichier en aurait dupliqué toute la mise en place.)*

**Point de contrôle** : avec le jeu de septembre, les 5 éléments LCL se classent et le budget
reflète chaque choix.

---

## Phase 6 : Récit 4 — Mes remboursements réduisent mes dépenses (Priorité : P2)

**But** : un remboursement carte vient en déduction des dépenses du jour, du mois et de
l'enveloppe.

**Test indépendant** : un remboursement de 4,99 € réduit le total du mois de 4,99 €.

- [X] T048 [P] [US4] Étendre `src/features/budget/expenses.test.ts` : dépensé net au jour, avant
      un jour et au mois ; remboursement seul dans un mois (net borné à 0, excédent exposé) ;
      remboursement d'un autre mois sans effet ; montants nuls et plus grand montant réaliste ;
      allocation quotidienne et report de la veille avec remboursement.
- [X] T049 [P] [US4] Étendre `src/features/budget/envelopes.test.ts` : consommation nette d'une
      enveloppe ; remboursement sans catégorie compté dans « hors enveloppe » ; excédent sur une
      enveloppe → consommation 0, jamais négative.
- [X] T050 [US4] Modifier `src/features/budget/expenses.ts` : agrégats nets (dépenses moins
      remboursements) dans `totalSpentCentsForMonth`, `spentOnDayCents`, `spentBeforeDayCents`,
      `computeMonthlySpending` et `computeDailyAllowance`, bornés à 0 là où le contrat l'exige,
      excédent exposé (R9, EF-031, EF-032). Mettre à jour les appelants dans
      `src/features/budget/` pour transmettre les remboursements.
- [X] T051 [US4] Modifier `src/features/budget/envelopes.ts` : consommation nette par catégorie
      dans `computeMonthlyEnvelopes`, y compris le groupe « hors enveloppe ».
- [X] T052 [US4] Ajouter l'étape 3 (`cardRefund` → remboursement daté de `bookingDate`) à
      `decide()` dans `src/features/banking/rules.ts`, avec son test dans
      `src/features/banking/rules.test.ts`.
- [X] T053 [US4] Afficher les remboursements dans
      `src/features/budget/components/expense-journal.tsx`, distinctement des dépenses, avec un
      montant présenté comme une déduction en texte (« Remboursement − 4,99 € ») et non par la
      seule couleur.

**Point de contrôle** : tous les tests antérieurs des calculs passent toujours (aucun
remboursement → résultats identiques à la version 3).

---

## Phase 7 : Récit 5 — Relier mes banques et garder l'accès dans la durée (Priorité : P2)

**But** : l'utilisateur est averti avant l'expiration, comprend chaque échec et reconnecte en un
geste, sans réimport.

**Test indépendant** : autorisation simulée à J + 10 → avertissement ; expirée → message clair
et « Reconnecter » ; reconnexion → aucun doublon.

- [X] T054 [P] [US5] Créer `src/features/banking/bank-status.ts` : fonction pure qui, à partir de
      `BankStatus` et de la date du jour, rend l'état affichable de chaque banque (à jour,
      expire bientôt à moins de 14 jours, expirée, révoquée, aucun compte, limitée,
      indisponible) et le texte de `contracts/api-banking.md` §5.
- [X] T055 [P] [US5] Créer `src/features/banking/bank-status.test.ts` : seuil de 14 jours exact,
      chaque `lastError`, date de dernière récupération réussie toujours présente.
- [X] T056 [US5] Étendre `src/features/banking/components/bank-panel.tsx` : avertissement
      d'expiration, messages d'échec, bouton « Reconnecter » (même parcours que la liaison),
      messages de retour `?banking=connected|error|noAccount|invalidState`.
- [X] T057 [US5] Signaler un **trou d'historique** probable dans
      `src/app/api/banking/operations/route.ts` et `bank-panel.tsx` : si la plus ancienne
      opération reçue est postérieure à la date demandée de plus de 7 jours alors que la
      dernière récupération réussie date de plus de 90 jours (R3, NAS éteint longtemps).
      *(Signalé uniquement dans la réponse de la récupération qui le constate : le message
      apparaît à cette ouverture-là, sans être conservé dans `banking.json`.)*
- [X] T058 [US5] Étendre `src/app/api/banking/routes.test.ts` : reconnexion d'une banque déjà
      reliée → `sessionId` et `validUntil` remplacés, cache conservé, puis traitement côté
      navigateur sans aucun doublon (EF-012) ; erreurs `expired` et `revoked` consignées dans
      `lastError` sans perdre le cache ; **trou d'historique** de T057 signalé quand la dernière
      récupération réussie date de plus de 90 jours et que la plus ancienne opération reçue
      est postérieure de plus de 7 jours à la date demandée, et **non** signalé dans le cas
      ordinaire (horloge injectée).

**Point de contrôle** : scénarios de la section 5 de `quickstart.md` passent.

---

## Phase 8 : Récit 6 — Garder la main sur ce qui a été importé (Priorité : P3)

**But** : corrections et suppressions tiennent ; une catégorie peut devenir une règle.

**Test indépendant** : modifier puis supprimer deux dépenses importées, resynchroniser,
vérifier que tout tient.

- [ ] T059 [P] [US6] Étendre `src/features/banking/bank-sync.integration.test.tsx` : dépense
      importée modifiée (catégorie, libellé, montant, date) puis resynchronisation → modification
      conservée (EF-033) ; dépense importée supprimée → jamais réimportée (EF-034).
- [ ] T060 [US6] Ajouter « Appliquer à ce commerçant » dans
      `src/features/budget/components/expense-detail.tsx` pour une dépense importée : crée une
      règle de catégorie **en tête** (motif proposé = libellé, modifiable), sans modifier les
      dépenses passées. Fonction pure `addCategoryRule` dans `src/features/banking/rules.ts`,
      testée dans `rules.test.ts`.
- [ ] T061 [US6] Créer `src/features/banking/components/rule-list.tsx` : liste des règles de
      traitement et de catégorie, dans l'ordre d'évaluation, avec suppression et modification
      du motif ou de la catégorie ; règles initiales supprimables comme les autres.
- [ ] T062 [US6] Créer `src/features/banking/components/rule-list.test.tsx` : suppression,
      modification, utilisation au clavier.

**Point de contrôle** : quickstart §4, étape 9, passe.

---

## Phase 9 : Finitions et déploiement

**Objet** : déployer, documenter, valider de bout en bout.

- [X] T063 [P] Modifier `docker-compose.yml` : variables **facultatives**
      `ENABLE_BANKING_APP_ID`, `BANKING_REDIRECT_URL`,
      `ENABLE_BANKING_KEY_PATH=/run/secrets/enable-banking.pem`, et montage **en lecture seule**
      de `${ENABLE_BANKING_KEY_FILE:-./data/enable-banking.pem}`. Commenter dans le fichier
      pourquoi la clé n'est pas dans le volume `budget-data` (l'application ne doit pas pouvoir
      modifier sa clé).
- [X] T064 [P] Documenter dans `README.md` les trois variables bancaires, l'emplacement de la clé
      (`data/enable-banking.pem`, propriétaire `1001`, mode `400`) et le comportement si elles
      sont absentes.
- [ ] T065 [P] Vérifier que rien de `src/lib/server/` n'entre dans le graphe client : aucune
      importation depuis un fichier `"use client"` ni depuis `src/features/` (recherche dans le
      dépôt), et `npm run build` sans avertissement à ce sujet.
- [ ] T066 Exécuter `npm run build`, `npm run lint` et `npm test` : zéro erreur, nombre de tests
      supérieur à la référence de T001, aucun test antérieur modifié hors chemins d'import.
- [ ] T067 Dérouler `specs/006-bank-sync/quickstart.md` sections 2, 4 et 5 sur le NAS avec les
      vraies banques, et consigner les résultats dans ce même fichier.
- [ ] T068 Relire tous les artefacts et commentaires produits selon le principe VIII (français,
      identifiants en anglais) et supprimer tout code mort ou commenté.

---

## Dépendances et ordre d'exécution

### Entre phases

```text
Phase 1 (préparation)
   └─► Phase 2 (fondations : document v4, fournisseur, magasin, liaison)  ⚠️ bloquante
          ├─► Phase 3  US1 import          🎯 MVP
          │      ├─► Phase 4  US2 double comptage      (étend decide())
          │      │      └─► Phase 5  US3 « À classer » (s'appuie sur les sorts inbox de US2)
          │      ├─► Phase 6  US4 remboursements       (indépendante de US2/US3 hors rules.ts)
          │      └─► Phase 8  US6 maîtrise             (s'appuie sur le journal de US1)
          └─► Phase 7  US5 accès dans la durée         (indépendante de US1 à US4)
                 └─► Phase 9 (finitions)
```

**Avertissement sur la livraison** : US1 **seul** importerait les paiements carte sans les
règles de US2. Les recharges `CB Revolut` et Spotify seraient alors comptés deux fois. **US1,
US2 et US3 se livrent ensemble** à l'utilisateur ; US1 seul reste démontrable sur des opérations
simulées.

### Dans un récit

Tests avant implémentation ; fonctions pures (normalisation, règles, calculs) avant points
d'entrée ; points d'entrée avant composants.

### Fichiers partagés (pas de parallélisme)

`src/features/banking/rules.ts` et son test sont touchés par US1, US2, US3, US4 et US6 :
ces tâches sont séquentielles. `budget-provider.tsx` est touché par US1 et US3.
`bank-panel.tsx` par la phase 2, US1 et US5.

---

## Exemples de parallélisme

### Phase 2

```text
En parallèle : T009 (transfer), T012 + T013 (config), T018 + T019 (pending-auth)
Puis : T014 → T015 (fournisseur), T016 → T017 (magasin), T020 → T023 (routes)
```

### Récit 1

```text
En parallèle : T026, T027, T028 (tests) puis T029, T030 (normalisateurs), T037 (journal)
Puis séquentiel : T031 → T032, T033 → T034 → T035 → T036 → T038
```

### Récits 4 et 5 (deux personnes ou deux sessions)

```text
US4 : T048 + T049 en parallèle, puis T050 → T051 → T052 → T053
US5 : T054 + T055 en parallèle, puis T056 → T057 → T058
```

---

## Stratégie d'implémentation

### MVP à livrer à l'utilisateur : phases 1 à 5

1. Préparation et fondations : les banques se relient depuis l'application.
2. US1 : les paiements carte entrent au journal.
3. US2 : rien n'est compté deux fois.
4. US3 : le reste se classe en un geste.
5. **Déploiement anticipé** : T063 et T064 (Docker et README) sont tirés de la phase 9 et faits
   ici, sans quoi le serveur ne voit pas la clé.
6. **Arrêt et validation** sur les vraies banques (quickstart §4, étapes 1 à 8).

À ce stade, l'utilisateur peut cesser toute saisie manuelle de ses paiements carte, comme décidé
pour le 2026-10-01.

### Ensuite, par incréments

7. US4 : remboursements (rares, un seul en septembre).
8. US5 : avertissements d'expiration. **À livrer avant fin mars 2027**, l'autorisation de 180
   jours accordée en octobre 2026 expirant alors.
9. US6 : règles éditables et « Appliquer à ce commerçant ».
10. Finitions restantes de la phase 9.
