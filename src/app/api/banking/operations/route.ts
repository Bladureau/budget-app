/**
 * Opérations normalisées des banques reliées, récupérées au besoin.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§3) et research.md (R3).
 *
 * **Aucune tâche de fond** : la récupération auprès des banques a lieu ici, quand le navigateur
 * demande les opérations, avec deux bornes par banque — 6 heures en automatique, 5 minutes à la
 * demande. Entre deux récupérations, le cache répond. La requête est faite en présence de
 * l'utilisateur : elle transmet les en-têtes qui le signalent à la banque.
 *
 * Le point d'entrée n'a pas de curseur : il rend tout le cache depuis `since − 7 jours`, et le
 * navigateur ignore ce qu'il a déjà traité. C'est ce qui le rend idempotent.
 */

import { isAuthorized, unauthorizedResponse } from "@/lib/server/authorization";
import { bankingConfig } from "@/lib/server/banking/config";
import { fetchTransactions } from "@/lib/server/banking/enable-banking";
import type { PsuHeaders } from "@/lib/server/banking/enable-banking";
import {
  mergeOperations,
  readBanking,
  updateBanking,
  withAttempt,
  withError,
  withFetchResult,
} from "@/lib/server/banking/banking-store";
import type { BankConnection } from "@/lib/server/banking/banking-store";
import { normalizeLclBatch } from "@/lib/server/banking/normalize-lcl";
import { mergeRoundUps, normalizeRevolutBatch } from "@/lib/server/banking/normalize-revolut";
import { publicStatus } from "@/lib/server/banking/public-status";
import { isValidIsoDate } from "@/lib/date";
import type { BankOperation } from "@/features/banking/types";
import type { BankSource } from "@/features/budget/types";

const BORNE_AUTO_MS = 6 * 60 * 60 * 1000;
const BORNE_MANUELLE_MS = 5 * 60 * 1000;
/** Un paiement LCL est débité jusqu'à quelques jours après (observé : 4 jours). */
const MARGE_JOURS = 7;
/** Au-delà, certaines banques ne donnent plus l'historique sans nouvelle validation (R3). */
const HISTORIQUE_JOURS = 90;
const JOUR_MS = 86_400_000;

function decaler(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10);
}

function plusTardive(a: string, b: string): string {
  return a > b ? a : b;
}

function enTetesPresence(request: Request): PsuHeaders {
  // Derrière le proxy inverse, l'adresse du navigateur est la première de `x-forwarded-for`.
  const relaye = request.headers.get("x-forwarded-for");
  return {
    ipAddress: relaye ? relaye.split(",")[0].trim() || null : null,
    userAgent: request.headers.get("user-agent"),
  };
}

function aRecuperer(connexion: BankConnection, maintenant: number, manuelle: boolean): boolean {
  if (connexion.lastAttemptAt === null) return true;
  const borne = manuelle ? BORNE_MANUELLE_MS : BORNE_AUTO_MS;
  return maintenant - Date.parse(connexion.lastAttemptAt) >= borne;
}

/**
 * Date de départ de la récupération : la plus tardive entre `since − 7 jours` et la dernière
 * opération connue − 7 jours. Repartir de la dernière opération évite de tout redemander à
 * chaque fois ; la marge rattrape un débit tardif.
 */
function dateDeDepart(connexion: BankConnection, since: string): string {
  const depuis = decaler(since, -MARGE_JOURS);
  const derniere = connexion.operations.reduce<string | null>(
    (max, operation) => (max === null || operation.bookingDate > max ? operation.bookingDate : max),
    null,
  );
  return derniere ? plusTardive(depuis, decaler(derniere, -MARGE_JOURS)) : depuis;
}

/**
 * Trou d'historique probable (R3) : la dernière récupération réussie date de plus de 90 jours,
 * et la plus ancienne opération reçue est postérieure de plus de 7 jours à la date demandée.
 */
function trouProbable(
  precedente: string | null,
  dateDemandee: string,
  recues: readonly BankOperation[],
  maintenant: number,
): boolean {
  if (precedente === null || maintenant - Date.parse(precedente) <= HISTORIQUE_JOURS * JOUR_MS) {
    return false;
  }
  if (recues.length === 0) return true;
  const plusAncienne = recues.reduce((min, o) => (o.bookingDate < min ? o.bookingDate : min), recues[0].bookingDate);
  return plusAncienne > decaler(dateDemandee, MARGE_JOURS);
}

function normaliser(bank: BankSource, brutes: unknown[]) {
  return bank === "lcl" ? normalizeLclBatch(brutes) : normalizeRevolutBatch(brutes);
}

export async function GET(request: Request): Promise<Response> {
  if (!(await isAuthorized())) return unauthorizedResponse();

  const config = bankingConfig();
  if (!config) return Response.json({ error: "notConfigured" }, { status: 503 });

  const parametres = new URL(request.url).searchParams;
  const since = parametres.get("since");
  if (!since || !isValidIsoDate(since)) {
    return Response.json({ error: "invalidSince" }, { status: 400 });
  }
  const manuelle = parametres.get("refresh") === "manual";
  const psu = enTetesPresence(request);

  const { state: initial } = await readBanking();
  const trous = new Set<BankSource>();

  // Chaque banque est récupérée indépendamment : l'échec de l'une n'empêche pas l'autre.
  await Promise.all(
    initial.connections.map(async ({ bank }) => {
      const maintenant = Date.now();

      // Décider de récupérer et consigner la tentative forment **une seule** écriture
      // sérialisée : deux onglets ouverts ensemble ne déclenchent pas deux récupérations.
      const reclamation: { connexion: BankConnection | null } = { connexion: null };
      await updateBanking((etat) => {
        const actuelle = etat.connections.find((c) => c.bank === bank);
        if (!actuelle || !aRecuperer(actuelle, maintenant, manuelle)) return null;
        reclamation.connexion = actuelle;
        return withAttempt(etat, bank, new Date(maintenant));
      });
      const connexion = reclamation.connexion;
      if (connexion === null) return;

      const depart = dateDeDepart(connexion, since);
      const resultat = await fetchTransactions(config, connexion.accountUid, depart, psu);
      if (!resultat.ok) {
        await updateBanking((etat) => withError(etat, connexion.bank, resultat.error, new Date()));
        return;
      }

      const lot = normaliser(connexion.bank, resultat.value);
      if (trouProbable(connexion.lastFetchAt, depart, lot.operations, maintenant)) {
        trous.add(connexion.bank);
      }

      await updateBanking((etat) => {
        const actuelle = etat.connections.find((c) => c.bank === connexion.bank);
        if (!actuelle) return null;
        const fusion = mergeOperations(actuelle.operations, lot.operations);
        return withFetchResult(etat, connexion.bank, {
          operations: connexion.bank === "revolut" ? mergeRoundUps(fusion) : fusion,
          discardedCount: lot.discarded,
          at: new Date(),
        });
      });
    }),
  );

  const { state } = await readBanking();
  const depuis = decaler(since, -MARGE_JOURS);
  const operations = state.connections
    .flatMap((connexion) => connexion.operations)
    .filter((operation) => operation.bookingDate >= depuis)
    .sort((a, b) =>
      a.bookingDate === b.bookingDate ? a.ref.localeCompare(b.ref) : a.bookingDate.localeCompare(b.bookingDate),
    );

  return Response.json({ operations, banks: publicStatus(state, trous).banks });
}
