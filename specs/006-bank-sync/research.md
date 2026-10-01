# Recherche : Synchronisation bancaire automatique (LCL + Revolut)

**Fonctionnalité** : [spec.md](./spec.md) · **Plan** : [plan.md](./plan.md) · **Date** : 2026-10-01

Chaque section suit le format **Décision / Motif / Alternatives écartées**. Les constats chiffrés
proviennent de l'essai réel du 2026-10-01 (septembre 2026, 39 opérations LCL, 28 Revolut),
mené avec un script hors dépôt.

---

## R1 — Qui écrit les dépenses importées dans le budget ?

**Décision** : **le navigateur**, pas le serveur. Le serveur se borne à récupérer les opérations
auprès d'Enable Banking, à les **normaliser** et à les tenir en cache dans un fichier distinct
(`banking.json`). Le navigateur les lit, applique les règles et produit des dépenses, des
remboursements ou des éléments « À classer » **par le chemin de mutation ordinaire**
(`appliquer()`), puis les pousse comme n'importe quelle saisie.

**Motif** : c'est le point décisif de la conception, et il découle du verrou optimiste de 005.
Si le serveur écrivait lui-même dans `budget.json`, chaque import ferait avancer la révision
centrale. Tout appareil ayant une modification non poussée, hors connexion par exemple, se
retrouverait alors en **conflit**. Or la résolution d'un conflit est toujours manuelle et
**perd l'un des deux côtés** (D4 de 005). Quatre imports par jour transformeraient un cas rare en
cas courant, avec à chaque fois le choix entre perdre ses saisies et perdre l'import.

En faisant de l'import une mutation locale :

- aucun nouveau type de conflit n'apparaît : le protocole de 005 s'applique tel quel ;
- le principe I reste intact, puisque le budget continue de vivre d'abord dans le navigateur ;
- les règles s'exécutent dans un module **pur**, testable sans serveur ni réseau.

**Alternatives écartées** :

- *Le serveur écrit dans `budget.json`* : conflits fréquents et destructeurs, voir ci-dessus.
- *Fusion automatique à trois voies côté client* : il faudrait conserver le document de base et
  écrire un algorithme de fusion par entité. C'est une complexité que 005 a explicitement
  refusée (D4), et que rien ici ne justifie.
- *Dépenses bancaires dans un second document fusionné à l'affichage* : les corrections de
  l'utilisateur (EF-033) et l'export (EF-035) devraient alors couvrir deux documents, et toute
  la logique de calcul existante devrait apprendre à lire deux sources.

---

## R2 — Comment garantir qu'une opération n'est importée qu'une fois ?

**Décision** :

1. Chaque opération reçoit une **référence** `"<banque>:<entry_reference>"`, par exemple
   `lcl:6abba36b-…`.
2. Le document tient un **registre** (`banking.ledger`) qui associe à chaque référence traitée
   son sort : dépense, remboursement, ignorée, à classer.
3. Une opération dont la référence figure au registre **n'est jamais retraitée**.
4. L'identifiant de l'entité produite est **déterministe** : `bank:<référence>`.

**Motif** :

- `entry_reference` est présent sur **100 %** des opérations des deux banques, et **identique
  d'une autorisation à l'autre** (vérifié : 39/39 et 28/28 entre deux sessions distinctes).
  `transaction_id`, lui, est toujours `null`.
- Le registre survit à la suppression de la dépense, ce qui satisfait **EF-034** sans
  mécanisme de « pierre tombale » dédié. Il survit aussi à la modification de la dépense, donc
  **EF-033** est satisfaite par construction : on ne retraite jamais ce qui a déjà été traité.
- L'identifiant déterministe rend le traitement **idempotent entre appareils**. Si deux
  appareils traitent la même opération avant de se synchroniser, ils produisent la même entité
  sous le même identifiant. Quel que soit le côté retenu en cas de conflit, la dépense y figure
  exactement une fois.

**Alternatives écartées** :

- *Empreinte (date + montant + libellé)* : deux cafés identiques le même jour se confondraient
  (cas limite de la spécification).
- *Registre côté serveur* : il ne voyagerait ni avec l'export ni avec un import, et pourrait
  diverger du budget auquel il se rapporte.

---

## R3 — Faut-il une tâche de fond ?

**Décision** : **non.** La récupération auprès de la banque est déclenchée **à la demande**,
quand le navigateur demande les opérations, c'est-à-dire à l'ouverture de l'application et au
retour sur l'onglet, avec deux bornes :

- **automatique** : au plus une récupération par banque toutes les **6 heures**, soit 4 par
  jour ;
- **manuelle** (bouton « Synchroniser maintenant ») : au plus une toutes les **5 minutes**.

Entre deux récupérations, le serveur répond depuis son cache.

**Motif** :

- Le principe VI soumet toute tâche de fond à justification, et aucune ne tient : le budget ne
  se consulte que dans l'application, donc une opération récupérée pendant que personne ne
  regarde n'apporte rien de plus qu'une opération récupérée à l'ouverture.
- La banque conserve au moins un an d'historique, si bien qu'une absence de plusieurs jours ne
  perd rien : la récupération suivante repart de la dernière date connue (EF-012).
- La requête est faite **en présence de l'utilisateur**. Elle porte donc les en-têtes
  `Psu-Ip-Address` et `Psu-User-Agent`, qui signalent à la banque un utilisateur présent ; la
  limite de 4 consultations par jour vise les consultations **sans** utilisateur présent.

**Serveur éteint** : le NAS n'est pas allumé en permanence. Enable Banking ne stocke rien et ne
pousse rien : il relaie une demande vers la banque au moment où le serveur la fait. Tant que le
NAS est éteint, rien n'est récupéré, et rien n'est perdu non plus. À l'allumage, la première
ouverture de l'application récupère tout depuis la dernière récupération réussie, et chaque
dépense prend la date de son paiement. Deux limites :

- **Autorisation** : les 180 jours courent que le serveur soit allumé ou non. Un renouvellement
  échu pendant une extinction se fait à l'allumage suivant, sans perte.
- **Profondeur d'historique** : certaines banques ne donnent accès qu'aux **90 derniers jours**
  sans nouvelle validation. Une extinction de plus de 90 jours pourrait laisser un trou au début
  de la période ; l'application affiche alors l'écart entre la dernière récupération et la plus
  ancienne opération reçue.

Une tâche de fond n'y changerait rien, puisqu'elle s'arrêterait avec le NAS.

**Conséquence sur la spécification** : EF-007 et CS-004 sont reformulés en conséquence (« à
chaque ouverture de l'application, au plus toutes les 6 heures »). L'utilisateur n'a rien à
faire de plus : ouvrir l'application suffit.

**Alternatives écartées** :

- *Minuterie dans le processus Node* (`setInterval` lancé par `instrumentation.ts`) : une tâche
  de fond pour un bénéfice nul, voir ci-dessus.
- *Second conteneur `cron`* : une pièce de déploiement de plus pour le même bénéfice nul.

---

## R4 — Le retour de la banque arrive sans cookie

**Constat** : le cookie d'accès de 005 est posé en `SameSite=Strict`
(`src/app/authorize/page.tsx`). Un navigateur **n'envoie pas** un tel cookie lors d'une
navigation venue d'un autre site, et le retour de la banque vers
`/api/banking/callback` en est précisément une. Contrôlé par `isAuthorized()`, le retour serait
**refusé à chaque fois**.

**Décision** : le retour est autorisé par le **paramètre `state`**, et non par le cookie :

1. `POST /api/banking/connect`, lui, exige le cookie. Il engendre un `state` aléatoire de
   32 octets, l'associe à la banque demandée et le garde **en mémoire** pendant 15 minutes.
2. `GET /api/banking/callback` n'accepte qu'un `state` connu, non expiré, et le **consomme** :
   il ne peut servir qu'une fois.
3. Le retour redirige ensuite vers `/`. Le chargement de l'application et ses appels d'API sont,
   eux, de même site : le cookie y est envoyé normalement.

**Motif** : le `state` ne peut avoir été émis que pour un appareil autorisé. C'est l'usage
prévu de ce paramètre par OAuth 2.0 et par le parcours d'Enable Banking.

**Alternatives écartées** :

- *Passer le cookie en `SameSite=Lax`* : cela affaiblit la protection de **toute**
  l'application pour le besoin d'une seule route.
- *Garder les `state` dans un fichier* : un redémarrage du serveur pendant les quinze minutes
  d'une liaison obligerait seulement à recommencer. La persistance ne se justifie pas.

---

## R5 — Signer les appels à Enable Banking sans dépendance

**Décision** : le jeton JWT RS256 est produit avec `node:crypto` (`createSign("RSA-SHA256")`),
avec `kid` égal à l'identifiant d'application, `iss` = `enablebanking.com`,
`aud` = `api.enablebanking.com` et une durée d'une heure. Les appels passent par le `fetch`
natif de Node.

**Motif** : le script d'essai l'a fait en vingt lignes, et il a fonctionné du premier coup. Une
bibliothèque JWT ou le SDK du fournisseur seraient une dépendance d'exécution que le
principe VI demande de justifier face à l'alternative « écrire la portion nécessaire ». Ici,
cette portion est minuscule.

**Alternatives écartées** : `jose`, `jsonwebtoken`, le SDK d'Enable Banking.

---

## R6 — Où vivent les secrets ?

**Décision** :

- `ENABLE_BANKING_APP_ID` : variable d'environnement, dans `.env` (non versionné).
- La clé privée est un **fichier monté en lecture seule** dans le conteneur, à
  `/run/secrets/enable-banking.pem`. Son chemin sur l'hôte est donné par
  `ENABLE_BANKING_KEY_FILE` dans `.env`, et le conteneur le lit via
  `ENABLE_BANKING_KEY_PATH`.
- **Fermeture par défaut**, comme D7 de 005 : identifiant ou clé absents ou illisibles, la
  synchronisation bancaire est **désactivée** et l'application l'affiche (« Synchronisation
  bancaire non configurée »). Le reste du budget fonctionne normalement.

**Motif** : une clé de 3 Ko multi-lignes se transporte mal dans une variable d'environnement, et
un fichier monté en lecture seule ne peut être ni modifié par l'application ni copié dans
l'image. La clé n'est lue que par `src/lib/server/`, jamais par le graphe client (EF-006).

**Point de déploiement** : le conteneur tourne sous l'utilisateur `nextjs` (uid 1001). Le
fichier de clé sur l'hôte doit lui être lisible : `chmod 640` avec le groupe adéquat, ou
`chown 1001`.

---

## R7 — Normaliser les opérations côté serveur

**Décision** : le serveur convertit chaque transaction brute en `BankOperation` (voir
[data-model.md](./data-model.md) §2) par **un adaptateur par banque**, deux fonctions pures. Le
navigateur ne voit jamais le format d'Enable Banking.

**Constats qui fixent les adaptateurs** :

| Point | LCL | Revolut |
| --- | --- | --- |
| Nature | 1ʳᵉ ligne de `remittance_information` : `CARTE`, `CARTE ANNUL./REGUL.`, `VIREMENT`, `VIREMENT INSTANTANE`, `VIREMENT SEPA RECU`, `PRELVT SEPA RECU D/O CONFRERE`, `COTISATION MENSUELLE CARTE` | `bank_transaction_code.code` : `CARD_PAYMENT`, `TOPUP`, `TRANSFER` |
| Commerçant | 3ᵉ ligne : `CB  PETROLEC SUD     26/09/26` → préfixe `CB` et date retirés, espaces réduits | `creditor.name` |
| Date de paiement | Date `JJ/MM/AA` en fin de 3ᵉ ligne | `booking_date` |
| Montant | `transaction_amount.amount`, **texte** (`"-33.82"`, `"50"`, `"35.8"`) | idem (`"5.45"`) |
| Sens | `credit_debit_indicator` | idem (`DBIT` / `CRDT`) |
| Arrondi | — | `TRANSFER` dont le libellé est `Revpoints Spare Change` |

Le montant est converti **depuis le texte**, en séparant partie entière et décimales, sans
jamais passer par `parseFloat` (principe II, EF-036) : `"35.8"` → 3580, `"50"` → 5000.

Les adaptateurs relèvent de l'obligation de test du principe III. Leurs jeux d'essai sont des
**opérations synthétiques** reproduisant la forme exacte de celles de septembre, mais **sans
nom, IBAN ni montant réels** : les données de l'utilisateur ne sont pas versionnées.

---

## R8 — Fusion des arrondis Revolut

**Décision** : la fusion a lieu **côté serveur, à la normalisation**. Un arrondi est rattaché à
un paiement carte si et seulement si :

- il est du même jour ;
- le paiement est d'un montant **strictement positif** (une pré-autorisation à 0,00 € ne
  déclenche pas d'arrondi) ;
- la somme des deux est un **multiple exact de 100 centimes** ;
- l'arrondi est compris entre 1 et 100 centimes inclus ;
- **un seul** paiement du jour satisfait ces conditions.

Le paiement porte alors `roundUpCents`, et l'arrondi disparaît de la liste. Sinon, l'arrondi
reste une opération de nature `roundUp`, que les règles envoient « À classer ».

**Vérification sur septembre** : les **9 arrondis s'apparient chacun à un paiement unique**.
Le seul cas délicat était le 27/09 : l'arrondi de 1,00 € tombe le même jour que `Fairtiq`
(0,00 €) et `Bunq` (50,00 €). Écarter les paiements à 0,00 € le rattache sans ambiguïté à
`Bunq`, et il est ignoré avec lui, ce qui est cohérent : un arrondi suit le sort de son
paiement. On remarque au passage que Revolut arrondit **un montant rond à l'euro
supérieur** (Volterra 14,00 € + 1,00 €), d'où la borne de 100 centimes incluse.

**Arrondi arrivé après son paiement** : si le paiement a déjà été traité par le navigateur, la
fusion ne peut plus se faire, et l'arrondi part « À classer ». C'est un cas improbable (les
deux sont comptabilisés le même jour), traité de la façon la plus sûre.

---

## R9 — Représenter un remboursement

**Décision** : une **nouvelle collection** `refunds`, dont les montants restent **strictement
positifs**. Les agrégats de dépense deviennent **nets** : dépenses moins remboursements, au
jour comme au mois et par enveloppe. Le total net d'un mois ou d'une enveloppe est **borné à
zéro** pour l'anneau et l'allocation, et l'excédent est exposé à part (EF-032).

**Motif** : la règle du montant strictement positif (`montantValide`) est l'un des invariants
les mieux protégés du projet. Une dépense négative la romprait, ainsi que toutes les
fonctions qui en dépendent (journal, recherche, sous-totaux). Une collection dédiée laisse ces
fonctions intactes.

**Alternatives écartées** :

- *Dépense négative* : rompt l'invariant ci-dessus.
- *Champ `kind` sur `Expense`* : le type porte un commentaire explicite contre l'ajout d'un
  discriminant (« généralité spéculative, principe VI ») ; un remboursement a de plus un sens
  de calcul opposé, que chaque consommateur devrait penser à tester.

---

## R10 — Rattacher un paiement à un abonnement

**Décision** : **pas de rapprochement automatique** par libellé ou par montant. La première
occurrence d'un paiement d'abonnement (Spotify, cotisation carte, Claude Code) part « À
classer ». L'utilisateur choisit « Rattacher à l'abonnement… », ce qui crée une **règle de
traitement** (« libellé contient `Spotify` → abonnement X ») appliquée ensuite
automatiquement.

**Motif** : le montant prélevé diffère souvent du montant saisi (taxe, change, hausse non
reportée), et le libellé bancaire ne ressemble pas toujours au nom de l'abonnement. Un
rapprochement deviné se tromperait silencieusement, ce que la spécification interdit. Un geste
unique par abonnement est un coût négligeable.

---

## R11 — Règles fournies d'office

**Décision** : deux familles.

- **Règles structurelles**, écrites dans le code et non modifiables, parce qu'elles découlent
  du fonctionnement des banques :
  - un crédit qui n'est pas un remboursement carte est ignoré ;
  - `CB Revolut**` côté LCL est ignoré (recharge) ;
  - côté Revolut, une recharge ou un paiement à 0,00 € est ignoré ;
  - une opération dans une autre devise que l'euro part « À classer ».
- **Règles initiales de l'utilisateur**, écrites dans le document à la migration v3 → v4, donc
  **modifiables et exportées** :
  - traitement : libellé contenant `LOYER` (virement LCL sortant) → ignorer ; `Bunq` (Revolut)
    → ignorer ; `UMS-ULYS` (LCL) → dépense ;
  - catégorie : `Carrefour`, `Casino` → Courses ; `SNCF`, `Tisseo`, `Fairtiq`, `Ulys` →
    Transport ; `Uber Eats`, `Burger King` → Restauration.

**Motif** : ce qui relève du fonctionnement des banques n'a pas à être modifiable. Ce qui relève
des choix de l'utilisateur doit l'être et doit voyager avec ses données (EF-035).

---

## R12 — Date de début d'import

**Décision** : `banking.importFrom` est une date du document. Elle est **proposée au 1ᵉʳ du mois
courant** lors de la première liaison et reste modifiable tant qu'aucune opération n'a été
traitée. Avec une mise en service en octobre 2026, elle vaut **2026-10-01**, comme décidé en
clarification (Q1).

Le filtre porte sur la **date de paiement** (EF-040). Le serveur, lui, récupère à partir de
`importFrom − 7 jours`, parce qu'un paiement LCL est débité jusqu'à quelques jours après
(observé : jusqu'à 4 jours).

**Motif** : une date figée dans le code serait fausse si la mise en service glissait au mois
suivant ; une date posée automatiquement à la date de liaison perdrait les paiements faits
entre le 1ᵉʳ octobre et cette liaison, que l'utilisateur a cessé de saisir à la main.

---

## R13 — Quand le navigateur traite-t-il les opérations ?

**Décision** : uniquement quand la copie locale est **à jour avec le serveur**, c'est-à-dire
après une lecture réussie, sans modification en attente ni conflit. Le traitement produit une
mutation, aussitôt poussée.

**Motif** : traiter sur une copie périmée augmenterait le risque de conflit entre appareils. R2
le rend inoffensif, mais il reste désagréable. Traiter sur une copie fraîche le rend
improbable.
