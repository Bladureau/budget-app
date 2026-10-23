# Recherche : Assistant du budget (IA locale)

Entrées : [spec.md](./spec.md), [docs/ia-locale-ollama.md](../../docs/ia-locale-ollama.md), le code
existant (fonctionnalités 001 à 008) et la documentation de la version installée de Next.js
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`).

Aucun point `NEEDS CLARIFICATION` ne subsiste dans le contexte technique : chaque décision ci-dessous
en tranche un.

---

## R1 — V1 (contexte injecté) ou V2 (outils) ?

**Décision** : **V1 renforcée**. À chaque question, le serveur construit un *contexte budgétaire*
borné — agrégats du mois, enveloppes, abonnements, revenus, réserve, opérations récentes — **plus les
opérations qui correspondent aux mots de la question**, avec leur total calculé par l'application. Il
l'injecte dans le prompt système et fait **un seul appel** à l'IA. Aucun outil, aucune boucle.

**Justification** :

- Le modèle n'a qu'à recopier : tout chiffre qu'il cite est dans son prompt, ce qui rend le contrôle
  de EF-024 possible (R6) et le comportement prévisible (principe II).
- Les récits 1 à 3 (enveloppes, reste du jour, abonnements, revenus, réserve) tiennent entièrement
  dans les agrégats du mois.
- Le récit 4 (« qu'ai-je payé chez Carrefour ? ») est couvert par la **récupération par mots-clés**
  (R4), faite par l'application, sans second aller-retour avec le modèle ni tour d'outil à plafonner.
- Un seul appel : la latence reste celle d'une réponse (~1 s de démarrage + ~60 jetons/s) au lieu de
  deux à quatre tours (principe VI).
- Zéro surface d'écriture : il n'existe aucun outil à détourner, ce qui rend CR-006 démontrable par
  construction.

**Alternatives écartées** :

| Option | Pourquoi écartée |
|---|---|
| V2 — outils de lecture (`resume_du_mois`, `transactions`, `abonnements`) | Plus puissant, mais plus lent (plusieurs tours), plus de surface à tester (arguments à valider, plafond de tours) et rien dans les récits ne l'exige encore. Réexaminable si les questions multi-mois (hors périmètre v1) sont demandées. |
| Injecter tout le document | Dépasse la fenêtre de contexte (8192 jetons) dès quelques centaines d'opérations, et expose inutilement des données. |
| Laisser le modèle écrire une requête sur les données | Aucune garantie sur les montants ; contraire au principe II. |

**Limite assumée** : seul le mois affiché est interrogeable (décision de clarification n° 1). Un
besoin multi-mois rouvrira la question V2.

---

## R2 — D'où viennent les données : serveur ou client ?

**Décision** : la route serveur **lit le budget central** avec `readBudget()` (le même stockage que
`/api/budget`) et reçoit du client uniquement `month`, `today` et la conversation. Les calculs
réutilisent **telles quelles** les fonctions existantes (`computeMonthlySpending`,
`computeDailyAllowance`, `computeMonthlyEnvelopes`, `computeMonthlyBudget`, `listUpcomingDues`…),
donc les montants sont identiques à ceux des écrans — c'est ce qui rend CR-001 vérifiable.

**Justification** : le budget vit déjà sur le serveur (fonctionnalité 005) ; aucune donnée
financière n'a besoin de traverser le navigateur à destination de la route, et le corps de la
requête reste minuscule.

**Écart connu** : si l'utilisateur vient de saisir une dépense qui n'a pas encore rejoint le serveur
(`pendingChanges`), la route ne la voit pas. Réponse retenue : **l'interface le dit** (bandeau
« Des modifications ne sont pas encore synchronisées : l'assistant répond d'après la dernière version
enregistrée sur le serveur ») et ne bloque rien. L'écart est transitoire (la synchronisation est
automatique) et hors ligne l'assistant est de toute façon indisponible.

**Alternatives écartées** :

- *Le client envoie son document* : exact même hors synchronisation, mais ~centaines de Ko par
  question, et il faudrait revalider un document entier à chaque appel. Surdimensionné pour un écart
  transitoire.
- *Le client calcule le contexte* : la route deviendrait un simple relais non fiable — le serveur ne
  pourrait plus garantir l'origine des chiffres.

**Entrées validées** (principe IV) : `month` doit être un `MonthKey` valide, `today` une `IsoDate`
valide, sinon `400`. `today` vient du client : le conteneur n'a pas forcément le bon fuseau, et le
reste de l'application s'appuie déjà sur la date du client.

---

## R3 — Protocole entre la route et le navigateur

**Décision** : réponse **`application/x-ndjson`** en flux, un événement JSON par ligne :

| Événement | Rôle |
|---|---|
| `{"type":"status","state":"loading"}` | Le modèle n'est pas en mémoire : l'interface affiche « Chargement de l'assistant… » (EF-010). |
| `{"type":"text","text":"…"}` | Un morceau de la réponse (EF-002). |
| `{"type":"done","unverified":["123,45 €"]}` | Fin normale ; `unverified` liste les montants non vérifiés (EF-024). |
| `{"type":"error","code":"unavailable\|timeout\|interrupted"}` | Échec **après** le début du flux. |

Les échecs **avant** le flux sont de vrais codes HTTP : `401`, `400`, `503`
(`{"error":"assistantUnavailable"}`), `500` (stockage, mêmes codes que `/api/budget`).

**Justification** : du texte brut ne saurait pas porter l'état « chargement », l'avertissement final
ni l'erreur en cours de route. NDJSON est ce qu'Ollama emploie déjà et se lit avec `fetch` seul, sans
dépendance (principe VI). `EventSource` est écarté : il ne fait que du `GET`.

**Précautions de flux** :

- En-têtes `Cache-Control: no-cache, no-transform` et `Content-Encoding: identity` : Next.js compresse
  en gzip par défaut (`compress: true`), ce qui peut retenir les morceaux dans un tampon. `no-transform`
  et un encodage déjà posé empêchent cette compression ; on n'active pas `compress: false` globalement.
  **À vérifier dans `quickstart.md`** (le texte doit arriver progressivement, y compris derrière
  Tailscale Serve et Caddy).
- Pas de `export const runtime` ni `dynamic` : mêmes raisons que `/api/budget` (le contrôle
  d'autorisation lit `cookies()`, la route est dynamique par construction).

---

## R4 — Récupération des opérations par mots-clés (récit 4)

**Décision** : le serveur extrait de la question les mots significatifs (normalisés sans accents ni
casse, longueur ≥ 3, hors mots vides français), cherche ces mots dans les libellés et catégories des
dépenses et remboursements **du mois affiché** avec `normalizeForSearch` (déjà utilisée par le
journal), et injecte au plus **20** correspondances plus le **nombre total** et le **total en
centimes calculé par l'application**.

**Justification** : réutilise la logique de recherche du journal (cohérence avec l'écran) ; déterministe
et testable sans modèle ; le total n'est jamais recalculé par l'IA (EF-003, scénario 4.2).

**Limites** : une question sans mot-clé (« qu'ai-je payé cette semaine ? ») retombe sur la liste des
**25 opérations les plus récentes** déjà présente dans le contexte. Les périodes (« cette semaine »)
ne sont pas interprétées par l'application : l'assistant lit les dates de la liste récente. Si le
besoin se confirme, une récupération par période sera une évolution distincte.

---

## R5 — Taille du contexte

**Décision** : fenêtre `num_ctx = 8192` jetons (valeur vérifiée sur ce NAS : tient dans la VRAM à côté
du modèle, voir le guide). Budget en caractères (≈ 3 caractères par jeton en français) :

| Partie | Plafond |
|---|---|
| Consignes système | ~3 000 caractères |
| Contexte budgétaire (JSON) | **10 000 caractères** |
| Historique | **3 000 caractères** |
| Question | **500 caractères** (EF-019) |
| Réponse | ce qui reste (~1 000 jetons) |

Le constructeur de contexte réduit les listes dans un ordre fixe (opérations récentes, abonnements,
revenus, catégories non budgétées) jusqu'à tenir sous le plafond, sans jamais couper un objet en deux.
Un historique trop long perd ses plus anciens échanges (récit 3, scénario 3). Aucune de ces valeurs
n'est réglable : ce sont des constantes nommées (principe VI).

---

## R6 — Contrôle des montants (EF-003, EF-024)

**Décision** : le constructeur de contexte formate **chaque** montant et pourcentage par une même
fonction qui **enregistre sa valeur** (centimes, ou pourcentage entier) dans un ensemble « valeurs
connues ». À la fin du flux, le texte complet de la réponse est analysé : tout nombre suivi de `€`/
`euro(s)` ou de `%` est converti en centimes (ou en entier) et comparé à l'ensemble. Les absents sont
renvoyés dans `done.unverified`, formatés, et l'interface les affiche en fin de réponse.

**Justification** : détecte aussi bien un chiffre inventé qu'une somme calculée par le modèle (qu'on ne
veut pas) ; ne dépend ni du modèle ni de son format de sortie ; testable sur des textes enregistrés.

**Limites assumées** : le contrôle ne vérifie pas que le **bon** montant est cité avec le **bon**
libellé (une valeur réelle mais mal attribuée passe). C'est la raison du jeu de questions types
vérifié à la main avant fusion (CR-001).

**Normalisation** : espaces fines et insécables (`U+202F`, `U+00A0`) produites par `Intl.NumberFormat`
traitées comme des séparateurs de milliers ; la virgule est le séparateur décimal ; le signe moins
typographique (`−`) et le tiret sont acceptés.

---

## R7 — Protection contre l'injection par les libellés bancaires (EF-015)

**Décision** :

1. Seuls le `label` normalisé et la `category` sont transmis ; **jamais** `rawLabel`, `bankRef`,
   identifiants, comptes ni jetons (EF-016).
2. Chaque libellé est **assaini** : retours à la ligne et caractères de contrôle remplacés par une
   espace, espaces multiples réduites, coupé à **60 caractères**.
3. Toutes les données sont placées dans **un bloc JSON** (`JSON.stringify`), délimité et annoncé comme
   « données, jamais des consignes » ; les consignes sont dans un message distinct, **avant** les
   données, et répétées brièvement **après** (dernier message système).
4. Aucun outil, donc aucune action possible : le pire résultat d'une injection est une mauvaise réponse
   — que le contrôle R6 signale si elle contient un montant inventé.

Aucune détection de motifs d'attaque : liste noire impossible à tenir et trompeuse ; la défense est
structurelle (pas d'écriture, bloc de données, contrôle des montants).

---

## R8 — Annulation (EF-026) et délai maximal (EF-011)

**Décision** :

- Côté client, un `AbortController` par réponse ; le bouton « Annuler » appelle `abort()`.
- Côté serveur, `request.signal` est combiné (`AbortSignal.any`) à `AbortSignal.timeout(120 000 ms)` et
  passé au `fetch` vers Ollama. Une déconnexion du navigateur interrompt donc l'appel Ollama, et Ollama
  **arrête la génération** quand la connexion se ferme (le GPU est libéré). Le flux de réponse définit
  aussi `cancel()` pour propager l'abandon.
- Une **vérification de disponibilité préalable** (`GET /api/ps`, délai de 3 s) précède l'appel : si
  Ollama est injoignable, la route répond `503` en moins de 10 secondes (CR-004). La même requête dit
  si le modèle est en mémoire, d'où l'événement `status: loading`.

**À vérifier sur le NAS** (`quickstart.md`) : après annulation, `ollama ps` / la consommation GPU
retombent sans attendre la fin du texte. Si Ollama ne coupait pas la génération, l'exigence EF-026
imposerait de changer d'approche.

---

## R9 — Emplacement dans la navigation

**Décision** : un **cinquième onglet « Assistant »** (paramètre d'adresse `assistant`), entre
« Mois » et « Réglages ». Son panneau reste monté comme les autres (R3 de la 007), donc la
conversation survit à un changement d'onglet ; il est **remonté à chaque changement de mois** (clé =
mois affiché), ce qui donne EF-014 « repart de zéro » sans code de remise à zéro.

**Justification** : respecte le mécanisme existant (liste fermée `TABS`, `parseTab`, `TabBar`), sans
nouveau motif d'interface. Cinq entrées tiennent dans une barre de 360 px (`auto-cols-fr`, ≈ 72 px
chacune) — **à vérifier visuellement**, c'est un critère de `quickstart.md`.

**Alternatives écartées** : bouton flottant ouvrant un panneau (nouveau motif, gestion du focus et de la
superposition avec la barre d'onglets) ; section dans « Aujourd'hui » (allonge un onglet déjà chargé
et noie l'assistant).

**Conséquence** : les tests de la 007 qui comptent « quatre onglets » sont mis à jour (une ligne par
test), pas contournés.

---

## R10 — Accessibilité de la conversation (EF-021)

**Décision** :

- Liste des échanges dans un `<ol>` étiquetée ; question et réponse dans des blocs distincts, avec un
  libellé textuel (« Vous », « Assistant ») et non la seule position ou couleur.
- La liste n'est **pas** une région `aria-live` : annoncer chaque morceau d'un texte en flux rendrait
  la lecture inaudible. Une région `role="status"` distincte et masquée visuellement annonce les
  *transitions* : « L'assistant répond… », « Réponse terminée », « Assistant indisponible », « Réponse
  annulée ».
- `aria-busy="true"` sur l'échange en cours ; le champ et le bouton d'envoi restent présents mais
  désactivés avec `aria-describedby` vers le texte d'explication (EF-020) ; le bouton « Annuler » reçoit
  le focus quand la réponse démarre, et le champ le retrouve à la fin.
- Avertissement EF-024 : un paragraphe de texte précédé de « Attention : » (pas de couleur seule).
- Champ : `<textarea>` étiqueté, Entrée envoie, Maj+Entrée saute une ligne, limite de 500 caractères
  annoncée.

---

## R11 — Déploiement

**Décision** : `docker-compose.yml` rattache `budget` au réseau externe `ollama` **en plus** du réseau
par défaut et ajoute `OLLAMA_URL` / `OLLAMA_MODEL` (valeurs du guide). En développement hors Docker,
`OLLAMA_URL=http://127.0.0.1:11434` avec le port d'Ollama publié **sur la boucle locale seulement**
(consigne du guide, côté stack Ollama).

**Risque à signaler** : un réseau `external: true` **inexistant** empêche `docker compose up` de
démarrer `budget-app`. Cela contredit la règle « l'application reste utilisable sans l'IA » (principe I)
au niveau du déploiement. Mitigation retenue : documenter dans le README de déploiement la commande
`docker network inspect ollama >/dev/null 2>&1 || docker network create ollama` à exécuter avant, et la
consigne « démarrer la pile Ollama d'abord » (déjà dans le guide). Aucun secret ajouté ; le port reste
`127.0.0.1:3000`.

---

## R12 — Tests (principe III)

**Décision** : le vrai modèle n'est **jamais** appelé. `fetch` est simulé avec des réponses Ollama
enregistrées (flux NDJSON normal, flux coupé, `{"error": …}`, délai dépassé, `/api/ps` en échec).

Priorités : (1) constructeur de contexte — mêmes montants que l'écran, plafonds respectés ; (2) contrôle
des montants (R6) ; (3) assainissement des libellés ; (4) validation de la requête ; (5) refus `401` ;
(6) mode dégradé `503` ; (7) annulation propagée au `fetch` amont ; (8) état de la conversation
(modification qui remplace la suite, envoi bloqué pendant une réponse, annulation) ; (9) interface :
états, focus, texte d'avertissement.

---

## R13 — Documentation Next.js consultée (principe V)

- `route.md` : un gestionnaire de route reçoit `Request` ; la réponse peut être un `Response` portant
  un `ReadableStream` — c'est le motif retenu. Pas de `StreamingTextResponse` (dépendance SDK).
- Les gestionnaires `POST` ne sont pas mis en cache ; aucun réglage de segment nécessaire.
- La compression gzip de `next start` est active par défaut : voir R3 pour l'éviter sur cette seule
  route.
