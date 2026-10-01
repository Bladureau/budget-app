# Plan d'implémentation : Synchronisation bancaire automatique (LCL + Revolut)

**Branche** : `feat-006-bank-sync` | **Date** : 2026-10-01 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/006-bank-sync/spec.md`

## Résumé

Faire entrer les paiements LCL et Revolut dans le budget sans saisie, sans jamais compter deux
fois le même argent, et sans rien compter à l'insu de l'utilisateur.

L'approche tient en une phrase : **le serveur récupère, le navigateur décide.**

- Le **serveur** parle à Enable Banking : il signe ses appels, récupère les opérations
  comptabilisées, les **normalise** (une fonction pure par banque) et les garde en cache dans un
  fichier distinct du budget, `banking.json`.
- Le **navigateur** demande ces opérations à l'ouverture de l'application, les passe dans un
  **moteur de règles pur**, et inscrit le résultat (dépenses, remboursements, « À classer ») dans
  le budget **par le chemin de mutation ordinaire** de 005.

Ce partage est le choix structurant du plan (R1). Si le serveur écrivait lui-même dans le budget,
chaque import ferait avancer la révision centrale et mettrait en conflit tout appareil ayant une
saisie non poussée. Or un conflit, dans 005, se résout toujours en perdant un côté. En faisant de
l'import une mutation comme les autres, **aucun nouveau type de conflit n'apparaît**.

L'anti-doublon repose sur un **registre** inscrit dans le budget et sur des **identifiants
déterministes** (R2). Ensemble, ils rendent le traitement idempotent, y compris entre deux
appareils, et satisfont par construction les exigences « ne jamais réimporter ce que
l'utilisateur a supprimé » et « ne jamais écraser ce qu'il a corrigé ».

**Aucune tâche de fond** (R3) et **aucune dépendance** ajoutée (R5) : `node:crypto` signe les
JWT, le `fetch` natif appelle le fournisseur.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8, Node.js 22 (image Docker
`node:22-alpine`).

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19, Tailwind CSS 4. **Aucune
dépendance ajoutée**, ni d'exécution ni de développement.

**Réutilisé de l'existant** :

| Élément existant | Rôle dans 006 |
| --- | --- |
| `appliquer()` et le protocole de synchronisation de 005 | Seul chemin d'écriture des imports (R1). Aucun changement de protocole. |
| `parseDocument()` / `migrer()` | Étendus à la version 4 : migration additive 3 → 4. |
| `budget-store.ts` (écriture atomique, sérialisation, quarantaine) | Modèle du magasin `banking.json`. Les primitives communes (`enSerie`, écriture atomique, quarantaine) sont **extraites** et partagées, puisqu'elles auront deux consommateurs réels. |
| `isAuthorized()` / `unauthorizedResponse()` | Contrôle de chaque point d'entrée bancaire, sauf le retour de banque (R4). |
| `normalizeForSearch()` (`expenses.ts`) | Comparaison des motifs de règles, insensible à la casse et aux accents. |
| `serializeExport` / `parseImport` | Inchangés hors `FORMAT_VERSION` → 4 : le document v4 porte déjà toutes les nouvelles données (EF-035). |

**Stockage** :

- *Budget* : inchangé dans sa mécanique, document en **version 4** (refunds, banking).
- *Serveur* : nouveau fichier `banking.json` sous `BUDGET_DATA_DIR`, même volume Docker.
- *Mémoire du serveur* : `state` des liaisons en cours (15 minutes).

**Tests** : Vitest, React Testing Library, jsdom, déjà en place. `fetch` vers Enable Banking est
simulé ; le magasin bancaire est testé sur un répertoire temporaire réel, comme `budget-store`.
Jeux d'essai **synthétiques**, à la forme exacte des données de septembre (R7).

**Plateforme cible** : inchangée. Serveur Node auto-hébergé, instance unique, sortie HTTPS vers
`api.enablebanking.com`.

**Type de projet** : application web existante ; ajout de points d'entrée serveur et d'un
domaine `banking`.

**Objectifs de performance** : traitement d'un lot de 100 opérations sans délai perceptible ;
ouverture de l'application jamais bloquée par la banque (la récupération est lancée **après**
l'affichage du budget local).

**Contraintes** : centimes entiers depuis le **texte** des montants (EF-036) ; consultation et
saisie hors connexion préservées ; secrets jamais vers le navigateur (EF-006) ; aucune
opération réelle de l'utilisateur dans le dépôt.

**Échelle / portée** : un utilisateur, deux banques, environ 70 opérations par mois.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

### Avant la phase 0

| Principe | Verdict | Analyse |
| --- | --- | --- |
| I. Propriété locale des données | ⚠️ **Conforme, dépendance consignée** | Enable Banking est un **service tiers**, que le principe n'admet que s'il est « explicitement choisi » par l'utilisateur. C'est le cas : il l'a sélectionné, a créé l'application et lié ses comptes lui-même. Le flux est **entrant** : des opérations viennent de la banque, et **aucune donnée du budget** n'est envoyée au fournisseur. La consultation et la saisie hors connexion sont intactes : la synchronisation bancaire est un apport, pas une dépendance du cœur du budget. Elle se désactive entièrement si la configuration est absente (R6). |
| II. L'argent est exact | ✅ Conforme | Montants convertis depuis le texte, sans `parseFloat` (EF-036). Fusion des arrondis en centimes. Remboursements en collection positive plutôt qu'en dépense négative (R9). Devise explicite, non-euro écartée (EF-038). Aucune division introduite. |
| III. Tester là où cela compte | ✅ Conforme, **périmètre large** | Tombent sous l'obligation : normalisation (analyse de données financières importées), moteur de règles, fusion des arrondis, calculs nets, migration v4, magasin bancaire. Le jeu d'essai de référence est fixé au [contrat des règles](./contracts/regles.md) §5. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Deux nouvelles frontières de confiance : la réponse d'Enable Banking (validée par les adaptateurs) et la réponse de `/api/banking/operations` (validée par le navigateur). Aucun transtypage. |
| V. Documentation du framework | ✅ Conforme | Relus : gestionnaires de route (`route.md`, dont `redirect` en gestionnaire) et `after()`, écarté. |
| VI. Simplicité et YAGNI | ⚠️ **Justifié** | Ajouts : un domaine `banking`, un magasin serveur, quatre points d'entrée, deux collections du document. Chacun répond à une exigence. Écartés faute de besoin : tâche de fond (R3), dépendance JWT (R5), couche « multi-banques » générique (deux adaptateurs écrits pour les deux banques réelles), rapprochement automatique avec les abonnements (R10). Voir « Suivi de la complexité ». |
| VII. Accessibilité et adaptabilité | ✅ Conforme | États des banques et motifs « À classer » en texte ; liste « À classer » utilisable au clavier et à 360 px ; choix par boutons libellés, pas par icônes seules. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts et commentaires en français ; identifiants en anglais. |

**Aucun amendement constitutionnel n'est requis.**

### Après la phase 1 — réévaluation

Aucun verdict ne change. Points vérifiés en conception :

- **Principe I** : aucun appel de `src/lib/server/banking/` n'envoie de donnée du budget ; les
  seuls corps sortants sont la demande d'autorisation (banque, durée, URL de retour) et
  l'échange du `code`. L'IBAN complet n'est conservé nulle part.
- **Principe VI** : l'extraction des primitives de fichier atomique (D3) a deux consommateurs
  réels, `budget-store` et `banking-store`, et n'anticipe rien.
- **Principe IV** : la réponse de `/api/banking/operations` est validée champ par champ côté
  navigateur, comme l'est déjà celle de `/api/budget`.
- **Principe II** : le contrat de normalisation interdit nommément `parseFloat` et liste les
  formes de montant acceptées.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/006-bank-sync/
├── plan.md                  # Ce fichier
├── research.md              # Phase 0 — R1 à R13
├── data-model.md            # Phase 1 — document v4, opération normalisée, banking.json
├── quickstart.md            # Phase 1 — mise en service et validation
├── contracts/
│   ├── api-banking.md       # Points d'entrée /api/banking/*
│   ├── normalisation.md     # Transactions brutes → BankOperation, par banque
│   └── regles.md            # Ordre de décision, lot, classement manuel, jeu d'essai
├── checklists/
│   └── requirements.md      # Existant
└── tasks.md                 # Phase 2 — produit par /speckit-tasks
```

### Code source (racine du dépôt)

```text
src/
├── app/
│   └── api/
│       └── banking/
│           ├── status/route.ts         # NOUVEAU — GET
│           ├── connect/route.ts        # NOUVEAU — POST
│           ├── callback/route.ts       # NOUVEAU — GET, autorisé par state (R4)
│           └── operations/route.ts     # NOUVEAU — GET, récupération bornée (R3)
├── features/
│   ├── banking/                        # NOUVEAU — domaine, côté navigateur, pur sauf client.ts
│   │   ├── types.ts                    # BankOperation, LedgerEntry, InboxItem, règles
│   │   ├── rules.ts                    # decide(), processBatch(), classement manuel
│   │   ├── rules.test.ts
│   │   ├── initial-rules.ts            # Règles initiales (R11)
│   │   ├── client.ts                   # Appels /api/banking/*, validation des réponses
│   │   ├── client.test.ts
│   │   └── components/
│   │       ├── bank-panel.tsx          # État des banques, relier / reconnecter, synchroniser
│   │       ├── inbox.tsx               # « À classer »
│   │       └── rule-list.tsx           # Règles de traitement et de catégorie
│   └── budget/
│       ├── types.ts                    # MODIFIÉ — Expense.source/bankRef, Refund, banking, v4
│       ├── expenses.ts                 # MODIFIÉ — dépensé net (remboursements)
│       ├── envelopes.ts                # MODIFIÉ — consommation nette
│       ├── transfer.ts                 # MODIFIÉ — FORMAT_VERSION 4
│       ├── budget-provider.tsx         # MODIFIÉ — traitement après lecture fraîche (R13), actions de classement
│       └── components/
│           ├── expense-journal.tsx     # MODIFIÉ — provenance, remboursements
│           └── budget-view.tsx         # MODIFIÉ — pose bank-panel et le compteur « À classer »
└── lib/
    ├── budget-document.ts              # MODIFIÉ — v4 : analyse et migration 3 → 4
    └── server/
        ├── atomic-file.ts              # NOUVEAU — enSerie, écriture atomique, quarantaine (extraits)
        ├── budget-store.ts             # MODIFIÉ — s'appuie sur atomic-file.ts, comportement inchangé
        └── banking/
            ├── config.ts               # Lecture identifiant / clé, fermeture par défaut (R6)
            ├── enable-banking.ts       # JWT RS256 (node:crypto), appels au fournisseur
            ├── normalize-lcl.ts        # Contrat normalisation §2
            ├── normalize-revolut.ts    # Contrat normalisation §3, fusion des arrondis
            ├── banking-store.ts        # banking.json
            ├── pending-auth.ts         # state en mémoire, 15 min, usage unique (R4)
            └── *.test.ts
```

### Fichiers hors `src/`

| Fichier | Changement |
| --- | --- |
| `docker-compose.yml` | Variables `ENABLE_BANKING_APP_ID`, `BANKING_REDIRECT_URL`, `ENABLE_BANKING_KEY_PATH=/run/secrets/enable-banking.pem` ; montage **en lecture seule** de `${ENABLE_BANKING_KEY_FILE}`. Les variables bancaires sont **facultatives** : sans elles, l'application démarre, synchronisation bancaire désactivée. |
| `.gitignore` | Vérifier que `*.pem` y figure (c'est le cas) et que `data/` couvre `banking.json` (c'est le cas). Aucune modification attendue, contrôle seulement. |
| `deploy/` | Note de déploiement : droits du fichier de clé pour l'uid 1001 (R6). |

**Décision de structure** : le domaine bancaire côté navigateur rejoint `src/features/banking/`,
à côté de `src/features/budget/`, parce qu'il a son vocabulaire propre (opération, registre,
règle) et ses propres composants. Le code serveur rejoint `src/lib/server/banking/`, sous le
répertoire dont le nom porte déjà l'invariant « jamais dans le graphe client ». Les adaptateurs
de normalisation sont côté serveur : le navigateur ne voit jamais le format du fournisseur.

## Décisions de conception

| # | Décision | Motif |
| --- | --- | --- |
| **D1** | Le **serveur récupère et normalise**, le **navigateur décide et écrit** dans le budget. | Aucun nouveau type de conflit (R1). Règles pures et testables. |
| **D2** | **Registre** des opérations traitées et **identifiants déterministes** `bank:<ref>` dans le budget. | Idempotence, y compris entre appareils ; EF-010, EF-033, EF-034 par construction (R2). |
| **D3** | Primitives de fichier atomique **extraites** de `budget-store.ts` vers `atomic-file.ts`. | Deux consommateurs réels ; dupliquer l'atomicité et la quarantaine serait la vraie dette. |
| **D4** | **Récupération à la demande**, bornée à 6 h (automatique) et 5 min (manuelle). Aucune tâche de fond. | Principe VI ; la limite bancaire est respectée et la banque garde l'historique (R3). |
| **D5** | Retour de banque autorisé par **`state` à usage unique**, pas par le cookie. | Le cookie `SameSite=Strict` n'accompagne pas une navigation venue de la banque (R4). |
| **D6** | JWT RS256 par **`node:crypto`**. | Aucune dépendance pour vingt lignes (R5). |
| **D7** | Clé privée en **fichier monté en lecture seule** ; **fermeture par défaut** si absente. | Pas de secret dans l'image ni dans une variable multi-lignes (R6). |
| **D8** | **Remboursements** en collection positive ; calculs **nets bornés à zéro**, excédent exposé. | L'invariant « montant strictement positif » reste intact (R9). |
| **D9** | Un paiement dont le libellé contient celui d'un **abonnement existant** part « À classer » plutôt qu'en dépense. | Évite le double comptage de Spotify à sa première occurrence, sans rien deviner (contrat des règles, étape 9 bis). |
| **D10** | **Fusion des arrondis côté serveur**, sur critère strict et unique ; sinon « À classer ». | Les 9 arrondis de septembre s'apparient sans ambiguïté (R8). |
| **D11** | Traitement **uniquement sur copie fraîche**, en **un seul lot = une seule mutation**. | Minimise les conflits entre appareils (R13) et les poussées. |
| **D12** | **Date de début d'import** dans le document, proposée au 1ᵉʳ du mois, figée dès la première opération traitée. | Q1 de la spécification ; aucune date codée en dur (R12). |

## Suivi de la complexité

| Ajout | Besoin présent | Alternative plus simple écartée parce que |
| --- | --- | --- |
| Domaine `banking` (règles, registre, « À classer ») | Récits 1 à 3 : importer, ne pas compter deux fois, ne rien compter à l'insu | Des règles codées en dur ne laisseraient ni classer ni apprendre (EF-027) |
| Collection `refunds` | Récit 4, choix explicite de l'utilisateur | Une dépense négative romprait l'invariant le mieux protégé du projet (R9) |
| Magasin `banking.json` distinct | Les sessions sont secrètes et les opérations récupérables : ni exportables, ni synchronisables | Les ranger dans le budget les ferait voyager vers les navigateurs et dans l'export (EF-006, CS-009) |
| Quatre points d'entrée | Un par geste : état, liaison, retour de banque, opérations | Un point d'entrée unique multiplexé serait plus opaque sans être plus petit |

**Limite assumée** : si deux appareils traitent le même lot avant de se synchroniser, un conflit
de 005 peut survenir. Il est **inoffensif** (les deux documents contiennent les mêmes imports
sous les mêmes identifiants, R2) et **improbable** (D11), mais il reste visible.
L'éliminer exigerait une fusion automatique, que 005 a refusée.
