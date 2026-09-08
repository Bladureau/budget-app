# Plan d'implémentation : Tableau de bord — anneau, allocation quotidienne et journal

**Branche** : `003-daily-allowance-dashboard` | **Date** : 2026-09-06 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/003-daily-allowance-dashboard/spec.md`

> Branche Git réelle : `feat-002-income_and_subscription`. Aucune extension Git n'est installée.

## Résumé

Livrer la face quotidienne de l'application : saisir une dépense en quelques secondes, voir dans un
anneau ce qu'il reste pour le mois, savoir ce qu'on peut dépenser aujourd'hui, et parcourir ses
dépenses comme un relevé bancaire.

Deux décisions gouvernent ce plan.

**L'allocation quotidienne est dérivée, jamais stockée.** La spécification demande en EF-020 de
conserver, pour chaque jour écoulé, l'allocation applicable et le montant dépensé. La vérification
arithmétique menée en phase 0 montre que ces deux valeurs se déduisent intégralement du triplet
(montant disponible, dépenses antérieures, jours restants). Les stocker introduirait un défaut réel :
les jours où l'application n'est pas ouverte n'auraient aucun instantané, et le report afficherait des
trous. **EF-020 doit être amendée** ; c'est signalé au rapport et non contourné en silence.

**Le document persisté passe en version 2.** L'ajout de la collection `expenses` est purement
additif, et le contrat de stockage de 002 avait réservé cette migration dès l'origine. Le point de
contact avec la fonctionnalité 004 est unique et prévu : `FORMAT_VERSION` passe à 2 et la table des
versions du contrat d'export gagne une ligne. Rien d'autre dans l'export/import ne bouge.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19, Tailwind CSS 4. **Aucune
dépendance ajoutée** — ni bibliothèque de graphiques pour l'anneau, ni virtualisation pour le journal.

**Réutilisé des fonctionnalités livrées** :

| Élément existant | Rôle dans 003 |
| --- | --- |
| `Cents`, `parseAmountInput`, `formatCents`, `centsToInputValue`, `sumCents` | Toute la manipulation monétaire. |
| `daysInMonth`, `monthKeyOf`, `dayOfMonth`, `compareIso`, `isValidIsoDate` | Calendrier et jours restants. |
| `parseDocument`, `saveDocument`, `migrer` | Persistance, étendue en version 2. |
| `computeMonthlyBudget().remainingCents` | Montant disponible du mois (EF-009). |
| `BudgetProvider` | Accueille les dépenses et l'état du journal. |
| `transfer.ts` (004) | Suit automatiquement, à la version de format près. |

**Stockage** : `localStorage`, document versionné passant en version 2. Voir la décision D3 pour le
réexamen promis par la fonctionnalité 002 face au critère CS-008 (2 000 dépenses).

**Tests** : Vitest, React Testing Library, jsdom — déjà en place.

**Plateforme cible** : navigateurs de bureau et mobiles récents, rendu statique.

**Type de projet** : extension de l'application mono-page cliente existante.

**Objectifs de performance** : journal consultable sans attente perceptible à 2 000 dépenses
(CS-008) ; anneau et allocation recalculés à chaque mutation sans rafraîchissement manuel.

**Contraintes** : exactitude au centime (CS-003) ; la somme des allocations restantes n'excède jamais
le montant restant (CS-004) ; états identifiables sans la couleur (CS-009) ; utilisable au clavier et
à 200 % de zoom (CS-010) ; saisie d'une dépense en moins de dix secondes (CS-001).

**Échelle / portée** : plusieurs milliers de dépenses sur plusieurs années. C'est le premier volume
significatif du projet, d'où le réexamen du stockage.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

Évaluation au regard de `.specify/memory/constitution.md` v1.1.0.

| Principe | Statut | Comment il est tenu dans ce plan |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Aucune connexion bancaire, aucun import de relevé, aucune détection automatique. « Comme une application de banque » porte sur la présentation du journal, jamais sur la synchronisation. Toutes les dépenses sont saisies à la main. |
| II. L'argent est exact | ✅ Conforme | La division du montant restant par les jours restants est le point de dérive d'arrondi le plus exposé du projet. La règle est fixée (troncature au centime inférieur, décision D2) et **vérifiée par calcul sur 20 000 tirages** : la somme des allocations restantes n'excède jamais le disponible. |
| III. Tester là où cela compte | ✅ Conforme | `expenses.ts` — allocation, report, totaux, agrégation du journal — est de la logique monétaire pure : tests obligatoires, cas limites de la spécification inclus (dernier jour du mois, reste nul ou négatif, montant non divisible). La migration 1→2 est également sous obligation de test : une migration qui perd des données est l'anomalie que le principe III vise en priorité. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Le document v2 est validé à l'exécution par les analyseurs existants, étendus à `expenses`. Aucun transtypage. |
| V. La documentation du framework prime sur la mémoire | ✅ Conforme | Docs relues : `05-server-and-client-components.md` (frontière cliente inchangée) et `02-guides/testing/vitest.md`. Aucune page de la version installée ne traite de la virtualisation de liste ni de `IntersectionObserver` : ce sont des API de plateforme. Consigné en D6. |
| VI. Simplicité et YAGNI | ✅ Conforme | Zéro dépendance ajoutée : anneau en SVG inline, pagination du journal en trente lignes. L'allocation est dérivée plutôt que stockée, ce qui supprime une entité entière du modèle. |
| VII. Accessibilité et adaptabilité par défaut | ✅ Conforme | États de l'anneau portés par du texte, `prefers-reduced-motion` respecté, cibles tactiles de 44 px, lisible dès 360 px et à 200 % de zoom. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts et commentaires en français ; identifiants en anglais. |

**Verdict avant phase 0** : aucune violation. Suivi de complexité vide.

**Verdict après phase 1** : réévalué, aucune violation introduite. Le modèle de données ajoute une
seule entité persistée (`Expense`) et **en retire une** par rapport à la spécification (la journée
budgétaire, devenue dérivée). Voir la note en fin de [data-model.md](./data-model.md).

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/003-daily-allowance-dashboard/
├── spec.md              # Spécification (déjà présente)
├── plan.md              # Ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── calculs-depenses.md
│   ├── stockage-v2.md
│   └── interface.md
├── checklists/
│   └── requirements.md  # Déjà présente
└── tasks.md             # Sortie de /speckit-tasks — NON créée ici
```

### Code source (racine du dépôt)

Fichiers **ajoutés** :

```text
src/
└── features/budget/
    ├── expenses.ts                       # Allocation, report, agrégation — logique pure
    ├── expenses.test.ts                  # Sous obligation de test (principe III)
    ├── dashboard.test.tsx                # Intégration : saisie, anneau, journal
    └── components/
        ├── expense-form.tsx              # Saisie rapide d'une dépense
        ├── expense-detail.tsx            # Détail, modification, suppression
        ├── expense-journal.tsx           # Journal groupé par jour, recherche, filtre
        ├── budget-ring.tsx               # Anneau du reste mensuel (SVG inline)
        └── daily-allowance.tsx           # Allocation du jour et report de la veille
```

Fichiers **modifiés** :

```text
src/
├── features/budget/
│   ├── types.ts                          # Expense, DOCUMENT_VERSION → 2
│   ├── budget-provider.tsx               # Actions addExpense, updateExpense, removeExpense
│   ├── messages.ts                       # Messages de saisie d'une dépense
│   ├── transfer.ts                       # FORMAT_VERSION → 2 (unique point de contact avec 004)
│   ├── transfer.test.ts                  # Test activant EF-024 de la fonctionnalité 004
│   └── components/budget-view.tsx        # Anneau et allocation en tête, journal ensuite
└── lib/
    ├── storage.ts                        # Analyseur d'Expense, migration 1 → 2
    └── storage.test.ts                   # Tests de migration et de l'analyseur d'Expense
```

Les deux fichiers de test existants sont **étendus**, jamais réécrits : les tests des fonctionnalités
002 et 004 qu'ils contiennent doivent continuer à passer sans modification.

**Décision de structure** : `expenses.ts` est distinct de `calculs.ts` plutôt que d'y être ajouté.
`calculs.ts` compte déjà quatorze fonctions exportées et couvre les revenus, les abonnements et le
budget mensuel ; y verser l'allocation quotidienne et l'agrégation du journal en ferait un module
fourre-tout. La frontière est nette : `calculs.ts` répond « que prévoit ce mois ? », `expenses.ts`
répond « où en suis-je aujourd'hui ? ».

La frontière `"use client"` reste celle de 002 : les nouveaux composants sont importés depuis
`BudgetProvider` et rejoignent le graphe client sans nouvelle directive.

## Suivi de complexité

> À remplir uniquement si le contrôle de conformité relève des violations à justifier.

Aucune violation relevée. Ce tableau reste vide.

## Écart signalé avec la spécification

**EF-020 doit être amendée.** Elle impose de conserver, pour chaque jour écoulé du mois, l'allocation
applicable et le montant dépensé. Ce plan ne l'implémente pas, et ce n'est pas un oubli :

- ces valeurs sont **intégralement dérivables** de données déjà présentes, ce que la phase 0 vérifie
  par le calcul sur les quatre scénarios de la spécification ;
- les stocker créerait des **trous** les jours où l'application n'est pas ouverte, là où la dérivation
  donne toujours une réponse ;
- elles imposeraient une **écriture à chaque ouverture**, contraire à la règle selon laquelle aucune
  écriture n'a lieu en dehors d'une action utilisateur.

Le comportement attendu par le récit 3 et ses neuf scénarios d'acceptation est intégralement rendu.
Seul le moyen change. Le rapport de fin de commande détaille la correction proposée.

## Séquencement

003 est la dernière fonctionnalité livrable indépendamment, et elle **débloque 001** en apportant la
saisie des dépenses que les enveloppes budgétaires attendent depuis leur spécification.

Ordre des travaux à l'intérieur de la fonctionnalité : la migration du document et la saisie d'abord,
puis l'anneau, puis l'allocation, puis le journal. La migration en premier parce que tout le reste en
dépend, et parce qu'une migration livrée tardivement est une migration testée tardivement.

Impact sur 004, unique et prévu : `FORMAT_VERSION` passe à 2 et la table des versions de
`specs/004-data-export-import/contracts/fichier-export.md` gagne une ligne. Les 43 tests de l'export
et de l'import doivent continuer à passer sans modification — c'est le contrôle qui prouve que
l'extension du document était bien additive.
