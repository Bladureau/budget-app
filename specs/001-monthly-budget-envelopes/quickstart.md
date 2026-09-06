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

## Critères de clôture

1. `npm run build`, `npm run lint` et `npm run test` passent sans erreur ;
2. les tests de 002, 003 et 004 passent sans autre modification que leurs témoins ;
3. les cas obligatoires du contrat de calcul sont couverts, seuil exact de 85 % compris ;
4. les douze scénarios manuels se comportent comme décrit — en particulier le premier ;
5. le README est mis à jour ;
6. aucun code mort ; commentaires et message de commit en français ;
7. **EF-008 et EF-009 sont amendées** conformément aux écarts signalés dans le plan, ou la divergence
   est explicitement assumée par écrit.
