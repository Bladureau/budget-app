# Liste de contrôle qualité de la spécification : Réserve d'épargne et report entre les mois

**Objet** : valider la complétude et la qualité de la spécification avant la planification
**Créée le** : 2026-10-03
**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [x] Aucun détail d'implémentation (langages, frameworks, API)
- [x] Centrée sur la valeur pour l'utilisateur et ses besoins
- [x] Rédigée pour un lecteur non technique
- [x] Toutes les sections obligatoires sont remplies

## Complétude des exigences

- [x] Aucun marqueur [NEEDS CLARIFICATION] ne subsiste
- [x] Les exigences sont testables et sans ambiguïté
- [x] Les critères de succès sont mesurables
- [x] Les critères de succès sont indépendants de la technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est clairement borné
- [x] Les dépendances et hypothèses sont identifiées

## Préparation de la fonctionnalité

- [x] Chaque exigence fonctionnelle a des critères d'acceptation clairs
- [x] Les scénarios utilisateur couvrent les parcours principaux
- [x] La fonctionnalité répond aux résultats mesurables des critères de succès
- [x] Aucun détail d'implémentation ne fuit dans la spécification

## Notes

- Les quatre décisions structurantes (réserve unique, répartition sur N mois, revenus d'abord,
  mise à jour en fin de mois) ont été prises par l'utilisateur le 2026-10-03 ; aucune
  clarification bloquante ne subsiste.
- Quatre choix ont été faits par défaut et figurent en « Hypothèses », pour relecture : le reste
  non dépensé s'ajoute à la réserve ; un découvert est imputé en entier au mois suivant ; une
  fois la durée écoulée, toute la réserve est disponible ; la déclaration vaut pour le mois en
  cours.
- Le comportement monétaire (troncature, devenir du reste, signes) est énoncé dans une section
  dédiée, comme l'exige la constitution.
