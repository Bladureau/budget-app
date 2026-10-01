"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { StorageNotice } from "@/features/budget/components/storage-notice";
import { SyncStatus } from "@/features/budget/components/sync-status";
import { ConflictDialog } from "@/features/budget/components/conflict-dialog";
import { MonthNavigator } from "@/features/budget/components/month-navigator";
import { BudgetRing } from "@/features/budget/components/budget-ring";
import { DailyAllowance } from "@/features/budget/components/daily-allowance";
import { ExpenseForm } from "@/features/budget/components/expense-form";
import { ExpenseJournal } from "@/features/budget/components/expense-journal";
import { EnvelopeList } from "@/features/budget/components/envelope-list";
import { MonthSummary } from "@/features/budget/components/month-summary";
import { IncomeList } from "@/features/budget/components/income-list";
import { SubscriptionList } from "@/features/budget/components/subscription-list";
import { ChargeBreakdown } from "@/features/budget/components/charge-breakdown";
import { UpcomingDues } from "@/features/budget/components/upcoming-dues";
import { ForecastView } from "@/features/budget/components/forecast-view";
import { DataTransfer } from "@/features/budget/components/data-transfer";
import { BankAlerts, BankPanel } from "@/features/banking/components/bank-panel";
import { Inbox, InboxCount } from "@/features/banking/components/inbox";

/**
 * Premier lancement : le stockage central est vide.
 *
 * **Ce n'est pas une erreur, c'est un budget neuf.** La distinction compte : l'application
 * répond `200` avec la révision 0, pas un échec, et l'utilisateur doit être invité à
 * commencer plutôt qu'averti d'un problème inexistant.
 *
 * N'apparaît que lorsque la synchronisation a réellement abouti : hors connexion, on ignore
 * si le budget est vide ou seulement injoignable, et l'affirmer serait faux.
 */
function PremierLancement() {
  const { document, syncState, pendingChanges } = useBudget();

  const vide =
    document.incomes.length === 0 &&
    document.subscriptions.length === 0 &&
    document.expenses.length === 0 &&
    document.envelopes.length === 0;

  if (!vide || syncState !== "idle" || pendingChanges) return null;

  return (
    <section
      aria-label="Bienvenue"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
    >
      <p className="font-semibold">Votre budget est vide.</p>
      <p className="mt-1 text-[var(--muted)]">
        Saisissez une première dépense ci-dessous, ou restaurez une sauvegarde depuis la
        section « Vos données » en bas de page. Ce que vous enregistrerez ici se retrouvera
        sur vos autres appareils.
      </p>
    </section>
  );
}

/**
 * Vue complète.
 *
 * L'ordre traduit une hiérarchie d'usage : l'anneau et l'allocation se consultent plusieurs
 * fois par jour, le budget prévisionnel une fois par mois. Le prévisionnel de la
 * fonctionnalité 002 passe donc sous le quotidien, dans un repli.
 */
export function BudgetView() {
  const { ready } = useBudget();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {/* « restent sur cet appareil » cesserait d'être vrai avec le stockage
                central : la phrase dit désormais ce qui se passe réellement. */}
            Vos données restent chez vous, synchronisées entre vos appareils.
          </p>
        </div>
        {ready ? <MonthNavigator /> : null}
      </header>

      <div className="space-y-8">
        <SyncStatus />
        <ConflictDialog />
        <StorageNotice />
        {ready ? (
          <>
            <PremierLancement />
            <BankAlerts />
            <InboxCount />
            <BudgetRing />
            <DailyAllowance />
            <ExpenseForm />
            <Inbox />
            <ExpenseJournal />
            <EnvelopeList />
            <BankPanel />

            <details className="rounded-lg border border-[var(--border)] p-4">
              <summary className="cursor-pointer font-medium">
                Budget prévisionnel du mois
              </summary>
              <div className="mt-6 space-y-8">
                <MonthSummary />
                <IncomeList />
                <SubscriptionList />
                <ChargeBreakdown />
                <UpcomingDues />
                <ForecastView />
              </div>
            </details>

            <DataTransfer />
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        )}
      </div>
    </main>
  );
}
