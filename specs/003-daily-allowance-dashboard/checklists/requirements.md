# Liste de contrôle qualité de la spécification : Tableau de bord — anneau, allocation quotidienne et journal

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

- *Exigences testables et sans ambiguïté* : « interface moderne » n'est pas vérifiable en l'état. La
  formule a été traduite en exigences mesurables (EF-031 à EF-035 : formats, thèmes clair et sombre,
  adaptabilité dès 360 px, cibles tactiles de 44 px, respect du mouvement réduit), et le parti pris
  graphique a été explicitement renvoyé à la conception dans les hypothèses.
- *Exigences testables et sans ambiguïté* : « montant quotidien fluctuable » a été remplacé par la
  règle de calcul explicite d'EF-016 (montant restant réparti sur les jours restants, aujourd'hui
  inclus) et la règle d'arrondi d'EF-017 (centime inférieur). Les scénarios 3 et 4 du récit 3
  chiffrent le résultat attendu (32,22 € et 24,44 €) afin que la règle soit vérifiable sans
  interprétation.
- *Critères de succès indépendants de la technologie* : un critère initial portait sur le temps de
  rendu de la liste en millisecondes. Réécrit en CS-008, qui énonce le seuil observable par
  l'utilisateur (consultation sans attente perceptible à 2 000 dépenses).
- *Cas limites* : ajout du changement de mois pendant que l'application est ouverte, du changement
  d'heure saisonnier et du cas d'un montant disponible négatif dès le départ, absents de la première
  passe.

**Décisions de conception consignées (à confirmer si elles ne conviennent pas) :**

- L'allocation quotidienne est **recalculée chaque jour** à partir du montant restant et du nombre de
  jours restants, plutôt que tenue dans un solde de report distinct. Ce choix produit exactement le
  comportement décrit — sous-dépenser augmente le lendemain, sur-dépenser le réduit — sans état
  supplémentaire à maintenir. Conséquence à connaître : l'écart d'une journée est lissé sur tous les
  jours restants, il ne se reporte pas intégralement sur le seul lendemain.
- **L'arrondi se fait au centime inférieur** (EF-017), de sorte que la somme des allocations restantes
  n'excède jamais le disponible réel (CS-004). Les centimes non répartis se redistribuent les jours
  suivants.

## Élargissement de périmètre assumé

La description ne demandait pas explicitement la saisie des dépenses, mais le journal, l'anneau et
l'allocation quotidienne en dépendent tous, et aucune spécification antérieure ne la couvrait. Elle
est donc intégrée ici (récit 1, EF-001 à EF-006). Deux conséquences :

- cette fonctionnalité est **autonome** : elle ne dépend d'aucune fonctionnalité non spécifiée ;
- elle **débloque `specs/001-monthly-budget-envelopes`**, dont les exigences EF-007 à EF-010
  attendaient une saisie de transactions inexistante.

## Articulation avec les fonctionnalités 001 et 002

- **002** (`specs/002-income-subscriptions-budget`) établit le montant disponible du mois : revenus
  moins charges récurrentes engagées. La présente fonctionnalité le consomme (EF-009) et affiche
  0,00 € avec une invitation à saisir tant qu'il n'existe pas (EF-014).
- **003 (celle-ci)** fournit la saisie des dépenses, l'anneau du reste mensuel, l'allocation
  quotidienne et le journal.
- **001** (`specs/001-monthly-budget-envelopes`) répartira ensuite ces dépenses par catégorie avec
  des plafonds mensuels.

Séquencement recommandé : **002 → 003 → 001**. 003 est développable et testable dès maintenant avec
un montant disponible fourni, mais ne prend tout son sens qu'une fois 002 livrée.

## Conformité à la constitution

Vérifiée au regard de `.specify/memory/constitution.md` v1.1.0 :

- **I. Propriété locale des données** — les hypothèses écartent explicitement toute synchronisation
  bancaire : « comme une application de banque » porte sur la présentation du journal, pas sur un
  import de relevé.
- **II. L'argent est exact** — la division du montant restant par le nombre de jours restants est le
  point de dérive d'arrondi le plus probable de tout le projet. EF-017 fixe la règle (centime
  inférieur), CS-003 impose l'exactitude au centime et CS-004 garantit que la répartition ne promet
  jamais plus que le disponible.
- **III. Tester là où cela compte** — le calcul de l'allocation quotidienne (EF-016, EF-017), le
  report (EF-019, EF-020) et la totalisation mensuelle (EF-008) relèvent de la logique monétaire et
  tombent sous l'obligation de test, cas limites inclus : dernier jour du mois, montant restant nul
  ou négatif, montant non divisible.
- **VI. Simplicité et YAGNI** — l'allocation est dérivée plutôt que stockée dans un compte de report ;
  photo de justificatif, géolocalisation et saisie vocale sont écartées explicitement.
- **VII. Accessibilité et adaptabilité par défaut** — EF-013, EF-032 à EF-035 et CS-009, CS-010
  couvrent le contraste dans les deux thèmes, l'usage au clavier, le zoom à 200 %, la largeur de
  360 px, les cibles tactiles et la préférence pour un mouvement réduit.
- **VIII. Le français comme langue du projet** — spécification et liste de contrôle rédigées en
  français ; le nom du répertoire reste en anglais, conformément à l'exception prévue.

## Notes

- Les points non cochés exigent une mise à jour de la spécification avant `/speckit-clarify` ou
  `/speckit-plan`
