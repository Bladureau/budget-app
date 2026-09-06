# Liste de contrôle qualité de la spécification : Export et import des données budgétaires

**Objet** : valider la complétude et la qualité de la spécification avant de passer à la planification
**Créée le** : 2026-09-05
**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [x] Aucun détail d'implémentation (langages, frameworks, API)
- [x] Centrée sur la valeur pour l'utilisateur et le besoin métier
- [x] Rédigée pour un lecteur non technique
- [x] Toutes les sections obligatoires sont complétées

## Complétude des exigences

- [x] Aucun marqueur [NEEDS CLARIFICATION] ne subsiste
- [x] Les exigences sont testables et sans ambiguïté
- [x] Les critères de succès sont mesurables
- [x] Les critères de succès sont indépendants de la technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est clairement borné
- [x] Les dépendances et hypothèses sont identifiées

## Aptitude à la mise en œuvre

- [x] Chaque exigence fonctionnelle dispose de critères d'acceptation clairs
- [x] Les récits utilisateur couvrent les parcours principaux
- [x] La fonctionnalité satisfait les résultats mesurables des critères de succès
- [x] Aucun détail d'implémentation ne s'est glissé dans la spécification

## Notes de validation

**Itération 1 (2026-09-05)** — tous les points sont satisfaits. Corrections apportées en cours de
rédaction :

- *Exigences testables et sans ambiguïté* : « format documenté et portable », repris tel quel de la
  constitution, n'est pas vérifiable en l'état. Traduit en exigences mesurables : fichier unique
  (EF-003), textuel et lisible sans outil spécifique (EF-003, scénario 4 du récit 1), en-tête portant
  version et date (EF-004).
- *Exigences testables et sans ambiguïté* : « restitue fidèlement » a été remplacé par la garantie
  d'aller-retour d'EF-011 et de CS-003 — deux exports encadrant un import produisent un contenu
  identique à l'horodatage près. C'est une propriété vérifiable par comparaison, là où « fidèlement »
  ne l'est pas.
- *Cas limites* : ajout du fichier valide mais entièrement vide, du double import du même fichier, des
  identifiants en double et du stockage plein pendant l'import — quatre cas absents de la première
  passe et tous susceptibles de provoquer une perte de données silencieuse.
- *Critères de succès indépendants de la technologie* : un critère initial exprimait un débit
  d'analyse en éléments par seconde. Réécrit en CS-009, qui énonce ce que l'utilisateur observe
  (interface non figée, indication de traitement visible).

## Décisions de périmètre consignées

Quatre exclusions délibérées, chacune justifiée dans les hypothèses. À revoir si l'une d'elles ne
correspond pas à l'intention :

- **L'import remplace, il ne fusionne pas.** L'obligation porte sur une restitution fidèle, donc une
  restauration. La fusion soulève des conflits d'identifiants et des doublons qui en font une
  fonctionnalité distincte.
- **Pas d'export tableur (CSV).** Un format tabulaire ne peut pas restituer fidèlement des structures
  imbriquées comme l'historique des tarifs d'un abonnement, et casserait donc la garantie
  d'aller-retour. Une exportation de commodité vers un tableur reste possible plus tard, comme
  fonctionnalité séparée et à sens unique.
- **Pas de chiffrement du fichier exporté.** Le fichier contient des données financières
  personnelles, mais chiffrer imposerait de gérer la perte du mot de passe — un sujet entier.
- **Pas de sauvegarde automatique ni planifiée.** La constitution parle d'un export « déclenché par
  l'utilisateur ».

## Indépendance vis-à-vis des autres fonctionnalités

Cette fonctionnalité est **agnostique du contenu** : elle exporte et importe le document de données
quel qu'il soit, sans connaître le détail des revenus, abonnements, dépenses ou plafonds.
Conséquences :

- elle reste valide au fil des fonctionnalités 002, 003 et 001, sans devoir être respécifiée à
  chacune ;
- elle n'est pas bloquée par elles : elle est implémentable dès que le document de données existe,
  c'est-à-dire dès la fin de la phase 2 de la fonctionnalité 002 ;
- en contrepartie, sa valeur pour l'utilisateur croît avec le volume de données à protéger.

**Séquencement recommandé** : après 002, en parallèle ou juste avant 003. La livrer tôt met en place
le filet de sécurité avant que l'utilisateur n'ait accumulé des données qu'il regretterait de perdre.

## Origine et conformité à la constitution

Cette spécification existe pour combler le constat **D1 (CRITICAL)** de l'analyse de cohérence du
2026-09-05 : l'obligation d'export/import des lignes 185 à 187 de la constitution n'était couverte par
aucune spécification, aucun plan et aucune tâche du projet.

Vérification au regard de `.specify/memory/constitution.md` v1.1.0 :

- **Contraintes techniques et de données** — obligation directement satisfaite : export intégral
  déclenché par l'utilisateur (EF-001, EF-002), format documenté et portable (EF-003, EF-004), import
  restituant fidèlement l'export (EF-010, EF-011).
- **I. Propriété locale des données** — EF-027 et EF-028 : fonctionnement hors ligne, aucun envoi vers
  un service tiers. La fonctionnalité est l'expression même de ce principe.
- **II. L'argent est exact** — CS-004 : exactitude au centime après l'aller-retour, sans dérive
  d'arrondi. C'est le risque principal d'une sérialisation vers un format textuel.
- **III. Tester là où cela compte** — l'analyse d'un fichier importé est du code qui persiste des
  montants : tests obligatoires, avec les cas malformés énumérés dans EF-023 et les cas limites.
- **La perte de données n'est jamais acceptable** — EF-013, EF-019, EF-021 et EF-026 : validation
  totale avant écriture, point de restauration, données antérieures intactes en cas d'échec ou de
  refus. CS-005 en fait un critère mesurable.
- **VI. Simplicité et YAGNI** — fusion, CSV, chiffrement et sauvegarde planifiée sont écartés
  explicitement plutôt que prévus par anticipation.
- **VIII. Le français comme langue du projet** — spécification et liste de contrôle en français ; nom
  de répertoire en anglais, conformément à l'exception prévue.

## Notes

- Les points non cochés exigent une mise à jour de la spécification avant `/speckit-clarify` ou
  `/speckit-plan`
