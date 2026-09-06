# Spécification de fonctionnalité : Tableau de bord — anneau mensuel, allocation quotidienne et journal des dépenses

**Branche de fonctionnalité** : `003-daily-allowance-dashboard`

**Créée le** : 2026-09-05

**Statut** : Brouillon

**Entrée** : Description utilisateur : « Je veux une interface moderne, avec une sorte de cercle pour
me montrer le montant restant que je peux me permettre de dépenser mensuellement, un montant
quotidien fluctuable (si je dépense moins de la limite quotidienne, ça se répercute sur le jour
suivant), et la liste de mes dépenses que je peux regarder comme sur une application de banque
normale. »

## Scénarios utilisateur et tests *(obligatoire)*

### Récit utilisateur 1 – Enregistrer une dépense en quelques secondes (Priorité : P1)

En tant que personne qui note ses dépenses au moment où elle les fait, je veux saisir un montant et
valider en très peu de gestes, afin que noter une dépense au comptoir d'une boulangerie ne soit pas
plus long que de payer.

**Pourquoi cette priorité** : c'est la source de toutes les autres vues. Sans dépense enregistrée,
l'anneau ne bouge jamais, l'allocation quotidienne ne fluctue pas et le journal reste vide. C'est
aussi la plus petite tranche à valeur autonome : même seule, elle donne un carnet de dépenses.

**Test indépendant** : entièrement testable en saisissant plusieurs dépenses, en rechargeant
l'application et en vérifiant qu'elles sont toutes présentes avec le bon montant et la bonne date,
sans qu'aucune autre partie de la fonctionnalité ne soit construite.

**Scénarios d'acceptation** :

1. **Étant donné** l'écran principal, **quand** l'utilisateur saisit un montant de 12,40 € et valide,
   **alors** la dépense est enregistrée à la date du jour et apparaît immédiatement en tête du
   journal.
2. **Étant donné** la saisie d'une dépense, **quand** l'utilisateur ne renseigne ni libellé ni
   catégorie, **alors** la dépense est tout de même enregistrée, avec un libellé par défaut et sans
   catégorie.
3. **Étant donné** la saisie d'une dépense, **quand** l'utilisateur renseigne un libellé, une
   catégorie et une date antérieure, **alors** ces valeurs sont enregistrées et la dépense est
   rattachée à la date choisie.
4. **Étant donné** la saisie d'une dépense, **quand** le montant est vide, nul, négatif ou non
   numérique, **alors** la saisie est refusée avec un message explicatif et rien n'est enregistré.
5. **Étant donné** une dépense enregistrée, **quand** l'utilisateur ferme puis rouvre l'application,
   **alors** la dépense est toujours présente à l'identique.
6. **Étant donné** la saisie d'une dépense, **quand** l'utilisateur saisit un montant avec une
   virgule décimale (`12,40`) ou un point (`12.40`), **alors** les deux formes sont acceptées et
   enregistrent le même montant.

---

### Récit utilisateur 2 – Voir dans l'anneau ce qu'il me reste ce mois (Priorité : P1)

Je veux qu'un anneau occupe le haut de l'écran principal et m'affiche, en grand, le montant qu'il me
reste à dépenser d'ici la fin du mois, avec la portion déjà consommée matérialisée sur son
pourtour, afin de connaître ma situation sans lire un tableau.

**Pourquoi cette priorité** : c'est l'élément que l'utilisateur a décrit en premier et celui qu'il
regardera le plus souvent. Il apporte une valeur propre dès qu'une seule dépense existe.

**Test indépendant** : entièrement testable en fixant un montant disponible pour le mois, en
saisissant des dépenses, puis en vérifiant que le montant affiché au centre de l'anneau et la
portion remplie correspondent exactement à ce qui a été consommé.

**Scénarios d'acceptation** :

1. **Étant donné** 900,00 € disponibles pour le mois et aucune dépense, **quand** l'utilisateur
   ouvre l'écran principal, **alors** l'anneau affiche 900,00 € restants et une portion consommée
   nulle.
2. **Étant donné** 900,00 € disponibles et 225,00 € dépensés, **quand** l'utilisateur consulte
   l'anneau, **alors** il affiche 675,00 € restants et une portion consommée d'un quart.
3. **Étant donné** 900,00 € disponibles et 900,00 € dépensés, **quand** l'utilisateur consulte
   l'anneau, **alors** il affiche 0,00 € restant, une portion entièrement consommée et un état
   « budget épuisé » signalé par un libellé textuel.
4. **Étant donné** 900,00 € disponibles et 1 020,00 € dépensés, **quand** l'utilisateur consulte
   l'anneau, **alors** il affiche un dépassement de 120,00 €, la portion reste plafonnée au tour
   complet sans déborder, et l'état « dépassement » est signalé textuellement.
5. **Étant donné** un mois pour lequel aucun revenu ni abonnement n'a été renseigné, **quand**
   l'utilisateur ouvre l'écran principal, **alors** l'anneau affiche 0,00 € et invite explicitement
   à renseigner revenus et abonnements, sans état d'erreur.
6. **Étant donné** l'anneau affiché, **quand** l'utilisateur enregistre une nouvelle dépense,
   **alors** le montant restant et la portion consommée sont mis à jour sans action manuelle de
   rafraîchissement.
7. **Étant donné** l'anneau dans l'un de ses états, **quand** la couleur est retirée de l'affichage,
   **alors** l'état reste identifiable par le texte et la proportion.

---

### Récit utilisateur 3 – Savoir ce que je peux dépenser aujourd'hui, avec report (Priorité : P2)

Je veux voir, sous l'anneau, le montant que je peux dépenser aujourd'hui, calculé en répartissant ce
qu'il me reste sur les jours restants du mois — de sorte qu'un jour où je dépense peu augmente ce
que j'ai le lendemain, et qu'un jour de trop forte dépense le réduise. Je veux aussi voir
explicitement ce que la veille m'a rapporté ou coûté.

**Pourquoi cette priorité** : c'est le mécanisme qui rend le budget vivant au quotidien, mais il
suppose l'anneau et la saisie pour avoir un sens.

**Test indépendant** : entièrement testable en fixant un montant disponible et un nombre de jours
restants connus, en saisissant des dépenses inférieures puis supérieures à l'allocation, et en
vérifiant que l'allocation du lendemain augmente ou diminue exactement du montant attendu.

**Scénarios d'acceptation** :

1. **Étant donné** 300,00 € restants et 10 jours restants dans le mois, aujourd'hui inclus,
   **quand** l'utilisateur consulte son allocation du jour, **alors** elle affiche 30,00 €.
2. **Étant donné** une allocation du jour de 30,00 € et 10,00 € dépensés aujourd'hui, **quand**
   l'utilisateur consulte l'écran, **alors** il voit qu'il lui reste 20,00 € pour la journée.
3. **Étant donné** 300,00 € restants sur 10 jours et 10,00 € dépensés aujourd'hui, **quand** le jour
   suivant commence, **alors** l'allocation du nouveau jour est de 32,22 €, soit les 290,00 €
   restants répartis sur les 9 jours restants.
4. **Étant donné** 300,00 € restants sur 10 jours et 80,00 € dépensés aujourd'hui, **quand** le jour
   suivant commence, **alors** l'allocation du nouveau jour est de 24,44 €, soit les 220,00 €
   restants répartis sur les 9 jours restants.
5. **Étant donné** un jour écoulé où l'utilisateur a dépensé moins que son allocation, **quand** il
   consulte l'écran principal le lendemain, **alors** le report de la veille est affiché comme un
   gain, avec son montant.
6. **Étant donné** un jour écoulé où l'utilisateur a dépassé son allocation, **quand** il consulte
   l'écran principal le lendemain, **alors** le report de la veille est affiché comme une perte,
   avec son montant.
7. **Étant donné** un montant restant nul ou négatif, **quand** l'utilisateur consulte son allocation
   du jour, **alors** elle affiche 0,00 € accompagnée d'un libellé indiquant qu'il n'y a plus rien à
   répartir.
8. **Étant donné** le dernier jour du mois, **quand** l'utilisateur consulte son allocation du jour,
   **alors** elle est égale à la totalité du montant restant.
9. **Étant donné** la fin d'un mois avec un montant restant non consommé, **quand** le mois suivant
   commence, **alors** l'allocation quotidienne repart du budget du nouveau mois et le reliquat du
   mois précédent n'est pas reporté.

---

### Récit utilisateur 4 – Parcourir mes dépenses comme un relevé bancaire (Priorité : P2)

Je veux une liste de mes dépenses présentée comme dans une application bancaire : les plus récentes
en haut, regroupées par jour avec un sous-total par journée, que je peux faire défiler loin en
arrière et dans laquelle je peux rechercher.

**Pourquoi cette priorité** : c'est la vue de consultation et de contrôle, celle qui permet de
retrouver « où est passé l'argent ». Elle a une valeur propre dès que des dépenses existent.

**Test indépendant** : entièrement testable en saisissant des dépenses sur plusieurs jours et
plusieurs mois, puis en vérifiant l'ordre d'affichage, les regroupements par jour, les sous-totaux
et le résultat d'une recherche.

**Scénarios d'acceptation** :

1. **Étant donné** des dépenses sur plusieurs jours, **quand** l'utilisateur ouvre le journal,
   **alors** elles apparaissent de la plus récente à la plus ancienne, regroupées par jour.
2. **Étant donné** trois dépenses le même jour, **quand** l'utilisateur consulte ce jour dans le
   journal, **alors** un sous-total de la journée est affiché et vaut la somme des trois montants.
3. **Étant donné** un journal contenant des dépenses, **quand** l'utilisateur saisit un terme de
   recherche, **alors** seules les dépenses dont le libellé ou la catégorie contient ce terme sont
   affichées, la casse et les accents étant ignorés.
4. **Étant donné** un journal contenant des dépenses de plusieurs mois, **quand** l'utilisateur
   filtre sur un mois, **alors** seules les dépenses de ce mois sont affichées, avec leur total.
5. **Étant donné** un journal sans aucune dépense, **quand** l'utilisateur l'ouvre, **alors** un
   message explique comment enregistrer une première dépense, sans état d'erreur.
6. **Étant donné** un journal contenant un grand nombre de dépenses, **quand** l'utilisateur fait
   défiler vers le passé, **alors** les dépenses plus anciennes se chargent au fil du défilement
   sans interruption perceptible.
7. **Étant donné** une recherche sans résultat, **quand** l'utilisateur consulte la liste, **alors**
   un message le lui indique et propose d'effacer la recherche.

---

### Récit utilisateur 5 – Consulter, corriger ou supprimer une dépense (Priorité : P3)

Je veux ouvrir une dépense pour en voir le détail, corriger un montant saisi trop vite ou supprimer
un doublon, afin que mon budget reste juste sans que je doive tout reprendre.

**Pourquoi cette priorité** : indispensable sur la durée, mais l'application reste utilisable
plusieurs semaines sans correction, en saisissant avec soin.

**Test indépendant** : entièrement testable en modifiant le montant puis la date d'une dépense
existante, et en vérifiant que l'anneau, l'allocation du jour et le journal reflètent la
modification.

**Scénarios d'acceptation** :

1. **Étant donné** une dépense dans le journal, **quand** l'utilisateur l'ouvre, **alors** il voit
   son montant, sa date, son libellé et sa catégorie.
2. **Étant donné** le détail d'une dépense, **quand** l'utilisateur en modifie le montant, **alors**
   l'anneau, l'allocation du jour et le sous-total de la journée concernée sont recalculés.
3. **Étant donné** le détail d'une dépense, **quand** l'utilisateur en modifie la date pour une autre
   journée, **alors** elle change de regroupement dans le journal et les sous-totaux des deux
   journées concernées sont recalculés.
4. **Étant donné** le détail d'une dépense, **quand** l'utilisateur demande sa suppression,
   **alors** une confirmation lui est demandée avant que la suppression ne soit effectuée.
5. **Étant donné** une dépense supprimée, **quand** l'utilisateur consulte l'écran principal,
   **alors** le montant restant de l'anneau a augmenté du montant supprimé.

---

### Cas limites

- **Dépense enregistrée juste avant minuit puis consultée après minuit** : elle reste rattachée au
  jour de sa date, et le calcul de l'allocation du nouveau jour la compte comme dépense de la veille.
- **Dépense datée d'un mois passé ou futur** : elle n'entre pas dans l'anneau du mois courant ni dans
  l'allocation du jour, mais reste visible dans le journal au mois auquel elle appartient.
- **Jour restant unique** : l'allocation du jour vaut la totalité du montant restant, sans division.
- **Montant restant non divisible exactement par le nombre de jours restants** : la répartition ne
  doit jamais allouer plus que ce qui reste réellement disponible.
- **Changement de mois pendant que l'application est ouverte** : l'anneau et l'allocation basculent
  sur le nouveau mois sans que l'utilisateur ait à recharger.
- **Mois de 28, 29, 30 ou 31 jours** : le nombre de jours restants est calculé sur la longueur réelle
  du mois.
- **Changement d'heure saisonnier** : le découpage en journées reste celui du calendrier local, sans
  journée dupliquée ni manquante.
- **Montant disponible du mois négatif dès le départ** (charges engagées supérieures aux revenus) :
  l'anneau affiche l'état de déficit et l'allocation quotidienne est nulle, sans état d'erreur.
- **Très grand nombre de dépenses sur un même jour** : le sous-total de la journée reste exact et le
  regroupement reste lisible.
- **Saisie d'un montant à plus de deux décimales** : la saisie est refusée ou arrondie selon une
  règle annoncée à l'utilisateur, jamais silencieusement tronquée.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

**Saisie des dépenses**

- **EF-001** : L'utilisateur DOIT pouvoir enregistrer une dépense en saisissant au minimum un
  montant, la date du jour étant appliquée par défaut.
- **EF-002** : L'utilisateur DOIT pouvoir renseigner facultativement un libellé, une catégorie et une
  date différente de celle du jour.
- **EF-003** : Le système DOIT accepter la virgule comme la virgule décimale et le point comme
  séparateur décimal, et interpréter les deux de façon identique.
- **EF-004** : Le système DOIT refuser un montant vide, nul, négatif, non numérique ou comportant
  plus de deux décimales, en expliquant le refus par un texte et sans rien enregistrer.
- **EF-005** : Le système DOIT conserver les dépenses de manière à ce qu'elles survivent à la
  fermeture et à la réouverture de l'application.
- **EF-006** : L'utilisateur DOIT pouvoir consulter le détail d'une dépense, la modifier et la
  supprimer, la suppression exigeant une confirmation.

**Anneau du montant mensuel restant**

- **EF-007** : Le système DOIT afficher le montant restant à dépenser pour le mois courant au centre
  d'un anneau de progression, comme élément principal de l'écran d'accueil.
- **EF-008** : Le système DOIT calculer le montant restant du mois comme le montant disponible du
  mois diminué du total des dépenses datées dans ce mois.
- **EF-009** : Le système DOIT reprendre comme montant disponible du mois le reste disponible établi
  par le budget prévisionnel du mois — revenus moins charges récurrentes engagées.
- **EF-010** : Le système DOIT matérialiser sur le pourtour de l'anneau la proportion du montant
  disponible déjà consommée.
- **EF-011** : Le système DOIT présenter l'anneau dans l'un de ces quatre états : intact (aucune
  dépense), en cours, épuisé (montant restant nul) ou en dépassement (dépenses supérieures au
  disponible).
- **EF-012** : En cas de dépassement, le système DOIT afficher le montant du dépassement plutôt qu'un
  reste négatif, et plafonner le remplissage de l'anneau au tour complet.
- **EF-013** : Le système DOIT signaler l'état de l'anneau par du texte en plus de la couleur et de
  la proportion.
- **EF-014** : Lorsque aucun revenu ni abonnement n'est renseigné pour le mois, le système DOIT
  afficher un montant disponible nul et inviter explicitement l'utilisateur à les renseigner.

**Allocation quotidienne fluctuante**

- **EF-015** : Le système DOIT afficher, sous l'anneau, le montant que l'utilisateur peut dépenser
  aujourd'hui.
- **EF-016** : Le système DOIT calculer l'allocation du jour en répartissant le montant restant du
  mois sur le nombre de jours restants du mois, aujourd'hui inclus.
- **EF-017** : Le système DOIT arrondir l'allocation du jour au centime inférieur, de sorte que la
  somme des allocations restantes n'excède jamais le montant réellement disponible.
- **EF-018** : Le système DOIT afficher le montant déjà dépensé aujourd'hui et ce qu'il reste pour la
  journée.
- **EF-019** : Le système DOIT afficher le report de la veille, présenté comme un gain lorsque la
  dépense de la veille a été inférieure à son allocation, et comme une perte dans le cas contraire.
- **EF-020** : Le système DOIT pouvoir restituer, pour chaque jour écoulé du mois, l'allocation qui
  s'appliquait ce jour-là et le montant dépensé, afin d'en déduire le report.

  > **Amendée le 2026-09-06.** La rédaction initiale imposait de *conserver* ces valeurs. La
  > conception a montré qu'elles se déduisent intégralement du montant disponible du mois, des
  > dépenses antérieures et du nombre de jours restants — les quatre scénarios chiffrés du récit 3
  > se reproduisent exactement par le calcul. Les stocker créerait des trous les jours où
  > l'application n'est pas ouverte, et imposerait une écriture hors action utilisateur. L'exigence
  > porte donc désormais sur la **capacité à restituer**, non sur le moyen. Les neuf scénarios
  > d'acceptation du récit 3 sont inchangés.
- **EF-021** : Lorsque le montant restant du mois est nul ou négatif, le système DOIT afficher une
  allocation du jour nulle assortie d'un libellé explicatif.
- **EF-022** : Le système NE DOIT PAS reporter un reliquat au-delà de la fin du mois ; l'allocation
  repart du budget du mois suivant.
- **EF-023** : Le système DOIT basculer sur le nouveau mois ou le nouveau jour sans intervention de
  l'utilisateur lorsque la date change alors que l'application est ouverte.

**Journal des dépenses**

- **EF-024** : Le système DOIT présenter les dépenses en liste chronologique inverse, de la plus
  récente à la plus ancienne.
- **EF-025** : Le système DOIT regrouper les dépenses par journée et afficher un sous-total pour
  chaque journée.
- **EF-026** : Le système DOIT permettre de rechercher une dépense par libellé ou par catégorie, sans
  tenir compte de la casse ni des accents.
- **EF-027** : Le système DOIT permettre de filtrer le journal sur un mois et d'afficher le total
  correspondant.
- **EF-028** : Le système DOIT charger les dépenses plus anciennes au fil du défilement, sans exiger
  d'action de pagination explicite.
- **EF-029** : Le système DOIT afficher un message d'accompagnement lorsque le journal est vide ou
  lorsqu'une recherche ne donne aucun résultat.

**Qualités de présentation**

- **EF-030** : Le système DOIT recalculer et réafficher l'anneau, l'allocation du jour et le journal
  dès qu'une dépense est créée, modifiée ou supprimée, sans action manuelle de rafraîchissement.
- **EF-031** : Le système DOIT présenter tous les montants au format monétaire français, avec deux
  décimales et le symbole de la devise.
- **EF-032** : Le système DOIT proposer un thème clair et un thème sombre, tous deux respectant les
  exigences de contraste.
- **EF-033** : Le système DOIT rester utilisable à partir d'une largeur de fenêtre de 360 px, l'anneau
  restant lisible sans défilement horizontal.
- **EF-034** : Le système DOIT proposer des cibles tactiles d'au moins 44 px pour les actions
  principales que sont la saisie d'une dépense et l'ouverture du journal.
- **EF-035** : Le système DOIT supprimer ou réduire les animations, dont celle de l'anneau, lorsque
  l'utilisateur a exprimé une préférence pour un mouvement réduit.

### Entités clés

- **Dépense** : une sortie d'argent enregistrée par l'utilisateur. Attributs : montant, date,
  libellé facultatif, catégorie facultative.
- **Journée budgétaire** : l'état d'un jour du mois. Attributs : la date, l'allocation qui
  s'appliquait ce jour-là, le montant dépensé ce jour-là. Le report est la différence des deux.
- **Solde mensuel** : la vue dérivée du mois courant — montant disponible, total dépensé, montant
  restant, proportion consommée et état de l'anneau.
- **Catégorie** : un regroupement de dépenses ayant du sens pour l'utilisateur, facultatif à la
  saisie et partagé avec les autres fonctionnalités budgétaires.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Un utilisateur enregistre une dépense courante, montant seul, en moins de dix secondes
  à partir de l'écran d'accueil.
- **CS-002** : Un utilisateur ouvrant l'application identifie en moins de trois secondes le montant
  qu'il lui reste pour le mois et celui dont il dispose aujourd'hui.
- **CS-003** : Le montant restant affiché dans l'anneau est exactement égal au montant disponible du
  mois moins la somme des dépenses du mois, au centime près, sur un mois d'au moins 200 dépenses.
- **CS-004** : La somme des allocations quotidiennes des jours restants n'excède jamais le montant
  restant du mois, vérifié sur l'ensemble des jours d'un mois complet.
- **CS-005** : Une journée dont la dépense est inférieure à l'allocation augmente l'allocation du
  lendemain exactement de l'écart réparti sur les jours restants, vérifié sur au moins cinq
  journées consécutives.
- **CS-006** : Aucun reliquat de fin de mois n'apparaît dans l'allocation du premier jour du mois
  suivant, vérifié sur deux changements de mois consécutifs.
- **CS-007** : Un utilisateur retrouve une dépense précise datant de plus de trois mois en moins de
  quinze secondes, par recherche ou par défilement.
- **CS-008** : Le journal reste consultable sans attente perceptible avec au moins 2 000 dépenses
  enregistrées.
- **CS-009** : 100 % des états de l'anneau et de l'allocation quotidienne restent identifiables
  lorsque la couleur est retirée de l'affichage.
- **CS-010** : L'ensemble de l'écran d'accueil reste utilisable au clavier seul et à 200 % de zoom,
  sans perte d'information ni défilement horizontal.

## Hypothèses

- **« Comme une application de banque » porte sur la présentation, pas sur la synchronisation
  bancaire.** Le journal reprend les codes de lecture d'un relevé — ordre antéchronologique,
  regroupement par jour, sous-totaux, recherche — mais aucune connexion à un établissement bancaire,
  aucun import de relevé et aucune détection automatique de transaction ne sont prévus, conformément
  au principe I de la constitution. Toutes les dépenses sont saisies à la main.
- **La saisie des dépenses est intégrée à cette fonctionnalité.** Elle n'existait dans aucune
  spécification antérieure, alors que le journal, l'anneau et l'allocation quotidienne en dépendent
  tous. La livrer ici rend cette fonctionnalité autonome et débloque au passage
  `specs/001-monthly-budget-envelopes`, qui l'attendait.
- **Le montant disponible du mois provient de la fonctionnalité 002**
  (`specs/002-income-subscriptions-budget`) : revenus du mois moins charges récurrentes engagées. En
  l'absence de ces données, il vaut zéro et l'application invite à les renseigner (EF-014). Cette
  fonctionnalité peut donc être développée et testée avec un montant disponible fourni, mais n'a de
  sens complet qu'une fois 002 livrée.
- **L'allocation quotidienne est recalculée chaque jour plutôt que tenue dans un compte de report
  distinct.** Répartir le montant restant sur les jours restants produit mécaniquement le
  comportement demandé — sous-dépenser augmente le lendemain, sur-dépenser le réduit — sans
  introduire de solde de report à maintenir. Ce choix suit le principe VI de la constitution.
- **L'arrondi de l'allocation se fait au centime inférieur.** Les centimes non répartis restent dans
  le montant restant et se redistribuent les jours suivants, ce qui garantit qu'aucune allocation ne
  promette de l'argent qui n'existe pas.
- **Les journées sont des journées calendaires** dans le fuseau horaire local, et les mois des mois
  calendaires, en cohérence avec les fonctionnalités 001 et 002.
- **Aucun report de reliquat d'un mois sur l'autre**, en cohérence avec les hypothèses des
  fonctionnalités 001 et 002. L'épargne du reliquat est une fonctionnalité envisageable
  ultérieurement.
- **Les dépenses de cette fonctionnalité et les transactions attendues par 001 sont la même chose.**
  Le type d'écriture retenu ici est la dépense ; les revenus restent gérés par 002. Les virements
  entre comptes sont hors périmètre.
- **La catégorie est facultative à la saisie**, pour ne pas ralentir le geste. Les dépenses sans
  catégorie apparaissent comme non catégorisées dans les vues qui trient par catégorie.
- **Aucune photo de justificatif, aucune géolocalisation, aucune saisie vocale** dans cette version.
- **Utilisateur unique, sans compte ni partage**, conformément à la constitution.
- **Devise unique — l'euro —** avec le format monétaire français (`1 234,56 €`) et les dates au
  format `JJ/MM/AAAA`, en cohérence avec les fonctionnalités 001 et 002.
- **« Interface moderne » est traduit en exigences vérifiables** — hiérarchie visuelle centrée sur
  l'anneau, thèmes clair et sombre, adaptabilité dès 360 px, cibles tactiles de 44 px, respect de la
  préférence pour un mouvement réduit. Le parti pris graphique précis (palette, typographie,
  espacements) relève de la conception et non de la présente spécification.
