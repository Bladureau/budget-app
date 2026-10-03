# Guide de validation : Réserve d'épargne et report entre les mois

**Fonctionnalité** : `specs/008-savings-reserve` | **Date** : 2026-10-03

## Prérequis

- Branche `feat-008-savings-reserve`, dépendances installées.
- **Une sauvegarde du budget réel** exportée avant tout essai sur l'instance du NAS (onglet
  « Réglages » → « Vos données ») : le document passe en version 5.
- Pour les essais manuels, un budget d'essai avec 900,00 € de revenus nets sur le mois en cours
  (par exemple un revenu de 1 000,00 € et un abonnement de 100,00 €).

## Contrôles automatiques

```powershell
npm run lint
npm run build
npm test
```

Les trois passent sans erreur. Le jeu de référence du
[contrat de calcul](./contracts/calcul-reserve.md) §4 est reproduit au centime par les tests.

### Référence

Relevée le 2026-10-03 sur la branche vierge (T001) : **868 tests au vert** (36 fichiers), lint
sans erreur, build réussi avec `/` prérendue.

## Vérifications manuelles

### Récit 1 — Déclarer la réserve

1. Sans réserve : l'anneau affiche 900,00 € de disponible, sans mention d'épargne. « Réglages »
   propose une section « Réserve d'épargne » vide.
2. Saisir 6 000 et 12 mois, enregistrer. L'anneau affiche 1 400,00 €, détaillé en « Revenus du
   mois : 900,00 € » et « Part d'épargne : 500,00 € ». Le montant par jour a augmenté.
3. Saisies refusées, chacune avec son message et sans rien enregistrer : solde `-5`, `abc`,
   `1,234` ; mois `0`, `1,5`, `121`, vide.
4. Avec un revenu ponctuel daté du mois en cours : le formulaire rappelle de vérifier que
   l'épargne n'y est pas déjà comptée.
5. Réserve de 1 000 sur 3 mois : part de 333,33 €.

### Récit 2 — Report au mois suivant

1. Dans le mois en cours, saisir 1 100,00 € de dépenses. Avancer d'un mois avec le sélecteur :
   onglet « Mois », réserve en début de mois 5 800,00 €, 11 mois restants, part 527,27 €.
2. Revenir au mois en cours, supprimer 100,00 € de dépenses, avancer d'un mois : réserve
   5 900,00 €.
3. Reculer d'un mois avant la déclaration : aucune mention de réserve, mêmes montants qu'avant
   la fonctionnalité.
4. Ouvrir l'application sur un second appareil : mêmes réserve et part, au centime.

### Récit 3 — Voir quand l'épargne est entamée

1. 800,00 € dépensés : l'anneau indique que l'épargne n'est pas entamée et qu'il reste 100,00 €
   de revenus.
2. 1 100,00 € dépensés : « Épargne entamée : 200,00 € sur 500,00 € ».
3. 1 500,00 € dépensés : dépassement de 100,00 €, présenté comme un montant positif, avec la
   mention qu'il sera retiré de la réserve.
4. Passer l'affichage en niveaux de gris (outils de développement) : chaque état reste lisible
   par son texte.
5. Onglet « Mois » : réserve en début de mois, mois restants, part, épargne entamée, réserve
   prévue en fin de mois.

### Récit 4 — Recaler et retirer

1. Après le récit 2, au mois suivant, ressaisir 3 000 sur 6 mois : part 500,00 €. Reculer d'un
   mois : montants inchangés.
2. Retirer la réserve (confirmation demandée) : le mois en cours revient à 900,00 € ; le mois
   précédent garde ses montants.
3. Déclarer 600 sur 1 mois, avancer de deux mois : avis « durée atteinte », lien vers
   « Réglages ».
4. Recalage en cours de mois : avec 900,00 € de revenus nets et 1 100,00 € déjà dépensés,
   ressaisir 5 800 : « Réserve prévue en fin de mois » affiche 5 800,00 € (et non 5 600,00 €).

### Remboursements

1. Mois avec 50,00 € de dépenses et 80,00 € de remboursements (document d'essai) : l'anneau
   affiche 0,00 € dépensé et un disponible inchangé ; la « Réserve prévue en fin de mois » a
   augmenté de 30,00 € en plus des revenus nets.

### Données

1. Exporter, vider le navigateur, importer : la réserve est restituée, mêmes montants.
2. Importer une sauvegarde d'avant la fonctionnalité : elle s'ouvre, sans réserve.

### Sur le budget réel

1. Supprimer de septembre le revenu ponctuel qui représentait l'épargne **n'est pas
   nécessaire** : septembre précède la déclaration et garde ses chiffres.
2. Déclarer en octobre le solde réel cumulé des deux comptes d'épargne et la durée voulue.
3. Vérifier que le disponible d'octobre = revenus nets d'octobre + solde ÷ durée.
