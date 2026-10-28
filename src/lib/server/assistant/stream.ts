/**
 * Flux de réponse de l'assistant : du texte de l'IA aux événements NDJSON du navigateur.
 *
 * Voir specs/009-local-ai-assistant/contracts/api-assistant.md (« Réponse 200 : flux NDJSON »).
 *
 * Garanties tenues ici :
 *  - au plus un événement `status`, puis des `text` non vides, puis **exactement un** événement
 *    terminal (`done` ou `error`) — sauf annulation, où le client a décidé d'arrêter et n'attend rien ;
 *  - aucun événement après le terminal ;
 *  - le contrôle des montants (EF-024) porte sur le **texte complet** et n'ajoute rien avant `done` ;
 *  - quand le lecteur renonce, la source est fermée : c'est ce qui arrête la génération côté IA et
 *    libère le GPU du serveur (EF-026).
 */

import { OllamaError } from "@/lib/server/assistant/ollama";
import type { StreamErrorCode, StreamEvent } from "@/features/assistant/types";
import type { KnownValues } from "@/features/assistant/types";
import { findUnverifiedValues } from "@/features/assistant/verify-amounts";

export interface ResponseStreamOptions {
  /** Morceaux de texte de l'IA. Paresseux : rien n'est demandé avant la première lecture. */
  chunks: AsyncGenerator<string, void, void>;
  /** Le modèle n'est pas en mémoire : le client en est averti avant le premier morceau. */
  modelLoading: boolean;
  known: KnownValues;
}

const encodeur = new TextEncoder();

function ligne(evenement: StreamEvent): Uint8Array {
  return encodeur.encode(`${JSON.stringify(evenement)}\n`);
}

/** Code d'erreur de flux d'une panne de la source, ou `null` pour une annulation silencieuse. */
function codeDErreur(erreur: unknown, texteRecu: boolean): StreamErrorCode | null {
  if (erreur instanceof OllamaError) {
    return erreur.code === "aborted" ? null : erreur.code;
  }
  // Panne imprévue : traitée comme une coupure si l'utilisateur lisait déjà, sinon comme une absence.
  return texteRecu ? "interrupted" : "unavailable";
}

export function buildResponseStream(options: ResponseStreamOptions): ReadableStream<Uint8Array> {
  const { chunks, modelLoading, known } = options;
  let texte = "";

  return new ReadableStream<Uint8Array>({
    start(controleur) {
      if (modelLoading) controleur.enqueue(ligne({ type: "status", state: "loading" }));
    },

    async pull(controleur) {
      try {
        // Un morceau vide ne produit aucun événement : sans la boucle, `pull` ne serait jamais
        // rappelé et la lecture resterait suspendue.
        for (;;) {
          const suivant = await chunks.next();

          if (suivant.done === true) {
            if (texte === "") {
              // Une réponse vide ne répond à rien : pour l'utilisateur, c'est une absence de l'IA.
              controleur.enqueue(ligne({ type: "error", code: "unavailable" }));
            } else {
              controleur.enqueue(
                ligne({ type: "done", unverified: findUnverifiedValues(texte, known) }),
              );
            }
            controleur.close();
            return;
          }

          if (suivant.value !== "") {
            texte += suivant.value;
            controleur.enqueue(ligne({ type: "text", text: suivant.value }));
            return;
          }
        }
      } catch (erreur) {
        const code = codeDErreur(erreur, texte !== "");
        if (code !== null) controleur.enqueue(ligne({ type: "error", code }));
        controleur.close();
      }
    },

    async cancel() {
      // Le lecteur renonce (le navigateur a annulé ou s'est déconnecté) : fermer la source ferme la
      // connexion vers l'IA, qui cesse de générer.
      await chunks.return().catch(() => undefined);
    },
  });
}
