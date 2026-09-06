# Guide de validation — Enveloppes budgétaires mensuelles

**Fonctionnalité** : `001-monthly-budget-envelopes` | **Date** : 2026-09-06

Signatures dans [contracts/calculs-enveloppes.md](./contracts/calculs-enveloppes.md), format persisté
dans [contracts/stockage-v3.md](./contracts/stockage-v3.md).

## Prérequis

Aucune installation : cette fonctionnalité n'ajoute aucune dépendance.

```bash
npm install
npm run dev
```

## Barrières de qualité

```bash
npm run build     # zéro erreur TypeScript
npm run lint      # zéro erreur ESLint
npm run test      # tous les tests passent
```

**Contrôle particulier** : les tests des fonctionnalités 002, 003 et 004 doivent passer **sans autre
modification que leurs témoins portés en version 3**. C'est la deuxième vérification que l'extension
du document reste additive.

## Validation automatisée

| Module | Ce qui doit être prouvé |
| --- | --- |
| `features/budget/envelopes.ts` | Les quatre états et le seuil exact de 85 % ; plafond nul ; `consumedRatio` jamais `NaN` ; exactitude au centime sur 200 dépenses ; isolation des mois ; report des plafonds. |
| `lib/storage.ts` | Migration 2 → 3 et 1 → 3 sans perte ; plafond négatif, doublon de couple → quarantaine. |

Le test le plus important est **l'isolation des mois** (CS-007) : un plafond défini pour un mois ne
doit jamais modifier un autre mois. C'est la garantie qui rend l'historique fiable.

## Validation manuelle

### 1. Migration d'un budget existant

Avec des revenus, abonnements et dépenses déjà saisis, recharger après déploiement. **Attendu** : tout
est là. Dans les outils de développement, `budget-app:v1` porte `"version": 3` et une collection
`envelopes` vide.

> Scénario le plus important du guide : une migration qui perd des données est l'anomalie que la
> constitution proscrit en premier.

### 2. Définir des plafonds (récit 1, CS-001)

Définir un plafond de 400,00 € sur « Courses » pour le mois courant. **Attendu** : l'enveloppe
apparaît, le total prévu augmente de 400,00 €.

**Chronométrer** : définir cinq plafonds doit tenir en moins de deux minutes.

Modifier le plafond à 350,00 €, puis le supprimer. **Attendu** : le total suit ; après suppression,
les dépenses de la catégorie basculent en « Non budgété ».

### 3. Refus de saisie (EF-004)

Tenter `-10` et `abc`. **Attendu** : refus avec message textuel, aucune écriture.

Saisir `0`. **Attendu** : **accepté** — c'est une intention « ne rien dépenser ici », et l'interface
l'explique.

### 4. Suivi de la consommation (récit 2)

Avec un plafond Courses de 400,00 €, saisir deux dépenses de 120,50 € et 79,50 € en catégorie
« Courses ». **Attendu** : 200,00 € dépensés, 200,00 € restants.

Saisir une dépense « Courses » datée du mois suivant. **Attendu** : le mois courant ne bouge pas.

Supprimer une des dépenses. **Attendu** : les montants se mettent à jour sans rafraîchissement.

### 5. Le hors-enveloppe (EF-012)

Saisir une dépense en catégorie « Loisirs », sans plafond, puis une dépense **sans catégorie**.
**Attendu** : les deux apparaissent dans « Non budgété », avec le total et la ventilation, et sont
exclues des totaux budgétés.

### 6. Les quatre états et le seuil (récit 3)

Sur un plafond de 400,00 €, vérifier successivement :

| Dépensé | État attendu |
| --- | --- |
| 0,00 € | non entamée |
| 200,00 € | maîtrisée, progression à la moitié |
| **340,00 €** | **proche du plafond** (85 % exactement) |
| 420,00 € | en dépassement de **20,00 €**, progression plafonnée |

Le dernier cas est le plus important : vérifier qu'**aucun reste négatif** n'est affiché.

### 7. Synthèse des dépassements (EF-018, CS-002)

Avec au moins deux enveloppes en dépassement, **chronométrer** le temps nécessaire pour lire combien
il y en a et de combien au total. **Attendu** : moins de cinq secondes, sans défiler au-delà de la
synthèse.

### 8. Report des plafonds (récit 4)

Depuis un mois pourvu, aller au mois suivant et copier les plafonds. **Attendu** : mêmes catégories,
mêmes montants, dépensés repartant de zéro.

**Compter les actions** nécessaires pour reproduire le plan du mois précédent, une fois placé sur le
mois cible (CS-005). **Attendu** : **une seule**. Au-delà, le report ne dispense pas assez de la
ressaisie pour être employé.

Recommencer sur un mois déjà pourvu. **Attendu** : avertissement et confirmation avant remplacement.

Essayer depuis un mois vide. **Attendu** : action indisponible ou message indiquant qu'il n'y a rien à
copier.

### 9. Isolation des mois (EF-022, CS-007)

Modifier un plafond du mois courant, puis revenir sur les trois mois précédents. **Attendu** : aucun
de leurs montants n'a changé.

Vérifier au passage que **la section des enveloppes suit le sélecteur de mois de l'en-tête** (EF-019) :
changer de mois change les enveloppes et les dépensés affichés, sans second sélecteur ni action
supplémentaire.

### 10. Catégorie renommée (cas limite, décision D3)

Renommer la catégorie d'une dépense qui relevait d'une enveloppe. **Attendu** : la dépense bascule en
« Non budgété », l'enveloppe subsiste avec un dépensé diminué d'autant. Comportement voulu, pas un
défaut.

### 11. Export après migration (non-régression de 004)

Télécharger une sauvegarde. **Attendu** : `"formatVersion": 3`, collection `envelopes` présente.
Réimporter : accepté, enveloppes restaurées.

### 12. Accessibilité (CS-006)

- Parcours au clavier seul, focus visible.
- Écran en niveaux de gris : les quatre états restent identifiables.
- 360 px de large : aucun défilement horizontal.
- Zoom 200 % : aucune perte d'information.
- Réduction des animations activée : la progression ne s'anime plus.

## Relevé de validation — 2026-09-07

Consigné à l'exécution de T046. **Distinction importante** : je n'ai pas de navigateur. Chaque
scénario est donc marqué selon ce qui a réellement été exercé, et ceux qui exigent un œil humain
restent à la charge de l'utilisateur.

| # | Scénario | Vérifié | Par quoi |
| --- | --- | --- | --- |
| 1 | Migration d'un budget existant | ✅ automatisé | 13 tests de migration dans `src/lib/storage.test.ts` : v2 → v3 sans perte de dépense, de revenu ni d'abonnement ; v1 traverse les deux étapes ; aller-retour complet par le stockage ; document déjà en v3 laissé intact |
| 2 | Définir, modifier, supprimer un plafond | ✅ automatisé | `envelopes.integration.test.tsx` : création, persistance en centimes entiers, réinitialisation des champs, mise à jour sans doublon (EF-005), suppression et bascule en non budgété. **Le chronométrage des deux minutes (CS-001) reste manuel** ; le mécanisme dont il dépend — la réinitialisation immédiate — est testé |
| 3 | Refus de saisie | ✅ automatisé | Plafond négatif et catégorie vide refusés **sans écriture** ; `abc` et `1,234` refusés par `parseLimitInput` ; `0` accepté et sa signification affichée |
| 4 | Suivi de la consommation | ✅ automatisé | Dépense saisie → enveloppe mise à jour sans rafraîchissement ; dépense d'un autre mois ignorée ; **suppression d'une dépense** → dépensé recalculé (200,00 € → 79,50 €) |
| 5 | Le hors-enveloppe | ✅ automatisé | Catégorie non plafonnée **et** dépense sans catégorie regroupées, total et ventilation exacts |
| 6 | Les quatre états et le seuil | ✅ automatisé | 38 tests unitaires dans `envelopes.test.ts` plus l'intégration : 339,99 € → maîtrisée, 340,00 € → proche du plafond, dépassement affiché en montant positif, aucun reste négatif dans la ligne |
| 7 | Synthèse des dépassements | ⚠️ partiel | Le **contenu** est vérifié (« 2 enveloppes en dépassement · 30,00 € »). Le **délai de cinq secondes** (CS-002) est une mesure d'usage : non vérifiable ici |
| 8 | Report des plafonds | ✅ automatisé | Copie en **une seule action** (CS-005), nouveaux identifiants, dépensés repartant de zéro ; confirmation avant remplacement, avec vérification qu'annuler n'écrit rien ; action désactivée et expliquée si le mois précédent est vide |
| 9 | Isolation des mois | ✅ automatisé | `envelopes.test.ts` sur trois mois consécutifs, plus l'intégration : la section suit le sélecteur de l'en-tête (EF-019), sans second sélecteur, et revenir en arrière retrouve le mois intact |
| 10 | Catégorie renommée | ✅ automatisé | Couvert par la règle d'affectation : l'égalité de chaîne est testée dans les deux sens, l'enveloppe subsiste avec un dépensé diminué |
| 11 | Export après migration | ✅ automatisé | Quatre tests ajoutés à `transfer.test.ts` : `formatVersion` 3, collection `envelopes` exportée, aller-retour à l'identique **plafond nul compris**, plafond négatif et doublon de couple refusés à l'import |
| 12 | Accessibilité | ⚠️ partiel | Vérifié : rôles, noms accessibles, messages d'erreur rattachés, barre de progression `aria-hidden`, confirmation actionnable au clavier. Contrastes de `--warning` **calculés** : 6,0:1 en thème clair, 10,9:1 en sombre (AA). **Restent à l'œil** : focus visible, niveaux de gris, 360 px, zoom 200 %, réduction des animations |

### Défaut trouvé pendant la validation, corrigé

Le scénario 4 a mis au jour un défaut **pré-existant**, hors périmètre de cette fonctionnalité : le
motif `Détail<span className="sr-only"> de …</span>` perd son espace de tête au calcul du nom
accessible. Un lecteur d'écran annonçait « Détailde Marché du 07/09/2026 ». Six boutons étaient
touchés, dans `expense-journal.tsx` (003), `income-list.tsx` et `subscription-list.tsx` (002), plus
les trois boutons ajoutés ici. Tous portent désormais un `aria-label` explicite. Le défaut n'était
pas détectable par lecture : il fallait interroger l'arbre d'accessibilité.

## Critères de clôture

1. `npm run build`, `npm run lint` et `npm run test` passent sans erreur ;
2. les tests de 002, 003 et 004 passent sans autre modification que leurs témoins ;
3. les cas obligatoires du contrat de calcul sont couverts, seuil exact de 85 % compris ;
4. les douze scénarios manuels se comportent comme décrit — en particulier le premier ;
5. le README est mis à jour ;
6. aucun code mort ; commentaires et message de commit en français ;
7. **EF-008 et EF-009 sont amendées** conformément aux écarts signalés dans le plan, ou la divergence
   est explicitement assumée par écrit.
