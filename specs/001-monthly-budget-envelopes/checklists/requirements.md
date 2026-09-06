# Liste de contrôle qualité de la spécification : Enveloppes budgétaires mensuelles

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

- *Exigences testables et sans ambiguïté* : une première version d'EF-015 indiquait que l'enveloppe
  alertait « à l'approche du plafond ». Remplacée par le seuil explicite de 85 %, afin que
  l'exigence soit testable ; ce choix est consigné dans les hypothèses comme valeur par défaut fixe.
- *Critères de succès indépendants de la technologie* : un critère initial portait sur la latence de
  recalcul en millisecondes. Réécrit en CS-004, qui énonce la garantie observable par l'utilisateur
  (les montants sont à jour sans étape manuelle de rafraîchissement).
- *Périmètre clairement borné* : le report des montants non dépensés, les périodes budgétaires
  personnalisées, le multi-devises, la gestion des catégories et les notifications sont chacun
  explicitement placés hors périmètre dans les hypothèses, plutôt que laissés ouverts.

**Itération 2 (2026-09-05)** — mise en conformité linguistique. La spécification et la présente liste
de contrôle, initialement rédigées en anglais, ont été traduites en français en application du
principe VIII de la constitution (v1.1.0). Les identifiants d'exigences ont suivi la traduction des
libellés — `FR-xxx` devient `EF-xxx` (exigence fonctionnelle) et `SC-xxx` devient `CS-xxx` (critère
de succès) — afin de rester cohérents avec `specs/002-income-subscriptions-budget`. La numérotation,
le nombre d'exigences (22) et de critères (7) et le fond des énoncés sont inchangés. Le nom du
répertoire `001-monthly-budget-envelopes` reste en anglais, conformément à l'exception prévue par le
principe VIII pour les noms de fichiers et de répertoires. Cette itération solde le
`TODO(ARTEFACTS_EXISTANTS)` consigné dans le rapport de synchronisation de la constitution.

**Risque en suspens (ne bloque pas la planification, mais bloque l'implémentation) :**

- La spécification dépend d'une fonctionnalité de saisie des transactions qui n'existe pas encore
  dans le dépôt. EF-007 à EF-010 ne peuvent être ni implémentées ni testées tant que des
  transactions comportant montant, date, catégorie et type ne sont pas disponibles. Ce point est
  consigné dans la première hypothèse de la spécification. Il est recommandé de spécifier et de
  construire la saisie des transactions avant de lancer `/speckit-implement` sur cette
  fonctionnalité.

## Articulation avec la fonctionnalité 002

`specs/002-income-subscriptions-budget` et la présente spécification emploient toutes deux
l'expression « budget mensuel », sans se recouvrir sur le fond :

- **002** calcule le reste disponible d'un mois : les revenus, moins les charges récurrentes déjà
  engagées.
- **001 (celle-ci)** répartit les dépenses variables par catégorie au moyen de plafonds, et alerte en
  cas de dépassement.

002 ne dépend d'aucune autre fonctionnalité et peut être planifiée immédiatement ; 001 attend la
saisie des transactions. Séquencement recommandé : **002, puis la saisie des dépenses, puis 001**.

## Conformité à la constitution

Vérifiée au regard de `.specify/memory/constitution.md` v1.1.0 :

- **II. L'argent est exact** — CS-003 exige des totaux exacts au centime sans dérive d'arrondi, et
  EF-016 écarte la présentation d'un reste négatif. La planification devra reporter la règle des
  unités mineures entières dans le modèle de données.
- **III. Tester là où cela compte** — l'agrégation des dépenses par enveloppe (EF-007 à EF-010) relève
  de la logique monétaire et tombe donc sous l'obligation de test.
- **VI. Simplicité et YAGNI** — le report des montants non dépensés, le multi-devises et les périodes
  personnalisées sont écartés explicitement plutôt que prévus par anticipation.
- **VII. Accessibilité par défaut** — EF-017 et CS-006 exigent que l'état d'une enveloppe reste
  signalé sans recourir à la seule couleur.
- **VIII. Le français comme langue du projet** — satisfait depuis l'itération 2 : spécification et
  liste de contrôle sont rédigées en français.

## Notes

- Les points non cochés exigent une mise à jour de la spécification avant `/speckit-clarify` ou
  `/speckit-plan`
