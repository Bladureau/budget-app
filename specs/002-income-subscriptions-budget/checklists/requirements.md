# Liste de contrôle qualité de la spécification : Revenus, abonnements prévisionnels et budget mensuel

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

- *Exigences testables et sans ambiguïté* : une première version d'EF-008 se contentait de dire que
  les abonnements étaient « pris en compte chaque mois », ce qui rendait le traitement des
  périodicités annuelles indécidable. Reformulée pour rattacher explicitement chaque échéance au
  mois où elle tombe, avec EF-009 qui isole le coût mensuel moyen comme indicateur distinct.
- *Critères de succès indépendants de la technologie* : un critère initial portait sur le temps de
  recalcul en millisecondes. Remplacé par CS-004, qui énonce la garantie observable par
  l'utilisateur (les totaux sont à jour sans rafraîchissement manuel).
- *Périmètre clairement borné* : le suivi des dépenses ponctuelles, le report de solde, le
  multi-devises, les périodes calées sur la paie et la périodicité hebdomadaire sont explicitement
  placés hors périmètre dans les hypothèses plutôt que laissés ouverts.
- *Cas limites* : ajout du rattachement d'une échéance au dernier jour du mois lorsque le jour de
  prélèvement n'existe pas (EF-013), point qui manquait après la première passe.

**Décision de périmètre à confirmer (ne bloque pas la planification) :**

- La description mentionne « maintenir un budget mensuel » sans préciser si cela inclut la saisie
  des dépenses variables. La spécification retient une lecture prévisionnelle — revenus, charges
  engagées, reste disponible — et renvoie la saisie des dépenses ponctuelles à une fonctionnalité
  distincte. Cette fonctionnalité est autonome et livrable telle quelle ; si le besoin inclut le
  suivi des dépenses réelles, il s'agit d'un ajout et non d'une correction.

## Articulation avec la fonctionnalité 001

`specs/001-monthly-budget-envelopes` porte sur le plafonnement des dépenses variables par catégorie.
Les deux spécifications se recouvrent sur l'expression « budget mensuel » mais pas sur le fond :

- **002 (celle-ci)** calcule le reste disponible : ce qui entre, moins ce qui est déjà engagé.
- **001** répartit les dépenses variables par catégorie et alerte en cas de dépassement.

001 dépend d'une fonctionnalité de saisie des transactions qui n'existe pas encore ; 002 n'en dépend
pas et peut être planifiée et implémentée immédiatement. Recommandation de séquencement : 002, puis
la saisie des dépenses, puis 001.

## Conformité à la constitution

Vérifiée au regard de `.specify/memory/constitution.md` v1.1.0 :

- **I. Propriété locale des données** — CS-008 exige un fonctionnement sans réseau ; les hypothèses
  excluent toute connexion bancaire et toute détection automatique d'abonnement.
- **II. L'argent est exact** — EF-027 et CS-002 imposent l'exactitude au centime, y compris lors des
  conversions de périodicité, qui sont le point de dérive d'arrondi le plus probable de cette
  fonctionnalité.
- **III. Tester là où cela compte** — le calcul des échéances (EF-008, EF-013), la totalisation
  mensuelle (EF-005, EF-014) et l'historisation des montants (EF-010, EF-025) relèvent de la logique
  monétaire et tombent donc sous l'obligation de test.
- **VI. Simplicité et YAGNI** — multi-devises, report de solde et périodicité hebdomadaire sont
  écartés explicitement plutôt que prévus par anticipation.
- **VII. Accessibilité par défaut** — EF-016 et CS-007 exigent que les états du budget restent
  distinguables sans la couleur.
- **VIII. Le français comme langue du projet** — la spécification et la présente liste de contrôle
  sont rédigées en français ; le nom du répertoire reste en anglais, conformément à l'exception
  prévue pour les noms de fichiers et de répertoires.

## Notes

- Les points non cochés exigent une mise à jour de la spécification avant `/speckit-clarify` ou
  `/speckit-plan`
