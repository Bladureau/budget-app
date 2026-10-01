/**
 * Retour de la banque après validation par l'utilisateur.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§4).
 *
 * **Seul point d'entrée non contrôlé par le cookie d'accès** : ce cookie est en
 * `SameSite=Strict`, et le navigateur ne l'envoie pas lors d'une navigation venue de la
 * banque. L'autorisation repose sur le `state`, émis pour un appareil autorisé, à usage unique
 * et valable 15 minutes (R4). Sans `state` valide, rien n'est fait.
 *
 * La réponse est toujours une redirection `303` vers `/` avec un paramètre `banking` qui sert
 * seulement à afficher un message. L'en-tête `Location` est **relatif** : derrière le proxy
 * inverse, l'origine vue par le serveur (`http://0.0.0.0:3000`) n'est pas celle du navigateur.
 */

import { bankingConfig } from "@/lib/server/banking/config";
import {
  createSession,
  empreinteIban,
  suffixeIban,
} from "@/lib/server/banking/enable-banking";
import type { ProviderAccount } from "@/lib/server/banking/enable-banking";
import { consumePendingAuth } from "@/lib/server/banking/pending-auth";
import {
  findConnection,
  updateBanking,
  withConnection,
  withError,
} from "@/lib/server/banking/banking-store";
import type { BankConnection } from "@/lib/server/banking/banking-store";

type CallbackOutcome = "connected" | "error" | "noAccount" | "invalidState";

function retour(issue: CallbackOutcome): Response {
  return new Response(null, { status: 303, headers: { Location: `/?banking=${issue}` } });
}

/**
 * Choix du compte (data-model §3) :
 *  - renouvellement : celui dont l'empreinte d'IBAN est déjà enregistrée ;
 *  - première liaison : le compte s'il est seul, sinon l'**unique** compte en euros. Aucun,
 *    ou plusieurs sans moyen de les départager : on refuse de choisir au hasard.
 */
function choisirCompte(
  comptes: readonly ProviderAccount[],
  existante: BankConnection | undefined,
): (ProviderAccount & { iban: string }) | null {
  const avecIban = comptes.filter(
    (compte): compte is ProviderAccount & { iban: string } => compte.iban !== null,
  );

  if (existante) {
    return avecIban.find((compte) => empreinteIban(compte.iban) === existante.ibanHash) ?? null;
  }

  // Un seul compte : aucune ambiguïté, quelle que soit la devise annoncée. LCL annonce `XXX`
  // (« sans devise » en ISO 4217) pour un compte courant en euros, constaté à la mise en
  // service : exiger `EUR` ici rendait toute liaison LCL impossible.
  if (avecIban.length === 1) return avecIban[0];

  const enEuros = avecIban.filter((compte) => compte.currency === "EUR");
  return enEuros.length === 1 ? enEuros[0] : null;
}

export async function GET(request: Request): Promise<Response> {
  const parametres = new URL(request.url).searchParams;
  const state = parametres.get("state");
  if (!state) return retour("invalidState");

  // Consommé avant toute autre vérification : un `state` ne sert qu'une fois, quelle que soit
  // l'issue de la liaison.
  const liaison = consumePendingAuth(state, new Date());
  if (!liaison) return retour("invalidState");

  const config = bankingConfig();
  if (!config) return retour("error");

  // Refus de l'utilisateur, ou erreur côté banque (`server_error` constaté lors de l'essai).
  const code = parametres.get("code");
  if (parametres.get("error") !== null || !code) return retour("error");

  const session = await createSession(config, code);
  if (!session.ok) return retour("error");

  let issue: CallbackOutcome = "connected";
  const ecriture = await updateBanking((etat) => {
    const existante = findConnection(etat, liaison.bank);
    const compte = choisirCompte(session.value.accounts, existante);

    if (!compte) {
      issue = "noAccount";
      // Renouvellement sans le compte attendu : l'ancienne session est **conservée**, seule
      // l'erreur est consignée. Première liaison : rien n'est enregistré.
      return existante ? withError(etat, liaison.bank, "noAccount", new Date()) : null;
    }

    return withConnection(etat, {
      bank: liaison.bank,
      sessionId: session.value.sessionId,
      accountUid: compte.uid,
      ibanHash: empreinteIban(compte.iban),
      ibanSuffix: suffixeIban(compte.iban),
      validUntil: liaison.validUntil,
    });
  });

  if (!ecriture.ok) return retour("error");
  return retour(issue);
}
