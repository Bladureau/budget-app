# Contrat — Interface utilisateur

**Fonctionnalité** : `002-income-subscriptions-budget`

L'application n'expose aucune API externe : son seul contrat vis-à-vis de l'extérieur est
l'interface. Ce document fixe les routes, les états de vue et les invariants d'accessibilité que la
mise en œuvre doit respecter, sans préjuger du parti pris graphique.

## Routes

| Route | Rendu | Rôle |
| --- | --- | --- |
| `/` | Composant Serveur rendant `<BudgetProvider>` | Vue budgétaire du mois sélectionné : synthèse, revenus, abonnements, ventilation. |

Le mois consulté est un état d'interface, non une route : la navigation entre les mois ne change pas
l'URL. Ce choix évite le rendu serveur d'un mois qui dépend de données présentes uniquement dans le
navigateur. Une route par mois deviendrait justifiable si le partage d'un lien vers un mois précis
entrait au périmètre — ce n'est pas le cas.

## États de la vue

Chaque état ci-dessous doit être atteignable et testable.

| État | Déclencheur | Attendu |
| --- | --- | --- |
| Chargement initial | Premier rendu client avant lecture du stockage | Ossature neutre, sans clignotement de contenu. Aucune lecture de `localStorage` pendant le rendu. |
| Vide | Document absent ou collections vides | Totaux à zéro, invitation explicite à saisir un revenu ou un abonnement, aucun état d'erreur (EF-020). |
| Renseigné | Au moins un revenu ou un abonnement | Synthèse, ventilation triée, listes. |
| Déficit | `remainingCents < 0` | Reste présenté comme un déficit libellé, état distinct de l'excédent (EF-015, EF-016). |
| Projection | Mois postérieur au mois courant | Mention explicite du caractère projeté (EF-022). |
| Stockage illisible | Document en quarantaine | Message expliquant que les données précédentes n'ont pas pu être lues, qu'elles sont conservées et non détruites. |
| Écriture impossible | Quota dépassé, stockage indisponible | Message signalant que la modification n'a pas été enregistrée ; l'état en mémoire reste cohérent. |

## Invariants d'accessibilité

Vérifiables un par un ; ils traduisent le principe VII et les critères CS-007 et CS-010 de la
spécification.

1. Chaque champ de formulaire porte une étiquette associée, pas un simple texte de substitution.
2. Les messages d'erreur de saisie sont textuels, rattachés programmatiquement à leur champ, et ne
   reposent pas sur la couleur seule.
3. L'état du budget — excédent, équilibre, déficit — est identifiable par le texte : retirer la
   couleur ne doit faire perdre aucune information (CS-007).
4. Toute action est atteignable au clavier, dans un ordre de tabulation cohérent, avec un indicateur
   de focus visible.
5. La navigation entre les mois annonce le mois affiché à un lecteur d'écran lorsqu'il change.
6. La mise en page reste utilisable dès 360 px de large, sans défilement horizontal, et à 200 % de
   zoom (CS-010).
7. Les deux thèmes, clair et sombre, respectent le contraste WCAG 2.1 AA.

## Invariants de présentation des montants

1. Tout montant affiché passe par `formatCents()`. Aucune concaténation manuelle de symbole
   monétaire.
2. Un déficit s'affiche comme un montant de déficit libellé, jamais comme un nombre négatif brut
   (EF-015).
3. Le coût mensuel moyen d'un abonnement est présenté comme un indicateur explicitement distinct du
   montant réellement imputé au mois, pour qu'aucun lecteur ne puisse confondre les deux (EF-009).
4. Les dates s'affichent en `JJ/MM/AAAA`.

## Contrat de réactivité

Toute mutation — création, modification, suppression d'un revenu ou d'un abonnement — met à jour la
synthèse, la ventilation et les listes sans action de rafraîchissement de l'utilisateur (EF-019). La
mise en œuvre en découle naturellement : les valeurs affichées sont dérivées de l'état par les
fonctions pures de [calculs.md](./calculs.md), jamais stockées en double.
