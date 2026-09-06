# Guide de validation — Revenus, abonnements et budget mensuel

**Fonctionnalité** : `002-income-subscriptions-budget` | **Date** : 2026-09-05

Ce guide décrit comment vérifier que la fonctionnalité est réellement livrée. Il ne contient pas de
code d'implémentation : les signatures sont dans [contracts/calculs.md](./contracts/calculs.md), les
structures dans [data-model.md](./data-model.md).

## Prérequis

- Node.js installé et dépendances à jour : `npm install`
- Outillage de test ajouté (voir décision D8 de [research.md](./research.md)) :

  ```bash
  npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths
  ```

- `vitest.config.mts` créé à la racine et script `"test": "vitest"` ajouté à `package.json`.

## Barrières de qualité

Les cinq premières viennent de la constitution ; la sixième est la vérification linguistique
(principe VIII).

```bash
npm run build     # zéro erreur TypeScript
npm run lint      # zéro erreur ESLint
npm run test      # tous les tests passent
```

Aucune de ces commandes ne doit produire d'avertissement neutralisé par une désactivation de règle à
l'échelle d'un fichier.

## Validation automatisée

Les cas obligatoires sont énumérés dans la dernière section de
[contracts/calculs.md](./contracts/calculs.md). La couverture attendue avant clôture :

| Module | Ce qui doit être prouvé |
| --- | --- |
| `lib/money` | Virgule et point équivalents ; refus explicite des saisies invalides ; absence de `NaN` ; somme exacte sur un grand volume. |
| `lib/date` | Rabattement au dernier jour du mois sans dérive ; années bissextiles ; franchissement d'année ; refus des dates calendaires impossibles. |
| `lib/storage` | Document absent, JSON invalide, version inconnue, version supérieure, champ invalide → quarantaine et démarrage à vide, valeur brute conservée. |
| `features/budget/calculs` | Échéances imputées au bon mois ; changement de tarif sans effet rétroactif ; revenus nuls sans division par zéro ; exactitude au centime sur 50 éléments et plus. |

## Validation manuelle

À exécuter dans le navigateur après `npm run dev`, dans cet ordre. Chaque scénario correspond à un
récit de la [spécification](./spec.md).

### 1. Démarrage à vide (EF-020)

Ouvrir l'application sur un navigateur sans données. **Attendu** : totaux à zéro, invitation à saisir,
aucun message d'erreur.

### 2. Revenu récurrent et revenu ponctuel (récit 1)

Saisir un salaire récurrent mensuel de 2 400,00 € démarrant au mois courant, puis une prime ponctuelle
de 500,00 € datée du mois courant. **Attendu** : total des revenus du mois à 2 900,00 € ; le mois
suivant affiche 2 400,00 €.

Recharger la page. **Attendu** : les deux revenus sont toujours présents à l'identique.

### 3. Refus de saisie (EF-004)

Tenter d'enregistrer un revenu à `-10`, puis à `0`, puis à `abc`, puis à `1,234`. **Attendu** : quatre
refus, chacun avec un message textuel à côté du champ, aucune écriture.

### 4. Abonnements de périodicités différentes (récit 2)

Créer un abonnement mensuel à 13,99 € et un abonnement annuel à 120,00 € dont l'échéance tombe dans
trois mois. **Attendu** : le mois courant compte 13,99 € de charges ; le mois de l'échéance annuelle
en compte 133,99 € ; le coût mensuel moyen de l'abonnement annuel s'affiche à 10,00 €, visiblement
distinct du montant imputé.

### 5. Rabattement de fin de mois (EF-013)

Créer un abonnement mensuel dont la date de début est un 31. **Attendu** : l'échéance de février
tombe le 28 (ou le 29 en année bissextile), et celle de mars revient au 31 — sans dérive.

### 6. Reste disponible et déficit (récit 3)

Avec les données ci-dessus, vérifier que le reste disponible vaut exactement revenus moins charges.
Porter ensuite les charges au-dessus des revenus. **Attendu** : présentation en déficit libellé, pas
un nombre négatif brut, dans un état visuellement distinct.

### 7. Changement de tarif daté (récit 5, CS-006)

Passer un abonnement de 9,99 € à 12,99 € à compter du mois prochain. **Attendu** : le mois courant et
les mois antérieurs conservent 9,99 € ; les mois suivants affichent 12,99 €.

### 8. Anticipation sur douze mois (récit 4)

Ouvrir la vue d'anticipation. **Attendu** : douze mois projetés, l'échéance annuelle n'apparaissant
que dans son mois, les mois déficitaires signalés, les mois futurs identifiés comme projections.

### 9. Accessibilité (CS-007, CS-010)

- Parcourir toute la vue au clavier seul : chaque action est atteignable, le focus est visible.
- Activer un filtre de niveaux de gris (ou passer l'écran en monochrome) : excédent, équilibre et
  déficit restent distinguables.
- Réduire la fenêtre à 360 px de large : aucun défilement horizontal.
- Porter le zoom du navigateur à 200 % : aucune perte d'information.
- Basculer entre thème clair et thème sombre : contraste conservé dans les deux.

### 10. Fonctionnement hors ligne (CS-008)

Couper le réseau, recharger l'application. **Attendu** : consultation et saisie restent possibles.

### 11. Stockage illisible

Dans les outils de développement, remplacer la valeur de `budget-app:v1` par `{"version":99}`, puis
recharger. **Attendu** : message expliquant que les données n'ont pas pu être lues et sont conservées ;
une clé `budget-app:corrupted:<horodatage>` contient la valeur brute d'origine ; l'application démarre
à vide sans avoir détruit quoi que ce soit.

## Critères de clôture

La fonctionnalité est considérée comme livrée lorsque :

1. `npm run build`, `npm run lint` et `npm run test` passent sans erreur ;
2. les quatre modules du tableau de validation automatisée sont couverts, cas limites inclus ;
3. les onze scénarios manuels ci-dessus se comportent comme décrit ;
4. aucun code mort, commenté ou en attente ne subsiste ;
5. les commentaires de code et le message de commit sont en français (principe VIII).
