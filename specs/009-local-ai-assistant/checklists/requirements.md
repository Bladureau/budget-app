# Liste de contrôle de qualité de la spécification : Assistant du budget (IA locale)

**Objectif** : valider l'exhaustivité et la qualité de la spécification avant la planification

**Créée le** : 2026-10-24

**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [x] Aucun détail d'implémentation (langages, frameworks, API) dans les exigences et critères
- [x] Centrée sur la valeur pour l'utilisateur et ses besoins
- [x] Compréhensible par un lecteur non technique
- [x] Toutes les sections obligatoires sont remplies

## Exhaustivité des exigences

- [x] Aucun marqueur [NEEDS CLARIFICATION] ne subsiste
- [x] Les exigences sont testables et non ambiguës
- [x] Les critères de réussite sont mesurables
- [x] Les critères de réussite ne dépendent d'aucune technologie
- [x] Tous les scénarios d'acceptation sont définis
- [x] Les cas limites sont identifiés
- [x] Le périmètre est clairement borné (sections « Périmètre » et « Exclu »)
- [x] Les dépendances et hypothèses sont identifiées

## Prêt pour la planification

- [x] Toutes les exigences fonctionnelles ont un critère d'acceptation clair
- [x] Les récits couvrent les parcours principaux
- [x] La fonctionnalité atteint les résultats mesurables des critères de réussite
- [x] Aucun détail d'implémentation ne fuit dans la spécification

## Notes

- Le nom de l'IA locale et le renvoi à `docs/ia-locale-ollama.md` figurent dans la « Demande
  initiale », citée telle quelle, et dans les hypothèses comme contrainte d'environnement ; les
  exigences et critères restent indépendants de la technologie.
- Choix par défaut retenus sans question : conversation non conservée, mois affiché seulement,
  emplacement dans la navigation laissé au plan.
- Points à instruire dans `research.md` : V1 (contexte injecté) ou V2 (outils), emplacement dans
  la navigation, taille du contexte, délai maximal.
