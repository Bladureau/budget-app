# Phase 0 — Recherche : stockage centralisé et synchronisation

**Fonctionnalité** : [spec.md](./spec.md) | **Date** : 2026-09-07

Ce document tranche les inconnues du contexte technique. Les trois questions laissées ouvertes par
la spécification (Q1, Q2, Q3) ont été posées à l'utilisateur et sont consignées ici avec leur
réponse, ainsi qu'une quatrième portant sur le support de stockage.

---

## Q1 — Ampleur de la capacité hors connexion

**Décision** : **local-first complet.** `localStorage` reste la copie de travail, lue et écrite
immédiatement à chaque mutation. Le serveur détient la référence partagée entre appareils, atteinte
par synchronisation en arrière-plan.

**Justification** : le principe I exige en toutes lettres que « l'application DOIT rester utilisable
pour consulter et saisir des transactions sans connexion réseau ». Les deux autres options
(consultation seule, serveur obligatoire) exigeaient un amendement constitutionnel préalable. Le
local-first le rend inutile — c'est le seul choix qui laisse la constitution intacte.

Bénéfice secondaire non recherché mais décisif : EF-011 (« la saisie d'une dépense NE DOIT PAS
devenir sensiblement plus lente ») est satisfait **par construction**. L'écriture perçue par
l'utilisateur reste l'écriture `localStorage` actuelle ; le réseau n'est jamais sur le chemin
critique de la saisie.

**Alternatives écartées** :

- *Consultation seule hors connexion* — viole le principe I directement.
- *Serveur obligatoire* — abandonne le récit 3 (P2) et impose un amendement majeur.

---

## Q2 — Concurrence entre appareils

**Décision** : **verrou optimiste par numéro de révision.** Le stockage central porte un entier
`revision` incrémenté à chaque écriture acceptée. Toute écriture déclare la révision sur laquelle
elle se fonde ; si elle ne correspond plus, le serveur refuse (409) et renvoie son état courant.
L'application présente alors un choix explicite à l'utilisateur.

**Justification** : EF-025 interdit toute perte silencieuse. Le verrou optimiste est le mécanisme le
plus économique qui garantisse cette propriété : une écriture aboutit, ou bien l'utilisateur en est
informé. Aucun troisième cas n'existe.

**Interaction décisive avec Q1** — c'est le cœur de ce plan. Parce que le fournisseur écrit
**toujours le document entier** (voir `budget-provider.tsx` : chaque mutation appelle `appliquer()`
avec un `BudgetDocument` complet), l'unité de synchronisation est le document, pas l'opération. Il
en découle que :

- **aucun journal d'opérations hors connexion n'est nécessaire.** Le document local *est* l'état en
  attente ; un simple drapeau « non synchronisé » suffit ;
- **EF-019 (« sans créer de doublon ») est satisfait trivialement.** Pousser le même document deux
  fois est idempotent. Un journal d'opérations, lui, aurait exigé une déduplication.

C'est cette combinaison qui rend la fonctionnalité petite. Elle mérite d'être énoncée parce qu'elle
n'est pas une coïncidence heureuse : elle découle d'un choix d'architecture déjà pris en 002.

**Résolution de conflit** : jamais automatique. Deux choix explicites sont présentés — conserver les
modifications locales (écrasement délibéré de la version distante) ou reprendre la version du
serveur (abandon délibéré des modifications locales). L'export reste disponible avant de trancher,
ce qui donne une porte de sortie à qui refuse de choisir.

**Alternatives écartées** :

- *Fusion par entité* — réconciliation automatique sur les identifiants. Introduit une logique non
  triviale (une suppression ici contre une modification là : que faire ?) pour un besoin qui, en
  usage strictement mono-utilisateur, reste occasionnel. Généralité spéculative au sens du
  principe VI.
- *Dernier écrivain gagne* — viole EF-025 frontalement.

---

## Q3 — Modalité de l'accès privé

**Décision** : **jeton d'appareil et isolation réseau**, en défense en profondeur.

1. **Isolation réseau** — le service n'écoute que sur le réseau privé ou le VPN de l'utilisateur.
   Relève du déploiement, documenté dans [quickstart.md](./quickstart.md), pas du code.
2. **Jeton d'appareil** — un secret détenu par le serveur dans la variable d'environnement
   `BUDGET_ACCESS_TOKEN`, jamais versionné, jamais préfixé `NEXT_PUBLIC_*`. Chaque appareil
   l'échange **une fois** contre un cookie `httpOnly` ; toute requête d'API vérifie ce cookie.

**Justification** : le hors-périmètre exclut « tout système de connexion, de compte ou de mot de
passe utilisateur ». Un jeton d'appareil n'est aucun des trois : il n'y a ni identité, ni annuaire,
ni secret choisi et mémorisé par un humain. CS-007 devient une propriété vérifiée par du code plutôt
qu'une promesse de configuration.

**Points d'attention relevés** :

- **La vérification appartient aux gestionnaires de route, pas au `proxy`.** La documentation de la
  version installée (`01-app/01-getting-started/16-proxy.md`) est explicite : Proxy « should not be
  used as a full session management or authorization solution ». Le contrôle est donc effectué dans
  chaque gestionnaire.
- **Comparaison à temps constant.** `crypto.timingSafeEqual`, après contrôle d'égalité des
  longueurs, plutôt que `===`.
- **Fermeture par défaut.** Si `BUDGET_ACCESS_TOKEN` est absent ou vide, le serveur refuse **tout**
  accès à l'API au lieu de fonctionner ouvert. Une erreur de configuration doit rendre
  l'application inutilisable, jamais publique.
- **EF-021** — un refus renvoie `{ "error": "unauthorized" }` et rien d'autre : ni contenu
  financier, ni révision, ni indication sur l'existence de données.

**Alternative écartée** : *isolation réseau seule* — tout appareil du réseau lirait le budget, et
CS-007 ne serait plus vérifiable par un test.

---

## Q4 — Support du stockage central

**Décision** : **un fichier JSON unique, écrit atomiquement** via `node:fs` (écriture d'un fichier
temporaire puis `rename`).

**Justification** :

- **Aucune dépendance ajoutée.** La constitution qualifie tout ajout à la pile approuvée
  d'amendement, pas de demande de fusion ordinaire. SQLite en aurait exigé un.
- **Le modèle n'exploiterait pas le relationnel.** Le document étant déjà écrit en entier à chaque
  mutation, une base offrirait des transactions par ligne dont personne n'a l'usage.
- **La quarantaine se transpose telle quelle.** `storage.ts` met déjà un contenu illisible de côté
  sous une clé distincte plutôt que de l'écraser ; un fichier renommé produit exactement la même
  garantie (EF-008, récit 5 scénario 2).

**Sérialisation des écritures** : les gestionnaires de route s'exécutent dans un unique processus
Node. Deux `PUT` simultanés pourraient néanmoins s'entrelacer entre la lecture de la révision et
l'écriture du fichier. Un verrou en mémoire (chaîne de promesses) sérialise les écritures. Cela
suppose **une seule instance du serveur**, ce qui est le cas d'un déploiement auto-hébergé et ce que
la spécification pose en hypothèse.

**Alternative écartée** : *SQLite* — amendement constitutionnel requis pour un gain nul à cette
échelle.

---

## Décisions techniques complémentaires

### R1 — Runtime : ne rien déclarer

`03-file-conventions/02-route-segment-config/runtime.md` de la version installée indique que
`'nodejs'` est **le défaut** et que le runtime Edge est **déprécié** (« Remove the `runtime` export
from your route files »). Aucun `export const runtime` ne sera écrit. `node:fs` est donc disponible
sans configuration.

### R2 — Mise en cache : dynamique par construction

`15-route-handlers.md` précise que les gestionnaires de route ne sont pas mis en cache par défaut, et
que la lecture d'une API de requête — `cookies()` y est nommée — interrompt tout prérendu. Le
contrôle d'autorisation lisant le cookie, `GET /api/budget` est dynamique par construction. Aucun
`export const dynamic` n'est nécessaire, et `cacheComponents` n'est pas activé dans
`next.config.ts`.

### R3 — `cookies()` est asynchrone

`04-functions/cookies.md` : `const cookieStore = await cookies()`. Les options `httpOnly`,
`sameSite` et `secure` sont prises en charge par `cookieStore.set()`.

### R4 — `middleware.ts` est déprécié, renommé `proxy.ts`

`03-file-conventions/middleware.md` : le fichier est déprécié en Next.js 16 au profit de `proxy.ts`.
Aucun des deux n'est introduit par cette fonctionnalité — l'autorisation vit dans les gestionnaires
(voir Q3) — mais la dépréciation est consignée pour qu'aucune contribution ultérieure ne réintroduise
`middleware.ts` par habitude.

### R5 — Extraction de l'analyseur de document

`parseDocument()` vit aujourd'hui dans `src/lib/storage.ts`, aux côtés des accès `localStorage`. Le
serveur a besoin du même analyseur : la donnée reçue du réseau est une frontière de confiance au même
titre (principe IV), et en écrire un second garantirait leur divergence.

L'analyseur pur est donc extrait vers `src/lib/budget-document.ts`, `storage.ts` conservant le rôle
d'adaptateur `localStorage` et réexportant ce qu'il exposait déjà. Ce n'est pas de l'abstraction
spéculative : le module a **deux** consommateurs réels dès cette fonctionnalité. Les tests existants
(`storage.test.ts`, `storage.security.test.ts`) couvrent l'analyseur et servent de filet à
l'extraction.

### R6 — Déclenchement de la synchronisation

Aucune poussée depuis le serveur : la spécification l'exclut explicitement du périmètre. La
synchronisation est déclenchée par :

| Déclencheur | Effet |
| --- | --- |
| Montage du fournisseur | Lecture initiale |
| Mutation locale | Poussée |
| `online` | Poussée de ce qui attend |
| `visibilitychange` (onglet redevenu visible) | Lecture |

Le dernier traite le cas limite de « l'onglet resté ouvert plusieurs jours » et satisfait CS-001,
dont l'énoncé parle bien de « après rafraîchissement ».

**Coalescence plutôt qu'anti-rebond** : si une poussée est déjà en vol, la suivante n'est pas mise
en file mais notée comme « à refaire au retour ». Le document poussé étant toujours le dernier état
complet, une poussée intermédiaire n'aurait aucune valeur. Cela borne le nombre de requêtes sans
introduire de délai artificiel avant la première.

### R7 — Volume et limite assumée

Une dépense pèse environ 120 octets en JSON ; les 5 000 dépenses de CS-005 représentent donc de
l'ordre de 600 Ko poussés à chaque salve de mutations. Sur le réseau local visé par CS-001, c'est
sans conséquence, et la coalescence (R6) borne la fréquence.

Cette limite est **assumée, pas ignorée** : si le volume devenait gênant, la réponse serait des
points d'entrée par entité, pas un cache intermédiaire. Les construire aujourd'hui, sans besoin
démontré, serait précisément ce que le principe VI interdit.

### R8 — Indication d'état par du texte

Le principe VII impose que les états soient portés par du texte, non par la couleur seule. Les états
de synchronisation (`synchronisé`, `hors connexion`, `non synchronisé`, `échec`, `conflit`) sont
donc libellés, et rejoignent le mécanisme d'alerte existant (`BudgetNotice`, `storage-notice.tsx`)
plutôt que d'en ouvrir un second.
