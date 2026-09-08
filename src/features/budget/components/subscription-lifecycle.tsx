"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { AMOUNT_ERROR_MESSAGES, DATE_INVALID } from "@/features/budget/messages";
import type { Subscription } from "@/features/budget/types";
import { isValidIsoDate } from "@/lib/date";
import { formatCents, parseAmountInput } from "@/lib/money";
import { formatIsoDateFr } from "@/lib/format";

type Action = null | "amount" | "pause" | "terminate";

/**
 * Cycle de vie d’un abonnement : changement de tarif daté, mise en pause, résiliation
 * (EF-010 à EF-012).
 *
 * Ces trois opérations préservent l’historique au lieu de l’écraser, ce qui garantit que les
 * mois antérieurs ne bougent pas (EF-025). La résiliation exige une confirmation explicite.
 */
export function SubscriptionLifecycle({ subscription }: { subscription: Subscription }) {
  const { changeSubscriptionAmount, pauseSubscription, terminateSubscription, today } =
    useBudget();
  const prefixe = useId();
  const [action, setAction] = useState<Action>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [montant, setMontant] = useState("");
  const [dateEffet, setDateEffet] = useState(today);
  const [pauseDebut, setPauseDebut] = useState(today);
  const [pauseFin, setPauseFin] = useState("");
  const [dateResiliation, setDateResiliation] = useState(today);
  const [confirmation, setConfirmation] = useState(false);

  function fermer() {
    setAction(null);
    setErreur(null);
    setConfirmation(false);
  }

  function soumettreTarif(evenement: React.FormEvent) {
    evenement.preventDefault();
    const analyse = parseAmountInput(montant);
    if (!analyse.ok) return setErreur(AMOUNT_ERROR_MESSAGES[analyse.reason]);
    if (!isValidIsoDate(dateEffet)) return setErreur(DATE_INVALID);

    if (!changeSubscriptionAmount(subscription.id, analyse.cents, dateEffet)) {
      return setErreur("Ce changement de tarif n’a pas pu être enregistré.");
    }
    setMontant("");
    fermer();
  }

  function soumettrePause(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!isValidIsoDate(pauseDebut)) return setErreur(DATE_INVALID);
    if (pauseFin !== "" && !isValidIsoDate(pauseFin)) return setErreur(DATE_INVALID);

    const fin = pauseFin === "" ? null : pauseFin;
    if (!pauseSubscription(subscription.id, pauseDebut, fin)) {
      return setErreur(
        "Cette période chevauche une suspension existante ou se termine avant de commencer.",
      );
    }
    setPauseFin("");
    fermer();
  }

  function soumettreResiliation(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (!isValidIsoDate(dateResiliation)) return setErreur(DATE_INVALID);
    if (!confirmation) {
      return setErreur("Cochez la case de confirmation pour résilier cet abonnement.");
    }
    if (!terminateSubscription(subscription.id, dateResiliation)) {
      return setErreur(
        "La date de résiliation ne peut pas être antérieure à la première échéance.",
      );
    }
    fermer();
  }

  const historique = subscription.amounts;
  const suspensions = subscription.pauses;

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      {action === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setAction("amount")}
          >
            Changer le tarif
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setAction("pause")}
          >
            Mettre en pause
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setAction("terminate")}
          >
            Résilier
          </button>
        </div>
      ) : null}

      {action === "amount" ? (
        <form onSubmit={soumettreTarif} noValidate className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Le nouveau tarif s’applique à partir de la date choisie. Les mois antérieurs
            conservent leur montant.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`${prefixe}-nouveau-montant`} label="Nouveau montant">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className={inputClassName}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="12,99"
                />
              )}
            </FormField>
            <FormField id={`${prefixe}-date-effet`} label="À partir du">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClassName}
                  value={dateEffet}
                  onChange={(e) => setDateEffet(e.target.value)}
                />
              )}
            </FormField>
          </div>
          {erreur ? <p className="text-sm text-[var(--deficit)]">{erreur}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClassName}>
              Enregistrer le tarif
            </button>
            <button type="button" className={buttonClassName} onClick={fermer}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {action === "pause" ? (
        <form onSubmit={soumettrePause} noValidate className="space-y-3">
          <p className="text-sm text-[var(--muted)]">
            Les échéances tombant dans cette période ne seront pas comptées.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={`${prefixe}-pause-debut`} label="Suspendre à partir du">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClassName}
                  value={pauseDebut}
                  onChange={(e) => setPauseDebut(e.target.value)}
                />
              )}
            </FormField>
            <FormField id={`${prefixe}-pause-fin`} label="Jusqu’au (facultatif)">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClassName}
                  value={pauseFin}
                  onChange={(e) => setPauseFin(e.target.value)}
                />
              )}
            </FormField>
          </div>
          {erreur ? <p className="text-sm text-[var(--deficit)]">{erreur}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClassName}>
              Suspendre
            </button>
            <button type="button" className={buttonClassName} onClick={fermer}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {action === "terminate" ? (
        <form onSubmit={soumettreResiliation} noValidate className="space-y-3">
          <FormField id={`${prefixe}-resiliation`} label="Résilier à compter du">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClassName}
                value={dateResiliation}
                onChange={(e) => setDateResiliation(e.target.value)}
              />
            )}
          </FormField>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={confirmation}
              onChange={(e) => setConfirmation(e.target.checked)}
            />
            <span>
              Je confirme la résiliation de « {subscription.label} ». Il n’apparaîtra plus
              dans les charges après cette date, mais restera consultable dans les mois où il
              s’appliquait.
            </span>
          </label>
          {erreur ? <p className="text-sm text-[var(--deficit)]">{erreur}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className={primaryButtonClassName}>
              Résilier
            </button>
            <button type="button" className={buttonClassName} onClick={fermer}>
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      {historique.length > 1 || suspensions.length > 0 ? (
        <div className="mt-3 space-y-1 text-sm text-[var(--muted)]">
          {historique.length > 1 ? (
            <p>
              Tarifs :{" "}
              {historique
                .map(
                  (periode) =>
                    `${formatCents(periode.amountCents)} dès le ${formatIsoDateFr(periode.effectiveFrom)}`,
                )
                .join(" · ")}
            </p>
          ) : null}
          {suspensions.map((pause) => (
            <p key={pause.from}>
              Suspendu du {formatIsoDateFr(pause.from)}
              {pause.to ? ` au ${formatIsoDateFr(pause.to)}` : " (sans terme)"}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
