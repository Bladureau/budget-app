# Plan d'implémentation : Réserve d'épargne et report entre les mois

**Branche** : `feat-008-savings-reserve` | **Date** : 2026-10-03 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/008-savings-reserve/spec.md`

## Résumé

Donner au budget une **réserve d'épargne** saisie à la main, répartie sur un nombre de mois, et
faire passer par elle le reste ou le dépassement d'un mois au suivant.

L'approche tient en une phrase : **on enregistre ce que l'utilisateur déclare, on recalcule tout
le reste.**

- Le document ne gagne qu'une liste de **déclarations** (solde, durée, mois d'effet). Aucun
  solde mensuel n'est stocké (R1, R2).
- La réserve d'un mois se déduit par une **cascade** depuis la dernière déclaration : ouverture
  du mois suivant = ouverture + revenus nets − sorties nettes (R3). Corriger une dépense passée,
  rouvrir l'application après trois mois ou consulter un second appareil donne toujours le bon
  chiffre, sans rien écrire.
- Deux précisions issues de l'analyse : la réserve suit les sorties nettes **non bornées**, pour
  qu'un excédent de remboursement n'y disparaisse pas (R3) ; et le solde saisi est celui **du
  jour**, l'épargne déjà entamée dans le mois lui étant rajoutée à l'enregistrement (R7).
- Le calcul s'insère en **un seul point** : le « disponible » que lisent déjà l'anneau,
  l'allocation du jour et le report de la veille devient revenus nets + part d'épargne (R5).
  Sans réserve, la part vaut zéro et rien ne change.
- La division est **tronquée** ; le reste ne quitte jamais la réserve (R4).

Le document passe en **version 5** par une migration purement additive (R6).

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8.

**Dépendances principales** : Next.js 16.3.4 (App Router), Tailwind CSS 4. **Aucune dépendance
ajoutée.**

**Réutilisé de l'existant** :

| Élément existant | Rôle dans 008 |
| --- | --- |
| `computeMonthlyBudget()` (`calculs.ts`) | Fournit les revenus nets de chaque mois de la cascade. Inchangé. |
| Dépensé net de `expenses.ts` (dépenses − remboursements) | Fait baisser la réserve. Inchangé. |
| `computeMonthlySpending`, `computeDailyAllowance` | Lisent le nouveau disponible ; structure conservée. |
| `parseDocument()` / `migrer()` | Étendus à la version 5 : migration additive 4 → 5. |
| `appliquer()` et le protocole de 005 | Seul chemin d'écriture des déclarations. Aucun changement de protocole. |
| `parseLimitInput()` (`money.ts`) | Analyse du solde (zéro accepté), sans nouvelle grammaire. |
| `addMonthsToKey()` (`date.ts`) | Parcours des mois ; complété par un écart en mois. |
| `serializeExport` / `parseImport` | Inchangés hors `FORMAT_VERSION` → 5. |
| `TabLink` et les onglets (007) | Emplacement des nouveaux composants et liens entre eux. |

**Stockage** : document budgétaire en **version 5** (`reserve`). Aucun fichier serveur nouveau,
aucune route modifiée.

**Tests** : Vitest, React Testing Library, jsdom, déjà en place. Tests **exigés** (R9).

**Plateforme cible** : inchangée.

**Type de projet** : application web existante ; extension du modèle, des calculs et de
l'interface. Aucun changement côté serveur hors la version du document.

**Objectifs de performance** : affichage sans délai perceptible avec 5 000 dépenses et une
déclaration vieille de 24 mois (cascade recalculée à chaque rendu, sans mémoïsation).

**Contraintes** : centimes entiers, aucune virgule flottante sur un montant ; troncature
explicite ; consultation et saisie hors connexion préservées ; aucun montant négatif brut à
l'écran ; migration sans perte.

**Échelle / portée** : un utilisateur, une réserve, quelques déclarations sur la vie du budget.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

### Avant la phase 0

| Principe | Verdict | Analyse |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Le solde est saisi à la main (FR-005) : aucune donnée ne sort, aucun tiers. La réserve voyage avec le budget, dans le stockage que l'utilisateur possède, et figure dans l'export. Tout fonctionne hors connexion. |
| II. L'argent est exact | ✅ Conforme, **point central** | Centimes entiers partout. Une seule division, tronquée, dont le reste demeure dans la réserve et revient au dernier mois (R4). Signes explicites ; pas de division sur un négatif. Saisie convertie depuis le texte par l'analyseur existant. Devise unique (euro), comme le reste de l'application. |
| III. Tester là où cela compte | ✅ Conforme, **tests exigés** | Toute la fonctionnalité est monétaire : cascade, part, migration, export. Jeu de référence et invariants fixés au [contrat de calcul](./contracts/calcul-reserve.md) ; cas nominal, limites et entrées malformées listés en R9. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Frontières de confiance : `reserve` dans le document lu (navigateur, serveur, import), validé par `parseDocument` puis typé ; saisie du formulaire, validée avant mutation. Aucun transtypage. |
| V. Documentation du framework | ✅ Sans objet | Aucune API Next.js nouvelle : ni route, ni cache, ni frontière serveur/client modifiée. Les composants ajoutés sont des composants clients ordinaires sous une frontière existante. |
| VI. Simplicité et YAGNI | ✅ Conforme | Aucune dépendance, aucune tâche de fond, aucune mémoïsation. Une réserve, pas « des comptes ». La liste de déclarations est justifiée par FR-021 (R2), pas par anticipation. |
| VII. Accessibilité et adaptabilité | ✅ Conforme | Champs étiquetés, erreurs textuelles rattachées ; états de l'épargne portés par du texte (FR-016, FR-018) ; retrait par confirmation en deux temps au clavier ; mise en page vérifiée à 360 px. |
| VIII. Le français | ✅ Conforme | Artefacts, commentaires et messages en français ; identifiants en anglais (`ReserveDeclaration`, `shareCents`). |

### Après la phase 1

Verdicts inchangés. Deux points de vigilance relevés à la conception :

- **Principe II — redéfinition de `availableCents`.** Le champ garde son nom et change de sens
  (revenus nets + part). Tout lecteur existant doit vouloir « ce qui est dépensable ce mois » :
  l'anneau, l'allocation, le report de la veille — c'est le cas. `MonthSummary` et les
  prévisions lisent `computeMonthlyBudget`, non modifié. À vérifier à l'implémentation par une
  recherche de tous les usages de `availableCents` et de `remainingCents`.
- **Contraintes — changement de schéma.** Version 5, migration additive, export de sauvegarde
  recommandé avant déploiement ([quickstart](./quickstart.md), prérequis). Le serveur et le
  navigateur partagent `parseDocument` : ils montent de version ensemble.

Aucune violation : la section « Suivi de la complexité » est sans objet.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/008-savings-reserve/
├── plan.md
├── research.md              # Décisions R1 à R9
├── data-model.md            # Document v5, déclarations, entités dérivées
├── quickstart.md            # Guide de validation
├── contracts/
│   ├── calcul-reserve.md    # Formules, invariants, jeu de référence
│   └── stockage.md          # Schéma v5, validation, migration, export
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 (/speckit-tasks)
```

### Code source

```text
src/
├── lib/
│   ├── date.ts                           # MODIFIÉ : monthsBetween(a, b)
│   ├── date.test.ts                      # MODIFIÉ
│   ├── budget-document.ts                # MODIFIÉ : analyse de `reserve`, migration 4 → 5
│   └── budget-document.test.ts           # MODIFIÉ
├── features/budget/
│   ├── types.ts                          # MODIFIÉ : ReserveDeclaration, ReserveState, DOCUMENT_VERSION 5,
│   │                                     #   MonthlySpending (incomeNetCents, reserve), emptyDocument
│   ├── reserve.ts                        # NOUVEAU : déclaration applicable, mois restants, part,
│   │                                     #   ajout / retrait de déclaration, validation de saisie
│   ├── reserve.test.ts                   # NOUVEAU
│   ├── expenses.ts                       # MODIFIÉ : computeReserveState, availableCentsForMonth ;
│   │                                     #   anneau et allocation lisent le nouveau disponible
│   ├── expenses.test.ts                  # MODIFIÉ : jeu de référence, invariants
│   ├── transfer.ts                       # MODIFIÉ : FORMAT_VERSION 5
│   ├── transfer.test.ts                  # MODIFIÉ
│   ├── messages.ts                       # MODIFIÉ : libellés et erreurs de la réserve
│   ├── budget-provider.tsx               # MODIFIÉ : declareReserve, removeReserve
│   ├── reserve.integration.test.tsx      # NOUVEAU
│   └── components/
│       ├── reserve-settings.tsx          # NOUVEAU : formulaire, rappel, retrait (onglet Réglages)
│       ├── reserve-summary.tsx           # NOUVEAU : détail mensuel (onglet Mois)
│       ├── budget-ring.tsx               # MODIFIÉ : détail du disponible, état de l'épargne
│       └── budget-view.tsx               # MODIFIÉ : placement des deux composants
```

**Décision de structure** : la réserve appartient au domaine `budget` — elle modifie son calcul
central. `reserve.ts` reste une feuille sans dépendance vers `expenses.ts`, qui porte la cascade
(R5) : c'est ce découpage qui évite un import circulaire.

## Ordre de mise en œuvre suggéré

1. Types, version 5, migration, analyse de `reserve`, export — avec leurs tests. À ce stade
   l'application se comporte exactement comme avant.
2. `reserve.ts` et la cascade dans `expenses.ts`, sur le jeu de référence et les invariants.
3. Branchement du disponible (anneau, allocation) ; mutations du fournisseur ; formulaire dans
   « Réglages » — **MVP : récits 1 et 2**.
4. État de l'épargne dans l'anneau et détail dans « Mois » — récit 3.
5. Recalage, retrait, avis de durée atteinte — récit 4.
6. Validation selon le [quickstart](./quickstart.md), d'abord sur un budget d'essai.

## Suivi de la complexité

Sans objet : aucune violation de la constitution.
