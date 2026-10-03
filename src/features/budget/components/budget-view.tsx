"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
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
import { TABS } from "@/features/navigation/navigation";
import type { Tab } from "@/features/navigation/navigation";
import { useActiveTab } from "@/features/navigation/use-active-tab";
import { TabBar } from "@/features/navigation/components/tab-bar";
import { TabLink } from "@/features/navigation/components/tab-link";

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
        Saisissez une première dépense ci-dessous, ou restaurez une sauvegarde depuis{" "}
        <TabLink tab="settings" section="titre-donnees" className="underline">
          l’onglet Réglages
        </TabLink>
        . Ce que vous enregistrerez ici se retrouvera sur vos autres appareils.
      </p>
    </section>
  );
}

/**
 * Nom du panneau pour les technologies d'assistance. Préfixé : la section du reste du jour
 * s'appelle déjà « Aujourd'hui », et deux régions homonymes imbriquées seraient ambiguës.
 */
function nomDuPanneau(tab: Tab): string {
  return `Onglet ${TABS.find((definition) => definition.tab === tab)?.label ?? tab}`;
}

/**
 * Panneau d'un onglet. Tous restent montés, l'inactif est seulement `hidden` (R3) : une saisie
 * en cours survit ainsi au changement d'onglet sans qu'aucun formulaire n'ait à la conserver.
 */
function Panneau({ tab, actif, children }: { tab: Tab; actif: Tab; children: ReactNode }) {
  return (
    <section aria-label={nomDuPanneau(tab)} hidden={tab !== actif} className="space-y-8">
      {children}
    </section>
  );
}

/**
 * Vue complète, découpée en onglets (specs/007-navigation-menu).
 *
 * La hiérarchie d'usage passe par les onglets : « Aujourd'hui », qui s'ouvre par défaut, réunit
 * ce qui se consulte plusieurs fois par jour ; « Mois » le budget prévisionnel, consulté une fois
 * par mois ; « Réglages » ce qui sert rarement. L'en-tête et les bandeaux de synchronisation
 * restent au-dessus, quel que soit l'onglet.
 */
export function BudgetView() {
  const { ready } = useBudget();
  const { tab, section } = useActiveTab();

  // Amène à l'écran la section visée par l'adresse (`#a-classer`…), une fois son panneau
  // affiché : un élément `hidden` ne peut pas défiler, d'où l'effet après validation du rendu
  // plutôt qu'un défilement au moment du clic.
  useEffect(() => {
    if (!ready || section === null) return;
    document.getElementById(section)?.scrollIntoView({ block: "start" });
  }, [ready, tab, section]);

  return (
    // Sous `sm`, le bas réserve la hauteur de la barre d'onglets fixe et de la zone système, pour
    // que le dernier élément d'un onglet ne soit jamais recouvert. Les marges latérales tiennent
    // compte des encoches, que `viewportFit: "cover"` laisse empiéter sur la page en paysage.
    <main className="mx-auto w-full max-w-3xl pt-8 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 sm:pb-8">
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

      {ready ? <TabBar /> : null}

      <div className="space-y-8">
        <SyncStatus />
        <ConflictDialog />
        <StorageNotice />
        {ready ? (
          <>
            <Panneau tab="today" actif={tab}>
              <PremierLancement />
              <BankAlerts />
              <InboxCount />
              <BudgetRing />
              <DailyAllowance />
              <ExpenseForm />
            </Panneau>

            <Panneau tab="expenses" actif={tab}>
              <Inbox />
              <ExpenseJournal />
              <EnvelopeList />
            </Panneau>

            <Panneau tab="month" actif={tab}>
              <MonthSummary />
              <IncomeList />
              <SubscriptionList />
              <ChargeBreakdown />
              <UpcomingDues />
              <ForecastView />
            </Panneau>

            <Panneau tab="settings" actif={tab}>
              <BankPanel />
              <DataTransfer />
            </Panneau>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        )}
      </div>
    </main>
  );
}
