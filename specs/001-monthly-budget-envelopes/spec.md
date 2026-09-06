# Spécification de fonctionnalité : Enveloppes budgétaires mensuelles

**Branche de fonctionnalité** : `001-monthly-budget-envelopes`

**Créée le** : 2026-09-05

**Statut** : Brouillon

**Entrée** : Description utilisateur : « Enveloppes budgétaires mensuelles — définir un plafond de
dépense par catégorie et par mois, et suivre la dépense réelle par rapport à ce plafond, avec une
progression visuelle et une alerte en cas de dépassement. »

## Scénarios utilisateur et tests *(obligatoire)*

### Récit utilisateur 1 – Définir un plafond mensuel pour une catégorie (Priorité : P1)

En tant que personne qui gère son argent seule, je veux pouvoir dire « je compte dépenser au plus
400 € en Courses ce mois-ci », afin de disposer d'un objectif énoncé auquel comparer ma dépense
réelle. Je choisis une catégorie, je saisis un montant, et le plafond s'applique au mois que je suis
en train de consulter.

**Pourquoi cette priorité** : sans plafond énoncé, il n'y a rien à suivre. C'est la plus petite
tranche qui apporte une valeur autonome : même si rien d'autre n'est construit, l'utilisateur peut
consigner son intention de dépense du mois et voir le total qu'il s'est engagé à ne pas dépasser.

**Test indépendant** : entièrement testable en ouvrant la vue budgétaire d'un mois, en définissant
des plafonds sur deux ou trois catégories, en rechargeant l'application, puis en vérifiant que les
plafonds persistent et que le total prévu est bien la somme des plafonds individuels. La valeur
livrée est un plan mensuel écrit.

**Scénarios d'acceptation** :

1. **Étant donné** le mois de mars 2026 sans aucun plafond défini, **quand** l'utilisateur définit un
   plafond de 400,00 € sur « Courses », **alors** l'enveloppe Courses affiche un plafond de 400,00 €
   pour mars 2026 et le total prévu du mois augmente de 400,00 €.
2. **Étant donné** un plafond Courses de 400,00 € pour mars 2026, **quand** l'utilisateur le passe à
   350,00 €, **alors** l'enveloppe affiche 350,00 € et le total prévu du mois reflète ce changement.
3. **Étant donné** un plafond Courses de 400,00 € pour mars 2026, **quand** l'utilisateur supprime ce
   plafond, **alors** Courses n'apparaît plus comme enveloppe budgétée pour mars 2026 et sa dépense
   est reportée comme non budgétée.
4. **Étant donné** la saisie d'un plafond, **quand** l'utilisateur entre un montant négatif ou une
   valeur non numérique, **alors** le plafond est refusé avec un message expliquant la saisie
   attendue, et aucune modification n'est enregistrée.
5. **Étant donné** un plafond Courses de 400,00 € pour mars 2026, **quand** l'utilisateur navigue
   vers avril 2026, **alors** avril n'affiche aucun plafond Courses, sauf si un plafond y a été
   défini spécifiquement.

---

### Récit utilisateur 2 – Voir la dépense réelle face à chaque plafond (Priorité : P2)

Je veux que chaque enveloppe affiche ce que j'ai réellement dépensé ce mois-ci par rapport à son
plafond, ainsi que ce qu'il me reste, afin de décider si je peux me permettre le prochain achat dans
cette catégorie.

**Pourquoi cette priorité** : c'est ce qui transforme un plan figé en budget vivant. Ce récit
suppose l'existence du récit 1 — il faut un plafond auquel comparer — mais il apporte une valeur
propre et se teste indépendamment dès lors que des plafonds existent.

**Test indépendant** : entièrement testable en définissant un plafond sur une catégorie, en
enregistrant plusieurs transactions dans cette catégorie au cours du mois, puis en vérifiant que les
montants dépensé et restant de l'enveloppe correspondent à la somme de ces transactions. À vérifier
également en enregistrant une transaction datée hors du mois et en confirmant qu'elle n'affecte pas
ces montants.

**Scénarios d'acceptation** :

1. **Étant donné** un plafond Courses de 400,00 € pour mars 2026 et aucune transaction Courses,
   **quand** l'utilisateur consulte mars 2026, **alors** Courses affiche 0,00 € dépensé et 400,00 €
   restants.
2. **Étant donné** un plafond Courses de 400,00 € et des dépenses Courses de 120,50 € et 79,50 €
   datées dans mars 2026, **quand** l'utilisateur consulte mars 2026, **alors** Courses affiche
   200,00 € dépensés et 200,00 € restants.
3. **Étant donné** un plafond Courses de 400,00 € pour mars 2026, **quand** une dépense Courses datée
   du 1er avril 2026 est enregistrée, **alors** le montant dépensé de Courses en mars reste inchangé.
4. **Étant donné** une enveloppe Courses à 200,00 € dépensés, **quand** l'utilisateur supprime l'une
   des transactions sous-jacentes, **alors** les montants dépensé et restant sont mis à jour pour
   l'exclure.
5. **Étant donné** une catégorie comportant des dépenses mais aucun plafond défini pour le mois,
   **quand** l'utilisateur consulte le mois, **alors** la dépense de cette catégorie apparaît dans un
   regroupement « Non budgété » avec son total, et est exclue des totaux budgétés.
6. **Étant donné** un remboursement ou une dépense de montant négatif dans une catégorie, **quand**
   l'utilisateur consulte le mois, **alors** le remboursement diminue le montant dépensé de
   l'enveloppe.

---

### Récit utilisateur 3 – Être alerté avant et pendant le dépassement (Priorité : P2)

Je veux qu'une enveloppe change visiblement d'état à mesure qu'elle approche puis dépasse son
plafond, et que la vue du mois me signale d'un coup d'œil quelles enveloppes posent problème, afin
que le dépassement soit quelque chose que je remarque pendant qu'il se produit plutôt qu'à la fin du
mois.

**Pourquoi cette priorité** : l'alerte est la partie de la fonctionnalité qui change le
comportement — la raison pour laquelle on ouvre l'application avant de dépenser. Elle partage la
priorité P2 avec le récit 2 car un suivi sans alerte laisse encore la comparaison à la charge de
l'utilisateur.

**Test indépendant** : entièrement testable en définissant un plafond, puis en ajoutant des
transactions qui font franchir à l'enveloppe le seuil d'alerte puis le plafond, en vérifiant que
l'état change à chaque franchissement et qu'il est signalé par du texte autant que visuellement.

**Scénarios d'acceptation** :

1. **Étant donné** un plafond Courses de 400,00 € avec 200,00 € dépensés, **quand** l'utilisateur
   consulte l'enveloppe, **alors** elle est présentée dans un état normal, avec une progression
   reflétant 50 % du plafond consommé.
2. **Étant donné** un plafond Courses de 400,00 €, **quand** la dépense atteint 340,00 € (85 % du
   plafond), **alors** l'enveloppe passe à l'état « proche du plafond », accompagné d'un libellé
   textuel l'indiquant.
3. **Étant donné** un plafond Courses de 400,00 €, **quand** la dépense atteint 420,00 €, **alors**
   l'enveloppe passe à l'état « en dépassement », le montant restant est présenté comme 20,00 € de
   dépassement plutôt que comme un reste négatif, et la progression est plafonnée au maximum plutôt
   que de déborder.
4. **Étant donné** au moins une enveloppe en dépassement, **quand** l'utilisateur consulte la
   synthèse du mois, **alors** celle-ci indique combien d'enveloppes sont en dépassement et pour quel
   montant total.
5. **Étant donné** une enveloppe dans un état d'alerte quelconque, **quand** cet état est présenté,
   **alors** il reste distinguable sans recourir à la seule couleur.

---

### Récit utilisateur 4 – Reporter un plan sur le mois suivant (Priorité : P3)

Je veux démarrer un nouveau mois avec les plafonds définis le mois précédent, plutôt que de ressaisir
chaque enveloppe depuis zéro, tout en gardant la possibilité de les ajuster.

**Pourquoi cette priorité** : c'est un confort qui compte à partir du deuxième mois. La
fonctionnalité est pleinement utilisable sans lui ; chaque mois peut être configuré manuellement.

**Test indépendant** : entièrement testable en définissant des plafonds sur un mois, en passant au
mois suivant, en déclenchant le report, puis en vérifiant que les plafonds sont bien copiés tandis
que les montants dépensés du nouveau mois repartent de zéro.

**Scénarios d'acceptation** :

1. **Étant donné** mars 2026 comportant des plafonds sur trois catégories et avril 2026 n'en
   comportant aucun, **quand** l'utilisateur choisit de copier les plafonds du mois précédent,
   **alors** avril reçoit les trois mêmes plafonds pour les mêmes montants, et ses montants dépensés
   ne reflètent que les transactions d'avril.
2. **Étant donné** qu'avril 2026 comporte déjà des plafonds, **quand** l'utilisateur choisit de
   copier ceux de mars, **alors** il est averti que les plafonds existants d'avril seront remplacés
   et la copie n'a lieu qu'après confirmation.
3. **Étant donné** un mois précédent sans aucun plafond, **quand** l'utilisateur choisit de copier
   les plafonds, **alors** l'action est indisponible ou signale qu'il n'y a rien à copier, et aucune
   modification n'est effectuée.

---

### Cas limites

- **Une catégorie est renommée ou supprimée alors que des plafonds la référencent** : les enveloppes
  des mois passés doivent continuer à être restituées correctement ; les enveloppes historiques d'une
  catégorie supprimée restent visibles dans les mois où elles s'appliquaient et sont clairement
  signalées comme rattachées à une catégorie supprimée.
- **La catégorie ou la date d'une transaction est modifiée après coup** : les enveloppes concernées
  doivent être recalculées pour l'ancien mois comme pour le nouveau, et pas seulement pour le
  nouveau.
- **Des dépenses existent dans un mois dépourvu de tout plafond** : la vue du mois affiche le total
  non budgété et invite l'utilisateur à définir des plafonds, plutôt que de présenter un état vide ou
  cassé.
- **Un plafond strictement égal à zéro** : traité comme une enveloppe valide et intentionnelle
  « ne rien dépenser ici », où la moindre dépense place immédiatement l'enveloppe en dépassement.
- **Plafonds et montants très élevés** : les valeurs restent lisibles et correctement totalisées,
  sans troncature ni dérive d'arrondi.
- **Limites de mois** : une transaction datée du premier ou du dernier jour du mois compte dans ce
  mois ; le mois est déterminé par la date de la transaction elle-même, non par sa date de saisie.
- **Consultation d'un mois futur** : les plafonds peuvent être définis à l'avance, et les montants
  dépensés restent à zéro tant qu'aucune transaction n'existe dans ce mois.
- **Écritures de revenu ou de virement dans une catégorie budgétée** : elles ne doivent pas être
  comptées comme des dépenses au regard d'une enveloppe.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

**Définition et gestion des plafonds**

- **EF-001** : L'utilisateur DOIT pouvoir définir un plafond de dépense pour une catégorie donnée et
  un mois calendaire donné.
- **EF-002** : L'utilisateur DOIT pouvoir modifier ou supprimer un plafond existant pour une
  catégorie et un mois.
- **EF-003** : Le système DOIT rattacher chaque plafond à exactement un mois calendaire ; un plafond
  défini pour un mois NE DOIT s'appliquer à aucun autre mois.
- **EF-004** : Le système DOIT refuser les montants de plafond négatifs ou non monétaires valides,
  en expliquer la raison par un texte, et laisser inchangée la valeur précédemment enregistrée.
- **EF-005** : Le système NE DOIT autoriser qu'un seul plafond par catégorie et par mois.
- **EF-006** : Le système DOIT conserver les plafonds de manière à ce qu'ils survivent à la fermeture
  et à la réouverture de l'application.

**Suivi de la dépense**

- **EF-007** : Le système DOIT calculer le montant dépensé de chaque enveloppe comme la somme des
  transactions de dépense dont la catégorie correspond à l'enveloppe et dont la date tombe dans le
  mois de l'enveloppe.
- **EF-008** : Le système DOIT exclure les écritures de revenu et de virement du calcul de dépense
  des enveloppes.
- **EF-009** : Le système DOIT traiter les remboursements et les montants de dépense négatifs comme
  diminuant le montant dépensé de l'enveloppe.
- **EF-010** : Le système DOIT recalculer les enveloppes concernées à chaque création, modification
  ou suppression d'une transaction, y compris recalculer l'ancien et le nouveau mois lorsque la date
  ou la catégorie d'une transaction change.
- **EF-011** : Le système DOIT afficher, pour chaque enveloppe, le plafond, le montant dépensé et le
  montant restant.
- **EF-012** : Le système DOIT présenter les dépenses des catégories dépourvues de plafond pour le
  mois sous forme d'un total non budgété, distinct des enveloppes budgétées.
- **EF-013** : Le système DOIT afficher une synthèse au niveau du mois indiquant le total prévu, le
  total dépensé au titre des enveloppes budgétées et le total restant.

**Alertes**

- **EF-014** : Le système DOIT présenter chaque enveloppe dans l'un de ces quatre états : non
  entamée (aucune dépense), maîtrisée, proche du plafond, ou en dépassement.
- **EF-015** : Le système DOIT classer une enveloppe comme « proche du plafond » lorsque la dépense
  atteint 85 % du plafond sans l'avoir dépassé, et comme « en dépassement » lorsque la dépense excède
  le plafond.
- **EF-016** : Le système DOIT exprimer une enveloppe dépassée comme un montant de dépassement plutôt
  que comme un solde restant négatif.
- **EF-017** : Le système DOIT signaler l'état d'une enveloppe par du texte ou par la forme, en plus
  de la couleur.
- **EF-018** : Le système DOIT indiquer, dans la synthèse du mois, combien d'enveloppes sont en
  dépassement et le montant total de ce dépassement.

**Navigation et report**

- **EF-019** : L'utilisateur DOIT pouvoir passer d'un mois à l'autre et voir les plafonds et les
  dépenses du mois consulté.
- **EF-020** : L'utilisateur DOIT pouvoir copier les plafonds du mois précédent dans le mois
  consulté.
- **EF-021** : Le système DOIT exiger une confirmation avant qu'une copie ne remplace des plafonds
  déjà présents dans le mois cible.
- **EF-022** : Le système DOIT préserver inchangés les plafonds et les dépenses des mois passés
  lorsque des mois ultérieurs sont modifiés.

### Entités clés

- **Enveloppe** : un plafond de dépense pour une catégorie sur un mois calendaire. Attributs
  principaux : la catégorie concernée, le mois concerné et le montant du plafond. Il en existe au
  plus une par catégorie et par mois. Ses montants dépensé et restant sont dérivés des transactions
  plutôt que stockés.
- **Catégorie** : un regroupement de dépenses ayant du sens pour l'utilisateur (par exemple Courses,
  Transport). Elle existe indépendamment de toute enveloppe ; une catégorie peut avoir des enveloppes
  certains mois et aucune d'autres mois.
- **Transaction** : un mouvement d'argent enregistré, comportant un montant, une date, une catégorie
  et un type (dépense, revenu ou virement). Les enveloppes lisent les transactions ; la présente
  fonctionnalité ne définit pas comment les transactions sont créées. Voir les hypothèses.
- **Synthèse budgétaire mensuelle** : la vue dérivée d'un mois calendaire — total prévu sur
  l'ensemble des enveloppes, total dépensé, total restant, total des dépenses non budgétées, ainsi
  que le nombre d'enveloppes en dépassement et le montant total du dépassement.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Un utilisateur peut définir les plafonds de cinq catégories pour le mois en cours en
  moins de deux minutes, à partir de la vue principale de l'application.
- **CS-002** : Un utilisateur consultant le mois identifie chaque enveloppe en dépassement en moins
  de cinq secondes, sans avoir à faire défiler la page au-delà de la synthèse.
- **CS-003** : Le montant dépensé de chaque enveloppe est égal au centime près à la somme des
  transactions qui la concernent, sans dérive d'arrondi, sur un mois complet comportant au moins
  200 transactions.
- **CS-004** : Après l'ajout, la modification ou la suppression d'une transaction, les montants des
  enveloppes concernées reflètent le changement dès la consultation suivante du mois, sans que
  l'utilisateur ait à rafraîchir ou à déclencher un recalcul.
- **CS-005** : Un utilisateur entamant son deuxième mois peut reproduire le plan du mois précédent en
  une seule action, plutôt qu'en ressaisissant chaque plafond.
- **CS-006** : 100 % des états d'enveloppe restent distinguables lorsque la couleur est retirée de
  l'affichage.
- **CS-007** : Les plafonds définis sur un mois n'altèrent jamais les montants restitués pour un
  autre mois, vérifié sur au moins trois mois consécutifs de données.

## Hypothèses

- **La saisie des transactions est une fonctionnalité prérequise et se trouve hors périmètre.** La
  présente spécification définit uniquement la manière dont les plafonds sont fixés et dont la
  dépense est mesurée par rapport à eux. Elle suppose l'existence de transactions comportant au
  minimum un montant, une date, une catégorie et un type distinguant dépense, revenu et virement. Si
  la saisie des transactions n'est ni spécifiée ni construite, cette fonctionnalité ne peut pas être
  menée à terme.
- **Les catégories existent déjà** sous forme de liste gérée par l'utilisateur, ou sont créées dans
  le cadre de la saisie des transactions. La gestion de la liste des catégories (création, renommage,
  suppression) est hors périmètre de cette fonctionnalité.
- **Une devise unique** est utilisée partout, conformément au périmètre mono-utilisateur et local de
  la constitution du projet. Les enveloppes multi-devises sont hors périmètre.
- **Les mois sont des mois calendaires** dans le fuseau horaire local de l'utilisateur. Les périodes
  budgétaires personnalisées (quinzaine, cycles de quatre semaines, périodes calées sur la paie) sont
  hors périmètre pour cette version.
- **Les montants non dépensés ne sont pas reportés** sur le mois suivant. Chaque mois, l'enveloppe
  repart de son plafond énoncé. Le véritable budget par enveloppes avec report est une fonctionnalité
  envisageable ultérieurement.
- **Le seuil de 85 % pour l'état « proche du plafond » est une valeur par défaut fixe**, non
  configurable par l'utilisateur dans cette version. Il a été retenu comme une convention budgétaire
  courante laissant une marge de réaction exploitable.
- **Aucune notification, alerte ou relance** n'est émise en dehors de l'application. Les alertes sont
  visibles lorsque l'utilisateur ouvre la vue budgétaire, conformément aux contraintes de la
  constitution sur le fonctionnement local et l'absence de télémétrie.
- **Utilisateur unique, sans partage ni gestion de droits**, conformément à la constitution du
  projet. Aucun rôle, aucune validation, aucun budget partagé.
- **Exactitude historique plutôt que correction rétroactive** : modifier un plafond ne le modifie que
  pour le mois concerné ; le système ne cherche pas à réinterpréter les mois passés.
- **Articulation avec la fonctionnalité 002** : `specs/002-income-subscriptions-budget` détermine le
  reste disponible d'un mois (revenus moins charges engagées). La présente fonctionnalité répartit
  les dépenses variables par catégorie et alerte en cas de dépassement. Les deux sont complémentaires
  et aucune ne dépend de l'autre pour être livrée.
- **La langue de l'interface** retenue est le **français**, avec le format monétaire français
  (`1 234,56 €`) et les dates au format `JJ/MM/AAAA`, en cohérence avec la fonctionnalité 002.
