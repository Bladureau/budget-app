# Liste de contrôle qualité de la spécification : Stockage centralisé et synchronisation

**Objet** : valider la complétude et la qualité de la spécification avant de passer à la planification
**Créée le** : 2026-09-07
**Fonctionnalité** : [spec.md](../spec.md)

## Qualité du contenu

- [X] Aucun détail d'implémentation (langages, cadres applicatifs, interfaces techniques)
- [X] Centrée sur la valeur pour l'utilisateur et le besoin réel
- [X] Rédigée pour un lecteur non technique
- [X] Toutes les sections obligatoires sont remplies

## Complétude des exigences

- [ ] **Aucune question ouverte ne subsiste** — trois questions restent en attente de décision (Q1, Q2, Q3)
- [X] Les exigences sont testables et non ambiguës
- [X] Les critères de succès sont mesurables
- [X] Les critères de succès sont indépendants de toute technologie
- [X] Tous les scénarios d'acceptation sont définis
- [X] Les cas limites sont identifiés
- [X] Le périmètre est clairement borné (section « Hors périmètre »)
- [X] Les hypothèses et dépendances sont identifiées

## Aptitude de la fonctionnalité

- [X] Chaque exigence fonctionnelle a des critères d'acceptation clairs
- [X] Les récits utilisateur couvrent les parcours principaux
- [X] La fonctionnalité satisfait les résultats mesurables des critères de succès
- [X] Aucun détail d'implémentation ne fuit dans la spécification

## Contrôle propre au projet

- [X] Rédigée en français (principe VIII)
- [X] Conformité constitutionnelle examinée principe par principe
- [X] **Le modèle de données réel a été analysé dans le code** et la terminologie de la demande
      rectifiée en conséquence, comme le demandait explicitement l'énoncé
- [X] L'exigence d'exactitude monétaire est préservée jusque dans le transport (EF-004)
- [X] L'obligation d'export / import de la constitution est préservée et étendue au stockage central

## Notes

Trois questions bloquent le passage à `/speckit-plan`, et une seule est réellement structurante :

1. **Q1 — capacité hors connexion.** C'est la question critique. Le principe I impose que
   l'application reste utilisable sans réseau. Une bascule naïve vers un stockage distant
   **violerait la constitution**. Selon la réponse, la fonctionnalité change d'ampleur du simple au
   triple, ou bien le principe I doit être amendé au préalable.
2. **Q2 — concurrence entre appareils.** Détermine si une écriture peut en écraser une autre
   silencieusement.
3. **Q3 — modalité de l'accès privé.** Détermine le niveau de protection des données financières une
   fois qu'elles sont joignables par le réseau.

Les autres points ont été tranchés par défaut raisonnable et consignés dans la section
« Hypothèses » de la spécification.

**Un écart a été relevé et corrigé dans la spécification** : la demande décrivait le modèle comme
« transactions, catégories, budgets mensuels ». Le code montre quatre collections — revenus,
abonnements, dépenses, enveloppes — sans aucune entité catégorie, et les abonnements (avec leur
historique de tarifs et leurs périodes de pause) n'apparaissaient pas du tout dans la demande.
Suivre la demande à la lettre aurait fait perdre des données.
