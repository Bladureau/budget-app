# Spécification de fonctionnalité : Synchronisation bancaire automatique (LCL + Revolut)

**Répertoire de fonctionnalité** : `specs/006-bank-sync`

**Branche** : `feat-006-bank-sync`

**Créée le** : 2026-10-01

**Statut** : Brouillon

**Demande initiale** : « Synchronisation bancaire automatique LCL + Revolut via Enable Banking
(open banking DSP2), pour que mes dépenses s'ajoutent toutes seules au budget sans saisie
manuelle. »

---

## Données observées

Cette spécification s'appuie sur un **essai réel** mené le 2026-10-01 : les opérations de
septembre 2026 des deux comptes de l'utilisateur ont été récupérées par l'intermédiaire
d'Enable Banking, puis comparées à l'export CSV de LCL. Les règles ci-dessous ne sont pas des
hypothèses, elles décrivent ce qui a été constaté.

| Constat | LCL | Revolut |
| --- | --- | --- |
| Opérations de septembre | 39 | 28 |
| Identifiant d'opération présent et stable d'une autorisation à l'autre | 39 / 39 | 28 / 28 |
| Nature de l'opération fournie de façon structurée | Non : elle se lit dans le libellé (`CARTE`, `VIREMENT`, `PRELVT SEPA…`) | Oui (paiement carte, recharge, virement) |
| Nom du commerçant | Dans le libellé : `CB  PETROLEC SUD     26/09/26` | Propre et isolé : `Carrefour City` |
| Date du paiement | **Différente de la date de débit** ; elle figure à la fin du libellé (débit le 28/09, paiement le 26/09) | Égale à la date de l'opération |
| Code d'activité du commerçant | Absent | Absent |
| Compte | Joint (l'utilisateur et ses parents, qui n'ont pas de carte) | Personnel |

L'identifiant du compte change à chaque nouvelle autorisation : un compte se reconnaît à son
IBAN. Les deux banques accordent une autorisation de **180 jours** au maximum.

**Recoupement vérifié** : chaque recharge de Revolut apparaît des deux côtés le même jour
(`CB Revolut … −50` chez LCL, `Top-Up +50` chez Revolut). Compter les deux reviendrait à compter
deux fois le même argent.

**Conséquence** : l'export CSV n'apporte rien que la synchronisation n'apporte déjà. Il est
écarté (voir « Hors périmètre »).

---

## Scénarios utilisateur et validation *(obligatoire)*

### Récit 1 — Mes paiements apparaissent tout seuls dans mon budget (Priorité : P1)

Je paie mes courses avec ma carte LCL, puis un trajet en bus avec Revolut. Sans rien saisir,
je retrouve plus tard ces deux dépenses dans mon journal, au bon jour, au bon montant, avec un
libellé lisible et une catégorie, et mon reste du jour et du mois en tient compte.

**Pourquoi cette priorité** : c'est la raison d'être de la fonctionnalité. Sans import
automatique des paiements carte, aucun autre récit n'a de valeur.

**Test indépendant** : relier un compte, laisser une synchronisation s'exécuter, puis vérifier
que chaque paiement carte de la période figure une et une seule fois dans le journal, au
centime, à la date du paiement.

**Scénarios d'acceptation** :

1. **Étant donné** un paiement carte LCL débité le 28/09 dont le libellé porte `26/09/26`,
   **quand** la synchronisation s'exécute,
   **alors** une dépense de même montant est créée **au 26/09**, avec le nom du commerçant pour
   libellé.
2. **Étant donné** un paiement Revolut de 5,45 € suivi de son arrondi de 0,55 €,
   **quand** la synchronisation s'exécute,
   **alors** **une seule** dépense de **6,00 €** est créée.
3. **Étant donné** une opération déjà importée,
   **quand** la synchronisation s'exécute à nouveau, y compris après une nouvelle autorisation,
   **alors** aucune dépense en double n'est créée.
4. **Étant donné** un commerçant reconnu par une règle de catégorie (par exemple `Carrefour` →
   Courses),
   **quand** la dépense est importée,
   **alors** elle porte cette catégorie et est comptée dans l'enveloppe correspondante.
5. **Étant donné** des dépenses importées,
   **quand** je consulte le journal,
   **alors** je vois pour chacune sa provenance (LCL, Revolut ou saisie manuelle).

---

### Récit 2 — Ne jamais compter deux fois le même argent (Priorité : P1)

Je recharge Revolut depuis LCL, mon abonnement Spotify passe sur ma carte LCL, et mes parents
me versent le loyer que je reverse aussitôt au bailleur. Aucune de ces opérations ne doit
gonfler mes dépenses ou mes revenus.

**Pourquoi cette priorité** : un import qui compte deux fois est pire que pas d'import du tout.
Il fausse le reste à dépenser dès le premier jour et détruit la confiance dans les chiffres.
Ce récit est donc indissociable du récit 1.

**Test indépendant** : synchroniser le mois de septembre 2026 de l'utilisateur et vérifier que
ni les recharges Revolut, ni Spotify, ni le loyer, ni aucun virement entrant n'apparaissent
dans les dépenses ou les revenus.

**Scénarios d'acceptation** :

1. **Étant donné** un paiement LCL `CB Revolut**…`,
   **quand** il est synchronisé,
   **alors** il est ignoré, et la recharge correspondante côté Revolut l'est aussi.
2. **Étant donné** un paiement correspondant à un abonnement déjà saisi (Spotify, cotisation
   mensuelle de carte LCL, Claude Code),
   **quand** il est synchronisé,
   **alors** il n'est pas importé comme dépense, l'abonnement étant déjà compté dans les charges.
3. **Étant donné** le virement du loyer au bailleur et les virements des parents qui le
   couvrent,
   **quand** ils sont synchronisés,
   **alors** ils ne sont comptés ni en dépense, ni en revenu, ni en abonnement.
4. **Étant donné** un virement entrant (CAF, pension, virement de l'utilisateur à lui-même),
   **quand** il est synchronisé,
   **alors** il est ignoré, les revenus restant saisis à part.
5. **Étant donné** un paiement Revolut à 0,00 € (pré-autorisation) ou un paiement vers `Bunq`,
   **quand** il est synchronisé,
   **alors** il est ignoré.
6. **Étant donné** le prélèvement de télépéage `UMS-ULYS`,
   **quand** il est synchronisé,
   **alors** il est importé comme **dépense**, et non comme abonnement.

---

### Récit 3 — Décider moi-même des opérations que les règles ne savent pas trancher (Priorité : P1)

Un virement sortant vers ma mère avec le motif « caution tls » ne correspond à aucune règle.
Je le retrouve dans une liste « À classer » et je décide : c'est une dépense, je l'ignore, ou
j'ignore désormais tout ce qui va vers ce bénéficiaire.

**Pourquoi cette priorité** : c'est la garantie que **rien n'est compté à mon insu**. Sans elle,
le système devrait deviner, et une erreur de devinette fausse le budget sans que je le sache.

**Test indépendant** : synchroniser un mois contenant des virements sortants inconnus, vérifier
qu'ils apparaissent dans « À classer » sans avoir modifié le budget, puis classer chacun et
vérifier l'effet.

**Scénarios d'acceptation** :

1. **Étant donné** une opération qu'aucune règle ne tranche,
   **quand** elle est synchronisée,
   **alors** elle rejoint la liste « À classer » et **n'affecte pas** le budget tant que je ne
   l'ai pas classée.
2. **Étant donné** une opération à classer,
   **quand** je choisis « Dépense » (avec une catégorie facultative),
   **alors** elle devient une dépense à sa date et quitte la liste.
3. **Étant donné** une opération à classer,
   **quand** je choisis « Ignorer »,
   **alors** elle quitte la liste sans affecter le budget et n'y revient jamais.
4. **Étant donné** une opération à classer,
   **quand** je choisis « Toujours ignorer ce bénéficiaire / ce libellé »,
   **alors** les opérations futures correspondantes sont ignorées automatiquement.
5. **Étant donné** une opération à classer correspondant à un abonnement déjà saisi,
   **quand** je la rattache à cet abonnement,
   **alors** elle est ignorée, ainsi que ses occurrences futures.
6. **Étant donné** des opérations en attente de classement,
   **quand** j'ouvre l'application,
   **alors** leur nombre m'est signalé.

---

### Récit 4 — Mes remboursements réduisent mes dépenses (Priorité : P2)

Twitch me rembourse 4,99 €. Ce montant doit venir en déduction de ce que j'ai dépensé, et non
être ignoré ni compté comme un revenu.

**Pourquoi cette priorité** : les remboursements sont rares (un seul en septembre) mais réels.
Les ignorer surestimerait durablement mes dépenses.

**Test indépendant** : synchroniser une période contenant une opération `CARTE ANNUL./REGUL.` et
vérifier que le total dépensé du mois diminue du montant remboursé.

**Scénarios d'acceptation** :

1. **Étant donné** un remboursement carte de 4,99 €,
   **quand** il est synchronisé,
   **alors** le total dépensé du mois diminue de 4,99 €, et le reste à dépenser augmente
   d'autant.
2. **Étant donné** un remboursement,
   **quand** je consulte le journal,
   **alors** il y apparaît distinctement d'une dépense, avec son montant présenté comme une
   déduction.
3. **Étant donné** un remboursement dont la catégorie est connue,
   **quand** il est comptabilisé,
   **alors** il réduit la consommation de l'enveloppe de cette catégorie.

---

### Récit 5 — Relier mes banques et garder l'accès dans la durée (Priorité : P2)

Depuis l'application, je relie LCL puis Revolut en validant chez chaque banque. Six mois plus
tard, l'application me prévient avant que l'accès expire et me propose de le renouveler en un
geste.

**Pourquoi cette priorité** : sans parcours de liaison, la fonctionnalité n'existe pas ; sans
rappel de renouvellement, elle s'arrête silencieusement au bout de 180 jours, et le budget
redevient faux sans que je le sache.

**Test indépendant** : relier une banque depuis l'application, vérifier qu'une synchronisation
aboutit, puis simuler une autorisation proche de l'expiration et vérifier l'avertissement.

**Scénarios d'acceptation** :

1. **Étant donné** une banque non reliée,
   **quand** je choisis « Relier LCL » et que je valide chez la banque,
   **alors** je reviens dans l'application avec la banque reliée et une première
   synchronisation lancée.
2. **Étant donné** une autorisation qui expire dans moins de 14 jours,
   **quand** j'ouvre l'application,
   **alors** un avertissement m'invite à la renouveler.
3. **Étant donné** une autorisation expirée ou révoquée,
   **quand** la synchronisation échoue,
   **alors** l'application l'indique en toutes lettres, avec la date de dernière
   synchronisation réussie, et propose « Reconnecter ».
4. **Étant donné** une autorisation renouvelée,
   **quand** la synchronisation reprend,
   **alors** les opérations survenues pendant l'interruption sont importées, sans doublon.

---

### Récit 6 — Garder la main sur ce qui a été importé (Priorité : P3)

Je corrige la catégorie d'une dépense importée, ou je supprime une dépense importée par
erreur. La synchronisation suivante ne doit ni écraser ma correction, ni réimporter ce que j'ai
supprimé.

**Pourquoi cette priorité** : moins fréquent que les récits précédents, mais indispensable pour
que l'utilisateur garde le dernier mot sur son budget.

**Test indépendant** : modifier puis supprimer deux dépenses importées, relancer une
synchronisation, et vérifier que la modification est conservée et que la suppression tient.

**Scénarios d'acceptation** :

1. **Étant donné** une dépense importée dont j'ai changé la catégorie, le libellé ou le montant,
   **quand** une synchronisation s'exécute,
   **alors** ma modification est conservée.
2. **Étant donné** une dépense importée que j'ai supprimée,
   **quand** une synchronisation s'exécute,
   **alors** elle n'est pas réimportée.
3. **Étant donné** une catégorie que j'attribue à une dépense importée,
   **quand** je demande à l'appliquer à ce commerçant,
   **alors** les dépenses futures de ce commerçant reçoivent cette catégorie.

---

### Cas limites

- **Deux paiements identiques le même jour** (deux cafés à 2 € au même endroit) : ce sont deux
  opérations distinctes, chacune avec son identifiant ; les deux sont importées.
- **Arrondi Revolut sans paiement associable sans ambiguïté** (deux paiements du même jour
  pourraient l'expliquer) : l'arrondi rejoint « À classer » plutôt que d'être rattaché au
  hasard. Un paiement à 0,00 € n'est jamais candidat : le 27/09, l'arrondi de 1,00 € se
  rattache donc à `Bunq` et est ignoré avec lui.
- **Paiement carte LCL d'un mois débité le mois suivant** (payé le 30/09, débité le 02/10) :
  la dépense est comptée en **septembre**, mois du paiement.
- **Libellé LCL dont la date de paiement est illisible** : l'opération rejoint « À classer »
  (EF-014).
- **Paiement fait à l'étranger** : il est débité en euros sur le compte, donc importé normalement
  pour son montant en euros. Seule une opération dont le montant est exprimé dans une autre
  devise que l'euro rejoint « À classer » (EF-038).
- **Abonnement dont le montant prélevé diffère du montant saisi** (hausse de tarif non encore
  reportée) : l'opération rejoint « À classer » plutôt que d'être ignorée à tort ou comptée
  deux fois.
- **Première synchronisation après des semaines de saisie manuelle** : seules les opérations
  payées à partir du 2026-10-01 sont importées (EF-039). À partir de cette date, l'utilisateur
  cesse de saisir ses paiements carte à la main.
- **Dépense carte saisie à la main par habitude après le 2026-10-01** : elle ferait doublon avec
  l'import. Aucune détection automatique n'est prévue ; l'utilisateur la supprime (voir
  « Hypothèses »).
- **Banque momentanément indisponible**, ou limite de consultations atteinte : la
  synchronisation est retentée plus tard, sans perte ni doublon, et l'échec reste visible.
- **Synchronisation pendant qu'un appareil modifie le budget** : ni l'import ni la saisie de
  l'utilisateur ne doivent être perdus.
- **Opération en attente puis annulée par la banque** : seules les opérations comptabilisées
  sont importées.
- **Compte non lié dans le portail du fournisseur** : la banque renvoie une liste de comptes
  vide (constaté lors de l'essai). L'application doit le dire plutôt que d'afficher une
  synchronisation réussie sans résultat.

---

## Exigences *(obligatoire)*

### Exigences fonctionnelles

#### Liaison et autorisation

- **EF-001** : L'utilisateur DOIT pouvoir relier, depuis l'application, son compte LCL et son
  compte Revolut, en validant l'accès auprès de chaque banque.
- **EF-002** : L'accès aux banques DOIT être en **lecture seule**. Aucun paiement ni virement ne
  peut être initié.
- **EF-003** : Le système DOIT reconnaître un compte d'une autorisation à l'autre par son IBAN,
  sans conserver l'IBAN complet. À la première liaison, si la banque renvoie plusieurs comptes
  en euros ou aucun, la liaison échoue avec un message explicite plutôt que de choisir au
  hasard.
- **EF-004** : Le système DOIT conserver la date d'expiration de chaque autorisation, avertir
  l'utilisateur **14 jours** avant son terme et proposer de la renouveler.
- **EF-005** : Une autorisation expirée, révoquée ou ne renvoyant aucun compte DOIT être
  signalée en toutes lettres, avec la date de dernière synchronisation réussie.
- **EF-006** : Les secrets permettant d'interroger le fournisseur NE DOIVENT jamais atteindre le
  navigateur ni être versionnés.

#### Synchronisation

- **EF-007** : Le système DOIT récupérer automatiquement les nouvelles opérations des comptes
  reliés **à chaque ouverture de l'application** (ou retour sur celle-ci), au plus une fois
  toutes les **6 heures** par banque, sans dépasser la limite de consultation de chaque
  banque. *(Reformulée au plan, voir research.md R3 : aucune tâche de fond.)*
- **EF-008** : L'utilisateur DOIT pouvoir déclencher une synchronisation à la demande, au plus
  une fois toutes les 5 minutes.
- **EF-009** : Seules les opérations **comptabilisées** par la banque DOIVENT être traitées ;
  une opération en attente ne l'est pas.
- **EF-010** : Une opération bancaire NE DOIT être traitée qu'**une seule fois**, quels que
  soient le nombre de synchronisations et de renouvellements d'autorisation. L'identifiant
  d'opération fourni par la banque fait foi.
- **EF-011** : L'import NE DOIT entrer en conflit avec aucune saisie faite sur un appareil :
  ni l'opération importée, ni la saisie de l'utilisateur ne peuvent être perdues.
- **EF-012** : Après une interruption (banque indisponible, autorisation expirée), la
  synchronisation suivante DOIT rattraper les opérations survenues entretemps.
- **EF-013** : L'application DOIT afficher la date de dernière synchronisation réussie de
  chaque banque, et tout échec en toutes lettres.

#### Règles de traitement — LCL

- **EF-014** : Un paiement carte DOIT devenir une dépense datée du **jour du paiement** extrait
  du libellé, et non du jour de débit. Si cette date est illisible, l'opération rejoint « À
  classer », où l'utilisateur la classe en connaissant la date de débit.
- **EF-015** : Le libellé de la dépense DOIT être le nom du commerçant extrait du libellé
  bancaire, débarrassé du préfixe `CB` et de la date.
- **EF-016** : Un paiement `CB Revolut**…` DOIT être ignoré : c'est une recharge du compte
  Revolut.
- **EF-017** : Un prélèvement `UMS-ULYS` DOIT devenir une dépense.
- **EF-018** : Un remboursement carte (`CARTE ANNUL./REGUL.`) DOIT être comptabilisé en
  **déduction** des dépenses (voir EF-030 à EF-032).
- **EF-019** : Les virements liés au loyer (le virement sortant vers le bailleur et les
  virements entrants des parents qui le couvrent) DOIVENT être ignorés.
- **EF-020** : Tout autre virement entrant DOIT être ignoré : les revenus restent saisis à part.

#### Règles de traitement — Revolut

- **EF-021** : Un paiement carte de montant strictement positif DOIT devenir une dépense, au jour
  du paiement, avec le nom du commerçant pour libellé.
- **EF-022** : L'arrondi « Spare Change » associé à un paiement DOIT être **ajouté** au montant
  de ce paiement pour former une seule dépense (5,45 € + 0,55 € → 6,00 €). Un arrondi
  impossible à associer sans ambiguïté rejoint « À classer ».
- **EF-023** : Les recharges, les paiements à 0,00 € et les paiements vers `Bunq` DOIVENT être
  ignorés.

#### Règles communes

- **EF-024** : Une opération correspondant à un **abonnement déjà saisi** DOIT être ignorée.
  La correspondance se fait par une association établie par l'utilisateur (EF-027) ; à défaut
  d'association, l'opération rejoint « À classer » plutôt que d'être devinée.
- **EF-025** : Toute opération qu'aucune règle ne tranche DOIT rejoindre la liste « À classer »
  et NE DOIT PAS affecter le budget tant qu'elle n'est pas classée.
- **EF-026** : Le nombre d'opérations à classer DOIT être visible dès l'ouverture de
  l'application.
- **EF-027** : Pour chaque opération à classer, l'utilisateur DOIT pouvoir choisir :
  « Dépense » (avec une catégorie facultative), « Ignorer », « Toujours ignorer ce
  bénéficiaire / ce libellé », ou « Rattacher à l'abonnement… ». Les deux derniers choix
  s'appliquent aux opérations futures correspondantes.
- **EF-028** : Le système DOIT attribuer une catégorie aux dépenses importées à partir de règles
  portant sur le nom du commerçant, fournies avec des valeurs initiales (`Carrefour`/`Casino` →
  Courses ; `SNCF`/`Tisseo`/`Fairtiq`/`Ulys` → Transport ; `Uber Eats`/`Burger King` →
  Restauration) et modifiables par l'utilisateur. Sans règle applicable, la dépense est
  importée sans catégorie.
- **EF-029** : Chaque dépense importée DOIT porter sa provenance (LCL, Revolut) ; une dépense
  saisie à la main porte la provenance « manuelle ».

#### Remboursements

- **EF-030** : Un remboursement DOIT être représenté comme une notion distincte d'une dépense,
  la règle du projet imposant un montant de dépense strictement positif.
- **EF-031** : Un remboursement DOIT réduire, à sa date, le total dépensé du mois et du jour,
  et la consommation de l'enveloppe de sa catégorie si elle est connue.
- **EF-032** : Le total dépensé d'un mois NE DOIT jamais devenir négatif du fait de
  remboursements ; l'excédent éventuel est présenté comme tel plutôt que comme une dépense
  négative.

#### Maîtrise par l'utilisateur

- **EF-033** : Une modification apportée par l'utilisateur à une dépense importée (catégorie,
  libellé, montant, date) NE DOIT jamais être écrasée par une synchronisation.
- **EF-034** : Une dépense importée puis supprimée par l'utilisateur NE DOIT jamais être
  réimportée.
- **EF-035** : Les règles de traitement et de catégorisation créées par l'utilisateur, ainsi que
  ses décisions de classement, font partie de ses données : elles DOIVENT être incluses dans
  l'export et restituées par l'import. Les autorisations bancaires et les secrets, eux, n'y
  figurent pas.

#### Exactitude monétaire

- **EF-036** : Les montants bancaires DOIVENT être convertis en centimes entiers **sans passer
  par un nombre à virgule flottante**, à partir de leur représentation textuelle.
- **EF-037** : La fusion d'un paiement et de son arrondi DOIT être une somme exacte en
  centimes.
- **EF-038** : Seuls les montants en euros sont pris en compte. Une opération dans une autre
  devise rejoint « À classer ».

#### Démarrage

- **EF-039** : Le système DOIT n'importer que les opérations dont la date de paiement est
  **postérieure ou égale à la date de début d'import** (2026-10-01). Les opérations antérieures
  sont ignorées, et les dépenses saisies à la main avant cette date restent intactes.
  *(Q1 tranchée le 2026-10-01.)*
- **EF-040** : La date de début d'import DOIT être visible dans l'application. Un paiement
  antérieur débité après cette date (payé le 30/09, débité le 02/10) DOIT être ignoré, puisque
  c'est la date de paiement qui fait foi.

### Entités clés

- **Banque reliée** — une banque (LCL ou Revolut), le compte suivi (identifié par son IBAN), la
  date d'expiration de l'autorisation, la date et l'état de la dernière synchronisation.
- **Opération bancaire** — une ligne de relevé : identifiant fourni par la banque, date de
  débit, date de paiement si connue, montant, sens (débit ou crédit), libellé brut, provenance.
  Chaque opération reçoit un **sort** : importée comme dépense, importée comme remboursement,
  ignorée (avec la règle qui l'a décidé), ou à classer.
- **Dépense** *(existante, étendue)* — gagne une provenance et, si elle est importée, la
  référence de l'opération bancaire d'origine.
- **Remboursement** *(nouvelle)* — un montant positif venant en déduction des dépenses : date,
  montant, libellé, catégorie facultative, opération bancaire d'origine.
- **Règle de traitement** — un critère portant sur une opération (libellé, bénéficiaire,
  nature) et le sort qu'il impose : ignorer, rattacher à un abonnement, importer comme
  dépense.
- **Règle de catégorie** — un motif de nom de commerçant et la catégorie qu'il attribue.

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Sur le mois de septembre 2026 de l'utilisateur, **100 %** des paiements carte
  LCL et Revolut sont importés, **au centime** et **au jour du paiement**.
- **CS-002** : Sur ce même mois, **aucune** recharge Revolut, aucun abonnement déjà saisi, aucun
  virement de loyer et aucun virement entrant n'apparaît en dépense ou en revenu.
- **CS-003** : **Zéro doublon** après dix synchronisations successives et un renouvellement
  d'autorisation.
- **CS-004** : Un paiement apparaît dans le budget **dans la journée** où la banque le
  comptabilise, dès que l'utilisateur ouvre l'application, sans autre action de sa part.
- **CS-005** : Au moins **80 %** des dépenses importées reçoivent une catégorie automatiquement
  après un mois d'usage.
- **CS-006** : Classer une opération de la liste « À classer » prend **moins de dix
  secondes**.
- **CS-007** : Le temps consacré à la saisie des dépenses carte passe à **zéro**, hors classement
  ponctuel.
- **CS-008** : L'utilisateur est averti **au moins 14 jours** avant l'expiration de chaque
  autorisation, et une autorisation expirée ne passe jamais inaperçue plus d'une journée.
- **CS-009** : Les identifiants d'accès au fournisseur ne sont lisibles depuis **aucun**
  navigateur, ni présents dans **aucun** fichier versionné ou exporté.

---

## Hypothèses

- **Fournisseur choisi par l'utilisateur** : Enable Banking, application déjà créée et active,
  avec LCL et Revolut liés dans son portail. Ce choix explicite est ce qui rend la
  fonctionnalité compatible avec le principe I (voir « Conformité constitutionnelle »).
- **Les parents n'ont pas de carte** sur le compte joint : tous les paiements carte LCL sont ceux
  de l'utilisateur, aucun filtrage par numéro de carte n'est nécessaire.
- **Les abonnements Spotify, Claude Code et la cotisation mensuelle de carte LCL sont saisis
  comme abonnements** dans l'application ; l'utilisateur ajoutera la cotisation de carte
  lui-même.
- **La reconnaissance du loyer** repose sur le libellé (`Loyer`) et les émetteurs observés. Une
  variante non reconnue rejoint « À classer » (EF-025), ce qui protège contre un faux classement.
- **Fréquence** : au plus quatre récupérations automatiques par jour et par banque suffisent pour
  un budget personnel et respectent la limite usuelle des banques. Le budget ne se consultant
  que dans l'application, récupérer à l'ouverture apporte le même résultat qu'une tâche
  planifiée.
- **Rappel à 14 jours** : délai par défaut, suffisant pour renouveler sans urgence.
- **La saisie manuelle reste possible** pour les dépenses en espèces ou les corrections. À partir
  du 2026-10-01, l'utilisateur ne saisit plus ses paiements carte LCL ni Revolut.
- **Le serveur auto-hébergé existant** (fonctionnalité 005) exécute la synchronisation ; il
  reste joignable depuis le réseau privé de l'utilisateur et sort vers le fournisseur.
- **Les règles de catégorie initiales** sont un point de départ, pas une liste exhaustive.
- **Le serveur n'est pas allumé en permanence.** Les opérations survenues pendant une extinction
  sont rattrapées à l'allumage suivant, datées du jour de leur paiement (EF-012). Une extinction
  de plus de 90 jours peut dépasser l'historique accessible chez certaines banques.

---

## Conformité constitutionnelle

| Principe | Verdict | Motif |
| --- | --- | --- |
| I. Propriété locale des données | ⚠️ **Compatible sous conditions** | Le principe interdit toute transmission à un service tiers « qu'il n'a pas explicitement choisi ». Enable Banking est **choisi explicitement** par l'utilisateur, qui l'a configuré lui-même. Le flux va **de la banque vers l'application** : aucune écriture du budget n'est envoyée au fournisseur. La consultation et la saisie hors connexion ne sont pas affectées, la synchronisation se déroulant côté serveur. Cette dépendance doit être consignée dans le plan. |
| II. L'argent est exact | ✅ Conforme | EF-036 à EF-038 : conversion depuis le texte, sans virgule flottante ; fusion des arrondis en somme exacte ; devise explicite. Le remboursement est une notion dédiée plutôt qu'une dépense négative (EF-030). |
| III. Tester là où cela compte | ✅ Conforme, **exigeant** | L'analyse des libellés, l'extraction des dates, la fusion des arrondis, les règles de tri et l'anti-doublon sont du code « qui analyse des données financières importées » : tous sous obligation de test. Les opérations réelles de septembre fournissent un jeu de cas concret. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Les réponses du fournisseur sont une entrée non fiable, à valider à l'exécution. |
| V. Documentation du framework | ✅ Conforme | À lire avant toute route ou tâche côté serveur. |
| VI. Simplicité et YAGNI | ⚠️ **À justifier** | La fonctionnalité introduit une **tâche de fond** et des **règles configurables**, deux éléments que le principe soumet à justification. Le besoin est présent et démontré par l'essai réel ; le plan devra néanmoins se limiter aux deux banques réelles, sans couche générique « multi-banques ». |
| VII. Accessibilité et adaptabilité | ✅ Conforme | Les nouveaux états (à classer, autorisation expirée, échec) sont portés par du texte. La liste « À classer » est utilisable au clavier et à 360 px. |
| VIII. Le français comme langue du projet | ✅ Conforme | Cette spécification est rédigée en français. |

**Contrainte technique** : l'export et l'import (constitution, « Contraintes techniques et de
données ») DOIVENT couvrir les nouvelles données de l'utilisateur, à savoir les règles, les
décisions de classement et les remboursements (EF-035). Le document persisté change donc de
version et DOIT disposer d'un chemin de migration sans perte.

---

## Hors périmètre

- **Affichage du reste à dépenser par semaine** : fonctionnalité séparée (007).
- **Import de relevés CSV** : l'essai a montré que la synchronisation fournit au moins les mêmes
  informations.
- **Soldes de comptes**, suivi multi-comptes ou rapprochement de soldes.
- **Initiation de paiements** ou de virements.
- **Import automatique des revenus** : ils restent saisis à part (fonctionnalité 002).
- **Banques autres que LCL et Revolut.**
- **Notifications poussées** sur le téléphone : l'information s'affiche à l'ouverture de
  l'application.

---

## Clarifications

### Session du 2026-10-01

- **Q1** : Que faire des dépenses déjà saisies à la main lors de la première synchronisation ?
  → **Option A** : import à partir d'une date de début fixée au **2026-10-01**. L'utilisateur
  arrête la saisie manuelle des paiements carte à partir de ce jour. Aucun rapprochement
  automatique avec les saisies manuelles (EF-039, EF-040).
