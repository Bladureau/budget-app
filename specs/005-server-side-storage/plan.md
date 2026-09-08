# Plan d'implémentation : Stockage centralisé et synchronisation entre appareils

**Branche** : `005-server-side-storage` | **Date** : 2026-09-07 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/005-server-side-storage/spec.md`

> Branche Git réelle au moment de la planification : `feat-005-server-side-storage`.

## Résumé

Faire qu'un budget saisi sur un appareil se retrouve sur les autres, sans rien perdre de ce qui
fonctionne aujourd'hui.

L'approche technique tient en une phrase : **ne pas remplacer `localStorage`, l'adosser à un serveur.**
Le navigateur reste la copie de travail — lue et écrite immédiatement, donc utilisable hors connexion
et sans ralentissement de la saisie — et un fichier JSON tenu par le serveur devient la référence
partagée entre appareils. La synchronisation pousse et tire le **document entier**, pas des
opérations.

Ce choix de l'unité de synchronisation est ce qui rend la fonctionnalité petite, et il n'est pas
arbitraire : le fournisseur écrit déjà toujours un `BudgetDocument` complet à chaque mutation
(`appliquer()` dans `budget-provider.tsx`). Il en découle sans effort supplémentaire qu'aucun journal
d'opérations hors connexion n'est nécessaire, et qu'une poussée répétée est idempotente — donc
EF-019, « sans créer de doublon », est satisfaite par construction plutôt que par du code.

La concurrence est traitée par un **verrou optimiste** : le serveur porte un numéro de révision,
refuse une écriture fondée sur une révision périmée, et l'application demande alors à l'utilisateur
de trancher. Aucune écriture n'est jamais perdue en silence (EF-025).

L'accès est protégé par un **jeton d'appareil** échangé une fois contre un cookie `httpOnly`,
vérifié dans chaque gestionnaire de route, doublé d'une isolation réseau relevant du déploiement.

**Aucune dépendance n'est ajoutée** : `node:fs`, `node:crypto`, les API Web `Request`/`Response` et
`next/headers` suffisent. La pile approuvée par la constitution reste donc inchangée, et aucun
amendement n'est requis.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8, Node.js (runtime par défaut des
gestionnaires de route)

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19, Tailwind CSS 4. **Aucune
dépendance ajoutée**, ni d'exécution ni de développement.

**Réutilisé de l'existant** — c'est le cœur du plan :

| Élément existant | Rôle dans 005 |
| --- | --- |
| `parseDocument(unknown)` (extrait vers `src/lib/budget-document.ts`) | Valide le document **des deux côtés** de la frontière réseau. Aucun second analyseur. |
| `migrer()` et `DOCUMENT_VERSION` | Chemin de migration du contenu central (EF-006, EF-007). |
| Quarantaine de `storage.ts` | Modèle transposé au fichier serveur (EF-008). |
| `saveDocument()` / `loadDocument()` | Inchangés : `localStorage` devient la copie de travail locale. |
| `serializeExport` / `parseImport` (`transfer.ts`) | Inchangés. L'export lit l'état courant, l'import écrit par le chemin normal, donc atteint le serveur sans code propre (EF-013 à EF-015). |
| `BudgetProvider` | Accueille l'état de synchronisation ; les 20 actions de mutation existantes ne changent pas de signature. |
| `BudgetNotice` / `storage-notice.tsx` | Étendus aux états de synchronisation plutôt que doublés. |

**Stockage** :

- *Client* — inchangé : `localStorage`, clé `budget-app:v1`. S'y ajoute une clé de métadonnées de
  synchronisation (révision de base, drapeau « non synchronisé »), délibérément séparée pour qu'un
  contenu de synchronisation abîmé ne mette jamais le budget en quarantaine.
- *Serveur* — un fichier JSON unique sous `BUDGET_DATA_DIR` (défaut `./data`), écrit atomiquement.

**Tests** : Vitest, React Testing Library, jsdom — déjà en place. `fetch` est simulé dans les tests
client ; le magasin serveur est testé sur un répertoire temporaire réel (`node:fs`), l'atomicité et
la quarantaine ne se vérifiant pas sur un double en mémoire.

**Plateforme cible** : navigateurs de bureau et mobiles récents ; serveur Node auto-hébergé, instance
unique, sur réseau privé.

**Type de projet** : application web existante, à laquelle s'ajoute une surface serveur (premiers
gestionnaires de route du projet).

**Objectifs de performance** : écriture visible sur un second appareil en moins de 5 s après
rafraîchissement (CS-001) ; saisie d'une dépense inchangée en ressenti, le réseau n'étant jamais sur
son chemin critique (EF-011, CS-003) ; 5 000 dépenses affichées sans figement (CS-005).

**Contraintes** : consultation et saisie hors connexion obligatoires (principe I, EF-017) ; centimes
entiers de bout en bout, transport compris (EF-004) ; aucune perte silencieuse (EF-025) ; aucun
comportement existant régressé (CS-004) ; aucun secret versionné.

**Échelle / portée** : un utilisateur, quelques appareils, ordre de grandeur du méga-octet.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

### Avant la phase 0

| Principe | Verdict | Analyse |
| --- | --- | --- |
| I. Propriété locale des données | ✅ **Conforme** | Point le plus sensible de la fonctionnalité, tranché par Q1. Le local-first conserve la consultation et la saisie hors connexion qu'exige le principe. Les données ne quittent pas un espace privé appartenant à l'utilisateur : le serveur est le sien, aucun service tiers n'intervient. La dépendance réseau est justifiée — la synchronisation entre appareils est impossible localement, par définition. |
| II. L'argent est exact | ✅ Conforme | Aucune arithmétique nouvelle. Les montants restent des entiers de centimes ; JSON les transporte comme tels et `parseDocument` refuse tout non-entier des deux côtés. |
| III. Tester là où cela compte | ✅ Conforme | Le magasin serveur persiste des montants : il tombe sous l'obligation de test, cas nominal, cas limites et entrée malformée compris. Idem pour le protocole de synchronisation et l'autorisation. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | La réponse du serveur est une frontière de confiance **au même titre** que `localStorage` : elle part d'`unknown` et passe par l'analyseur partagé. Le corps de requête reçu par le serveur également. Aucun transtypage, dans aucun des deux sens. |
| V. La documentation du framework prime | ✅ Conforme | Guides lus avant rédaction : gestionnaires de route, `cookies()`, `runtime`, `proxy`. Deux dépréciations relevées et respectées (R1, R4 de [research.md](./research.md)). |
| VI. Simplicité et YAGNI | ✅ Conforme | Aucune dépendance ajoutée. Un seul point d'entrée, deux méthodes. Fusion automatique, journal d'opérations, points d'entrée par entité et poussée temps réel sont explicitement écartés faute de besoin démontré. La seule extraction pratiquée (R5) a deux consommateurs réels dès aujourd'hui. |
| VII. Accessibilité et adaptabilité | ✅ Conforme | Les nouveaux états sont libellés en toutes lettres ; la boîte de dialogue de conflit est utilisable au clavier, avec focus visible. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts et commentaires en français ; identifiants, chemins de route et noms de fichiers en anglais, comme le reste du dépôt. |

**Aucun amendement constitutionnel n'est requis.** C'est une conséquence directe de Q1 : la
spécification avertissait qu'une bascule naïve vers un stockage distant aurait violé le principe I et
imposé de l'amender au préalable.

### Après la phase 1 — réévaluation

Aucun verdict ne change à l'issue de la conception. Trois points ont été vérifiés spécifiquement,
parce que ce sont ceux qu'une conception dérape le plus facilement :

- **Principe VI** — la conception n'a introduit aucun module au-delà de ceux annoncés : un magasin
  serveur, une autorisation, un client de synchronisation, un gestionnaire de route. Le contrat n'a
  pas gagné de point d'entrée en cours de route.
- **Principe IV** — l'enveloppe reçue du serveur (`revision`, `updatedAt`, `document`) est validée
  champ par champ, pas seulement le document qu'elle contient. Une enveloppe valide autour d'un
  document invalide, et l'inverse, sont deux cas traités.
- **Principe I** — vérifié en conception : aucun chemin de code ne rend une mutation locale
  dépendante d'une réponse du serveur. `appliquer()` écrit dans `localStorage` et notifie l'interface
  avant que la synchronisation ne soit seulement lancée.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/005-server-side-storage/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions Q1 à Q4 et compléments techniques
├── data-model.md        # Phase 1 — enveloppe persistée et état de synchronisation
├── quickstart.md        # Phase 1 — mise en service et validation
├── contracts/
│   ├── api-budget.md    # Contrat du point d'entrée HTTP
│   ├── authorization.md # Contrat d'autorisation d'un appareil
│   └── synchronisation.md # Protocole client : états, transitions, conflit
├── checklists/
│   └── requirements.md  # Existant
└── tasks.md             # Phase 2 — produit par /speckit-tasks
```

### Code source (racine du dépôt)

```text
src/
├── app/
│   ├── api/
│   │   └── budget/
│   │       └── route.ts              # NOUVEAU — GET et PUT du document central
│   ├── authorize/
│   │   └── page.tsx                  # NOUVEAU — échange du jeton contre un cookie
│   ├── layout.tsx                    # inchangé
│   └── page.tsx                      # inchangé
├── features/budget/
│   ├── budget-provider.tsx           # MODIFIÉ — état et déclenchement de synchronisation
│   ├── sync.ts                       # NOUVEAU — protocole client, pur et testable
│   ├── sync.test.ts                  # NOUVEAU
│   ├── sync.integration.test.tsx     # NOUVEAU — hors connexion, reprise, conflit
│   ├── types.ts                      # inchangé
│   ├── transfer.ts                   # inchangé
│   └── components/
│       ├── sync-status.tsx           # NOUVEAU — état textuel (principe VII)
│       ├── conflict-dialog.tsx       # NOUVEAU — choix explicite (EF-025)
│       ├── storage-notice.tsx        # MODIFIÉ — accueille les motifs de synchronisation
│       └── budget-view.tsx           # MODIFIÉ — pose les deux composants ci-dessus
└── lib/
    ├── budget-document.ts            # NOUVEAU — analyseur extrait de storage.ts (R5)
    ├── storage.ts                    # MODIFIÉ — adaptateur localStorage + métadonnées de sync
    ├── sync-metadata.ts              # NOUVEAU — révision de base et drapeau, clé distincte
    └── server/
        ├── budget-store.ts           # NOUVEAU — fichier JSON atomique, quarantaine, verrou
        ├── budget-store.test.ts      # NOUVEAU — sur répertoire temporaire réel
        ├── authorization.ts          # NOUVEAU — jeton, comparaison à temps constant
        └── authorization.test.ts     # NOUVEAU
```

### Fichiers hors `src/`

| Fichier | Changement |
| --- | --- |
| `.gitignore` | **Ajout de `data/`.** Vérifié à la planification : `.env*` y figure déjà, `data/` **non**. En l'état, le répertoire des données financières réelles serait versionné au premier `git add`. C'est une tâche de préparation, à faire **avant** que le magasin serveur n'écrive quoi que ce soit. |
| `.env.local` | Créé par l'utilisateur, jamais versionné. Porte `BUDGET_ACCESS_TOKEN` et `BUDGET_DATA_DIR`. |

**Décision de structure** : l'arborescence existante est conservée telle quelle — `src/app` pour le
routage, `src/features/budget` pour le domaine, `src/lib` pour l'outillage. Le seul ajout structurel
est `src/lib/server/`, dont le nom énonce l'invariant qui compte : **ce qui s'y trouve ne doit jamais
rejoindre le graphe client.** Ces modules touchent `node:fs` et lisent le secret d'accès ; les
importer depuis un composant client serait une fuite. Le répertoire rend la règle visible en revue.

## Décisions de conception

| # | Décision | Motif |
| --- | --- | --- |
| **D1** | L'unité de synchronisation est le **document entier**, pas l'entité ni l'opération. | Le fournisseur écrit déjà des documents complets. Supprime le journal d'opérations et rend la poussée idempotente (EF-019). |
| **D2** | `localStorage` reste la **copie de travail**, jamais un simple cache de lecture. | Principe I et EF-011 : le réseau n'est pas sur le chemin critique de la saisie. |
| **D3** | Verrou optimiste par `revision` entière, refus en **409** avec l'état courant en réponse. | EF-024, EF-025. Renvoyer l'état courant évite un aller-retour supplémentaire pour afficher le choix. |
| **D4** | Résolution de conflit **toujours manuelle**, deux choix explicites. | EF-025. Toute fusion automatique risquerait une perte que l'utilisateur n'aurait pas consentie. |
| **D5** | Métadonnées de synchronisation sous une **clé `localStorage` distincte** du budget. | Un contenu de synchronisation abîmé ne doit pas entraîner le budget en quarantaine. Les deux échecs sont indépendants. |
| **D6** | Autorisation vérifiée **dans chaque gestionnaire**, pas dans `proxy.ts`. | La documentation de la version installée l'exige (R4). |
| **D7** | **Fermeture par défaut** si `BUDGET_ACCESS_TOKEN` est absent. | Une erreur de configuration doit rendre l'application inutilisable, jamais publique. |
| **D8** | Écriture serveur **atomique** (fichier temporaire puis `rename`) sous **verrou en mémoire**. | Une coupure en plein enregistrement ne doit laisser ni fichier tronqué ni écriture à moitié appliquée (cas limite de la spécification). |
| **D9** | Contenu central illisible **mis en quarantaine, jamais écrasé**. | EF-008, récit 5. Transposition exacte du comportement déjà éprouvé côté navigateur. |
| **D10** | Analyseur **partagé** entre client et serveur, extrait dans `src/lib/budget-document.ts`. | Principe IV des deux côtés ; deux analyseurs divergeraient (R5). |
| **D11** | Aucune poussée serveur (ni SSE ni WebSocket) ; synchronisation sur montage, mutation, `online` et `visibilitychange`. | Explicitement hors périmètre ; ces quatre déclencheurs suffisent à CS-001. |

## Suivi de la complexité

> À remplir uniquement si le contrôle de conformité relève des violations à justifier.

Aucune violation. Le tableau reste vide : aucune dépendance ajoutée, aucun fondement de la pile
modifié, aucune abstraction introduite sans consommateur réel.

Un point est néanmoins **consigné comme limite assumée** plutôt que comme violation : pousser le
document entier à chaque salve de mutations représente de l'ordre de 600 Ko pour les 5 000 dépenses
de CS-005 (R7). C'est sans conséquence sur le réseau local visé. Si cela devenait gênant, la réponse
serait des points d'entrée par entité — les écrire aujourd'hui, sans besoin démontré, serait
précisément la généralité spéculative que le principe VI interdit.
