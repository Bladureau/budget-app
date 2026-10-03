# Spécification de fonctionnalité : Réserve d'épargne et report entre les mois

**Répertoire de fonctionnalité** : `specs/008-savings-reserve`

**Branche** : `feat-008-savings-reserve`

**Créée le** : 2026-10-03

**Statut** : Brouillon

**Demande initiale** : « Il faudrait que je puisse ajouter mes deux comptes épargne, mais pas via
Enable Banking. Ou sinon, les sous que je n'ai pas consommés le mois précédent se réappliquent au
mois courant. En septembre j'ai ajouté en revenu ponctuel les sous que j'ai en épargne, mais ils
ne se sont pas transférés pour le mois d'octobre. »

---

## Constat de départ

Chaque mois est aujourd'hui calculé **isolément** : disponible du mois = revenus du mois −
abonnements du mois, sur lequel s'imputent les dépenses du mois. Un revenu ponctuel daté de
septembre ne compte donc qu'en septembre. Rien ne passe d'un mois au suivant, ni un reste ni un
dépassement. Le seul report existant relie un jour au lendemain, à l'intérieur d'un mois.

L'utilisateur vit en partie sur son épargne : il n'y verse rien, elle sert à compléter ses
revenus. Faute de mieux, il l'a saisie comme un revenu ponctuel en septembre ; en octobre,
l'application l'ignore.

## Décisions de l'utilisateur (2026-10-03)

1. **Une seule réserve**, somme de ses deux comptes d'épargne. Son solde est **saisi à la main**,
   sans connexion bancaire.
2. La réserve est **répartie sur un nombre de mois** qu'il choisit : la part d'un mois vaut le
   solde restant divisé par le nombre de mois restants, recalculée chaque mois.
3. **Les revenus du mois sont dépensés d'abord.** La part d'épargne n'est entamée qu'une fois les
   revenus (nets des abonnements) épuisés.
4. **En fin de mois, la réserve est mise à jour toute seule** : un dépassement en est retiré, un
   reste non dépensé y est ajouté. C'est ce mécanisme qui fait le report d'un mois sur l'autre.

## Modèle de calcul

Pour un mois donné :

| Notion | Définition |
| --- | --- |
| **Revenus nets du mois** | Revenus du mois − abonnements du mois. C'est le « disponible » actuel, inchangé. Peut être négatif. |
| **Réserve en début de mois** | Solde de la réserve à l'ouverture du mois. |
| **Mois restants** | Nombre de mois sur lesquels la réserve doit encore durer, mois courant compris. Vaut au moins 1. |
| **Part du mois** | Réserve en début de mois ÷ mois restants, **tronquée au centime inférieur**. |
| **Disponible du mois** | Revenus nets du mois + part du mois. |
| **Dépensé** | Dépenses du mois − remboursements du mois, **borné à zéro** pour l'affichage du mois (règle existante, inchangée). |
| **Sorties nettes** | Dépenses du mois − remboursements du mois, **sans borne** : négatives quand les remboursements dépassent les dépenses. |
| **Épargne entamée** | Ce que les dépenses prennent au-delà des revenus nets : `max(0, dépensé − revenus nets)`. |
| **Réserve en fin de mois** | Réserve en début de mois + revenus nets − sorties nettes. Elle devient la réserve en début du mois suivant. |

Le dépensé et les sorties nettes ne diffèrent que lorsqu'un mois reçoit plus de remboursements
qu'il ne compte de dépenses. Dans ce cas l'excédent n'augmente pas le disponible du mois (il
n'était pas prévu), mais il **entre dans la réserve** en fin de mois : c'est de l'argent réel, il
ne doit pas disparaître.

**Exemple.** Réserve de 6 000,00 € à répartir sur 12 mois à partir d'octobre. Revenus nets
d'octobre : 900,00 €.

- Part d'octobre : 6 000,00 ÷ 12 = 500,00 €. Disponible d'octobre : 1 400,00 €.
- L'utilisateur dépense 1 100,00 € : les 900,00 € de revenus d'abord, puis 200,00 € d'épargne.
- Réserve fin octobre : 6 000,00 + 900,00 − 1 100,00 = 5 800,00 €.
- Novembre : 11 mois restants, part = 5 800,00 ÷ 11 = 527,27 € (les 3 centimes non répartis
  demeurent dans la réserve). Les 300,00 € de part non utilisés en octobre sont ainsi redistribués sur les mois
  suivants.

## Scénarios utilisateur et tests *(obligatoire)*

### Récit 1 — Déclarer ma réserve et la voir répartie (Priorité : P1) 🎯 MVP

L'utilisateur saisit le solde de son épargne et le nombre de mois sur lesquels elle doit durer.
Aussitôt, le disponible du mois, l'anneau et le montant par jour tiennent compte de la part
d'épargne du mois.

**Pourquoi cette priorité** : c'est la demande. Sans réserve déclarée, rien d'autre n'a de sens.

**Test indépendant** : avec 900,00 € de revenus nets, déclarer 6 000,00 € sur 12 mois et vérifier
que le disponible du mois passe de 900,00 € à 1 400,00 €, et que le montant par jour suit.

**Scénarios d'acceptation** :

1. **Étant donné** qu'aucune réserve n'existe, **quand** l'utilisateur ouvre « Réglages »,
   **alors** une section « Réserve d'épargne » lui propose de saisir un solde et un nombre de mois.
2. **Étant donné** 900,00 € de revenus nets ce mois-ci, **quand** il enregistre 6 000,00 € sur
   12 mois, **alors** l'anneau affiche un disponible de 1 400,00 €, détaillé en « Revenus du
   mois : 900,00 € » et « Part d'épargne : 500,00 € ».
3. **Étant donné** la réserve enregistrée, **quand** il consulte le reste du jour, **alors** le
   montant par jour est calculé sur le disponible incluant la part d'épargne.
4. **Étant donné** une réserve de 1 000,00 € sur 3 mois, **quand** la part est calculée,
   **alors** elle vaut 333,33 € et le centime non réparti reste dans la réserve.
5. **Étant donné** un solde ou un nombre de mois invalide (négatif, non numérique, plus de deux
   décimales, zéro mois), **quand** il valide, **alors** rien n'est enregistré et un message
   textuel explique l'erreur.
6. **Étant donné** que le mois courant contient un revenu ponctuel, **quand** il déclare sa
   réserve, **alors** l'application lui rappelle de vérifier que son épargne n'y figure pas déjà,
   pour ne pas la compter deux fois.

---

### Récit 2 — Le reste et le dépassement passent au mois suivant (Priorité : P1)

À chaque changement de mois, la réserve repart du solde de fin du mois précédent, sans aucune
action. Ce qui n'a pas été dépensé reste disponible plus tard ; ce qui a été dépensé en trop
manque ensuite.

**Pourquoi cette priorité** : c'est le problème signalé — « les sous ne se sont pas transférés
pour le mois d'octobre ». Sans ce report, la réserve du récit 1 repartirait de son solde initial
chaque mois.

**Test indépendant** : reprendre l'exemple du « Modèle de calcul », passer au mois suivant et
vérifier la réserve (5 800,00 €), les mois restants (11) et la part (527,27 €).

**Scénarios d'acceptation** :

1. **Étant donné** une réserve de 6 000,00 € en début d'octobre, 900,00 € de revenus nets et
   1 100,00 € dépensés, **quand** l'utilisateur consulte novembre, **alors** la réserve en début
   de mois vaut 5 800,00 € et la part 527,27 € sur 11 mois restants.
2. **Étant donné** un mois où 700,00 € sont dépensés pour 900,00 € de revenus nets, **quand** le
   mois suivant commence, **alors** la réserve a **augmenté** de 200,00 €.
3. **Étant donné** un mois où les dépenses dépassent le disponible (revenus nets + part),
   **quand** le mois suivant commence, **alors** tout le dépassement a été retiré de la réserve.
4. **Étant donné** qu'une dépense d'un mois passé est corrigée ou supprimée, **quand**
   l'utilisateur revient au mois courant, **alors** la réserve et la part reflètent la
   correction, sans action de sa part.
5. **Étant donné** que l'application n'a pas été ouverte pendant plusieurs mois, **quand** elle
   est rouverte, **alors** la réserve tient compte de chacun des mois écoulés.
6. **Étant donné** les mêmes données sur deux appareils, **quand** chacun affiche le même mois,
   **alors** la réserve et la part sont identiques au centime.

---

### Récit 3 — Voir quand je touche à mon épargne (Priorité : P2)

Tant que les dépenses du mois restent sous les revenus nets, l'épargne est intacte et
l'application le dit. Dès qu'elles les dépassent, elle indique combien d'épargne est entamé et
combien il reste de la part du mois.

**Pourquoi cette priorité** : l'utilisateur a insisté — « d'abord les sous de mes revenus
mensuels, on touche à mon épargne que si les revenus sont épuisés ». Le calcul des récits 1 et 2
respecte déjà cet ordre ; ce récit le rend **visible**.

**Test indépendant** : avec 900,00 € de revenus nets et 500,00 € de part, saisir 800,00 € puis
300,00 € de dépenses et vérifier les deux états affichés.

**Scénarios d'acceptation** :

1. **Étant donné** 800,00 € dépensés pour 900,00 € de revenus nets, **quand** l'utilisateur
   regarde l'anneau, **alors** il lit que l'épargne n'est pas entamée et qu'il reste 100,00 € de
   revenus avant d'y toucher.
2. **Étant donné** 1 100,00 € dépensés pour 900,00 € de revenus nets et 500,00 € de part,
   **quand** il regarde l'anneau, **alors** il lit « Épargne entamée : 200,00 € sur 500,00 € ».
3. **Étant donné** des dépenses supérieures au disponible, **quand** il regarde l'anneau,
   **alors** le dépassement est présenté comme un montant de dépassement, jamais comme un reste
   négatif, et il est précisé qu'il sera retiré de la réserve.
4. **Étant donné** n'importe lequel de ces états, **quand** il est affiché, **alors** il est
   porté par du texte et non par la seule couleur.
5. **Étant donné** l'onglet « Mois », **quand** l'utilisateur le consulte, **alors** il y trouve
   la réserve en début de mois, les mois restants, la part du mois, l'épargne entamée et la
   réserve prévue en fin de mois.

---

### Récit 4 — Recaler, modifier ou retirer ma réserve (Priorité : P2)

Le solde calculé par l'application finit par s'écarter du solde réel des comptes (intérêts,
retrait oublié, virement entre comptes). L'utilisateur peut à tout moment ressaisir le solde
réel et un nouveau nombre de mois, ou retirer la réserve.

**Pourquoi cette priorité** : sans recalage, la moindre dérive rendrait le chiffre faux pour
toujours. Mais la réserve est utilisable plusieurs mois sans lui.

**Test indépendant** : après deux mois d'usage, ressaisir un solde différent et vérifier que le
mois courant repart de ce solde et que les mois passés affichent toujours leurs anciens chiffres.

**Scénarios d'acceptation** :

1. **Étant donné** une réserve existante, **quand** l'utilisateur saisit un nouveau solde et un
   nouveau nombre de mois, **alors** le mois courant repart de ce solde, avec ce nombre de mois
   restants.
2. **Étant donné** un recalage fait en novembre, **quand** l'utilisateur consulte octobre,
   **alors** octobre affiche les mêmes montants qu'avant le recalage.
3. **Étant donné** une réserve existante, **quand** il la retire après confirmation, **alors**
   le mois courant et les suivants reviennent au calcul sans réserve ni report, et les mois
   passés gardent leurs montants.
4. **Étant donné** 900,00 € de revenus nets et 1 100,00 € déjà dépensés ce mois-ci, **quand**
   l'utilisateur ressaisit son solde réel du jour, 5 800,00 €, **alors** la réserve prévue en fin
   de mois vaut 5 800,00 € (et non 5 600,00 €) : les 200,00 € déjà puisés ne sont pas comptés
   deux fois.
5. **Étant donné** que le nombre de mois choisi est écoulé, **quand** l'utilisateur ouvre
   l'application, **alors** elle lui signale que la durée prévue est atteinte et l'invite à en
   choisir une nouvelle.

---

### Cas limites

- **Solde de zéro** : accepté. La réserve ne contient alors que les restes reportés ; c'est le
  « report simple » d'un mois sur l'autre, sans épargne.
- **Réserve négative** (dépassements cumulés supérieurs à la réserve) : la part du mois est alors
  **toute la dette**, retirée du disponible du mois. L'application affiche « Réserve épuisée » et
  le montant du découvert, jamais un solde négatif brut.
- **Revenus nets négatifs** (abonnements supérieurs aux revenus) : la part d'épargne comble
  d'abord ce manque ; il est compté comme épargne entamée.
- **Durée écoulée** : les mois restants ne descendent pas sous 1. Toute la réserve restante est
  alors disponible chaque mois, et l'application invite à choisir une nouvelle durée (récit 4).
- **Dernier mois de la durée** : un seul mois restant, la part est la réserve entière, centimes
  non répartis compris. Rien n'est perdu par les arrondis.
- **Mois antérieurs à la déclaration** : inchangés, calculés comme aujourd'hui.
- **Mois futurs** : calculés par la même cascade, avec les revenus et abonnements prévus et sans
  dépenses.
- **Réserve déclarée ou recalée en cours de mois** : le solde saisi est le solde **d'aujourd'hui**.
  Si les dépenses du mois ont déjà dépassé les revenus nets, l'épargne déjà entamée est rajoutée
  au solde saisi pour obtenir la réserve en début de mois ; ainsi la fin de mois retombe sur le
  solde saisi, sans compter deux fois ce qui a déjà été puisé (FR-002).
- **Remboursements** : ils réduisent le dépensé du mois, donc augmentent la réserve de fin de
  mois, comme toute dépense évitée. Un remboursement supérieur aux dépenses du mois n'augmente
  pas le disponible du mois, mais son excédent entre dans la réserve en fin de mois (FR-010).
- **Import d'une sauvegarde antérieure à la fonctionnalité** : aucune réserve, l'application se
  comporte comme avant.
- **Conflit de synchronisation** : la réserve suit le reste du budget, par le mécanisme existant.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

**Déclaration**

- **FR-001** : L'utilisateur DOIT pouvoir déclarer une réserve d'épargne unique par un solde
  (supérieur ou égal à zéro) et un nombre de mois (entier, de 1 à 120), depuis l'onglet
  « Réglages ».
- **FR-002** : La déclaration DOIT prendre effet au mois en cours au moment de la saisie, qui
  est le premier de la durée. Le solde saisi est le solde **au jour de la saisie** : la réserve
  en début de ce mois DOIT valoir le solde saisi, augmenté de l'épargne déjà entamée ce mois-ci
  — `max(0, sorties nettes à ce jour − revenus nets du mois)`. Tant que les revenus du mois ne
  sont pas épuisés, elle vaut donc exactement le solde saisi.
- **FR-003** : Une saisie invalide NE DOIT rien enregistrer et DOIT être signalée par un message
  textuel rattaché au champ concerné.
- **FR-004** : Lors d'une déclaration, si le mois en cours contient au moins un revenu ponctuel,
  l'application DOIT rappeler de vérifier que l'épargne n'y est pas déjà comptée.
- **FR-005** : Le solde de la réserve NE DOIT PAS provenir d'une connexion bancaire ni d'aucun
  service tiers.

**Calcul**

- **FR-006** : La part du mois DOIT valoir la réserve en début de mois divisée par les mois
  restants, tronquée au centime inférieur ; les centimes non répartis DOIVENT rester dans la
  réserve.
- **FR-007** : Les mois restants DOIVENT diminuer de 1 à chaque mois écoulé depuis la
  déclaration, sans descendre sous 1.
- **FR-008** : Le disponible d'un mois DOIT valoir ses revenus nets plus sa part d'épargne.
- **FR-009** : L'anneau et le reste du jour (montant par jour et report de la veille) DOIVENT
  utiliser ce disponible. Le bilan prévisionnel de l'onglet « Mois » (revenus − abonnements)
  reste inchangé ; la réserve y est présentée dans son propre bloc (FR-017).
- **FR-010** : La réserve en début d'un mois DOIT valoir la réserve en début du mois précédent,
  plus les revenus nets de ce mois précédent, moins ses sorties nettes (dépenses −
  remboursements, **sans borne à zéro**) : un excédent de remboursement DOIT entrer dans la
  réserve.
- **FR-011** : La réserve d'un mois DOIT se déduire entièrement des données du budget
  (déclaration, revenus, abonnements, dépenses, remboursements) : toute correction d'un mois passé
  DOIT se répercuter sur les mois suivants sans action de l'utilisateur.
- **FR-012** : Lorsque la réserve en début de mois est négative, la part du mois DOIT être cette
  réserve entière, en déduction du disponible.
- **FR-013** : Les mois antérieurs à la première déclaration DOIVENT rester calculés sans réserve
  ni report.
- **FR-014** : Les enveloppes, les abonnements, les revenus et l'import bancaire NE DOIVENT PAS
  changer de comportement.

**Affichage**

- **FR-015** : L'anneau DOIT détailler le disponible en « revenus du mois » et « part
  d'épargne » dès qu'une réserve existe.
- **FR-016** : L'application DOIT indiquer, pour le mois affiché, si l'épargne est entamée, de
  combien, et sur quelle part ; tant qu'elle ne l'est pas, ce qu'il reste de revenus avant d'y
  toucher.
- **FR-017** : L'onglet « Mois » DOIT présenter la réserve en début de mois, les mois restants, la
  part du mois, le disponible avec la part d'épargne, l'épargne entamée et la réserve prévue en
  fin de mois. La ligne « disponible avec la part d'épargne » fait le lien entre le « reste
  disponible » du bilan (sans épargne) et le « disponible ce mois » de l'anneau (avec).
- **FR-026** : Dès qu'une réserve existe pour le mois affiché, l'anneau NE DOIT PAS inviter à
  « renseigner ses revenus et abonnements » lorsque le disponible est nul ou négatif : il DOIT
  présenter l'état de la réserve à la place.
- **FR-018** : Un dépassement et une réserve épuisée DOIVENT être présentés comme des montants
  positifs accompagnés d'un libellé, jamais comme des nombres négatifs bruts, et jamais par la
  couleur seule.
- **FR-019** : Sans réserve déclarée, l'affichage DOIT rester identique à l'actuel.

**Recalage et retrait**

- **FR-020** : L'utilisateur DOIT pouvoir ressaisir à tout moment un solde et un nombre de mois ;
  le mois en cours repart alors de ces valeurs.
- **FR-021** : Un recalage ou un retrait NE DOIT PAS modifier les montants affichés pour les mois
  antérieurs à celui où il est fait.
- **FR-022** : L'utilisateur DOIT pouvoir retirer la réserve, après une confirmation délibérée ;
  le mois en cours et les suivants reviennent alors au calcul sans réserve.
- **FR-023** : Lorsque la durée choisie est écoulée, l'application DOIT le signaler et inviter à
  en choisir une nouvelle.

**Données**

- **FR-024** : La réserve DOIT être enregistrée avec le budget, synchronisée entre les appareils
  et incluse dans l'export ; un import DOIT la restituer à l'identique.
- **FR-025** : Un budget ou une sauvegarde antérieurs à cette fonctionnalité DOIVENT s'ouvrir sans
  perte, sans réserve.

### Comportement monétaire

- **Unité** : tous les montants sont en centimes entiers, en euros. Aucun calcul en virgule
  flottante sur un montant.
- **Saisie** : le solde est lu depuis le texte saisi (virgule ou point, deux décimales au plus),
  comme les autres montants de l'application.
- **Division** : la seule division introduite est celle de la part du mois. Elle est **tronquée
  au centime inférieur** (FR-006). Le reste de la division n'est pas distribué : il **demeure
  dans la réserve** et se retrouve dans les parts suivantes ; au dernier mois de la durée, la
  part est la réserve entière. La somme des parts n'excède donc jamais la réserve, et aucun
  centime n'est perdu.
- **Réserve négative** : pas de division (FR-012) ; la dette entière est imputée au mois.
- **Signes** : la réserve et la part peuvent être négatives dans le calcul ; l'affichage n'en
  montre jamais de brut (FR-018).
- **Remboursements** : le dépensé affiché reste borné à zéro (règle de la fonctionnalité 006) ;
  la réserve, elle, se calcule sur les sorties nettes non bornées, pour qu'aucun euro remboursé
  ne disparaisse.
- **Saisie en cours de mois** : le solde saisi est celui du jour ; l'épargne déjà entamée ce
  mois-ci lui est ajoutée pour former la réserve de début de mois (FR-002). Si cette somme
  dépasse le plafond des montants de l'application, la saisie est refusée.
- **Invariant** : pour tout mois postérieur à la déclaration, réserve fin de mois = réserve début
  de mois + revenus nets − sorties nettes, au centime.

### Entités clés

- **Réserve d'épargne** : un solde et une durée déclarés par l'utilisateur, avec le mois où la
  déclaration prend effet. Une seule réserve active. Chaque recalage ou retrait est une nouvelle
  déclaration datée, qui laisse les précédentes valoir pour les mois antérieurs.
- **État de la réserve pour un mois** *(dérivé, jamais enregistré)* : réserve en début de mois,
  mois restants, part du mois, épargne entamée, réserve en fin de mois.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : Après avoir déclaré sa réserve une fois, l'utilisateur n'a plus aucune saisie à
  faire pour que l'argent non dépensé d'un mois soit disponible le mois suivant.
- **SC-002** : La déclaration de la réserve se fait en moins d'une minute, avec deux champs.
- **SC-003** : Sur un parcours de 12 mois, la réserve affichée chaque mois est égale, au centime,
  à : réserve de début du mois de déclaration + somme des revenus nets − somme des sorties
  nettes (dépenses − remboursements) des mois écoulés.
- **SC-004** : La somme des parts d'épargne distribuées n'excède jamais la réserve, quels que
  soient le solde et la durée ; au dernier mois de la durée, aucun centime ne reste non réparti.
- **SC-005** : L'utilisateur sait en un coup d'œil sur « Aujourd'hui » s'il a entamé son épargne
  ce mois-ci et de combien.
- **SC-006** : Sans réserve déclarée, tous les montants de l'application sont identiques à ceux
  d'avant la fonctionnalité.
- **SC-007** : Deux appareils synchronisés affichent la même réserve et la même part, au centime.

## Hypothèses

- **La réserve n'est pas le relevé de la banque.** Un reste non dépensé s'y ajoute alors que
  l'argent reste physiquement sur le compte courant : la réserve représente « ce qui est
  disponible au-delà des revenus du mois », pas le solde exact des comptes d'épargne. Le recalage
  (récit 4) sert à la réaligner quand l'utilisateur le souhaite.
- Le calcul raisonne au mois entier : les revenus nets du mois sont considérés comme acquis dès
  le premier jour, y compris pour décider si l'épargne est « déjà entamée » lors d'une saisie en
  cours de mois.
- La déclaration vaut toujours pour le mois en cours ; il n'est pas possible de la faire débuter
  dans le passé ou le futur. Septembre garde donc son revenu ponctuel et ses montants ; la
  réserve part d'octobre avec le solde réel d'aujourd'hui, sans double comptage.
- Les intérêts de l'épargne ne sont pas calculés : ils entrent par un recalage.
- Un dépassement supérieur à la réserve est imputé en entier au mois suivant (FR-012), plutôt
  qu'étalé.
- Une fois la durée écoulée, toute la réserve restante est disponible chaque mois, jusqu'à ce
  que l'utilisateur choisisse une nouvelle durée.
- La vue « Douze prochains mois » reste fondée sur les revenus et les abonnements ; elle
  n'intègre pas la réserve dans cette fonctionnalité.
- La section de réglage se place dans l'onglet « Réglages » ; le détail mensuel dans l'onglet
  « Mois » (fonctionnalité 007).

## Hors périmètre

- Deux comptes d'épargne distincts, ou plus d'une réserve.
- La récupération automatique du solde d'épargne par la banque.
- Les versements vers l'épargne et le calcul d'intérêts.
- L'intégration de la réserve dans les prévisions à douze mois.
- La vue hebdomadaire du « reste à dépenser » (fonctionnalité suivante, 009).
