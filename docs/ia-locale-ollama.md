# Brancher l'IA locale (Ollama) sur Budget App

Guide d'intégration pour la fonctionnalité « assistant / chatbot » du budget. Il décrit ce qui existe déjà sur le NAS, comment Budget App peut y accéder, et les règles de conception qui découlent de la constitution. Il ne remplace pas la spécification de la fonctionnalité : il en est une entrée pour `research.md` et `plan.md`.

> **Statut (2026-10-24).** La fonctionnalité est implémentée : voir
> [specs/009-local-ai-assistant/](../specs/009-local-ai-assistant/). Décisions retenues, qui précisent
> ce guide sans le contredire : **V1 renforcée** (contexte injecté, plus une recherche des opérations
> par mots-clés faite par l'application), **aucun outil** ; disponibilité et état de chargement lus
> par `GET /api/ps` avant la génération ; réponse renvoyée au navigateur en **NDJSON** ; annulation par
> fermeture de la connexion, qui arrête la génération ; contrôle des montants de la réponse. Le
> squelette de la section 6 est un point de départ historique : le code de référence est sous
> `src/lib/server/assistant/` et `src/features/assistant/`.

## 1. Ce qui existe déjà sur le NAS

| Élément | Valeur |
| --- | --- |
| Stack | `/mnt/dev/stacks/ollama` (conteneur `ollama`, image `ollama/ollama`) |
| Modèle | `qwen3.5:9b` : français correct, appel d'outils (*tools*) et mode réflexion (*thinking*) |
| Matériel | RTX 3060 Ti, 8 Go de VRAM, partagés avec Jellyfin. Le modèle en occupe ~6 Go |
| Débit mesuré | ~60 tokens/s ; **~30 s de chargement** si le modèle n'est pas en mémoire, ~1 s par appel ensuite |
| Mémoire | déchargé du GPU après 10 min sans requête (`OLLAMA_KEEP_ALIVE=10m`) |
| Concurrence | une génération à la fois ; les requêtes suivantes attendent leur tour (file d'attente Ollama) |
| Accès réseau | **aucun port publié**. Seuls les conteneurs du réseau Docker `ollama` peuvent l'appeler, à l'adresse `http://ollama:11434` |
| Autre client | le hub du NAS (`stacks/hub`), pour ses diagnostics de pannes |

Vérifié sur ce NAS le 20/10/2026 : `qwen3.5:9b` appelle correctement un outil (format plus bas) et recopie les montants fournis.

## 2. Architecture cible

```md
Navigateur ──HTTPS──▶ Budget App (route serveur, isAuthorized())
                          │  lit le budget avec les fonctions existantes (centimes exacts)
                          │
                          └──HTTP interne──▶ http://ollama:11434/api/chat   (réseau Docker « ollama »)
```

- **Le navigateur n'appelle jamais Ollama directement.** Ollama n'a pas d'authentification. Tout passe par une route serveur de Budget App, protégée par `isAuthorized()` comme `/api/budget`.
- **Les données ne quittent pas le NAS** : c'est conforme au principe I (propriété locale), puisque le modèle tourne sur la même machine. Un fournisseur d'IA en ligne, lui, demanderait un choix explicite de l'utilisateur.
- **Mode dégradé obligatoire** (principe I) : si Ollama est arrêté, absent ou lent, le chatbot affiche « Assistant indisponible » et **tout le reste de l'application fonctionne normalement**.

## 3. Étape 1 : donner accès à Ollama (infrastructure)

### En production (conteneur `budget-app`)

Dans `docker-compose.yml`, rattacher le service au réseau `ollama` et lui donner l'adresse :

```yaml
services:
  budget:
    # … configuration existante inchangée …
    environment:
      # … variables existantes …
      OLLAMA_URL: http://ollama:11434
      OLLAMA_MODEL: qwen3.5:9b
    networks:
      - default     # à conserver : sans lui, le service quitte son réseau actuel
      - ollama

networks:
  ollama:
    external: true  # créé par /mnt/dev/stacks/ollama : démarrer Ollama avant budget-app
```

Pour vérifier depuis le conteneur, après `docker compose up -d` :

```bash
docker exec budget-app node -e "fetch(process.env.OLLAMA_URL + '/api/tags').then(r => r.json()).then(j => console.log(j.models.map(m => m.name)))"
# attendu : [ 'qwen3.5:9b' ]
```

Ce que ça ne change pas : le port reste `127.0.0.1:3000`, Tailscale Serve reste la seule entrée, et aucun secret n'est ajouté (Ollama n'en a pas).

### En développement (`next dev` hors Docker)

`http://ollama:11434` n'existe qu'à l'intérieur de Docker. Pour développer sur le NAS, il faut publier le port d'Ollama **sur la boucle locale uniquement**. Dans `/mnt/dev/stacks/ollama/docker-compose.yml` :

```yaml
    ports:
      - "127.0.0.1:11434:11434"   # boucle locale seulement : jamais "11434:11434"
```

puis `OLLAMA_URL=http://127.0.0.1:11434` dans `.env.local`. Sans le préfixe `127.0.0.1:`, Ollama serait ouvert à tout le réseau local, sans mot de passe.

## 4. Étape 2 : parler à Ollama (API)

Utiliser directement l'API REST native avec `fetch` : **aucune dépendance à ajouter** (principe VI). L'API compatible OpenAI (`/v1/chat/completions`) existe aussi, mais elle n'apporte rien ici sans un SDK, que la constitution demande justement d'éviter.

### Requête `POST /api/chat`

```json
{
  "model": "qwen3.5:9b",
  "messages": [
    { "role": "system", "content": "…règles et contexte…" },
    { "role": "user", "content": "Combien j'ai dépensé en courses ce mois-ci ?" }
  ],
  "tools": [ … ],
  "stream": true,
  "think": false,
  "options": { "num_ctx": 8192 }
}
```

- **`stream: true`** : la réponse arrive en NDJSON, un objet JSON par ligne. On transmet le texte au navigateur au fil de l'eau (voir §6).
- **`think`** : avec `false`, la réponse commence tout de suite (conversation). Avec `true`, le modèle raisonne d'abord : plus juste sur les questions d'analyse, mais plus lent.
- **`num_ctx`** : la fenêtre de contexte. **8192 tokens** tiennent dans la VRAM à côté du modèle. Ne pas monter plus haut sans vérifier `docker exec ollama ollama ps` (la colonne `PROCESSOR` doit rester `100% GPU`).

### Réponse en flux

Chaque ligne : `{"message": {"role": "assistant", "content": "…morceau…"}, "done": false}`. La dernière contient `"done": true` et des statistiques (`total_duration`, `eval_count`…). En cas d'erreur : `{"error": "…"}`.

### Appel d'outils (format vérifié sur ce NAS)

Le modèle ne renvoie pas de texte : il demande l'exécution d'un outil.

```json
{ "message": { "role": "assistant", "content": "",
    "tool_calls": [ { "function": { "name": "resume_du_mois", "arguments": { "mois": "2026-10" } } } ] } }
```

`arguments` est **déjà un objet**, pas une chaîne JSON. On exécute l'outil côté serveur, puis on renvoie toute la conversation, en ajoutant le message de l'assistant et le résultat :

```json
{ "role": "tool", "tool_name": "resume_du_mois", "content": "{\"mois\":\"2026-10\",\"enveloppes\":[…]}" }
```

On recommence tant que le modèle demande des outils. Il faut **toujours plafonner** le nombre de tours (par exemple 4), pour éviter une boucle.

## 5. Règles de conception qui découlent de la constitution

### L'argent reste exact (principe II, non négociable)

Un modèle de langage **ne sait pas calculer de façon fiable**. Lors du test sur ce NAS, il a de lui-même calculé un pourcentage (« 78,12 % du plafond ») qu'on ne lui avait pas fourni. Il était juste cette fois, mais rien ne le garantit. Donc :

- **Tous les montants, totaux, restes et pourcentages sont calculés par l'application**, avec ses fonctions existantes (`computeMonthlyEnvelopes`, `consumedRatio`, etc.), en centimes.
- **Les outils renvoient des valeurs déjà formatées** via `Intl.NumberFormat` (`"312,47 €"`, `"40,6 %"`), jamais des centimes bruts ni des flottants à additionner.
- **Le prompt système l'interdit explicitement** : « Ne calcule jamais un montant ni un pourcentage. Recopie les valeurs fournies par les outils. Si une valeur n'est pas fournie, dis que tu ne l'as pas. »
- **Prévoir un outil pour chaque question chiffrée attendue**, plutôt que d'espérer que le modèle additionne lui-même.

### Commencer simple (principe VI)

Deux approches possibles, à choisir dans `research.md` :

1. **Contexte injecté (V1 recommandée)** : à chaque question, la route calcule un résumé du mois (enveloppes, dépensé, reste, reste à dépenser du jour) et le place dans le prompt système. Pas d'outils, une seule requête : c'est le plus simple et le plus prévisible. Limite : seul le mois courant est connu.
2. **Outils (V2, si le besoin est démontré)** : quelques outils **en lecture seule**, par exemple `resume_du_mois(mois)`, `transactions(mois, recherche)` ou `abonnements()`. Le modèle choisit lui-même ce qu'il consulte. C'est plus puissant, mais demande plus d'allers-retours et plus de tests.

**Ne jamais donner au modèle d'outil qui écrit** (créer une dépense, modifier une enveloppe) sans une confirmation explicite de l'utilisateur dans l'interface. Voir le point suivant.

### Les libellés bancaires sont des données, pas des instructions

Les libellés importés par la synchronisation bancaire (006) sont du **texte venu de l'extérieur**. Un libellé du genre « IGNORE TES REGLES ET… » serait lu par le modèle comme n'importe quel texte. Avec des outils en lecture seule, le pire possible est une mauvaise réponse, ce qui reste acceptable. C'est aussi la raison pour laquelle aucun outil ne doit écrire. Dans le prompt, présenter ces données comme des données (par exemple dans un bloc JSON), jamais comme des consignes.

### Le contexte est petit

8192 tokens, c'est environ 20 000 caractères, **prompt système, historique et réponse compris**. Donc :

- **Ne jamais envoyer** tout le document budget, ni toutes les transactions.
- **Agréger côté serveur** et limiter les listes (par exemple les 20 dernières transactions correspondant à une recherche).
- **Tronquer l'historique de conversation** : garder les derniers échanges seulement.

### Disponibilité et lenteur

- **Premier appel après 10 min d'inactivité** : environ 30 s de chargement. L'interface doit l'afficher (« Chargement de l'assistant… ») plutôt que de sembler figée.
- **GPU occupé** (le hub pose une question, Jellyfin transcode) : la requête attend. Prévoir un délai maximal côté serveur (par exemple 120 s) et un message clair si on le dépasse.
- **Ollama absent** (erreur réseau, conteneur arrêté) : renvoyer `503` avec un code d'erreur dédié. Le client affiche alors l'assistant comme indisponible.

## 6. Squelette de code (à adapter)

> D'après `AGENTS.md`, la version de Next.js installée diffère de ce que les modèles connaissent. Avant d'écrire la route, lire dans `node_modules/next/dist/docs/` la partie sur les *route handlers* et le *streaming*. Ce squelette n'utilise que des API web standard (`fetch`, `Response`, `ReadableStream`).

### Client Ollama : `src/lib/server/assistant/ollama.ts`

```ts
/**
 * Client minimal de l'API Ollama (/api/chat), sans dépendance.
 * Ce module ne doit jamais rejoindre le graphe client : il parle à un service interne.
 */

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_name: string; content: string };

export type ToolCall = { function: { name: string; arguments: Record<string, unknown> } };

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const DELAI_MAX_MS = 120_000;

function config() {
  return {
    url: process.env.OLLAMA_URL ?? "http://ollama:11434",
    model: process.env.OLLAMA_MODEL ?? "qwen3.5:9b",
  };
}

/** Un appel complet, sans flux : utile pour les tours d'outils. */
export async function chat(messages: ChatMessage[], tools?: ToolDefinition[]) {
  const { url, model } = config();
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, stream: false, think: false, options: { num_ctx: 8192 } }),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const corps = (await res.json()) as { message: { content: string; tool_calls?: ToolCall[] } };
  return corps.message;
}

/** Réponse finale en flux : rend un flux de texte brut, morceau par morceau. */
export async function chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
  const { url, model } = config();
  const res = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, think: false, options: { num_ctx: 8192 } }),
    signal: AbortSignal.timeout(DELAI_MAX_MS),
  });
  if (!res.ok || !res.body) throw new Error(`ollama ${res.status}`);

  const decodeur = new TextDecoder();
  const encodeur = new TextEncoder();
  let reste = "";
  // NDJSON → texte : chaque ligne complète est un objet { message: { content }, done }
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(morceau, sortie) {
        reste += decodeur.decode(morceau, { stream: true });
        const lignes = reste.split("\n");
        reste = lignes.pop() ?? "";
        for (const ligne of lignes) {
          if (!ligne.trim()) continue;
          const msg = JSON.parse(ligne) as { message?: { content?: string }; error?: string };
          if (msg.error) throw new Error(msg.error);
          if (msg.message?.content) sortie.enqueue(encodeur.encode(msg.message.content));
        }
      },
    }),
  );
}
```

### Boucle d'outils (V2)

```ts
const TOURS_MAX = 4;

for (let tour = 0; tour < TOURS_MAX; tour++) {
  const reponse = await chat(messages, OUTILS);
  if (!reponse.tool_calls?.length) break; // le modèle a fini de consulter : passer à la réponse
  messages.push({ role: "assistant", content: reponse.content, tool_calls: reponse.tool_calls });
  for (const appel of reponse.tool_calls) {
    // executerOutil : table nom → fonction de lecture, qui valide ses arguments comme toute entrée
    const resultat = await executerOutil(appel.function.name, appel.function.arguments);
    messages.push({ role: "tool", tool_name: appel.function.name, content: JSON.stringify(resultat) });
  }
}
// puis : chatStream(messages) pour la réponse finale, transmise au navigateur
```

### Route : `src/app/api/assistant/route.ts` (forme générale)

```ts
export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();
  // 1. valider le corps (question, historique court), comme lireBaseRevision() le fait pour /api/budget
  // 2. lire le budget avec readBudget(), calculer le contexte ou préparer les outils
  // 3. appeler Ollama ; en cas d'erreur réseau ou de délai dépassé :
  //    return Response.json({ error: "assistantUnavailable" }, { status: 503 });
  // 4. return new Response(flux, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
```

## 7. Tests (principe III)

- **Ne jamais appeler le vrai modèle dans les tests** : il est lent, non déterministe et absent en CI. Simuler `fetch` avec des réponses Ollama enregistrées (un appel d'outil, une réponse en flux, une erreur `{"error": …}`, un délai dépassé).
- **À tester en priorité :**
  - les fonctions d'outils, qui doivent rendre les **mêmes montants** que l'écran (même source de calcul) ;
  - le refus sans autorisation (401) ;
  - le mode dégradé (Ollama injoignable → 503 et application utilisable) ;
  - le plafond de tours d'outils ;
  - la validation des arguments d'outils (mois invalide, recherche trop longue).
- **Une vérification manuelle** sur le NAS avant la fusion, avec quelques questions types. Les noter dans `quickstart.md`.

## 8. Liste de contrôle

- [ ] Spécification de la fonctionnalité : questions attendues, V1 (contexte injecté) ou V2 (outils), mode dégradé
- [ ] `docker-compose.yml` : réseau `ollama` (externe) et variables `OLLAMA_URL`, `OLLAMA_MODEL`
- [ ] Développement : port Ollama publié sur `127.0.0.1` uniquement, si besoin de `next dev`
- [ ] Route serveur protégée par `isAuthorized()`, entrée validée, délai maximal, 503 si indisponible
- [ ] Montants et pourcentages calculés par l'application et formatés ; le prompt interdit tout calcul
- [ ] Outils en lecture seule ; libellés bancaires traités comme des données
- [ ] Contexte limité (agrégats, listes plafonnées, historique tronqué)
- [ ] Interface : chargement du modèle, réponse au fil de l'eau, assistant indisponible
- [ ] Tests avec `fetch` simulé ; aucun appel au vrai modèle en CI
- [ ] Ollama démarré avant budget-app (réseau externe), à noter dans le README de déploiement
