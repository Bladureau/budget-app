# Phase 0 — Recherche et décisions techniques

**Fonctionnalité** : `002-income-subscriptions-budget` | **Date** : 2026-09-05

Aucun marqueur « NEEDS CLARIFICATION » ne subsistait dans le contexte technique du plan. Ce document
consigne les décisions prises, leur justification et les alternatives écartées.

Sources consultées dans la documentation de la version installée (`node_modules/next/dist/docs/`),
conformément au principe V :

- `01-app/01-getting-started/05-server-and-client-components.md`
- `01-app/02-guides/testing/vitest.md` et `01-app/02-guides/testing/index.md`
- `01-app/02-guides/interactive-apps.md`
- `01-app/01-getting-started/02-project-structure.md`

---

## D1 — Représentation des montants

**Décision** : un montant est un entier signé de centimes, exposé par le type `Cents` défini dans
`src/lib/money.ts`. Aucune valeur monétaire décimale n'existe hors de la couche d'affichage. La
saisie utilisateur passe par `parseAmountInput()`, qui accepte la virgule et le point, refuse plus de
deux décimales, et renvoie un résultat explicite succès/échec plutôt que `NaN`. Le formatage se fait
par `formatCents()`, seul point d'appel de `Intl.NumberFormat('fr-FR', { style: 'currency', currency:
'EUR' })`.

**Justification** : exigence directe du principe II de la constitution. Un entier de centimes couvre
sans perte des montants jusqu'à environ 90 000 milliards d'euros avec les entiers sûrs de
JavaScript, très au-delà de tout usage réaliste. Interdire `parseFloat` sur un montant supprime la
classe entière des erreurs de virgule flottante.

**Alternatives écartées** :

- *Nombre décimal JavaScript* — écarté par le principe II : `0,1 + 0,2 ≠ 0,3` fausse le registre dès
  les premières additions.
- *Bibliothèque de décimales (`decimal.js`, `dinero.js`)* — écartée par le principe VI. Elle apporte
  la division exacte et le multi-devises, dont aucun n'est requis ici : les seules opérations sont
  l'addition, la soustraction et une division par un petit entier (conversion de périodicité), toutes
  couvertes par des entiers et une règle d'arrondi énoncée. À reconsidérer si le multi-devises entre
  un jour au périmètre.

---

## D2 — Règle d'arrondi de la conversion de périodicité

**Décision** : le coût mensuel moyen d'un abonnement (EF-009) vaut `arrondi_au_centime_le_plus_proche
(montant × 12 ÷ mois_par_période)`, avec départage à l'entier supérieur pour les demi-centimes. Cette
valeur est un **indicateur d'affichage seulement** : elle n'entre jamais dans le calcul du total des
charges engagées ni du reste disponible, qui n'additionnent que des échéances réelles non arrondies.

**Justification** : le principe II exige que les règles d'arrondi soient énoncées au point de
division. En cantonnant la valeur arrondie à l'affichage, aucune erreur d'arrondi ne peut se propager
dans un total, ce qui satisfait CS-002 sans effort de compensation. C'est aussi l'hypothèse déjà
inscrite dans la spécification : les échéances sont imputées au mois où elles tombent, pas lissées.

**Alternative écartée** : *lisser les abonnements annuels sur douze mois dans le total du mois* —
écartée par la spécification elle-même, et techniquement plus coûteuse puisqu'il faudrait
redistribuer le reste de division pour que la somme des douze mois retombe exactement sur le montant
annuel.

---

## D3 — Mécanisme de persistance

**Décision** : `localStorage`, une seule clé `budget-app:v1`, contenant un document JSON versionné
décrit par [contracts/stockage.md](./contracts/stockage.md). Lecture au montage via
`useSyncExternalStore`, écriture intégrale du document à chaque mutation.

**Justification** : le volume attendu est d'une dizaine de revenus et d'une vingtaine d'abonnements,
soit quelques kilo-octets — trois ordres de grandeur sous la limite usuelle de 5 Mo. L'API synchrone
supprime toute gestion d'asynchronisme dans la logique métier, ce qui rend les tests plus simples et
sert le principe VI. Le principe I est satisfait : rien ne quitte l'appareil.

**Alternatives écartées** :

- *IndexedDB* — écartée pour l'instant par le principe VI : son intérêt (volumes importants,
  requêtes indexées, écritures partielles) ne se manifeste pas à cette échelle, et son API
  asynchrone contaminerait toute la logique de calcul. **À réexaminer lors de la fonctionnalité
  003**, dont le critère CS-008 vise 2 000 dépenses : le volume resterait acceptable (de l'ordre de
  300 Ko), mais la réécriture intégrale du document à chaque saisie deviendrait discutable. Le
  contrat de stockage est versionné précisément pour rendre cette bascule possible sans perte.
- *Fichier exporté sur le disque comme source de vérité* — écartée : impose une action manuelle à
  chaque modification, incompatible avec CS-001.
- *Base de données côté serveur* — écartée par le principe I.

---

## D4 — Validation des données lues

**Décision** : analyseurs écrits à la main dans `src/lib/storage.ts`, une fonction par entité, qui
prennent `unknown` et renvoient un résultat explicite `{ ok: true, value } | { ok: false, reason }`.
Aucun transtypage `as`. Un document illisible, d'une version inconnue ou invalide n'est jamais
partiellement appliqué : l'application démarre sur un état vide et conserve intact le contenu brut
sous une clé de quarantaine `budget-app:corrupted:<horodatage>`.

**Justification** : le principe IV impose la validation à l'exécution aux frontières de confiance, et
`localStorage` en est une — son contenu peut avoir été écrit par une version antérieure, modifié à la
main ou tronqué. La quarantaine plutôt que l'écrasement respecte la contrainte de la constitution
selon laquelle une migration en échec doit laisser les données antérieures intactes.

**Alternative écartée** : *Zod ou Valibot* — écartée par le principe VI. Le schéma comporte deux
entités et une douzaine de champs ; les analyseurs manuels représentent une centaine de lignes
entièrement couvertes par les tests qu'impose de toute façon le principe III. Une bibliothèque de
schéma deviendrait justifiable si l'import de fichiers externes (relevés bancaires) entrait au
périmètre.

---

## D5 — Calcul des dates et des échéances

**Décision** : module `src/lib/date.ts` écrit à la main, exposant un jeu réduit d'opérations :
`monthKey()`, `startOfMonth()`, `endOfMonth()`, `daysInMonth()`, `addMonthsClamped()` et
`occurrencesInMonth()`. Le rattachement d'une échéance dont le jour n'existe pas dans le mois se fait
au dernier jour du mois (EF-013), règle implémentée une seule fois dans `addMonthsClamped()`.

**Justification** : le besoin réel se limite à six opérations sur des dates calendaires locales, sans
fuseaux ni internationalisation de calendrier. Le principe VI demande de peser une dépendance contre
l'écriture de la portion nécessaire ; cette portion fait quelques dizaines de lignes et tombe sous
l'obligation de test du principe III, qui couvrira précisément les pièges (31 janvier → 28 ou
29 février, années bissextiles, passage d'année, changement d'heure saisonnier).

**Alternative écartée** : *`date-fns` ou `Temporal`* — `date-fns` est écartée pour l'instant par le
principe VI ; c'est le repli désigné si la logique de récurrence se révèle plus retorse que prévu à
l'implémentation. L'API `Temporal` n'est pas retenue car sa disponibilité n'est pas acquise sur la
cible sans polyfill, lequel serait lui-même une dépendance.

---

## D6 — Frontière serveur / client

**Décision** : `src/app/page.tsx` reste un Composant Serveur et ne fait que rendre
`<BudgetProvider>`, seul fichier portant la directive `"use client"`. Tous les composants de la
fonctionnalité sont importés depuis ce fournisseur et se retrouvent donc dans le graphe client.
L'état initial est lu par `useSyncExternalStore` et non pendant le rendu.

**Justification** : la documentation installée
(`01-getting-started/05-server-and-client-components.md`) indique explicitement que les API
navigateur — `localStorage` y est citée nommément — relèvent des Composants Client. Elle précise
aussi qu'une fois un fichier marqué `"use client"`, ses imports rejoignent le paquet client, ce qui
rend inutile de répéter la directive. Lire `localStorage` pendant le rendu provoquerait une
divergence d'hydratation, le serveur ne disposant pas de la valeur ; `useSyncExternalStore` fournit
un instantané serveur distinct et supprime le problème.

**Alternative écartée** : *le guide `interactive-apps.md`* décrit les Fonctions Serveur, `refresh()`
et l'interface optimiste. Il a été lu puis **écarté comme inapplicable** : il suppose une base de
données côté serveur, que le principe I exclut ici. Aucune Fonction Serveur n'est utilisée dans cette
fonctionnalité.

---

## D7 — Gestion de l'état applicatif

**Décision** : un contexte React unique exposé par `budget-provider.tsx`, avec un réducteur pour les
mutations et des valeurs dérivées calculées par les fonctions pures de
`src/features/budget/calculs.ts`. Aucune bibliothèque de gestion d'état.

**Justification** : l'état tient en deux collections et un mois sélectionné. Le principe VI proscrit
une bibliothèque d'état non justifiée par un besoin démontré. Séparer les mutations (réducteur) des
dérivations (fonctions pures) permet de tester tout le calcul budgétaire sans rendu, ce que le
principe III exige.

**Alternative écartée** : *Zustand, Redux, Jotai* — écartées faute de besoin présent : ni état
partagé entre routes distantes, ni middleware, ni voyage dans le temps.

---

## D8 — Outillage de test

**Décision** : Vitest, React Testing Library, jsdom et `vite-tsconfig-paths`, en dépendances de
développement, avec un `vitest.config.mts` à la racine et un script `npm run test`. Les tests de
`src/lib/**` et `src/features/budget/calculs.ts` sont des tests unitaires purs ; les composants de
formulaire sont couverts par des tests de rendu ciblés.

**Justification** : c'est la mise en place documentée par la version installée
(`02-guides/testing/vitest.md`), dont la commande d'installation et le fichier de configuration ont
été relevés tels quels. Le principe III rend ces tests obligatoires sur la logique monétaire ; il faut
donc un exécuteur, et celui que documente le framework installé est le choix par défaut légitime.

**Note relevée dans la documentation** : Vitest ne prend pas en charge les Composants Serveur
`async`. Cette fonctionnalité n'en comporte aucun, la limite est donc sans effet ici.

**Alternative écartée** : *Jest* — également documenté, mais Vitest partage la chaîne Vite et la
résolution de `tsconfig`, ce qui réduit la configuration. *Playwright* — pertinent pour un parcours
de bout en bout ultérieur, hors périmètre de cette fonctionnalité.

---

## D9 — Formatage et langue de l'interface

**Décision** : textes d'interface en français ; montants formatés par `Intl.NumberFormat('fr-FR')` en
euros ; dates par `Intl.DateTimeFormat('fr-FR')` au format `JJ/MM/AAAA`. Un seul point de formatage
par type, exposé par `src/lib/money.ts` et `src/lib/date.ts`.

**Justification** : conforme à l'hypothèse de la spécification et au principe VIII pour les artefacts
de projet. Passer par `Intl` évite d'écrire un formateur monétaire à la main, ce qui serait
précisément le genre de code où l'arrondi dérape.

---

## Synthèse des dépendances ajoutées

| Dépendance | Type | Justification au regard du principe VI |
| --- | --- | --- |
| `vitest` | développement | Exécuteur exigé par l'obligation de test du principe III ; mise en place documentée par le framework installé. |
| `@vitejs/plugin-react` | développement | Requis par la configuration Vitest documentée. |
| `jsdom` | développement | Environnement de rendu requis pour les tests de composants. |
| `@testing-library/react`, `@testing-library/dom` | développement | Rendu et interrogation des composants dans les tests. |
| `vite-tsconfig-paths` | développement | Résolution de l'alias `@/*` dans les tests, tel que documenté. |

**Aucune dépendance d'exécution n'est ajoutée par cette fonctionnalité.**
