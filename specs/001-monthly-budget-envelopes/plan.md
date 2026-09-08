# Plan d'implémentation : Enveloppes budgétaires mensuelles

**Branche** : `001-monthly-budget-envelopes` | **Date** : 2026-09-06 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/001-monthly-budget-envelopes/spec.md`

> Branche Git réelle : `feat-002-income_and_subscription`. Aucune extension Git n'est installée.

## Résumé

Livrer la dernière fonctionnalité spécifiée du projet : plafonner la dépense par catégorie et par
mois, suivre la consommation réelle de chaque enveloppe, et alerter avant et pendant le dépassement.

Cette spécification a été écrite **avant** que la saisie des dépenses n'existe. Elle supposait un
modèle de transaction plus riche que celui qui a finalement été construit par la fonctionnalité 003.
La confrontation au code réel fait apparaître **deux exigences à amender** et **une hypothèse à
corriger** — détaillées plus bas et signalées au rapport plutôt que contournées en silence.

Sur le fond, l'implémentation est directe : une enveloppe est un plafond attaché à un couple
(catégorie, mois) ; tout le reste — dépensé, restant, état, ventilation — est **dérivé** des dépenses
déjà en place. Aucun total n'est stocké.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19, Tailwind CSS 4. **Aucune
dépendance ajoutée** — quatrième fonctionnalité consécutive.

**Réutilisé des fonctionnalités livrées** :

| Élément existant | Rôle dans 001 |
| --- | --- |
| `Expense` et sa collection (003) | La matière première : ce que les enveloppes mesurent. |
| `expensesInMonth`, `sumCents` | Agrégation par mois et totalisation exacte. |
| `parseDocument`, `saveDocument`, `migrer` | Persistance, étendue en version 3. |
| `monthKeyOf`, `addMonthsToKey`, `compareIso` | Mois et navigation. |
| `BudgetProvider`, `MonthNavigator` | État et navigation entre les mois, déjà en place. |
| `transfer.ts` (004) | Suit à la version de format près, comme pour 003. |

**Stockage** : `localStorage`, document versionné passant en **version 3**. Ajout d'une collection
`envelopes`, migration purement additive.

**Tests** : Vitest, React Testing Library, jsdom — déjà en place.

**Type de projet** : extension de l'application mono-page cliente existante.

**Objectifs de performance** : recalcul des enveloppes sans attente perceptible sur un mois d'au
moins 200 dépenses (CS-003).

**Contraintes** : exactitude au centime (CS-003) ; états identifiables sans la couleur (CS-006) ;
les plafonds d'un mois n'altèrent jamais un autre mois (CS-007) ; définition de cinq plafonds en
moins de deux minutes (CS-001).

**Échelle / portée** : quelques dizaines d'enveloppes par mois au plus. Volume négligeable devant
celui des dépenses.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

Évaluation au regard de `.specify/memory/constitution.md` v1.1.0.

| Principe | Statut | Comment il est tenu dans ce plan |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Aucune dépendance réseau ajoutée. Les enveloppes vivent dans le même document local. |
| II. L'argent est exact | ✅ Conforme | Aucune division n'est introduite : les enveloppes additionnent et soustraient. Le seul quotient est le taux de consommation, cantonné à l'affichage et protégé de la division par zéro (plafond nul). |
| III. Tester là où cela compte | ✅ Conforme | `envelopes.ts` agrège des montants : tests obligatoires, cas limites de la spécification inclus (plafond à zéro, catégorie supprimée, dépense datée hors du mois). La migration 2 → 3 est également sous obligation de test. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | `Envelope` validée à l'exécution par l'analyseur existant, étendu. Aucun transtypage. |
| V. La documentation du framework prime sur la mémoire | ✅ Conforme | Aucun motif Next.js nouveau : la frontière cliente, la navigation entre mois et les composants suivent ce qui est déjà en place et documenté. Rien à relire au-delà de ce qui l'a été pour 002 et 003. |
| VI. Simplicité et YAGNI | ✅ Conforme | Zéro dépendance. Aucun total stocké : dépensé, restant et état sont dérivés. Le report d'enveloppe et les périodes personnalisées restent hors périmètre. |
| VII. Accessibilité et adaptabilité par défaut | ✅ Conforme | Les quatre états d'enveloppe sont portés par du texte (EF-017), la progression est plafonnée, la synthèse annonce le nombre d'enveloppes en dépassement. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts et commentaires en français ; identifiants en anglais. |

**Verdict avant phase 0** : aucune violation. Suivi de complexité vide.

**Verdict après phase 1** : réévalué, aucune violation introduite. Une seule entité persistée est
ajoutée, et aucun montant dérivé n'est stocké. Voir la note en fin de [data-model.md](./data-model.md).

## Écarts signalés avec la spécification

Cette spécification a été rédigée en premier, sur un modèle de transaction hypothétique. Le modèle
réellement construit par la fonctionnalité 003 est plus étroit — délibérément, par application du
principe VI. Trois points en découlent.

### 1. EF-009 est inapplicable en l'état — remboursements et montants négatifs

EF-009 demande que « les remboursements et les montants de dépense négatifs » diminuent le montant
dépensé d'une enveloppe. Or `Expense.amountCents` est validé **strictement positif** dans
`src/lib/storage.ts` : un montant négatif est refusé à la saisie comme à la relecture.

**Recommandation : amender EF-009 pour placer les remboursements hors périmètre**, et ouvrir une
fonctionnalité dédiée si le besoin se confirme. Les autoriser maintenant supposerait de rouvrir la
validation monétaire de 003, donc l'anneau, l'allocation quotidienne et le journal — un changement de
modèle disproportionné au regard d'un besoin qui n'a jamais été exprimé autrement que par cette
phrase, écrite avant que les dépenses n'existent.

Ce plan **n'implémente pas EF-009** et le dit.

### 2. EF-008 est satisfaite par construction — et devient vacante

EF-008 demande d'exclure « les écritures de revenu et de virement » du calcul des enveloppes. Le
modèle de 003 ne comporte aucun discriminant de type : une `Expense` **est** une dépense, les revenus
sont une entité distincte et les virements n'existent pas.

L'exigence est donc satisfaite sans qu'aucune ligne ne lui corresponde. **Recommandation : la
reformuler** pour dire que les enveloppes ne mesurent que les dépenses, ou la retirer.

### 3. Les catégories sont du texte libre, pas une liste gérée

L'hypothèse de la spécification — « les catégories existent déjà sous forme de liste gérée par
l'utilisateur » — ne s'est pas réalisée : 003 a fait de `category` une chaîne libre et facultative.

**Conséquence assumée, sans amendement nécessaire** : une enveloppe référence une catégorie par son
texte. Le cas limite que la spécification anticipait — « une catégorie est renommée ou supprimée
alors que des limites la référencent » — devient le cas courant, et le plan le traite explicitement
(voir décision D3). Les dépenses sans catégorie alimentent le regroupement « Non budgété »
d'EF-012, ce qui donne à ce dernier un rôle plus important que prévu.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/001-monthly-budget-envelopes/
├── spec.md              # Spécification (déjà présente)
├── plan.md              # Ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── calculs-enveloppes.md
│   ├── stockage-v3.md
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
    ├── envelopes.ts                      # Enveloppes, états, ventilation — logique pure
    ├── envelopes.test.ts                 # Sous obligation de test (principe III)
    ├── envelopes.integration.test.tsx    # Intégration : saisie d'un plafond, alerte, report
    └── components/
        ├── envelope-list.tsx             # Enveloppes du mois, progression et états
        ├── envelope-form.tsx             # Définir, modifier, supprimer un plafond
        └── envelope-summary.tsx          # Synthèse : prévu, dépensé, dépassements
```

Fichiers **modifiés** :

```text
src/
├── features/budget/
│   ├── types.ts                          # Envelope, DOCUMENT_VERSION → 3
│   ├── budget-provider.tsx               # setEnvelopeLimit, removeEnvelope, copyEnvelopesFrom
│   ├── messages.ts                       # Libellés des quatre états d'enveloppe
│   ├── transfer.ts                       # FORMAT_VERSION → 3
│   ├── transfer.test.ts                  # Témoins portés en version 3
│   └── components/budget-view.tsx        # Section des enveloppes
└── lib/
    ├── storage.ts                        # Analyseur d'Envelope, migration 2 → 3
    └── storage.test.ts                   # Tests de migration et de l'analyseur
```

**Décision de structure** : `envelopes.ts` est un troisième module de calcul, distinct de `calculs.ts`
(prévisionnel du mois) et d'`expenses.ts` (quotidien). La frontière reste lisible : celui-ci répond
« ai-je tenu mes plafonds ? ». Verser les enveloppes dans `expenses.ts` en ferait un module de trois
sujets.

## Suivi de complexité

> À remplir uniquement si le contrôle de conformité relève des violations à justifier.

Aucune violation relevée. Ce tableau reste vide.

## Séquencement

001 est la **dernière fonctionnalité spécifiée** du projet. Elle ne débloque rien et ne dépend plus
de rien : les dépenses qu'elle mesure existent depuis 003.

Ordre interne : migration d'abord, calculs ensuite, interface enfin — comme pour 003, et pour la même
raison : une migration livrée tardivement est une migration testée tardivement.

Impact sur la fonctionnalité 004, identique à celui de 003 et désormais éprouvé : `FORMAT_VERSION`
passe à 3, la table des versions du contrat d'export gagne une ligne, et **les tests d'export doivent
passer sans autre modification que leurs témoins**. Ce sera la deuxième vérification que l'export est
bien indifférent au contenu.
