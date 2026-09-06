"use client";

/**
 * Frontière cliente de la fonctionnalité budgétaire.
 *
 * Seul fichier de la fonctionnalité portant `"use client"` : la documentation de la version
 * installée (01-app/01-getting-started/05-server-and-client-components.md) indique que les
 * API navigateur — `localStorage` y est citée nommément — relèvent des Composants Client, et
 * qu’une fois un fichier marqué, ses imports rejoignent le graphe client.
 *
 * L’état initial est lu par `useSyncExternalStore` et JAMAIS pendant le rendu : le serveur ne
 * dispose pas de `localStorage`, une lecture au rendu provoquerait une divergence
 * d’hydratation.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { loadDocument, newId, saveDocument } from "@/lib/storage";
import { addMonthsToKey, monthKeyOf } from "@/lib/date";
import { emptyDocument } from "@/features/budget/types";
import {
  withAmountChange,
  withPause,
  withTermination,
} from "@/features/budget/calculs";
import type {
  BudgetDocument,
  Cents,
  Income,
  IsoDate,
  MonthKey,
  Subscription,
} from "@/features/budget/types";

/** Motif d’alerte présenté à l’utilisateur (voir contracts/interface.md). */
export type BudgetNotice = "quarantined" | "writeFailed" | null;

interface BudgetContextValue {
  document: BudgetDocument;
  /** Faux tant que le premier chargement client n’a pas eu lieu. */
  ready: boolean;
  notice: BudgetNotice;
  dismissNotice: () => void;
  today: IsoDate;
  selectedMonth: MonthKey;
  setSelectedMonth: (month: MonthKey) => void;
  goToAdjacentMonth: (offset: number) => void;
  goToCurrentMonth: () => void;

  addIncome: (income: Omit<Income, "id">) => void;
  updateIncome: (income: Income) => void;
  removeIncome: (id: string) => void;

  addSubscription: (subscription: Omit<Subscription, "id">) => void;
  updateSubscription: (subscription: Subscription) => void;
  removeSubscription: (id: string) => void;

  /** Renvoient `false` si l’opération viole un invariant du modèle. */
  changeSubscriptionAmount: (
    id: string,
    amountCents: Cents,
    effectiveFrom: IsoDate,
  ) => boolean;
  pauseSubscription: (id: string, from: IsoDate, to: IsoDate | null) => boolean;
  terminateSubscription: (id: string, endDate: IsoDate) => boolean;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

// --- Magasin externe -------------------------------------------------------------------

let instantane: BudgetDocument | null = null;
let quarantaineDetectee = false;
const abonnes = new Set<() => void>();

function notifier(): void {
  for (const abonne of abonnes) abonne();
}

function souscrire(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

function lireInstantaneClient(): BudgetDocument {
  if (instantane === null) {
    const resultat = loadDocument();
    instantane = resultat.document;
    quarantaineDetectee = resultat.quarantined;
  }
  return instantane;
}

// Instantané servi au rendu serveur et au premier rendu client, avant hydratation. Doit être
// stable : le renvoyer depuis une constante évite toute boucle de rendu.
const DOCUMENT_SERVEUR = emptyDocument();

function lireInstantaneServeur(): BudgetDocument {
  return DOCUMENT_SERVEUR;
}

function ecrire(suivant: BudgetDocument): "ok" | "writeFailed" {
  const resultat = saveDocument(suivant);
  if (!resultat.ok) return "writeFailed";
  instantane = suivant;
  notifier();
  return "ok";
}

// --- Fournisseur -----------------------------------------------------------------------

function moisCourant(): MonthKey {
  return monthKeyOf(dateDuJour());
}

/** Date du jour au format `AAAA-MM-JJ`, dans le fuseau local. */
function dateDuJour(): IsoDate {
  const maintenant = new Date();
  const mois = String(maintenant.getMonth() + 1).padStart(2, "0");
  const jour = String(maintenant.getDate()).padStart(2, "0");
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const document = useSyncExternalStore(
    souscrire,
    lireInstantaneClient,
    lireInstantaneServeur,
  );

  // `ready` distingue « pas encore hydraté » de « réellement vide », ce qui évite d’afficher
  // l’invitation à saisir pendant une fraction de seconde à chaque chargement.
  const ready = document !== DOCUMENT_SERVEUR;

  const [erreurEcriture, setErreurEcriture] = useState(false);
  const [alerteMasquee, setAlerteMasquee] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(moisCourant);

  const today = dateDuJour();

  const appliquer = useCallback((suivant: BudgetDocument) => {
    const resultat = ecrire(suivant);
    setErreurEcriture(resultat === "writeFailed");
  }, []);

  const addIncome = useCallback(
    (revenu: Omit<Income, "id">) => {
      const nouveau = { ...revenu, id: newId() } as Income;
      appliquer({ ...lireInstantaneClient(), incomes: [...lireInstantaneClient().incomes, nouveau] });
    },
    [appliquer],
  );

  const updateIncome = useCallback(
    (revenu: Income) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        incomes: actuel.incomes.map((element) => (element.id === revenu.id ? revenu : element)),
      });
    },
    [appliquer],
  );

  const removeIncome = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({ ...actuel, incomes: actuel.incomes.filter((element) => element.id !== id) });
    },
    [appliquer],
  );

  const addSubscription = useCallback(
    (abonnement: Omit<Subscription, "id">) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: [...actuel.subscriptions, { ...abonnement, id: newId() }],
      });
    },
    [appliquer],
  );

  const updateSubscription = useCallback(
    (abonnement: Subscription) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.map((element) =>
          element.id === abonnement.id ? abonnement : element,
        ),
      });
    },
    [appliquer],
  );

  const removeSubscription = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.filter((element) => element.id !== id),
      });
    },
    [appliquer],
  );

  /**
   * Applique une transformation pure à un abonnement. La transformation peut refuser
   * l’opération (`null`) : l’appelant en informe alors l’utilisateur au lieu d’écrire un
   * document que le stockage rejetterait de toute façon.
   */
  const transformerAbonnement = useCallback(
    (id: string, transformation: (abonnement: Subscription) => Subscription | null) => {
      const actuel = lireInstantaneClient();
      const cible = actuel.subscriptions.find((element) => element.id === id);
      if (!cible) return false;

      const transforme = transformation(cible);
      if (!transforme) return false;

      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.map((element) =>
          element.id === id ? transforme : element,
        ),
      });
      return true;
    },
    [appliquer],
  );

  const changeSubscriptionAmount = useCallback(
    (id: string, amountCents: Cents, effectiveFrom: IsoDate) =>
      transformerAbonnement(id, (abonnement) =>
        withAmountChange(abonnement, amountCents, effectiveFrom),
      ),
    [transformerAbonnement],
  );

  const pauseSubscription = useCallback(
    (id: string, from: IsoDate, to: IsoDate | null) =>
      transformerAbonnement(id, (abonnement) => withPause(abonnement, from, to)),
    [transformerAbonnement],
  );

  const terminateSubscription = useCallback(
    (id: string, endDate: IsoDate) =>
      transformerAbonnement(id, (abonnement) => withTermination(abonnement, endDate)),
    [transformerAbonnement],
  );

  const notice: BudgetNotice = alerteMasquee
    ? null
    : erreurEcriture
      ? "writeFailed"
      : ready && quarantaineDetectee
        ? "quarantined"
        : null;

  const valeur = useMemo<BudgetContextValue>(
    () => ({
      document,
      ready,
      notice,
      dismissNotice: () => setAlerteMasquee(true),
      today,
      selectedMonth,
      setSelectedMonth,
      goToAdjacentMonth: (offset: number) =>
        setSelectedMonth((precedent) => addMonthsToKey(precedent, offset)),
      goToCurrentMonth: () => setSelectedMonth(moisCourant()),
      addIncome,
      updateIncome,
      removeIncome,
      addSubscription,
      updateSubscription,
      removeSubscription,
      changeSubscriptionAmount,
      pauseSubscription,
      terminateSubscription,
    }),
    [
      document,
      ready,
      notice,
      today,
      selectedMonth,
      addIncome,
      updateIncome,
      removeIncome,
      addSubscription,
      updateSubscription,
      removeSubscription,
      changeSubscriptionAmount,
      pauseSubscription,
      terminateSubscription,
    ],
  );

  return <BudgetContext.Provider value={valeur}>{children}</BudgetContext.Provider>;
}

export function useBudget(): BudgetContextValue {
  const valeur = useContext(BudgetContext);
  if (!valeur) {
    throw new Error("useBudget doit être appelé à l’intérieur de <BudgetProvider>.");
  }
  return valeur;
}
