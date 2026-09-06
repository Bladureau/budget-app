# Spécification de fonctionnalité : Revenus, abonnements prévisionnels et budget mensuel

**Branche de fonctionnalité** : `002-income-subscriptions-budget`

**Créée le** : 2026-09-05

**Statut** : Brouillon

**Entrée** : Description utilisateur : « Je veux une application web, capable d'enregistrer les
revenus que j'ai disponibles, de mettre des abonnements en prévisions et de maintenir un budget
mensuel. »

## Scénarios utilisateur et tests *(obligatoire)*

### Récit utilisateur 1 – Enregistrer mes revenus disponibles (Priorité : P1)

En tant que personne qui gère son argent seule, je veux déclarer ce que je perçois — mon salaire
mensuel, et les rentrées ponctuelles comme une prime ou un remboursement — afin de connaître le
montant réellement disponible pour un mois donné.

**Pourquoi cette priorité** : sans revenu déclaré, aucun budget n'a de dénominateur. C'est la plus
petite tranche livrable qui a une valeur autonome : même si rien d'autre n'est construit,
l'utilisateur dispose du total de ce qu'il perçoit chaque mois.

**Test indépendant** : entièrement testable en saisissant un revenu récurrent et un revenu ponctuel,
en rechargeant l'application, puis en vérifiant que le total des revenus du mois consulté est bien la
somme des deux et qu'il persiste.

**Scénarios d'acceptation** :

1. **Étant donné** un mois sans revenu enregistré, **quand** l'utilisateur déclare un salaire
   récurrent de 2 400,00 € versé chaque mois, **alors** le total des revenus du mois affiche
   2 400,00 € et le même montant apparaît sur les mois suivants.
2. **Étant donné** un salaire récurrent de 2 400,00 €, **quand** l'utilisateur ajoute une prime
   ponctuelle de 500,00 € en mars 2026, **alors** le total des revenus de mars 2026 affiche
   2 900,00 € et celui d'avril 2026 reste à 2 400,00 €.
3. **Étant donné** un revenu enregistré, **quand** l'utilisateur en modifie le montant ou la date,
   **alors** les totaux des mois concernés sont recalculés.
4. **Étant donné** un revenu enregistré, **quand** l'utilisateur le supprime, **alors** il
   disparaît des totaux des mois concernés.
5. **Étant donné** la saisie d'un revenu, **quand** l'utilisateur entre un montant négatif, vide ou
   non numérique, **alors** la saisie est refusée avec un message explicatif et rien n'est
   enregistré.
6. **Étant donné** un revenu récurrent, **quand** l'utilisateur lui donne une date de fin,
   **alors** il cesse d'être compté à partir du mois suivant cette date.

---

### Récit utilisateur 2 – Déclarer mes abonnements en prévision (Priorité : P1)

Je veux enregistrer mes dépenses récurrentes engagées — loyer, énergie, téléphonie, plateformes de
streaming, assurances — avec leur montant et leur périodicité, afin de savoir ce qui est déjà
engagé avant même d'avoir dépensé quoi que ce soit.

**Pourquoi cette priorité** : les charges récurrentes sont la part du budget la plus prévisible et
la plus oubliée. Cette tranche a une valeur autonome immédiate : elle répond à la question
« combien me coûtent mes abonnements chaque mois ? » sans dépendre d'aucun autre récit.

**Test indépendant** : entièrement testable en déclarant plusieurs abonnements de périodicités
différentes, puis en vérifiant le total engagé du mois consulté et le coût mensuel moyen affiché,
sans qu'aucun revenu ne soit enregistré.

**Scénarios d'acceptation** :

1. **Étant donné** aucun abonnement, **quand** l'utilisateur déclare un abonnement mensuel de
   13,99 € prélevé le 5 de chaque mois, **alors** cet abonnement apparaît dans les charges engagées
   de chaque mois à compter de sa date de début, pour 13,99 €.
2. **Étant donné** un abonnement annuel de 120,00 € dont l'échéance tombe en septembre,
   **quand** l'utilisateur consulte septembre 2026, **alors** les charges engagées du mois incluent
   120,00 € ; **et quand** il consulte octobre 2026, **alors** cet abonnement n'y est pas compté.
3. **Étant donné** un abonnement annuel de 120,00 €, **quand** l'utilisateur consulte le coût
   mensuel moyen de ses abonnements, **alors** cet abonnement y contribue pour 10,00 €.
4. **Étant donné** un abonnement déclaré, **quand** l'utilisateur lui donne une date de début
   postérieure au mois consulté, **alors** il n'est pas compté dans ce mois.
5. **Étant donné** la saisie d'un abonnement, **quand** le montant est négatif ou non numérique, ou
   qu'aucune périodicité n'est choisie, **alors** la saisie est refusée avec un message explicatif.
6. **Étant donné** plusieurs abonnements, **quand** l'utilisateur consulte la liste, **alors** elle
   peut être triée par montant et par date de prochaine échéance.

---

### Récit utilisateur 3 – Consulter mon budget mensuel et mon reste disponible (Priorité : P2)

Je veux une vue par mois qui met face à face ce que je perçois et ce qui est déjà engagé, et qui me
donne le montant qu'il me reste réellement pour vivre, afin de savoir en un coup d'œil si le mois
tient debout.

**Pourquoi cette priorité** : c'est là que la valeur se matérialise — les récits 1 et 2 collectent
la matière, celui-ci produit la réponse. Il est classé après eux car il n'a de sens qu'une fois au
moins l'un des deux renseigné.

**Test indépendant** : entièrement testable en enregistrant des revenus et des abonnements sur un
mois, puis en vérifiant que le reste disponible affiché est exactement la différence entre les deux
totaux, y compris lorsqu'elle est négative.

**Scénarios d'acceptation** :

1. **Étant donné** 2 400,00 € de revenus et 1 450,00 € de charges engagées en mars 2026,
   **quand** l'utilisateur consulte mars 2026, **alors** le reste disponible affiche 950,00 €.
2. **Étant donné** 1 200,00 € de revenus et 1 450,00 € de charges engagées, **quand** l'utilisateur
   consulte le mois, **alors** le reste disponible est présenté comme un déficit de 250,00 €, dans
   un état visuellement distinct et accompagné d'un libellé textuel.
3. **Étant donné** un mois sans aucune donnée, **quand** l'utilisateur le consulte, **alors** la vue
   affiche des totaux à zéro et invite à enregistrer un revenu ou un abonnement, sans état d'erreur.
4. **Étant donné** un mois renseigné, **quand** l'utilisateur ajoute, modifie ou supprime un revenu
   ou un abonnement, **alors** les trois totaux du mois sont à jour sans action manuelle de
   rafraîchissement.
5. **Étant donné** la vue d'un mois, **quand** l'utilisateur consulte le détail, **alors** il voit la
   ventilation des charges engagées abonnement par abonnement, ordonnée du montant le plus élevé au
   plus faible.
6. **Étant donné** la vue d'un mois, **quand** l'utilisateur consulte le taux d'engagement,
   **alors** il voit quelle part de ses revenus est absorbée par ses charges récurrentes, exprimée
   en pourcentage.

---

### Récit utilisateur 4 – Naviguer entre les mois et anticiper les échéances (Priorité : P3)

Je veux passer d'un mois à l'autre, y compris vers des mois futurs, et repérer à l'avance les mois
lourds — celui où l'assurance annuelle tombe en même temps que la taxe — afin de ne pas les
découvrir le jour venu.

**Pourquoi cette priorité** : l'anticipation est le bénéfice de fond du prévisionnel, mais
l'application reste utile mois par mois sans elle.

**Test indépendant** : entièrement testable en déclarant un abonnement annuel et un abonnement
mensuel, puis en parcourant douze mois consécutifs et en vérifiant que l'échéance annuelle
n'apparaît que dans son mois et que les mois futurs sont projetés à partir des éléments récurrents
connus.

**Scénarios d'acceptation** :

1. **Étant donné** des revenus et abonnements récurrents déclarés, **quand** l'utilisateur consulte
   un mois futur, **alors** ce mois est projeté à partir des éléments récurrents actifs à cette date,
   et est identifié comme une projection.
2. **Étant donné** douze mois projetés, **quand** l'utilisateur consulte la vue d'anticipation,
   **alors** les mois dont les charges engagées dépassent les revenus sont signalés.
3. **Étant donné** des abonnements de périodicités variées, **quand** l'utilisateur consulte les
   échéances à venir, **alors** il voit les prochains prélèvements ordonnés par date, avec leur
   montant.
4. **Étant donné** un mois passé, **quand** l'utilisateur le consulte, **alors** ses montants
   reflètent les éléments tels qu'ils s'appliquaient à ce mois et ne sont pas réécrits par les
   modifications ultérieures.

---

### Récit utilisateur 5 – Faire évoluer un abonnement (Priorité : P3)

Je veux enregistrer qu'un abonnement change de prix, est mis en pause ou est résilié, afin que mes
prévisions restent justes sans que j'aie à supprimer puis recréer la ligne et perdre son historique.

**Pourquoi cette priorité** : indispensable sur la durée, mais un abonnement peut d'abord être
supprimé puis recréé ; l'application est utilisable sans ce récit pendant les premiers mois.

**Test indépendant** : entièrement testable en modifiant le tarif d'un abonnement à partir d'une
date donnée, puis en vérifiant que les mois antérieurs conservent l'ancien montant et que les mois
suivants appliquent le nouveau.

**Scénarios d'acceptation** :

1. **Étant donné** un abonnement à 9,99 €, **quand** l'utilisateur enregistre un passage à 12,99 € à
   compter de juin 2026, **alors** les mois jusqu'à mai 2026 comptent 9,99 € et les mois à partir de
   juin 2026 comptent 12,99 €.
2. **Étant donné** un abonnement actif, **quand** l'utilisateur le résilie à une date donnée,
   **alors** il cesse d'être compté après cette date et reste consultable dans les mois où il
   s'appliquait.
3. **Étant donné** un abonnement résilié, **quand** l'utilisateur consulte la liste des abonnements
   actifs, **alors** il n'y figure pas, mais reste accessible dans une liste des abonnements
   inactifs.
4. **Étant donné** un abonnement mis en pause sur une période, **quand** l'utilisateur consulte un
   mois de cette période, **alors** l'abonnement n'y est pas compté, et il l'est de nouveau ensuite.

---

### Cas limites

- **Mois sans revenu mais avec des charges** : le reste disponible est un déficit égal au total des
  charges ; la vue reste lisible et ne présente pas d'état d'erreur.
- **Abonnement dont le jour de prélèvement n'existe pas dans le mois** (le 31 en février) :
  l'échéance est rattachée au dernier jour du mois, sans être ni perdue ni dupliquée.
- **Abonnement annuel démarré en cours d'année** : sa première échéance tombe à la date de début,
  puis aux anniversaires de cette date ; aucun montant n'est compté avant la date de début.
- **Revenu ou abonnement dont la date de fin précède la date de début** : la saisie est refusée.
- **Périodicité dont l'échéance tombe deux fois dans le même mois** (cas d'une périodicité
  hebdomadaire) : chaque occurrence est comptée, et le total du mois reflète le nombre réel
  d'échéances.
- **Modification rétroactive d'un revenu récurrent** : l'utilisateur doit pouvoir distinguer
  « corriger une erreur sur tout l'historique » de « changement à partir d'une date », les deux
  n'ayant pas le même effet sur les mois passés.
- **Montants très élevés et très nombreux** : les totaux restent exacts et lisibles, sans troncature
  ni dérive d'arrondi.
- **Consultation d'un mois très éloigné dans le futur** : la projection reste cohérente et signale
  qu'elle repose uniquement sur les éléments récurrents connus à ce jour.
- **Changement d'année** : le passage de décembre à janvier conserve la continuité des éléments
  récurrents.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

**Revenus**

- **EF-001** : L'utilisateur DOIT pouvoir enregistrer un revenu en précisant son montant, sa date et
  un libellé.
- **EF-002** : L'utilisateur DOIT pouvoir qualifier un revenu de ponctuel ou de récurrent, et pour un
  revenu récurrent préciser sa périodicité, sa date de début et, facultativement, sa date de fin.
- **EF-003** : L'utilisateur DOIT pouvoir modifier et supprimer un revenu.
- **EF-004** : Le système DOIT refuser un montant négatif, vide ou non numérique, et une date de fin
  antérieure à la date de début, en expliquant le refus par un texte et sans enregistrer la saisie.
- **EF-005** : Le système DOIT calculer le total des revenus d'un mois comme la somme des revenus
  ponctuels datés dans ce mois et des occurrences des revenus récurrents actifs pour ce mois.

**Abonnements**

- **EF-006** : L'utilisateur DOIT pouvoir enregistrer un abonnement en précisant son libellé, son
  montant, sa périodicité, sa date de début et, facultativement, sa date de fin.
- **EF-007** : Le système DOIT prendre en charge les périodicités mensuelle, trimestrielle,
  semestrielle et annuelle.
- **EF-008** : Le système DOIT rattacher chaque échéance d'abonnement au mois où elle tombe, et
  n'imputer un abonnement non mensuel qu'aux mois où une échéance survient réellement.
- **EF-009** : Le système DOIT calculer, en complément, un coût mensuel moyen par abonnement,
  correspondant au montant de l'échéance ramené au mois selon sa périodicité.
- **EF-010** : L'utilisateur DOIT pouvoir enregistrer un changement de montant applicable à partir
  d'une date, sans que les mois antérieurs à cette date en soient affectés.
- **EF-011** : L'utilisateur DOIT pouvoir résilier un abonnement à une date donnée et pouvoir le
  suspendre sur une période bornée.
- **EF-012** : Le système DOIT conserver les abonnements résiliés en consultation et les exclure de
  la liste des abonnements actifs.
- **EF-013** : Lorsque le jour de prélèvement n'existe pas dans un mois donné, le système DOIT
  rattacher l'échéance au dernier jour de ce mois.

**Budget mensuel**

- **EF-014** : Le système DOIT présenter, pour le mois consulté, le total des revenus, le total des
  charges engagées et le reste disponible, ce dernier étant la différence des deux premiers.
- **EF-015** : Le système DOIT présenter un reste disponible négatif comme un déficit explicitement
  libellé, dans un état distinct de l'état excédentaire.
- **EF-016** : Le système DOIT distinguer ses états — excédent, équilibre, déficit — autrement que
  par la seule couleur.
- **EF-017** : Le système DOIT afficher la ventilation des charges engagées du mois, abonnement par
  abonnement, ordonnée du montant le plus élevé au plus faible.
- **EF-018** : Le système DOIT afficher le taux d'engagement du mois, soit la part des revenus
  absorbée par les charges engagées, exprimée en pourcentage.
- **EF-019** : Le système DOIT recalculer les totaux d'un mois dès qu'un revenu ou un abonnement
  qui le concerne est créé, modifié ou supprimé, sans action manuelle de rafraîchissement.
- **EF-020** : Le système DOIT afficher une vue exploitable pour un mois dépourvu de données, avec
  des totaux à zéro et une invitation à saisir.

**Navigation et anticipation**

- **EF-021** : L'utilisateur DOIT pouvoir naviguer vers le mois précédent et le mois suivant, et
  atteindre directement le mois courant.
- **EF-022** : Le système DOIT projeter les mois futurs à partir des éléments récurrents actifs à
  leur date, et signaler qu'il s'agit d'une projection.
- **EF-023** : Le système DOIT proposer une vue des douze prochains mois signalant ceux dont les
  charges engagées dépassent les revenus.
- **EF-024** : Le système DOIT proposer une liste des prochaines échéances d'abonnement, ordonnée
  par date, avec leur montant.
- **EF-025** : Le système DOIT préserver les montants des mois passés lorsqu'un changement est
  enregistré à partir d'une date postérieure.

**Données**

- **EF-026** : Le système DOIT conserver revenus et abonnements de manière à ce qu'ils survivent à
  la fermeture et à la réouverture de l'application.
- **EF-027** : Tous les montants DOIVENT être exacts au centime, sans dérive d'arrondi lors des
  totalisations et des conversions de périodicité.
- **EF-028** : Le système DOIT accepter indifféremment la virgule et le point comme séparateur
  décimal à la saisie d'un montant, et interpréter les deux formes de façon identique.

### Entités clés

- **Revenu** : une rentrée d'argent. Attributs : libellé, montant, nature (ponctuel ou récurrent),
  date — ou périodicité, date de début et date de fin facultative pour un revenu récurrent.
- **Abonnement** : une charge récurrente engagée. Attributs : libellé, montant courant, périodicité,
  jour de prélèvement, date de début, date de fin facultative, périodes de suspension et historique
  des montants applicables par période.
- **Échéance** : une occurrence datée d'un abonnement ou d'un revenu récurrent, rattachée au mois où
  elle tombe. Dérivée de l'élément récurrent plutôt que saisie.
- **Budget mensuel** : la vue dérivée d'un mois calendaire — total des revenus, total des charges
  engagées, reste disponible, taux d'engagement, ventilation par abonnement, et indication du
  caractère projeté ou constaté du mois.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Un utilisateur partant d'une application vide peut enregistrer son salaire et cinq
  abonnements, puis lire son reste disponible du mois, en moins de cinq minutes.
- **CS-002** : Le reste disponible affiché est exactement égal au total des revenus moins le total
  des charges engagées, au centime près, sur un jeu d'au moins cinquante éléments récurrents et
  ponctuels combinés.
- **CS-003** : Sur douze mois consécutifs comportant des abonnements mensuels, trimestriels et
  annuels, chaque abonnement est compté exactement une fois par échéance réelle, sans oubli ni
  doublon.
- **CS-004** : Après l'ajout, la modification ou la suppression d'un revenu ou d'un abonnement, les
  totaux du mois consulté reflètent le changement sans que l'utilisateur ait à rafraîchir ou à
  déclencher un recalcul.
- **CS-005** : Un utilisateur identifie en moins de cinq secondes, sur la vue d'anticipation, le mois
  des douze prochains qui présente le déficit le plus important.
- **CS-006** : Un changement de tarif enregistré à une date donnée ne modifie aucun montant affiché
  pour les mois antérieurs à cette date, vérifié sur au moins trois mois précédents.
- **CS-007** : 100 % des états du budget mensuel — excédent, équilibre, déficit — restent
  distinguables lorsque la couleur est retirée de l'affichage.
- **CS-008** : L'application reste utilisable pour consulter et saisir revenus et abonnements sans
  connexion réseau.

## Hypothèses

- **Le suivi des dépenses ponctuelles est hors périmètre de cette fonctionnalité.** La description
  demande d'enregistrer les revenus, de mettre les abonnements en prévision et de maintenir un
  budget mensuel : le budget produit ici est donc prévisionnel — ce qui entre, ce qui est déjà
  engagé, ce qu'il reste. La saisie des dépenses variables du quotidien et leur rapprochement avec
  ce prévisionnel feront l'objet d'une fonctionnalité distincte.
- **Articulation avec la fonctionnalité 001** : les enveloppes budgétaires par catégorie
  (`specs/001-monthly-budget-envelopes`) portent sur le plafonnement des dépenses variables par
  catégorie. Elles sont complémentaires et non redondantes : la présente fonctionnalité détermine le
  reste disponible, celle-là répartira ce reste entre catégories. Aucune des deux ne dépend de
  l'autre pour être livrée.
- **Les abonnements sont saisis manuellement.** Aucune connexion à un établissement bancaire, aucun
  import de relevé, aucune détection automatique d'abonnement, conformément au principe I de la
  constitution.
- **Devise unique** — l'euro — conformément au périmètre mono-utilisateur de la constitution. Le
  multi-devises est hors périmètre.
- **Les échéances non mensuelles sont imputées au mois où elles tombent**, et non lissées sur
  l'année. Ce choix reflète la trésorerie réelle, qui est ce dont l'utilisateur a besoin pour savoir
  si un mois tient. Le coût mensuel moyen (EF-009) est fourni en complément, comme indicateur, et
  n'entre pas dans le calcul du reste disponible.
- **Les mois sont des mois calendaires** dans le fuseau horaire local. Les périodes budgétaires
  calées sur la date de versement du salaire sont hors périmètre.
- **Aucun report de solde d'un mois sur l'autre.** Un excédent de mars n'augmente pas le reste
  disponible d'avril. Le cumul d'épargne est une fonctionnalité possible ultérieurement.
- **Aucune notification, alerte ou relance hors de l'application.** Les signalements de déficit et
  d'échéance sont visibles à l'ouverture de la vue concernée, conformément aux contraintes de la
  constitution sur l'absence de télémétrie et de dépendance à un service tiers.
- **Utilisateur unique, sans compte ni partage**, conformément à la constitution. Aucun rôle, aucune
  authentification, aucun budget partagé.
- **La périodicité hebdomadaire n'est pas prise en charge** dans cette version : elle est rare pour
  un abonnement et complique le rattachement mensuel. Elle est citée en cas limite pour mémoire.
- **La langue de l'interface n'est pas tranchée par la constitution**, dont le principe VIII ne
  couvre que les artefacts de projet et non les textes affichés à l'utilisateur. Cette spécification
  retient donc le **français** pour tous les textes affichés, ainsi que le format monétaire français
  (`1 234,56 €`) et les dates au format `JJ/MM/AAAA`.
