# Guide de validation — Anneau, allocation quotidienne et journal

**Fonctionnalité** : `003-daily-allowance-dashboard` | **Date** : 2026-09-06

Les signatures sont dans [contracts/calculs-depenses.md](./contracts/calculs-depenses.md), le format
persisté dans [contracts/stockage-v2.md](./contracts/stockage-v2.md).

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

**Contrôle particulier** : les 43 tests des fonctionnalités 002 et 004 portant sur le document et
l'export doivent passer **sans avoir été modifiés**, hormis la version de format attendue. C'est ce
qui prouve que l'extension du document était bien additive.

## Validation automatisée

Cas obligatoires en fin de [contracts/calculs-depenses.md](./contracts/calculs-depenses.md).

| Module | Ce qui doit être prouvé |
| --- | --- |
| `features/budget/expenses.ts` | Les quatre scénarios chiffrés du récit 3 ; CS-004 (la somme des allocations n'excède jamais le reste) ; CS-005 (l'écart se répartit sur les jours restants) ; report positif et négatif ; reste nul ou négatif ; premier et dernier jour du mois. |
| `lib/storage.ts` | Migration 1 → 2 sans perte ; document v2 validé ; dépense invalide → quarantaine sans import partiel. |
| Journal | Regroupement, sous-totaux, recherche insensible aux accents. |

Le test le plus important est la **propriété CS-004** : sur un mois complet et quel que soit le profil
de dépense, la somme des allocations restantes n'excède jamais le reste. C'est la garantie qui
empêche l'application de promettre de l'argent qui n'existe pas.

## Validation manuelle

### 1. Migration d'un budget existant

Avec des revenus et abonnements déjà saisis (fonctionnalité 002), recharger l'application après
déploiement. **Attendu** : tout est là, à l'identique. Dans les outils de développement,
`budget-app:v1` porte `"version": 2` et une collection `expenses` vide.

> C'est le scénario le plus important du guide : une migration qui perd des données est l'anomalie
> que la constitution proscrit en premier.

### 2. Saisie rapide (récit 1, CS-001)

Depuis l'écran d'accueil, saisir un montant seul et valider. **Attendu** : la dépense apparaît en tête
du journal, l'anneau et l'allocation se mettent à jour sans rafraîchissement.

**Chronométrer** : moins de dix secondes du chargement de la page à la dépense enregistrée.

Vérifier que `12,40` et `12.40` donnent le même montant (EF-003).

### 3. Refus de saisie (EF-004)

Tenter `-10`, `0`, `abc`, `1,234`. **Attendu** : quatre refus, chacun avec un message textuel à côté
du champ, aucune écriture.

### 4. L'anneau et ses quatre états (récit 2)

**Chronométrer d'abord** (CS-002) : recharger la page, puis mesurer le temps nécessaire pour lire le
montant restant du mois **et** celui dont on dispose aujourd'hui. **Attendu** : moins de trois
secondes. Au-delà, la hiérarchie visuelle de l'écran d'accueil est à revoir — c'est l'information la
plus consultée de l'application.

Avec 900,00 € disponibles, vérifier successivement :

| Dépensé | Attendu |
| --- | --- |
| 0,00 € | 900,00 € restants, portion nulle, état « intact » |
| 225,00 € | 675,00 € restants, portion au quart |
| 900,00 € | 0,00 €, tour complet, libellé « budget épuisé » |
| 1 020,00 € | **dépassement de 120,00 €**, anneau plafonné, libellé « dépassement » |

Le dernier cas est le plus important : vérifier qu'aucun **reste négatif** n'est affiché.

### 5. Allocation quotidienne et report (récit 3)

Avec 300,00 € restants et 10 jours restants dans le mois : l'allocation du jour affiche **30,00 €**.

Saisir une dépense de 10,00 €. **Attendu** : il reste 20,00 € pour la journée.

Pour vérifier le lendemain sans attendre, saisir la dépense à la date de la veille : l'allocation du
jour doit passer à **32,22 €** et le report de la veille s'afficher comme un **gain de 20,00 €**.

Refaire avec 80,00 € dépensés la veille : allocation à **24,44 €**, report affiché comme une **perte
de 50,00 €**.

> Rappel utile : l'écart d'une journée est **lissé sur tous les jours restants**, pas reversé en
> totalité sur le lendemain. Économiser 20,00 € donne +2,22 € par jour, pas +20,00 € demain.

### 6. Bornes du mois

Se placer au dernier jour du mois. **Attendu** : l'allocation vaut la totalité du reste.

Se placer au premier jour d'un mois. **Attendu** : aucun report affiché — et non un report de 0,00 €.

### 7. Journal type relevé bancaire (récit 4)

Saisir des dépenses sur plusieurs jours et plusieurs mois. **Attendu** : ordre antéchronologique,
regroupement par jour, sous-total par journée exact.

Rechercher « cafe » alors qu'une dépense s'intitule « Café ». **Attendu** : elle est trouvée (EF-026).

Filtrer sur un mois. **Attendu** : seules ses dépenses, avec leur total.

Faire défiler loin en arrière. **Attendu** : les dépenses anciennes se chargent au fil du défilement,
sans bouton de pagination et sans à-coup.

**Chronométrer** (CS-007) : choisir une dépense précise datant de plus de trois mois et mesurer le
temps nécessaire pour la retrouver, par recherche ou par défilement. **Attendu** : moins de quinze
secondes.

### 8. Modification et suppression (récit 5)

Ouvrir une dépense, changer son montant. **Attendu** : anneau, allocation et sous-total du jour
recalculés.

Changer sa date pour une autre journée. **Attendu** : elle change de regroupement, et **les
sous-totaux des deux journées** sont recalculés.

Supprimer une dépense. **Attendu** : confirmation demandée, puis le montant restant de l'anneau
augmente d'autant.

### 9. Export après migration (non-régression de 004)

Télécharger une sauvegarde. **Attendu** : le fichier porte `"formatVersion": 2` et contient la
collection `expenses`.

Réimporter ce fichier. **Attendu** : accepté, toutes les dépenses restaurées.

**Importer un ancien fichier de format 1**, si vous en avez conservé un. **Attendu** : accepté et
migré — c'est EF-024 de la fonctionnalité 004 qui devient enfin vérifiable.

### 10. Accessibilité (CS-009, CS-010)

- Parcourir l'écran au clavier seul : saisie, journal, détail d'une dépense, tous atteignables avec un
  focus visible.
- Passer l'écran en niveaux de gris : les quatre états de l'anneau restent identifiables.
- Réduire à 360 px : aucun défilement horizontal, l'anneau reste lisible.
- Porter le zoom à 200 % : aucune perte d'information.
- Activer la réduction des animations du système : l'anneau ne s'anime plus.
- Basculer entre thème clair et sombre.

### 11. Volume (CS-008)

Injecter 2 000 dépenses (par import d'un fichier fabriqué). **Attendu** : le journal se consulte sans
attente perceptible, la saisie d'une dépense supplémentaire reste instantanée.

### 12. Changement de jour, application ouverte (EF-023)

Laisser l'application ouverte au passage de minuit, ou avancer l'horloge système. **Attendu** :
l'allocation du jour bascule sans intervention.

### 13. Hors ligne

Couper le réseau, recharger. **Attendu** : saisie et consultation restent possibles.

## Critères de clôture

1. `npm run build`, `npm run lint` et `npm run test` passent sans erreur ;
2. les tests de 002 et 004 passent **sans modification** hormis la version de format ;
3. les cas obligatoires du contrat de calcul sont couverts, propriété CS-004 comprise ;
4. les treize scénarios manuels se comportent comme décrit — en particulier le premier, qui vérifie
   qu'aucune donnée existante n'a été perdue ;
5. le README est mis à jour : saisie des dépenses, anneau, allocation quotidienne et journal ;
6. aucun code mort ; commentaires et message de commit en français ;
7. **EF-020 de la spécification est amendée** pour refléter que l'allocation est dérivée et non
   stockée, ou la divergence est explicitement assumée par écrit.
