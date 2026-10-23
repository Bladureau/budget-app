/**
 * Appel du navigateur au point d'entrée `/api/assistant`.
 *
 * Voir specs/009-local-ai-assistant/contracts/api-assistant.md. Même convention que
 * `@/features/banking/client` : ce module parle au réseau et rend des événements, sans rien
 * décider. Il ne dépend d'aucun module de `src/lib/server/`.
 *
 * **Chaque ligne reçue est une frontière de confiance** (principe IV) : elle part d'`unknown` et est
 * validée. Une ligne invalide, un événement inconnu ou un flux qui se ferme sans événement terminal
 * valent « réponse interrompue » — le texte déjà reçu reste affiché.
 *
 * Une annulation locale (`AbortSignal`) ne produit **aucun** événement : c'est l'utilisateur qui a
 * décidé d'arrêter, et l'état de la conversation le sait déjà.
 */

import type { IsoDate, MonthKey } from "@/lib/date";
import type { ChatTurn, ClientErrorCode, ClientEvent, StreamErrorCode } from "@/features/assistant/types";

export interface AskInput {
  month: MonthKey;
  today: IsoDate;
  /** La conversation ; la dernière entrée est la question. */
  messages: ChatTurn[];
  signal?: AbortSignal;
}

const CODES_DE_FLUX: readonly StreamErrorCode[] = ["unavailable", "timeout", "interrupted"];

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/** Événement du serveur validé, ou `null` s'il ne respecte pas le contrat. */
function lireEvenement(brut: unknown): ClientEvent | null {
  if (!estObjet(brut)) return null;

  switch (brut.type) {
    case "status":
      return brut.state === "loading" ? { type: "status", state: "loading" } : null;
    case "text":
      return typeof brut.text === "string" && brut.text !== "" ? { type: "text", text: brut.text } : null;
    case "done":
      return Array.isArray(brut.unverified) && brut.unverified.every((v) => typeof v === "string")
        ? { type: "done", unverified: brut.unverified as string[] }
        : null;
    case "error": {
      const code = CODES_DE_FLUX.find((c) => c === brut.code);
      return code === undefined ? null : { type: "error", code };
    }
    default:
      return null;
  }
}

function erreur(code: ClientErrorCode): ClientEvent {
  return { type: "error", code };
}

/** Code d'erreur d'une réponse HTTP qui n'est pas un flux. */
function codeDeStatut(statut: number): ClientErrorCode {
  if (statut === 401) return "unauthorized";
  if (statut === 503) return "unavailable";
  return "failed";
}

export async function* askAssistant({
  month,
  today,
  messages,
  signal,
}: AskInput): AsyncGenerator<ClientEvent, void, void> {
  let reponse: Response;
  try {
    reponse = await fetch("/api/assistant", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ month, today, messages }),
      signal,
    });
  } catch {
    // Hors connexion, serveur injoignable : l'assistant est indisponible. Sauf annulation locale.
    if (signal?.aborted !== true) yield erreur("unavailable");
    return;
  }

  if (reponse.status !== 200 || reponse.body === null) {
    void reponse.body?.cancel().catch(() => undefined);
    yield erreur(codeDeStatut(reponse.status));
    return;
  }

  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = "";

  try {
    for (;;) {
      let lecture: ReadableStreamReadResult<Uint8Array>;
      try {
        lecture = await lecteur.read();
      } catch {
        if (signal?.aborted !== true) yield erreur("interrupted");
        return;
      }

      if (lecture.done) {
        // Le flux s'est fermé sans événement terminal.
        yield erreur("interrupted");
        return;
      }

      tampon += decodeur.decode(lecture.value, { stream: true });
      const lignes = tampon.split("\n");
      tampon = lignes.pop() ?? "";

      for (const ligne of lignes) {
        if (ligne.trim() === "") continue;

        let evenement: ClientEvent | null = null;
        try {
          evenement = lireEvenement(JSON.parse(ligne));
        } catch {
          evenement = null;
        }
        if (evenement === null) {
          yield erreur("interrupted");
          return;
        }

        yield evenement;
        if (evenement.type === "done" || evenement.type === "error") return;
      }
    }
  } finally {
    // Fermer la connexion avertit le serveur, qui interrompt l'IA (EF-026).
    void lecteur.cancel().catch(() => undefined);
  }
}
