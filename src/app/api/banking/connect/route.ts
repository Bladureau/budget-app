/**
 * Démarre une liaison bancaire, ou son renouvellement.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§2).
 *
 * Exige le cookie d'accès : c'est ce qui fait du `state` émis ici une preuve que la liaison a
 * été demandée par un appareil autorisé (R4).
 */

import { isAuthorized, unauthorizedResponse } from "@/lib/server/authorization";
import { bankingConfig } from "@/lib/server/banking/config";
import { getAspspMaxValidity, startAuthorization } from "@/lib/server/banking/enable-banking";
import { createPendingAuth } from "@/lib/server/banking/pending-auth";
import { BANK_SOURCES } from "@/features/banking/types";
import type { BankSource } from "@/features/budget/types";

/** 180 jours : le maximum constaté pour LCL et Revolut. */
const VALIDITE_MAX_S = 180 * 24 * 60 * 60;

function lireBanque(corps: unknown): BankSource | null {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) return null;
  const bank = (corps as Record<string, unknown>).bank;
  return typeof bank === "string" && BANK_SOURCES.includes(bank as BankSource)
    ? (bank as BankSource)
    : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();

  const config = bankingConfig();
  if (!config) return Response.json({ error: "notConfigured" }, { status: 503 });

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return Response.json({ error: "invalidBank" }, { status: 400 });
  }
  const bank = lireBanque(corps);
  if (!bank) return Response.json({ error: "invalidBank" }, { status: 400 });

  // La durée demandée ne dépasse jamais ce que la banque accepte : une demande trop longue
  // serait refusée par le fournisseur.
  const maximum = await getAspspMaxValidity(config, bank);
  if (!maximum.ok) return Response.json({ error: "providerUnavailable" }, { status: 502 });

  const maintenant = new Date();
  const duree = Math.min(VALIDITE_MAX_S, maximum.value);
  // Une minute de marge : la demande ne doit pas dépasser le maximum à cause du délai réseau.
  const validUntil = new Date(maintenant.getTime() + (duree - 60) * 1000);

  const state = createPendingAuth({ bank, validUntil: validUntil.toISOString() }, maintenant);
  const resultat = await startAuthorization(config, bank, state, validUntil);
  if (!resultat.ok) return Response.json({ error: "providerUnavailable" }, { status: 502 });

  return Response.json({ url: resultat.value });
}
