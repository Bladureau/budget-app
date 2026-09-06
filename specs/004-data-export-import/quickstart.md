# Guide de validation — Export et import des données

**Fonctionnalité** : `004-data-export-import` | **Date** : 2026-09-06

Comment vérifier que la fonctionnalité est réellement livrée. Les signatures sont dans
[contracts/transfert.md](./contracts/transfert.md), le format dans
[contracts/fichier-export.md](./contracts/fichier-export.md).

## Prérequis

Aucune installation : cette fonctionnalité n'ajoute aucune dépendance. L'outillage posé par la
fonctionnalité 002 suffit.

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

Aucune règle ne doit être neutralisée à l'échelle d'un fichier pour les faire passer.

## Validation automatisée

Les cas obligatoires sont énumérés en fin de [contracts/transfert.md](./contracts/transfert.md).
Couverture attendue avant clôture :

| Module | Ce qui doit être prouvé |
| --- | --- |
| `features/budget/transfer.ts` | Identité de l'aller-retour ; exactitude au centime ; les trois motifs de refus, chacun sans écriture ; fichier vide accepté ; `exportedAt` illisible toléré ; ordre des clés sans effet. |
| `lib/download.ts` | Révocation de l'URL après usage ; renvoi de `false` plutôt qu'une exception quand l'environnement ne permet pas le téléchargement. |
| `budget-provider` | Point de restauration capturé avant écriture ; `undoImport` restitue l'état antérieur ; `prepareImport` n'écrit rien. |

Le test le plus important est celui de l'**aller-retour** : exporter, importer, réexporter, et
comparer les champs `data`. C'est lui qui traduit « restitue fidèlement » en propriété vérifiable.

## Validation manuelle

À exécuter dans le navigateur après `npm run dev`, dans cet ordre. Chaque scénario correspond à un
récit de la [spécification](./spec.md).

### 1. Export d'une application vide (EF-006)

Sur une application sans données, déclencher l'export. **Attendu** : un fichier est téléchargé, son
nom comporte la date et l'heure, et son ouverture montre un contenu valide aux collections vides.

### 2. Export d'un budget renseigné (récit 1)

Saisir un salaire, une prime et deux abonnements de périodicités différentes, puis exporter.
**Attendu** : le fichier contient les quatre éléments ; ouvert dans un éditeur de texte, les libellés,
montants et dates sont reconnaissables sans outil ; l'en-tête porte `application`, `formatVersion` et
`exportedAt`.

> Vérifier au passage que les montants sont en centimes : 2 400,00 € apparaît comme `240000`.

**Compter les actions** nécessaires pour obtenir la sauvegarde, à partir de l'écran principal
(CS-001). **Attendu** : trois au maximum. Au-delà, la porte de sortie est trop coûteuse à emprunter
pour être empruntée régulièrement.

### 3. Restauration dans une application vide (récit 2)

Vider les données du site, recharger, puis importer le fichier de l'étape 2. **Attendu** : aperçu
présenté avant tout remplacement ; après confirmation, les quatre éléments sont revenus à
l'identique, et les totaux mensuels sont exactement ceux d'avant l'export.

Recharger ensuite la page. **Attendu** : les données importées sont toujours là (EF-015). Ce second
rechargement n'est pas redondant avec le premier : celui-ci vérifiait que l'application démarrait à
vide, celui-là vérifie que l'import a bien été **écrit** et non seulement affiché.

### 4. Aller-retour complet (EF-011, CS-003)

Réexporter immédiatement après l'import de l'étape 3, puis comparer les deux fichiers.

```bash
# Sous Git Bash, en ignorant la seule ligne qui doit différer :
diff <(grep -v exportedAt export1.json) <(grep -v exportedAt export2.json)
```

**Attendu** : aucune différence.

### 5. Protection contre le remplacement (récit 3)

Avec des données en place, sélectionner un fichier d'import. **Attendu** : un résumé indique le
nombre d'éléments **du fichier** et **de l'application**, ainsi que la date d'export, et avertit que
le contenu actuel sera remplacé.

Annuler. **Attendu** : rien n'a changé.

Recommencer et confirmer. **Attendu** : compte rendu du nombre d'éléments restaurés, et une action de
retour arrière disponible.

### 6. Retour arrière (EF-020, CS-006)

Juste après l'import de l'étape 5, déclencher le retour arrière. **Attendu** : l'état antérieur est
revenu en **une seule action**.

Recharger la page. **Attendu** : le retour arrière n'est plus proposé — il vaut pour la session,
comme annoncé.

### 7. Les trois refus (récit 4, CS-007)

Tenter d'importer successivement :

| Fichier | Attendu |
| --- | --- |
| Une image ou un `.txt` quelconque | « Ce fichier n'est pas une sauvegarde de cette application. » |
| Un export dont on a porté `formatVersion` à `99` | « Ce fichier a été créé par une version plus récente. » |
| Un export dont on a tronqué la fin, ou dont on a passé un `amountCents` à `-1` | « Son contenu est abîmé ou incomplet. » |

**Après chacun des trois** : vérifier que les données de l'application sont **strictement
inchangées**. C'est le point le plus important de tout ce guide.

### 8. Fichier valide mais vide

Importer un export dont les collections sont vides. **Attendu** : accepté, mais l'avertissement dit
clairement que l'application se retrouvera sans données.

### 9. Fichier volumineux (CS-009, EF-029)

Fabriquer un export contenant trois années de données, puis l'importer. **Attendu** : une indication
de traitement est visible, l'interface ne paraît pas figée.

### 10. Accessibilité (principe VII)

- Parcourir la section au clavier seul : sélecteur de fichier, confirmation, retour arrière tous
  atteignables, focus visible.
- Vérifier que le sélecteur de fichier a une étiquette lisible par un lecteur d'écran.
- Passer l'écran en niveaux de gris : les trois messages de refus restent distinguables, puisqu'ils
  sont textuels.
- Réduire à 360 px de large, puis porter le zoom à 200 % : aucune perte d'information.

### 11. Fonctionnement hors ligne (EF-027, CS-008)

Couper le réseau, puis exporter et importer. **Attendu** : les deux opérations aboutissent
normalement.

### 12. Absence de transmission (EF-028, principe I)

Ouvrir l'onglet réseau des outils de développement, puis déclencher un export. **Attendu** :
**aucune requête** n'est émise. C'est la vérification qui donne sa valeur à la promesse de propriété
locale des données.

## Critères de clôture

1. `npm run build`, `npm run lint` et `npm run test` passent sans erreur ;
2. les trois modules du tableau de validation automatisée sont couverts, refus et cas limites
   inclus ;
3. les douze scénarios manuels se comportent comme décrit — en particulier le scénario 7, pour ses
   trois cas ;
4. le fichier produit correspond au contrat [fichier-export.md](./contracts/fichier-export.md), qui
   est la documentation du format exigée par la constitution ;
5. le README est mis à jour : la mention « il n'y a pas encore d'export ni de sauvegarde » doit
   disparaître, remplacée par la marche à suivre ;
6. aucun code mort, commenté ou en attente ; commentaires et message de commit en français.
