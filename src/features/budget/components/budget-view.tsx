"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { StorageNotice } from "@/features/budget/components/storage-notice";
import { MonthNavigator } from "@/features/budget/components/month-navigator";
import { BudgetRing } from "@/features/budget/components/budget-ring";
import { DailyAllowance } from "@/features/budget/components/daily-allowance";
import { ExpenseForm } from "@/features/budget/components/expense-form";
import { ExpenseJournal } from "@/features/budget/components/expense-journal";
import { MonthSummary } from "@/features/budget/components/month-summary";
import { IncomeList } from "@/features/budget/components/income-list";
import { SubscriptionList } from "@/features/budget/components/subscription-list";
import { ChargeBreakdown } from "@/features/budget/components/charge-breakdown";
import { UpcomingDues } from "@/features/budget/components/upcoming-dues";
import { ForecastView } from "@/features/budget/components/forecast-view";
import { DataTransfer } from "@/features/budget/components/data-transfer";

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
            Vos données restent sur cet appareil.
          </p>
        </div>
        {ready ? <MonthNavigator /> : null}
      </header>

      <div className="space-y-8">
        <StorageNotice />
        {ready ? (
          <>
            <BudgetRing />
            <DailyAllowance />
            <ExpenseForm />
            <ExpenseJournal />

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
