/**
 * État des liaisons bancaires, sans déclencher de récupération.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§1).
 */

import { isAuthorized, unauthorizedResponse } from "@/lib/server/authorization";
import { bankingConfig } from "@/lib/server/banking/config";
import { readBanking } from "@/lib/server/banking/banking-store";
import { publicStatus } from "@/lib/server/banking/public-status";

export async function GET(): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();

  // Sans configuration, on le dit plutôt que de répondre en erreur : l'application doit
  // pouvoir afficher « non configurée » et continuer de fonctionner (R6).
  if (!bankingConfig()) return Response.json(publicStatus(null));

  const { state } = await readBanking();
  return Response.json(publicStatus(state));
}
