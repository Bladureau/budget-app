/**
 * Point d'entrée HTTP du budget central.
 *
 * Voir specs/005-server-side-storage/contracts/api-budget.md.
 *
 * Un seul chemin, deux méthodes. Toute autre méthode reçoit `405` de Next.js sans code ici.
 *
 * **Aucun `export const runtime`** : `'nodejs'` est le défaut de la version installée et le
 * runtime Edge y est déprécié (« Remove the `runtime` export from your route files »).
 *
 * **Aucun `export const dynamic`** : le contrôle d'autorisation lit `cookies()`, ce qui
 * interrompt tout prérendu. La route est donc dynamique par construction, sans le déclarer.
 */

import { isAuthorized, unauthorizedResponse } from "@/lib/server/authorization";
import { readBudget, writeBudget } from "@/lib/server/budget-store";
import type { ReadFailure } from "@/lib/server/budget-store";

/**
 * Un contenu illisible a été mis de côté ; un fichier de version postérieure est resté en
 * place. Les deux empêchent de servir le budget, mais appellent des gestes différents de la
 * part de l'utilisateur — les confondre lui cacherait lequel s'applique.
 */
function reponseLectureImpossible(reason: ReadFailure): Response {
  return Response.json(
    { error: reason === "futureVersion" ? "storageFutureVersion" : "storageUnreadable" },
    { status: 500 },
  );
}

export async function GET(): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();

  const resultat = await readBudget();
  if (!resultat.ok) return reponseLectureImpossible(resultat.reason);

  // Un fichier absent rend la révision 0 et un document vide : l'absence de budget est un
  // état normal du système, pas l'absence d'une ressource. C'est ce qui permet au premier
  // appareil d'écrire en se fondant sur la révision 0.
  return Response.json({
    revision: resultat.revision,
    updatedAt: resultat.updatedAt,
    document: resultat.document,
  });
}

/** Enveloppe de requête, validée avant d'atteindre l'analyseur de document (principe IV). */
function lireBaseRevision(corps: unknown): number | null {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) return null;

  const valeur = (corps as Record<string, unknown>).baseRevision;
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 0) return null;

  return valeur;
}

export async function PUT(request: Request): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return Response.json({ error: "invalidDocument" }, { status: 400 });
  }

  const baseRevision = lireBaseRevision(corps);
  if (baseRevision === null) {
    return Response.json({ error: "invalidDocument" }, { status: 400 });
  }

  const document = (corps as Record<string, unknown>).document;
  const resultat = await writeBudget(document, baseRevision);

  if (resultat.ok) {
    return Response.json({ revision: resultat.revision, updatedAt: resultat.updatedAt });
  }

  if (resultat.reason === "conflict") {
    // L'état courant accompagne le refus : l'appelant présente le choix à l'utilisateur
    // sans second aller-retour (EF-024, EF-025).
    return Response.json(
      {
        error: "revisionMismatch",
        revision: resultat.revision,
        updatedAt: resultat.updatedAt,
        document: resultat.document,
      },
      { status: 409 },
    );
  }

  if (resultat.reason === "invalidDocument") {
    return Response.json({ error: "invalidDocument" }, { status: 400 });
  }

  if (resultat.reason === "writeFailed") {
    return Response.json({ error: "writeFailed" }, { status: 500 });
  }

  return reponseLectureImpossible(resultat.reason);
}
