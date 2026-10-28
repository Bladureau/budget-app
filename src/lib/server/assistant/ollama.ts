/**
 * Client minimal de l'API d'Ollama, l'IA locale du serveur.
 *
 * Voir specs/009-local-ai-assistant/contracts/api-assistant.md (« Appel à l'IA ») et
 * docs/ia-locale-ollama.md.
 *
 * **Ce module ne doit jamais rejoindre le graphe client** : il parle à un service interne qui n'a
 * aucune authentification, et vit sous `src/lib/server/` pour que son nom porte cet invariant.
 *
 * **Seule adresse appelée : `OLLAMA_URL`** (EF-017). Aucune donnée budgétaire ne sort d'une machine
 * que l'utilisateur possède. Aucune dépendance : `fetch` et les flux de la plateforme (principe VI).
 *
 * Aucune journalisation : les messages contiennent des chiffres personnels.
 */

/** Rôles acceptés par l'IA. */
export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * - `unavailable` : l'IA ne répond pas, ou renvoie une erreur avant tout texte ;
 * - `timeout` : le délai maximal est écoulé ;
 * - `interrupted` : le flux s'est coupé après du texte ;
 * - `aborted` : l'appelant a lui-même renoncé (annulation de l'utilisateur) — pas une panne.
 */
export type OllamaFailureCode = "unavailable" | "timeout" | "interrupted" | "aborted";

export class OllamaError extends Error {
  constructor(readonly code: OllamaFailureCode) {
    super(`ollama: ${code}`);
    this.name = "OllamaError";
  }
}

/** Vérification de disponibilité (R8) : assez courte pour répondre `503` en moins de 10 s (CR-004). */
export const AVAILABILITY_TIMEOUT_MS = 3_000;

/** Fenêtre de contexte demandée : tient dans la VRAM à côté du modèle (guide Ollama). */
const CONTEXT_WINDOW = 8192;

/** Température basse : on cherche la fidélité aux données fournies, pas la créativité. */
const TEMPERATURE = 0.2;

/**
 * Lu à chaque appel, et non figé au chargement du module : les tests changent ces variables d'un
 * cas à l'autre, comme `BUDGET_DATA_DIR` pour le stockage central.
 */
function configuration(): { url: string; model: string } {
  const url = process.env.OLLAMA_URL?.trim();
  const model = process.env.OLLAMA_MODEL?.trim();
  return {
    url: (url && url !== "" ? url : "http://ollama:11434").replace(/\/+$/, ""),
    model: model && model !== "" ? model : "qwen3.5:9b",
  };
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

// --- Disponibilité ----------------------------------------------------------------------------

export type Availability = { available: true; modelLoaded: boolean } | { available: false };

/** Noms de modèles d'une réponse `/api/ps` ou `/api/tags`, ou `null` si la réponse est inutilisable. */
async function lireModeles(entree: string, signal: AbortSignal): Promise<Set<string> | null> {
  const reponse = await fetch(entree, { cache: "no-store", signal });
  if (!reponse.ok) return null;

  const corps: unknown = await reponse.json();
  if (!estObjet(corps) || !Array.isArray(corps.models)) return null;

  const noms = new Set<string>();
  for (const modele of corps.models) {
    if (!estObjet(modele)) continue;
    for (const champ of [modele.name, modele.model]) {
      if (typeof champ === "string") noms.add(champ);
    }
  }
  return noms;
}

function contient(noms: ReadonlySet<string>, model: string): boolean {
  return noms.has(model) || noms.has(`${model}:latest`);
}

/**
 * L'IA répond-elle, et le modèle demandé est-il déjà en mémoire ?
 *
 * `/api/ps` liste les modèles **chargés** : s'il y figure, tout va bien. Sinon `/api/tags` dit s'il
 * est au moins installé — absent des deux, la génération échouerait, autant répondre tout de suite.
 * Toute erreur (réseau, délai, réponse illisible) vaut « indisponible » : la route répond `503`.
 */
export async function checkAvailability(
  signal?: AbortSignal,
  timeoutMs: number = AVAILABILITY_TIMEOUT_MS,
): Promise<Availability> {
  const { url, model } = configuration();
  const borne = AbortSignal.timeout(timeoutMs);
  const effectif = signal ? AbortSignal.any([signal, borne]) : borne;

  try {
    const charges = await lireModeles(`${url}/api/ps`, effectif);
    if (charges === null) return { available: false };
    if (contient(charges, model)) return { available: true, modelLoaded: true };

    const installes = await lireModeles(`${url}/api/tags`, effectif);
    if (installes === null || !contient(installes, model)) return { available: false };
    return { available: true, modelLoaded: false };
  } catch {
    return { available: false };
  }
}

// --- Génération ---------------------------------------------------------------------------------

/**
 * Ce que dit `signal` d'un échec : l'appelant a-t-il renoncé, ou le délai est-il écoulé ?
 * `AbortSignal.timeout` abandonne avec une `TimeoutError`, tout autre abandon est une annulation.
 */
function erreurDeSignal(signal: AbortSignal | undefined): OllamaError | null {
  if (signal === undefined || !signal.aborted) return null;
  const raison: unknown = signal.reason;
  const delai = estObjet(raison) && raison.name === "TimeoutError";
  return new OllamaError(delai ? "timeout" : "aborted");
}

/**
 * Réponse de l'IA, morceau de texte par morceau de texte.
 *
 * Générateur **paresseux** : rien n'est envoyé avant la première lecture. L'appelant peut ainsi
 * répondre à son client, et lui annoncer le chargement du modèle, pendant que l'IA le charge.
 *
 * Chaque ligne reçue est une frontière de confiance (principe IV) : elle est validée avant usage,
 * et jamais transmise telle quelle. Une ligne qui n'a pas la forme attendue interrompt la réponse.
 */
export async function* streamChat(
  messages: readonly OllamaMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const { url, model } = configuration();
  let texteRecu = false;
  // Avant tout texte, un échec est une indisponibilité ; après, une coupure.
  const echec = (): OllamaError => new OllamaError(texteRecu ? "interrupted" : "unavailable");

  let reponse: Response;
  try {
    reponse = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think: false,
        options: { num_ctx: CONTEXT_WINDOW, temperature: TEMPERATURE },
      }),
    });
  } catch {
    throw erreurDeSignal(signal) ?? echec();
  }

  if (!reponse.ok || reponse.body === null) {
    // Corps inutilisé : on le libère pour que la connexion se ferme.
    void reponse.body?.cancel().catch(() => undefined);
    throw erreurDeSignal(signal) ?? echec();
  }

  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";

  /** Traite une ligne complète ; rend `true` quand l'IA annonce la fin. */
  const traiter = (ligne: string): { fin: boolean; texte: string } => {
    let objet: unknown;
    try {
      objet = JSON.parse(ligne);
    } catch {
      throw echec();
    }
    if (!estObjet(objet)) throw echec();
    if (typeof objet.error === "string") throw echec();

    const message = objet.message;
    let texte = "";
    if (message !== undefined) {
      if (!estObjet(message)) throw echec();
      if (message.content !== undefined && typeof message.content !== "string") throw echec();
      texte = message.content ?? "";
    }
    if (objet.done !== undefined && typeof objet.done !== "boolean") throw echec();
    return { fin: objet.done === true, texte };
  };

  try {
    for (;;) {
      let lecture: ReadableStreamReadResult<Uint8Array>;
      try {
        lecture = await lecteur.read();
      } catch {
        throw erreurDeSignal(signal) ?? echec();
      }

      if (lecture.done) {
        tampon += decodeur.decode();
        if (tampon.trim() !== "") {
          const { fin, texte } = traiter(tampon);
          if (texte !== "") {
            texteRecu = true;
            yield texte;
          }
          if (fin) return;
        }
        // Le flux s'est fermé sans annoncer sa fin.
        throw erreurDeSignal(signal) ?? echec();
      }

      tampon += decodeur.decode(lecture.value, { stream: true });
      const lignes = tampon.split("\n");
      tampon = lignes.pop() ?? "";

      for (const ligne of lignes) {
        if (ligne.trim() === "") continue;
        const { fin, texte } = traiter(ligne);
        if (texte !== "") {
          texteRecu = true;
          yield texte;
        }
        if (fin) return;
      }
    }
  } finally {
    // Fermer la connexion arrête la génération côté IA (EF-026) : c'est ici qu'une annulation, un
    // délai ou une fin normale libèrent le GPU du serveur.
    void lecteur.cancel().catch(() => undefined);
  }
}
