"use client";

import { useEffect, useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { BANK_LABELS } from "@/features/banking/types";
import type { BankConnectionStatus } from "@/features/banking/types";
import type { ClientFailure } from "@/features/banking/client";
import {
  BANKING_NOT_CONFIGURED,
  CALLBACK_MESSAGES,
  CLIENT_FAILURE_MESSAGES,
  HISTORY_GAP,
  IMPORT_FROM_HELP,
} from "@/features/banking/messages";
import { bankDisplay } from "@/features/banking/bank-status";
import { formatIsoDateFr } from "@/lib/format";
import { isValidIsoDate, monthKeyOf, startOfMonth } from "@/lib/date";
import type { BankSource } from "@/features/budget/types";
import { TabLink } from "@/features/navigation/components/tab-link";

const formateurHorodatage = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

function horodatage(iso: string): string {
  return formateurHorodatage.format(new Date(iso));
}

/**
 * Instant de référence pour les échéances, tiré de la date du jour que tient le fournisseur.
 *
 * Plutôt qu'une lecture de l'horloge au rendu, qui rendrait l'affichage impur : le fournisseur
 * met déjà `today` à jour quand la journée change. Midi local, pour qu'un décalage de fuseau
 * ne fasse jamais basculer le jour. La précision au jour suffit à un seuil de 14 jours.
 */
function maintenantDuJour(today: string): Date {
  return new Date(`${today}T12:00:00`);
}

/**
 * Alertes bancaires visibles dès l'ouverture (EF-004, EF-005), en tête de l'onglet
 * « Aujourd'hui » : une autorisation qui expire ne doit jamais passer inaperçue plus d'une
 * journée (CS-008). Le lien mène au panneau des banques, dans « Réglages » (007, FR-012).
 */
export function BankAlerts() {
  const { bankStatus, today } = useBudget();
  if (!bankStatus?.configured) return null;

  const alertes = bankStatus.banks
    .map((etat) => bankDisplay(etat, maintenantDuJour(today)))
    .filter((affichage) => affichage.alert && affichage.message !== null);
  if (alertes.length === 0) return null;

  return (
    <div role="status" className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm">
      {alertes.map((affichage) => (
        <p key={affichage.message} className="font-medium">
          {affichage.message}{" "}
          <TabLink tab="settings" section="titre-banques" className="underline">
            Aller à « Mes banques »
          </TabLink>
        </p>
      ))}
    </div>
  );
}

/**
 * Message de retour de la banque, porté par `?banking=` (contrat API §4).
 *
 * Lu une seule fois, à l'initialisation : ce composant n'est monté qu'après l'hydratation
 * (la vue attend `ready`), si bien que `window` est disponible et qu'aucun écart de rendu
 * serveur n'est possible.
 */
function messageDeRetour(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("banking");
  return code !== null && code in CALLBACK_MESSAGES ? CALLBACK_MESSAGES[code] : null;
}

function LigneBanque({
  etat,
  maintenant,
  peutRelier,
  onRelier,
}: {
  etat: BankConnectionStatus;
  maintenant: Date;
  peutRelier: boolean;
  onRelier: (bank: BankSource) => void;
}) {
  const nom = BANK_LABELS[etat.bank];
  const affichage = bankDisplay(etat, maintenant);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {nom}
          {etat.connected && etat.ibanSuffix ? (
            <span className="font-normal text-[var(--muted)]"> · compte …{etat.ibanSuffix}</span>
          ) : null}
        </p>
        <p className="text-[var(--muted)]">
          {!etat.connected
            ? "Non reliée."
            : etat.lastFetchAt
              ? `Dernière récupération réussie le ${horodatage(etat.lastFetchAt)}.`
              : "Reliée, aucune récupération pour l’instant."}
        </p>
        {affichage.message ? <p className="mt-1 font-medium">{affichage.message}</p> : null}
        {etat.connected && etat.validUntil && affichage.health === "ok" ? (
          <p className="text-[var(--muted)]">
            Accès valable jusqu’au {formatIsoDateFr(etat.validUntil.slice(0, 10))}.
          </p>
        ) : null}
        {etat.historyGap ? (
          <p className="mt-1 font-medium">{HISTORY_GAP}</p>
        ) : null}
        {etat.discardedCount > 0 ? (
          <p className="mt-1">
            {etat.discardedCount === 1
              ? "1 opération illisible a été écartée."
              : `${etat.discardedCount} opérations illisibles ont été écartées.`}
          </p>
        ) : null}
      </div>

      {peutRelier && affichage.needsReconnect ? (
        <button
          type="button"
          className={buttonClassName}
          aria-label={`${etat.connected ? "Reconnecter" : "Relier"} ${nom}`}
          onClick={() => onRelier(etat.bank)}
        >
          {etat.connected ? "Reconnecter" : "Relier"}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Panneau des banques : date de début d'import, liaison, état, synchronisation manuelle.
 *
 * Voir specs/006-bank-sync/spec.md (récits 1 et 5) et plan.md (D12).
 */
export function BankPanel() {
  const { document, today, bankStatus, bankSyncState, setImportFrom, connectBank, syncBanks } =
    useBudget();
  const idDate = useId();

  const [retour] = useState(messageDeRetour);
  const [echecLiaison, setEchecLiaison] = useState<ClientFailure | null>(null);
  const importFrom = document.banking.importFrom;
  const dateModifiable = document.banking.ledger.length === 0;
  const [date, setDate] = useState(importFrom ?? startOfMonth(monthKeyOf(today)));

  // Le paramètre de retour est retiré de l'adresse une fois lu : un rechargement ne doit pas
  // réafficher un message périmé.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("banking")) return;
    url.searchParams.delete("banking");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (bankStatus === null && bankSyncState === "idle") return null;

  const nonConfiguree = bankStatus?.configured === false || bankSyncState === "notConfigured";
  const uneBanqueReliee = bankStatus?.banks.some((b) => b.connected) ?? false;

  async function relier(bank: BankSource) {
    setEchecLiaison(null);
    const echec = await connectBank(bank);
    if (echec) setEchecLiaison(echec);
  }

  return (
    <section
      aria-labelledby="titre-banques"
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <h2 id="titre-banques" className="text-lg font-semibold">
        Mes banques
      </h2>

      {retour ? (
        <p role="status" className="text-sm font-medium">
          {retour}
        </p>
      ) : null}

      {nonConfiguree ? (
        <p className="text-sm text-[var(--muted)]">{BANKING_NOT_CONFIGURED}</p>
      ) : (
        <>
          {importFrom !== null && !dateModifiable ? (
            <p className="text-sm text-[var(--muted)]">
              Paiements importés depuis le {formatIsoDateFr(importFrom)}.
            </p>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (isValidIsoDate(date)) setImportFrom(date);
              }}
            >
              <div>
                <label htmlFor={idDate} className="block text-sm font-medium">
                  Importer les paiements à partir du
                </label>
                <input
                  id={idDate}
                  type="date"
                  className={`${inputClassName} mt-1`}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-describedby={`${idDate}-aide`}
                />
              </div>
              <button type="submit" className={buttonClassName}>
                {importFrom === null ? "Enregistrer" : "Modifier"}
              </button>
              <p id={`${idDate}-aide`} className="w-full text-sm text-[var(--muted)]">
                {importFrom === null
                  ? IMPORT_FROM_HELP
                  : `Date actuelle : ${formatIsoDateFr(importFrom)}. ${IMPORT_FROM_HELP}`}
              </p>
            </form>
          )}

          {bankStatus ? (
            <ul className="divide-y divide-[var(--border)]">
              {bankStatus.banks.map((etat) => (
                <LigneBanque
                  key={etat.bank}
                  etat={etat}
                  maintenant={maintenantDuJour(today)}
                  peutRelier={importFrom !== null}
                  onRelier={(bank) => void relier(bank)}
                />
              ))}
            </ul>
          ) : null}

          {importFrom === null ? (
            <p className="text-sm text-[var(--muted)]">
              Enregistrez d’abord la date de début pour pouvoir relier vos banques.
            </p>
          ) : null}

          {echecLiaison ? (
            <p role="alert" className="text-sm font-medium">
              {CLIENT_FAILURE_MESSAGES[echecLiaison]}
            </p>
          ) : null}

          {bankSyncState !== "idle" && bankSyncState !== "syncing" ? (
            <p className="text-sm font-medium">{CLIENT_FAILURE_MESSAGES[bankSyncState]}</p>
          ) : null}

          {uneBanqueReliee && importFrom !== null ? (
            <div aria-live="polite" className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={syncBanks}
                disabled={bankSyncState === "syncing"}
              >
                Synchroniser les banques
              </button>
              {bankSyncState === "syncing" ? (
                <span className="text-sm text-[var(--muted)]">Récupération en cours…</span>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
