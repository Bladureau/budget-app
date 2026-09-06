# Contrat — Interface utilisateur

**Fonctionnalité** : `004-data-export-import`

L'application n'expose aucune API externe : son contrat vis-à-vis de l'extérieur est l'interface et
le fichier produit. Ce document fixe les états et les invariants, sans préjuger du parti pris
graphique.

## Emplacement

Une section « Vos données » ajoutée à la vue budgétaire, en pied de page. Aucune route nouvelle : la
fonctionnalité est une action ponctuelle, pas une destination.

## États de la vue

Chaque état doit être atteignable et testable.

| État | Déclencheur | Attendu |
| --- | --- | --- |
| Repos | Par défaut | Bouton d'export, sélecteur de fichier pour l'import, et une phrase rappelant que les données ne quittent pas l'appareil. |
| Export en échec | `triggerDownload` renvoie `false` | Message expliquant que la sauvegarde n'a pas pu être produite. Jamais silencieux (EF-007). |
| Lecture en cours | Fichier sélectionné, analyse en cours | Indication de traitement, annoncée aux lecteurs d'écran (EF-029). |
| Refusé | `parseImport` renvoie un motif | Message **propre au motif** (voir plus bas). Aucune donnée modifiée. |
| Aperçu | Fichier validé, avant toute écriture | Résumé du contenu, avertissement de remplacement, confirmation et annulation. |
| Importé | Confirmation donnée, écriture réussie | Compte rendu du nombre d'éléments restaurés, et action de retour arrière. |
| Import en échec | Écriture refusée | Message d'échec ; les données antérieures sont intactes (EF-021). |

## Les trois messages de refus

Un message par motif, chacun menant à une action différente (CS-007). C'est l'exigence, pas une
préférence de rédaction.

| Motif | Message | Action que l'utilisateur peut en tirer |
| --- | --- | --- |
| `notAnExport` | Ce fichier n'est pas une sauvegarde de cette application. | Chercher le bon fichier |
| `futureVersion` | Ce fichier a été créé par une version plus récente de l'application. | Mettre l'application à jour |
| `corrupted` | Ce fichier est une sauvegarde de cette application, mais son contenu est abîmé ou incomplet. | Utiliser une autre sauvegarde |

Un message générique du type « import impossible » ne satisferait aucun des trois cas : il laisse
l'utilisateur sans savoir s'il s'est trompé de fichier, s'il doit mettre à jour, ou si sa sauvegarde
est perdue.

## Invariants de l'aperçu avant remplacement

L'aperçu est la protection centrale de la fonctionnalité. Il **doit** :

1. être présenté **avant toute écriture**, sans exception (EF-016, EF-017) ;
2. indiquer le nombre d'éléments par type **dans le fichier** et **dans l'application** — sans le
   second, l'utilisateur ne peut pas mesurer ce qu'il perd ;
3. indiquer la date d'export du fichier, ou signaler qu'elle est inconnue ;
4. énoncer explicitement que le contenu actuel sera **remplacé**, et non fusionné ;
5. offrir une annulation qui ne modifie rien (EF-018) ;
6. exiger une confirmation **délibérée** — une case à cocher ou un bouton distinct, jamais la simple
   sélection du fichier.

Cas particulier à traiter explicitement : un fichier valide mais **vide** est acceptable, et
l'avertissement doit alors dire clairement que l'application se retrouvera sans données.

## Invariants d'accessibilité

Vérifiables un par un ; ils traduisent le principe VII.

1. Le sélecteur de fichier porte une étiquette associée, pas seulement une icône.
2. L'indication de traitement en cours est annoncée aux technologies d'assistance, et non seulement
   visible.
3. Les messages de refus sont textuels, rattachés programmatiquement à la zone d'import, et ne
   reposent pas sur la couleur.
4. La confirmation de remplacement est atteignable et actionnable au clavier seul.
5. Le compte rendu d'import est annoncé après l'opération.
6. La section reste utilisable dès 360 px de large et à 200 % de zoom.
7. Les deux thèmes respectent le contraste WCAG 2.1 AA.

## Invariants de sécurité des données

Ce sont les exigences dont dépend la confiance dans la fonctionnalité.

1. **Aucun chemin** ne mène de la sélection d'un fichier à une écriture sans passage par l'aperçu et
   confirmation.
2. **Aucun refus** ne modifie les données existantes (EF-026, CS-005).
3. Le point de restauration est constitué **avant** l'écriture (EF-019).
4. Le retour arrière est atteignable en **une seule action** tant que la session dure (CS-006).
5. Le fichier exporté n'est transmis à aucun service : aucune requête réseau n'accompagne l'export
   (EF-028, principe I).
6. **L'export porte sur l'état enregistré, jamais sur une saisie en cours** (EF-008). C'est acquis par
   construction — le fournisseur n'expose que le document persisté, et un formulaire non validé
   n'existe que dans l'état local de son composant. La section de transfert **doit néanmoins l'énoncer
   à l'utilisateur** : sans cette mention, quelqu'un ayant un formulaire à demi rempli à l'écran peut
   légitimement croire que son contenu part dans la sauvegarde.
