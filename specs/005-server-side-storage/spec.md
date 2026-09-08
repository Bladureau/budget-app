# Spécification de fonctionnalité : Stockage centralisé et synchronisation entre appareils

**Répertoire de fonctionnalité** : `specs/005-server-side-storage`

**Créée le** : 2026-09-07

**Statut** : Brouillon

**Demande initiale** : « Faire évoluer l'application (actuellement en localStorage) pour stocker les
données côté serveur, de façon persistante et centralisée, afin qu'elles soient synchronisées entre
tous mes appareils. L'app reste mono-utilisateur, sans système de connexion. […] Auto-hébergé, accès
privé uniquement, usage personnel mono-utilisateur. »

---

## Rectification du modèle de données existant

La demande évoque « transactions, catégories, budgets mensuels ». L'analyse du code en place montre
**un modèle différent**, que cette spécification retient comme référence puisque la demande exige
explicitement que le stockage central respecte le modèle réel.

| Terme de la demande | Réalité du modèle |
| --- | --- |
| « Transactions » | Il n'existe **aucune** collection unifiée de transactions. Les revenus et les dépenses sont **deux collections distinctes**, de formes différentes. Un revenu n'a pas de catégorie ; une dépense en a une, facultative. |
| « Catégories » | Il n'existe **aucune entité catégorie**. La catégorie est une **chaîne de texte libre** portée par chaque dépense et par chaque plafond. Aucune liste gérée, aucun identifiant, aucun renommage global. |
| « Budgets mensuels » | Correspond aux **enveloppes** : un plafond par couple catégorie / mois. |
| *(absent de la demande)* | Les **abonnements**, entité la plus riche du modèle : périodicité, historique de tarifs jamais écrasé, périodes de pause, date de résiliation. |

Le document persisté comporte donc **quatre collections** et un numéro de version, actuellement 3.
Toute divergence entre le stockage central et ce modèle serait une régression, pas une simplification.

---

## Scénarios utilisateur et validation *(obligatoire)*

### Récit 1 — Retrouver mon budget sur un autre appareil (Priorité : P1)

Je saisis une dépense depuis mon ordinateur. Plus tard, j'ouvre l'application depuis mon téléphone :
la dépense y est, avec exactement les mêmes montants et les mêmes totaux. Je modifie un plafond
depuis le téléphone ; de retour sur l'ordinateur, la modification est là.

**Pourquoi cette priorité** : c'est la raison d'être de la fonctionnalité. Sans elle, rien d'autre
n'a de valeur. Aujourd'hui, chaque navigateur détient un budget différent et étanche, ce qui rend
l'application inutilisable dès qu'on possède plus d'un appareil.

**Test indépendant** : saisir une écriture depuis un appareil, ouvrir l'application depuis un second,
et vérifier que l'écriture et tous les totaux dérivés correspondent au centime.

**Scénarios d'acceptation** :

1. **Étant donné** un budget contenant des revenus, abonnements, dépenses et enveloppes,
   **quand** j'ouvre l'application depuis un appareil qui ne l'a jamais affichée,
   **alors** je retrouve l'intégralité de ces données, identiques au centime.
2. **Étant donné** deux appareils affichant le même budget,
   **quand** je crée une dépense sur le premier et que je rafraîchis le second,
   **alors** la dépense apparaît sur le second, et les totaux du mois y sont recalculés en conséquence.
3. **Étant donné** une dépense existante,
   **quand** je la supprime depuis un appareil,
   **alors** elle disparaît également des autres appareils au rafraîchissement suivant.
4. **Étant donné** un budget stocké de façon centrale,
   **quand** je vide les données de site de mon navigateur,
   **alors** mon budget est toujours là au rechargement — il ne vivait plus dans ce navigateur.

---

### Récit 2 — Reprendre mes données existantes sans en perdre une (Priorité : P1)

Mon budget actuel vit dans le navigateur de mon ordinateur. Je veux le transférer vers le stockage
central **sans ressaisir quoi que ce soit et sans rien perdre**, en me servant de la sauvegarde que
l'application sait déjà produire.

**Pourquoi cette priorité** : elle est aussi critique que le récit 1, pour une raison différente.
Un stockage central qui démarre vide me ferait perdre tout l'historique déjà saisi. La perte de
données lors d'une migration n'est jamais acceptable — c'est une règle explicite du projet.

**Test indépendant** : exporter le budget local existant, l'importer dans le stockage central, et
vérifier que le nombre d'éléments de chaque collection et la somme de tous les montants sont
identiques avant et après, au centime.

**Scénarios d'acceptation** :

1. **Étant donné** un budget existant dans le navigateur et un stockage central vide,
   **quand** j'exporte puis j'importe le fichier,
   **alors** le stockage central contient exactement les mêmes revenus, abonnements, dépenses et
   enveloppes, historiques de tarifs et périodes de pause compris.
2. **Étant donné** un fichier d'export produit par une version antérieure de l'application,
   **quand** je l'importe,
   **alors** son contenu est migré vers la version courante du modèle sans perte, comme aujourd'hui.
3. **Étant donné** un fichier refusé (étranger, abîmé, ou d'une version postérieure),
   **quand** je tente de l'importer,
   **alors** **aucune écriture n'a lieu** dans le stockage central et mes données antérieures sont
   intactes.
4. **Étant donné** un import qui vient d'être confirmé,
   **quand** je l'annule pendant la même session,
   **alors** l'état antérieur est restauré dans le stockage central.
5. **Étant donné** mon budget stocké centralement,
   **quand** je déclenche un export,
   **alors** j'obtiens un fichier qui reflète le contenu du stockage central, dans le même format
   documenté qu'aujourd'hui.

---

### Récit 3 — Continuer à saisir quand le stockage central est injoignable (Priorité : P2)

Je suis dans un magasin, sans réseau ou avec un réseau défaillant. J'ouvre l'application pour
enregistrer une dépense. Je dois pouvoir la consulter et la saisir malgré tout, et la retrouver
sur mes autres appareils une fois la connexion revenue.

**Pourquoi cette priorité** : ce n'est pas un confort. Le principe I de la constitution l'impose
en toutes lettres : « l'application DOIT rester utilisable pour consulter et saisir des transactions
sans connexion réseau ». C'est aussi le scénario d'usage le plus fréquent de la saisie de dépenses,
conçue pour être plus rapide que le paiement lui-même.

L'ampleur exacte de ce récit dépend de la question Q1 ci-dessous.

**Test indépendant** : couper l'accès au stockage central, saisir une dépense, vérifier qu'elle
s'affiche et se conserve, puis rétablir l'accès et vérifier qu'elle rejoint le stockage central.

**Scénarios d'acceptation** :

1. **Étant donné** un stockage central injoignable,
   **quand** j'ouvre l'application,
   **alors** je consulte mon budget tel qu'il était à la dernière synchronisation réussie, et
   l'application m'indique clairement que ce que je vois peut ne pas être à jour.
2. **Étant donné** un stockage central injoignable,
   **quand** je saisis une dépense,
   **alors** elle est conservée et affichée, et l'application m'indique qu'elle n'est pas encore
   synchronisée.
3. **Étant donné** des saisies effectuées hors connexion,
   **quand** l'accès au stockage central est rétabli,
   **alors** ces saisies rejoignent le stockage central sans action de ma part, et sans doublon.
4. **Étant donné** une écriture qui ne peut pas être enregistrée centralement,
   **quand** l'échec survient,
   **alors** l'application me le signale explicitement plutôt que de laisser croire à un
   enregistrement réussi.

---

### Récit 4 — Empêcher un tiers d'accéder à mon budget (Priorité : P2)

Mon budget n'est plus confiné à mon navigateur : il est joignable par le réseau. Je dois avoir la
certitude que personne d'autre que moi ne peut le lire ni le modifier.

**Pourquoi cette priorité** : c'est le risque **créé** par cette fonctionnalité. Aujourd'hui les
données sont inaccessibles à distance par construction ; demain elles ne le seront plus. L'historique
des transactions fait partie des jeux de données les plus révélateurs que possède une personne — la
justification même du principe I. Ce récit gate toute exposition au-delà de la machine locale.

**Test indépendant** : depuis un appareil non autorisé du même réseau, tenter de lire et de modifier
le budget, et vérifier que les deux échouent.

**Scénarios d'acceptation** :

1. **Étant donné** le stockage central en fonctionnement,
   **quand** une requête non autorisée tente de lire le budget,
   **alors** elle est refusée et aucune donnée financière n'est renvoyée.
2. **Étant donné** le stockage central en fonctionnement,
   **quand** une requête non autorisée tente de modifier ou d'effacer le budget,
   **alors** elle est refusée et les données restent intactes.
3. **Étant donné** un refus d'accès,
   **quand** il se produit,
   **alors** le message renvoyé ne divulgue aucun contenu financier ni aucun détail exploitable.

---

### Récit 5 — Ne pas perdre mes données si le serveur s'arrête (Priorité : P3)

Le stockage central tourne sur une machine que j'administre moi-même. Je dois pouvoir la redémarrer,
la mettre à jour ou la déplacer sans perdre mon budget.

**Pourquoi cette priorité** : la centralisation crée un point de défaillance unique là où il n'y en
avait pas. Elle est moins urgente que les précédents parce que l'export existant fournit déjà un
filet de sécurité, mais elle doit être traitée avant tout usage réel.

**Test indépendant** : arrêter puis relancer le stockage central, et vérifier que le budget est
intact et complet.

**Scénarios d'acceptation** :

1. **Étant donné** un budget enregistré centralement,
   **quand** le service est arrêté puis relancé,
   **alors** le budget est intact, au centime.
2. **Étant donné** un contenu central devenu illisible,
   **quand** l'application le détecte,
   **alors** elle ne l'écrase jamais et le conserve, comme elle le fait déjà pour le stockage local.

---

### Cas limites

- **Deux appareils modifient le budget au même moment.** Même en usage strictement personnel, un
  téléphone et un ordinateur peuvent être ouverts simultanément. Traité par la question Q2.
- **Un appareil hors connexion depuis longtemps se reconnecte** alors que le budget a évolué
  ailleurs entretemps.
- **Le stockage central devient injoignable en plein enregistrement** : l'écriture ne doit ni être
  perdue silencieusement, ni être appliquée à moitié.
- **Import d'un fichier volumineux** : plusieurs milliers de dépenses accumulées sur des années.
- **Un onglet resté ouvert plusieurs jours** affiche des données périmées sans le signaler.
- **Le budget contient déjà des données centralement** au moment d'un import : le remplacement doit
  être confirmé, comme aujourd'hui.
- **Deux navigateurs différents sur le même appareil** doivent voir le même budget — la donnée n'est
  plus liée au navigateur.
- **Le stockage central est vide au premier lancement** : ce n'est pas une erreur, c'est un budget
  neuf, et l'application doit inviter à la saisie ou à l'import.

---

## Exigences *(obligatoire)*

### Exigences fonctionnelles

#### Persistance centralisée

- **EF-001** : Le système DOIT conserver l'intégralité du budget dans un stockage central unique,
  distinct du navigateur, et le restituer identique à tout appareil autorisé.
- **EF-002** : Le stockage central DOIT accepter exactement les quatre collections du modèle en place
  — revenus, abonnements, dépenses, enveloppes — sans en fusionner, en renommer ni en omettre aucune.
- **EF-003** : Le système DOIT préserver chaque champ des entités existantes, y compris l'historique
  de tarifs et les périodes de pause d'un abonnement, dont la perte réécrirait des mois passés.
- **EF-004** : Les montants DOIVENT rester des entiers de centimes de bout en bout, y compris pendant
  leur transport vers et depuis le stockage central.
- **EF-005** : Le système DOIT permettre de créer, consulter, modifier et supprimer chaque entité des
  quatre collections, avec persistance centrale de chaque opération.
- **EF-006** : Le stockage central DOIT porter un numéro de version de schéma et DOIT disposer d'un
  chemin de migration pour toute évolution ultérieure.
- **EF-007** : Une migration en échec NE DOIT PAS altérer les données antérieures.
- **EF-008** : Un contenu central illisible NE DOIT jamais être écrasé ; il DOIT être conservé de
  côté, comme l'est aujourd'hui un contenu local illisible.

#### Continuité de l'expérience existante

- **EF-009** : Toutes les fonctionnalités actuelles DOIVENT continuer de se comporter à l'identique
  du point de vue de l'utilisateur : anneau du reste mensuel, allocation quotidienne, journal des
  dépenses, budget prévisionnel, cycle de vie des abonnements, enveloppes.
- **EF-010** : Les totaux, restants, allocations et états DOIVENT rester **dérivés** et ne jamais
  être stockés centralement, afin qu'un total ne puisse pas contredire ses composantes.
- **EF-011** : La saisie d'une dépense NE DOIT PAS devenir sensiblement plus lente qu'aujourd'hui.
- **EF-012** : L'application DOIT signaler visiblement tout échec d'enregistrement plutôt que de
  laisser croire à un succès.

#### Sauvegarde, restauration et migration

- **EF-013** : L'export DOIT produire un fichier reflétant le contenu du stockage central, dans le
  même format documenté qu'aujourd'hui.
- **EF-014** : L'import DOIT écrire dans le stockage central, en conservant les garanties actuelles :
  confirmation avant remplacement, refus sans écriture d'un fichier invalide, possibilité d'annuler
  dans la session.
- **EF-015** : Le couple export / import DOIT suffire à transférer un budget existant depuis le
  navigateur vers le stockage central, sans ressaisie et sans perte.
- **EF-016** : Un fichier d'une version antérieure DOIT rester acceptable et migré à la lecture ;
  un fichier d'une version postérieure DOIT rester refusé.

#### Disponibilité hors connexion

- **EF-017** : L'application DOIT rester utilisable pour **consulter et saisir** lorsque le stockage
  central est injoignable. *(Exigence constitutionnelle — voir la question Q1 pour son ampleur.)*
- **EF-018** : Lorsque les données affichées peuvent être périmées ou non synchronisées,
  l'application DOIT l'indiquer clairement plutôt que de les présenter comme certaines.
- **EF-019** : Les saisies effectuées hors connexion DOIVENT rejoindre le stockage central dès que
  possible, sans action de l'utilisateur et sans créer de doublon.

#### Accès privé

- **EF-020** : Le stockage central NE DOIT PAS être accessible en lecture ni en écriture sans
  autorisation. *(Modalité fixée par la question Q3.)*
- **EF-021** : Un refus d'accès NE DOIT divulguer aucun contenu financier.
- **EF-022** : Aucun secret NE DOIT être versionné, et aucun identifiant d'accès NE DOIT être exposé
  au navigateur sous une forme publique.
- **EF-023** : Les données NE DOIVENT être transmises à aucun service tiers. Le stockage central est
  un espace privé appartenant à l'utilisateur, non un service externe.

#### Concurrence entre appareils

- **EF-024** : Le système DOIT définir un comportement explicite lorsque deux appareils modifient le
  budget sans s'être vus. *(Comportement fixé par la question Q2.)*
- **EF-025** : Aucune situation de concurrence NE DOIT provoquer une perte silencieuse : soit
  l'écriture aboutit, soit l'utilisateur en est informé.

### Entités clés

Aucune entité nouvelle n'est introduite. Les quatre entités persistées sont inchangées et migrent
telles quelles vers le stockage central.

- **Revenu** — ponctuel (montant, date) ou récurrent (montant, périodicité, date de début, date de
  fin facultative). Porte un libellé, **pas** de catégorie.
- **Abonnement** — libellé, périodicité, date de début fixant le quantième de prélèvement, date de
  résiliation facultative, **historique de tarifs** ordonné et jamais écrasé, **périodes de pause**
  disjointes.
- **Dépense** — montant, date, libellé facultatif, catégorie facultative sous forme de texte libre.
- **Enveloppe** — catégorie (texte), mois, plafond entier positif ou nul, au plus une par couple
  catégorie / mois.
- **Document budgétaire** — l'agrégat des quatre collections, porteur du numéro de version de schéma.

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Une écriture saisie sur un appareil est visible sur un second appareil **en moins de
  cinq secondes** après rafraîchissement, sur un réseau local normal.
- **CS-002** : La migration du budget existant se fait **sans perte d'un seul centime** : le nombre
  d'éléments de chaque collection et la somme de tous les montants sont identiques avant et après,
  vérifiés sur le budget réel de l'utilisateur.
- **CS-003** : La saisie d'une dépense reste réalisable **en moins de dix secondes**, seuil déjà
  atteint aujourd'hui et qui ne doit pas se dégrader.
- **CS-004** : **Aucun comportement existant ne régresse** : l'intégralité des comportements
  actuellement vérifiés le reste après la bascule.
- **CS-005** : Un budget de **cinq mille dépenses** se charge et s'affiche sans que l'application
  paraisse figée.
- **CS-006** : Après arrêt et redémarrage du stockage central, le budget est **intact au centime**.
- **CS-007** : Depuis un appareil non autorisé, **aucune** donnée financière n'est lisible ni
  modifiable.
- **CS-008** : Hors connexion, consulter le budget et saisir une dépense restent possibles, et
  l'utilisateur comprend en **moins de cinq secondes** que ce qu'il voit n'est pas synchronisé.
- **CS-009** : Le transfert d'un budget depuis le navigateur vers le stockage central se fait en
  **moins de cinq minutes** et **sans ressaisie**.

---

## Hypothèses

- **Un seul utilisateur, plusieurs appareils.** Aucun compte, aucun profil, aucun partage. Le
  stockage central détient **un** budget, pas un budget par personne.
- **Auto-hébergement.** Le stockage central tourne sur une machine que l'utilisateur administre. Il
  n'est fait appel à aucun service tiers, ce qui est ce qui rend la fonctionnalité compatible avec le
  principe I.
- **La pile technique reste inchangée.** Elle est déjà capable d'exposer un service côté serveur sans
  ajout de fondement, donc sans amendement constitutionnel sur ce point.
- **Le modèle de données ne change pas.** Cette fonctionnalité déplace un stockage ; elle n'ajoute ni
  compte, ni objectif d'épargne, ni catégorie gérée.
- **L'usage concurrent est occasionnel**, mais possible : deux appareils peuvent être ouverts en même
  temps sans que ce soit un cas exotique.
- **Le format d'échange existant est réutilisé tel quel** pour la migration ; il a été conçu comme la
  porte de sortie des données et remplit ici exactement ce rôle.
- **La sauvegarde du stockage central relève de l'utilisateur**, l'export déclenché à la main
  restant le filet de sécurité documenté.

---

## Conformité constitutionnelle

Point examiné avant toute planification, cette fonctionnalité touchant directement au principe
fondateur du projet.

| Principe | Verdict | Motif |
| --- | --- | --- |
| I. Propriété locale des données | ⚠️ **Compatible sous conditions** | Le principe autorise un stockage « dans un unique espace privé qui lui appartient » : un serveur auto-hébergé en relève. Mais il exige aussi que « l'application DOIT rester utilisable pour consulter et saisir des transactions sans connexion réseau ». **Un simple remplacement de `localStorage` par des appels réseau violerait cette obligation.** D'où EF-017 et la question Q1. La dépendance réseau est par ailleurs justifiée : la synchronisation entre appareils est impossible localement, par définition. |
| II. L'argent est exact | ✅ Conforme | EF-004 impose des centimes entiers y compris en transport. Aucune division n'est introduite. |
| III. Tester là où cela compte | ✅ Conforme | Tout code qui persiste ou analyse des montants reste sous obligation de test, y compris le nouveau chemin de persistance et la migration. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Aucune dérogation demandée. Les données venues du stockage central sont **une entrée non fiable** et doivent être validées à l'exécution, exactement comme le contenu du navigateur aujourd'hui. |
| V. Documentation du framework | ✅ Conforme | La documentation de la version installée devra être lue avant tout code exposant un service. |
| VI. Simplicité et YAGNI | ⚠️ **À surveiller** | La centralisation ajoute une infrastructure là où il n'y en avait aucune. Elle est justifiée par un besoin réel — le multi-appareils — mais chaque ajout au-delà de ce besoin (comptes, rôles, historique de versions) serait de la généralité spéculative. |
| VII. Accessibilité et adaptabilité | ✅ Conforme | Les nouveaux états visibles (hors connexion, non synchronisé, échec) doivent être portés par du **texte**, pas seulement par une couleur ou une icône. |
| VIII. Le français comme langue du projet | ✅ Conforme | Cette spécification est rédigée en français. |

**Aucun amendement constitutionnel n'est requis si Q1 est tranchée en faveur du maintien de la
capacité hors connexion.** Dans le cas contraire, le principe I devrait être amendé **avant** toute
implémentation, et non après.

---

## Hors périmètre

Énoncé explicitement pour borner la fonctionnalité :

- Aucun système de connexion, de compte ou de mot de passe utilisateur.
- Aucun partage de budget entre plusieurs personnes.
- Aucun objectif d'épargne, compte bancaire multiple ou catégorie gérée — ce sont des évolutions du
  modèle, pas de son stockage.
- Aucune synchronisation temps réel poussée par le serveur : le rafraîchissement suffit à satisfaire
  CS-001.
- Aucun historique de versions du budget au-delà de l'annulation d'import déjà existante.
- Aucune application mobile native ; l'accès multi-appareils passe par le navigateur.
