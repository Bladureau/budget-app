# Plan d'implémentation : Revenus, abonnements prévisionnels et budget mensuel

**Branche** : `002-income-subscriptions-budget` | **Date** : 2026-09-05 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/002-income-subscriptions-budget/spec.md`

> Branche Git réelle au moment de la planification : `master`. Aucune extension Git n'est installée,
> aucune branche dédiée n'a donc été créée par le flux Spec Kit.

## Résumé

Livrer la première fonctionnalité réellement utilisable de l'application : saisir des revenus
(ponctuels et récurrents), déclarer des abonnements avec leur périodicité, et afficher pour chaque
mois le total des revenus, le total des charges engagées et le reste disponible, avec navigation
entre les mois et anticipation sur douze mois.

L'approche technique retenue est celle d'une application entièrement cliente à l'intérieur de l'App
Router : aucune base de données, aucun serveur applicatif, aucune route d'API. L'état est persisté
dans un unique document versionné en `localStorage`, validé à l'exécution à chaque lecture. Toute la
logique monétaire et calendaire est isolée dans des modules purs (`src/lib/`), testables sans rendu,
qui portent l'obligation de test du principe III. Les montants sont manipulés exclusivement en
centimes entiers, et les échéances des abonnements sont dérivées par calcul plutôt que stockées.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, cible ES2017, React 19.2.8

**Dépendances principales** : Next.js 16.3.4 (App Router, Turbopack), React 19, Tailwind CSS 4.
Aucune dépendance d'exécution supplémentaire n'est ajoutée par cette fonctionnalité.

**Stockage** : `localStorage` du navigateur, un unique document JSON versionné sous la clé
`budget-app:v1`. Validé à l'exécution à chaque lecture, jamais transtypé. Voir
[contracts/stockage.md](./contracts/stockage.md).

**Tests** : Vitest + React Testing Library + jsdom + `vite-tsconfig-paths`, conformément au guide
`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. Ajout d'un script `npm run test`.
Ces dépendances sont de développement uniquement.

**Plateforme cible** : navigateurs de bureau et mobiles récents, rendus par Next.js en mode
statique. Aucune exécution serveur requise après la construction.

**Type de projet** : application web mono-page à l'intérieur de l'App Router, sans backend.

**Objectifs de performance** : affichage du budget d'un mois sans attente perceptible avec au moins
50 éléments récurrents et ponctuels combinés (CS-002). Projection de douze mois calculée à
l'ouverture de la vue d'anticipation sans blocage de l'interface.

**Contraintes** : fonctionnement hors ligne complet (CS-008, principe I) ; exactitude au centime sur
toutes les totalisations et conversions de périodicité (CS-002, principe II) ; états du budget
distinguables sans la couleur (CS-007, principe VII) ; utilisable dès 360 px de large.

**Échelle / portée** : utilisateur unique, ordre de grandeur d'une dizaine de revenus et d'une
vingtaine d'abonnements, sur plusieurs années de mois consultables. Volume de données très faible
(quelques dizaines de kilo-octets).

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

Évaluation au regard de `.specify/memory/constitution.md` v1.1.0.

| Principe | Statut | Comment il est tenu dans ce plan |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Aucun serveur, aucune route d'API, aucune dépendance réseau. Tout est en `localStorage`. Aucun SDK de télémétrie. L'application fonctionne hors ligne par construction. |
| II. L'argent est exact | ✅ Conforme | Type `Centimes` (entier signé) unique représentation d'un montant. Aucun `parseFloat` sur un montant : la saisie passe par un analyseur dédié qui produit des centimes. Formatage uniquement à l'affichage via `Intl.NumberFormat`. Règle d'arrondi de la conversion de périodicité énoncée dans [research.md](./research.md) et [contracts/calculs.md](./contracts/calculs.md). |
| III. Tester là où cela compte | ✅ Conforme | `src/lib/montant`, `src/lib/date`, `src/lib/stockage` et `src/features/budget/calculs` sont de la logique monétaire : tests obligatoires, cas nominal + bornes (zéro, négatif, montant maximal réaliste) + entrée malformée. Les composants de présentation sans calcul peuvent être livrés sans test. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | `strict` déjà actif. Les lectures `localStorage` sont validées à l'exécution par des analyseurs écrits à la main, puis typées depuis le résultat validé — jamais `as`. `npm run build` et `npm run lint` sans erreur avant clôture. |
| V. La documentation du framework prime sur la mémoire | ✅ Conforme | Docs lues avant rédaction : `01-getting-started/05-server-and-client-components.md` (les API navigateur imposent un Composant Client), `02-guides/testing/vitest.md` (mise en place des tests), `02-guides/interactive-apps.md` (écarté : il suppose un backend, ce qui ne s'applique pas ici). Décisions consignées dans [research.md](./research.md). |
| VI. Simplicité et YAGNI | ✅ Conforme | Zéro dépendance d'exécution ajoutée : ni bibliothèque de dates, ni bibliothèque de validation, ni gestionnaire d'état. Justifications dans [research.md](./research.md). Pas de couche de dépôt abstraite : un seul module de stockage concret. |
| VII. Accessibilité et adaptabilité par défaut | ✅ Conforme | États du budget portés par du texte en plus de la couleur (EF-016), formulaires étiquetés, erreurs textuelles, navigation au clavier, lisible dès 360 px et à 200 % de zoom. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts de planification en français. Identifiants de code, noms de fichiers et de répertoires en anglais, conformément à l'exception. Textes d'interface en français. |

**Verdict avant phase 0** : aucune violation. Aucune entrée dans le suivi de complexité.

**Verdict après phase 1** : réévalué à l'issue de la conception, aucune violation introduite. Le
modèle de données conserve les montants en centimes, la validation reste à l'exécution, et aucune
dépendance n'a été ajoutée. Voir la note de réévaluation en fin de [data-model.md](./data-model.md).

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/002-income-subscriptions-budget/
├── spec.md              # Spécification (déjà présente)
├── plan.md              # Ce fichier (sortie de /speckit-plan)
├── research.md          # Sortie de la phase 0
├── data-model.md        # Sortie de la phase 1
├── quickstart.md        # Sortie de la phase 1
├── contracts/           # Sortie de la phase 1
│   ├── stockage.md
│   ├── calculs.md
│   └── interface.md
├── checklists/
│   └── requirements.md  # Déjà présente
└── tasks.md             # Sortie de /speckit-tasks — NON créée ici
```

### Code source (racine du dépôt)

```text
src/
├── app/
│   ├── layout.tsx                    # Existant — métadonnées et polices à mettre à jour
│   ├── page.tsx                      # Coquille serveur, rend la vue budgétaire cliente
│   └── globals.css                   # Existant
├── features/
│   └── budget/
│       ├── components/
│       │   ├── month-navigator.tsx   # Navigation entre les mois
│       │   ├── month-summary.tsx     # Revenus, charges engagées, reste disponible
│       │   ├── income-list.tsx       # Liste et saisie des revenus
│       │   ├── income-form.tsx
│       │   ├── subscription-list.tsx # Liste et saisie des abonnements
│       │   ├── subscription-form.tsx
│       │   ├── charge-breakdown.tsx  # Ventilation des charges du mois
│       │   ├── forecast-view.tsx     # Anticipation sur douze mois
│       │   ├── upcoming-dues.tsx     # Prochaines échéances d'abonnement
│       │   └── storage-notice.tsx    # Bandeaux : stockage illisible, écriture impossible
│       ├── budget-provider.tsx       # Frontière cliente : état, chargement, écriture
│       ├── types.ts                  # Types du domaine partagés (voir data-model.md)
│       ├── calculs.ts                # Logique métier pure — sous obligation de test
│       └── calculs.test.ts
└── lib/
    ├── money.ts                      # Type Centimes, analyse, formatage
    ├── money.test.ts
    ├── date.ts                       # Mois, échéances, bornes de mois
    ├── date.test.ts
    ├── storage.ts                    # Lecture/écriture/validation du document versionné
    └── storage.test.ts
```

**Décision de structure** : projet unique, sans découpage frontend/backend, puisqu'il n'y a pas de
backend. Le code est organisé par fonctionnalité sous `src/features/budget/`, conformément au motif
d'organisation par domaine décrit dans la documentation Next.js installée, avec les primitives
transverses sous `src/lib/`. L'alias `@/*` déjà configuré dans `tsconfig.json` est utilisé pour tous
les imports.

La frontière `"use client"` est posée au seul niveau de `budget-provider.tsx`. `src/app/page.tsx`
reste un Composant Serveur qui ne fait que rendre le fournisseur — application du principe
« `"use client"` au composant le plus restreint qui en a besoin » de la constitution, et de la règle
de la documentation Next.js selon laquelle les API navigateur comme `localStorage` exigent un
Composant Client.

## Suivi de complexité

> À remplir uniquement si le contrôle de conformité relève des violations à justifier.

Aucune violation relevée. Ce tableau reste vide.

## Séquencement inter-fonctionnalités

Ordre demandé et retenu : **002 → 003 → 001**.

- **002 (celle-ci)** pose les fondations partagées : `lib/money`, `lib/date`, `lib/storage`, le
  document persisté versionné et la notion de mois budgétaire. Elle ne dépend d'aucune autre
  fonctionnalité.
- **003** ajoutera la saisie des dépenses, l'anneau, l'allocation quotidienne et le journal. Elle
  consommera le reste disponible calculé ici (EF-009 de 003) et étendra le document persisté en
  version 2.
- **001** ajoutera enfin les plafonds par catégorie, en s'appuyant sur les dépenses introduites par
  003.

Conséquence pour cette fonctionnalité : le contrat de stockage est conçu dès maintenant pour être
étendu par migration versionnée, et les modules `lib/` sont écrits comme des primitives partagées et
non comme du code interne à la vue budgétaire.
