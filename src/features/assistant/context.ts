/**
 * Contexte budgétaire transmis à l'assistant (fonctionnalité 009).
 *
 * Voir specs/009-local-ai-assistant/data-model.md §1 et research.md (R1, R5, R6, R7).
 *
 * **Fonction pure** : ni disque, ni réseau, ni horloge. Elle n'appelle que les fonctions de calcul
 * existantes, si bien que chaque montant est celui des écrans, au centime (principe II). Tout
 * montant et tout pourcentage écrit ici passe par le registre de `verify-amounts.ts`, qui retient
 * ce qui a été fourni pour que la réponse puisse être contrôlée.
 *
 * Ce qui part vers le modèle est minimal (EF-016) : libellés assainis, jamais de `rawLabel`,
 * d'identifiant, de référence bancaire ni de compte.
 */

import { compareIso, monthKeyOf, startOfMonth } from "@/lib/date";
import type { IsoDate, MonthKey } from "@/lib/date";
import { formatIsoDateFr, formatMonthFr } from "@/lib/format";
import {
  computeMonthlyBudget,
  listUpcomingDues,
  occurrencesInMonth,
} from "@/features/budget/calculs";
import { computeMonthlyEnvelopes } from "@/features/budget/envelopes";
import {
  computeDailyAllowance,
  computeMonthlySpending,
  normalizeForSearch,
} from "@/features/budget/expenses";
import {
  ENVELOPE_STATE_LABELS,
  RING_STATUS_LABELS,
  reserveShortfallMessage,
} from "@/features/budget/messages";
import type { BudgetDocument } from "@/features/budget/types";
import { extractKeywords } from "@/features/assistant/keywords";
import { sanitizeLabel } from "@/features/assistant/sanitize";
import { CONTEXT_MAX_CHARS } from "@/features/assistant/types";
import type { KnownValues } from "@/features/assistant/types";
import { createValueRegistry } from "@/features/assistant/verify-amounts";

// --- Forme des données envoyées au modèle ---------------------------------------------------------

export interface OperationLine {
  date: string;
  libelle: string;
  categorie: string;
  montant: string;
  sens: "depense" | "remboursement";
  origine: "manuelle" | "banque";
}

interface EnvelopeLine {
  categorie: string;
  plafond: string;
  depense: string;
  reste: string;
  depassement?: string;
  etat: string;
}

interface DatedAmount {
  libelle: string;
  montant: string;
  date: string;
}

export interface AssistantData {
  mois: string;
  periode: "passé" | "courant" | "à venir";
  aujourdhui?: string;
  budgetVide: boolean;
  synthese: {
    revenusDuMois: string;
    totalAbonnements: string;
    revenusNets: string;
    disponible: string;
    depense: string;
    rembourse: string;
    resteDuMois: string;
    depassement?: string;
    etatDuMois: string;
    tauxEngagement?: string;
  };
  jour?: {
    parJour: string;
    depenseAujourdhui: string;
    resteAujourdhui: string;
    depassementAujourdhui?: string;
    report?: string;
    joursRestants: number;
  };
  reserve?: {
    reserveEnDebutDeMois: string;
    partDEpargneDuMois: string;
    moisRestants: number;
    horizonAtteint?: true;
    epargneEntameeCeMois: string;
    reserveEnFinDeMoisPrevue: string;
  };
  enveloppes: EnvelopeLine[];
  enveloppesTronquees?: true;
  nonBudgete?: { total: string; categories: { categorie: string; total: string }[] };
  abonnements: { libelle: string; montant: string; echeance: string }[];
  revenus: DatedAmount[];
  prochainesEcheances: DatedAmount[];
  operationsRecentes: OperationLine[];
  /**
   * Opérations du mois qui correspondent aux mots de la question (récit 4). Le total est calculé par
   * l'application : le modèle ne somme jamais lui-même.
   */
  correspondances?: {
    motsCles: string[];
    nombre: number;
    total: string;
    /** Le total est un remboursement net quand les remboursements l'emportent sur les dépenses. */
    sensDuTotal: "depense" | "remboursement";
    /** Vrai quand `operations` ne liste pas toutes les correspondances. */
    partielle?: true;
    operations: OperationLine[];
  };
  aClasser: number;
}

export interface AssistantContext {
  data: AssistantData;
  /** Valeurs réellement écrites dans `data`, pour le contrôle de la réponse. */
  known: KnownValues;
  /** `data` sérialisée, telle qu'elle est placée dans le prompt. */
  json: string;
}

/** Une dépense ou un remboursement du mois, avant mise en forme. */
interface OperationBrute {
  sens: OperationLine["sens"];
  date: IsoDate;
  libelle: string | undefined;
  categorie: string | null;
  amountCents: number;
  origine: OperationLine["origine"];
  id: string;
}

// --- Plafonds de listes ---------------------------------------------------------------------------------

interface Caps {
  operations: number;
  revenus: number;
  abonnements: number;
  categoriesNonBudgetees: number;
  enveloppes: number;
  correspondances: number;
}

const CAPS_DEPART: Caps = {
  operations: 25,
  revenus: 10,
  abonnements: 25,
  categoriesNonBudgetees: 10,
  enveloppes: 30,
  correspondances: 20,
};

/**
 * Ordre dans lequel les listes sont réduites quand le contexte dépasse sa taille (data-model §1).
 * Les agrégats (`synthese`, `jour`, `reserve`) ne sont jamais réduits.
 */
const ORDRE_DE_REDUCTION: readonly (keyof Caps)[] = [
  "operations",
  "revenus",
  "abonnements",
  "categoriesNonBudgetees",
  "enveloppes",
  "correspondances",
];

const PROCHAINES_ECHEANCES = 5;
const SANS_CATEGORIE = "Sans catégorie";

// --- Construction ---------------------------------------------------------------------------------------

/**
 * `question` sert uniquement à retrouver les opérations qu'elle évoque : elle n'est jamais copiée
 * dans le contexte, seuls ses mots-clés normalisés y figurent.
 */
export function buildAssistantContext(
  doc: BudgetDocument,
  month: MonthKey,
  today: IsoDate,
  question = "",
): AssistantContext {
  const mois = monthKeyOf(today);
  const estCourant = month === mois;
  const periode = estCourant ? "courant" : compareIso(month, mois) < 0 ? "passé" : "à venir";

  // Les calculs ont lieu une seule fois : seule la mise en forme est refaite quand on réduit.
  const depense = computeMonthlySpending(doc, month, today);
  const budget = computeMonthlyBudget(doc, month, today);
  const enveloppes = computeMonthlyEnvelopes(doc, month);
  const jour = estCourant ? computeDailyAllowance(doc, today) : null;
  const echeances = listUpcomingDues(
    doc,
    estCourant ? today : startOfMonth(month),
    PROCHAINES_ECHEANCES,
  );

  const depenses: OperationBrute[] = doc.expenses
    .filter((e) => monthKeyOf(e.date) === month)
    .map((e) => ({
      sens: "depense",
      date: e.date,
      libelle: e.label,
      categorie: e.category,
      amountCents: e.amountCents,
      origine: e.source === undefined ? "manuelle" : "banque",
      id: e.id,
    }));
  const remboursements: OperationBrute[] = doc.refunds
    .filter((r) => monthKeyOf(r.date) === month)
    .map((r) => ({
      sens: "remboursement",
      date: r.date,
      libelle: r.label,
      categorie: r.category,
      amountCents: r.amountCents,
      origine: "banque",
      id: r.id,
    }));
  // Tri déterministe : du plus récent au plus ancien, puis par libellé, montant et identifiant.
  const operations = [...depenses, ...remboursements].sort(
    (a, b) =>
      compareIso(b.date, a.date) ||
      (a.libelle ?? "").localeCompare(b.libelle ?? "", "fr") ||
      b.amountCents - a.amountCents ||
      a.id.localeCompare(b.id),
  );

  // Récupération par mots-clés (R4) : une opération correspond si l'un des mots figure dans son
  // libellé ou sa catégorie, comme dans la recherche du journal.
  const motsCles = extractKeywords(question);
  const correspondantes =
    motsCles.length === 0
      ? []
      : operations.filter((o) => {
          const champs = normalizeForSearch(`${o.libelle ?? ""} ${o.categorie ?? ""}`);
          return motsCles.some((mot) => champs.includes(mot));
        });
  // Total net, en centimes : dépenses moins remboursements, comme le journal.
  const totalNet = correspondantes.reduce(
    (somme, o) => somme + (o.sens === "depense" ? o.amountCents : -o.amountCents),
    0,
  );

  const revenus = doc.incomes.flatMap((revenu) =>
    occurrencesInMonth(revenu, month).map((date) => ({ revenu, date })),
  );

  const budgetVide =
    doc.incomes.length === 0 &&
    doc.subscriptions.length === 0 &&
    doc.expenses.length === 0 &&
    doc.envelopes.length === 0;

  function rendre(caps: Caps): { data: AssistantData; known: KnownValues } {
    const { montant, pourcentage, known } = createValueRegistry();

    const data: AssistantData = {
      mois: formatMonthFr(month),
      periode,
      ...(estCourant ? { aujourdhui: formatIsoDateFr(today) } : {}),
      budgetVide,
      synthese: {
        revenusDuMois: montant(budget.totalIncomeCents),
        totalAbonnements: montant(budget.totalChargesCents),
        revenusNets: montant(depense.incomeNetCents),
        disponible: montant(depense.availableCents),
        depense: montant(depense.spentCents),
        rembourse: montant(depense.refundedCents),
        // Comme l'anneau : jamais un reste négatif, le dépassement a son propre champ.
        resteDuMois: montant(Math.max(0, depense.remainingCents)),
        ...(depense.overspentCents > 0 ? { depassement: montant(depense.overspentCents) } : {}),
        etatDuMois: RING_STATUS_LABELS[depense.status],
        ...(budget.commitmentRate === null
          ? {}
          : { tauxEngagement: pourcentage(budget.commitmentRate) }),
      },
      enveloppes: [],
      abonnements: [],
      revenus: [],
      prochainesEcheances: echeances.map((e) => ({
        libelle: sanitizeLabel(e.label),
        montant: montant(e.amountCents),
        date: formatIsoDateFr(e.dueDate),
      })),
      operationsRecentes: [],
      aClasser: doc.banking.inbox.length,
    };

    if (jour !== null) {
      data.jour = {
        parJour: montant(jour.allowanceCents),
        depenseAujourdhui: montant(jour.spentTodayCents),
        resteAujourdhui: montant(Math.max(0, jour.remainingTodayCents)),
        ...(jour.remainingTodayCents < 0
          ? { depassementAujourdhui: montant(-jour.remainingTodayCents) }
          : {}),
        ...(jour.carryOverCents === null ? {} : { report: montant(jour.carryOverCents) }),
        joursRestants: jour.daysRemaining,
      };
    }

    if (depense.reserve !== null) {
      const reserve = depense.reserve;
      // Comme l'écran : un solde négatif se dit en toutes lettres, jamais comme un montant négatif.
      const solde = (cents: number) =>
        cents < 0 ? reserveShortfallMessage(montant(-cents)) : montant(cents);

      data.reserve = {
        reserveEnDebutDeMois: solde(reserve.openingCents),
        partDEpargneDuMois: montant(Math.max(0, reserve.shareCents)),
        moisRestants: reserve.monthsRemaining,
        ...(reserve.horizonReached ? { horizonAtteint: true as const } : {}),
        epargneEntameeCeMois: montant(reserve.drawnCents),
        reserveEnFinDeMoisPrevue: solde(reserve.closingCents),
      };
    }

    const retenues = enveloppes.envelopes.slice(0, caps.enveloppes);
    data.enveloppes = retenues.map((e) => ({
      categorie: sanitizeLabel(e.category),
      plafond: montant(e.limitCents),
      depense: montant(e.spentCents),
      reste: montant(Math.max(0, e.remainingCents)),
      ...(e.overspentCents > 0 ? { depassement: montant(e.overspentCents) } : {}),
      etat: ENVELOPE_STATE_LABELS[e.state],
    }));
    if (retenues.length < enveloppes.envelopes.length) data.enveloppesTronquees = true;

    if (enveloppes.unbudgeted.totalCents > 0) {
      data.nonBudgete = {
        total: montant(enveloppes.unbudgeted.totalCents),
        categories: enveloppes.unbudgeted.byCategory.slice(0, caps.categoriesNonBudgetees).map((l) => ({
          categorie: l.category === null ? SANS_CATEGORIE : sanitizeLabel(l.category),
          total: montant(l.totalCents),
        })),
      };
    }

    data.abonnements = budget.breakdown.slice(0, caps.abonnements).map((l) => ({
      libelle: sanitizeLabel(l.label),
      montant: montant(l.amountCents),
      echeance: formatIsoDateFr(l.dueDate),
    }));

    data.revenus = revenus.slice(0, caps.revenus).map(({ revenu, date }) => ({
      libelle: sanitizeLabel(revenu.label),
      montant: montant(revenu.amountCents),
      date: formatIsoDateFr(date),
    }));

    const ligne = (o: OperationBrute): OperationLine => ({
      date: formatIsoDateFr(o.date),
      libelle: sanitizeLabel(o.libelle),
      categorie: o.categorie === null ? SANS_CATEGORIE : sanitizeLabel(o.categorie),
      montant: montant(o.amountCents),
      sens: o.sens,
      origine: o.origine,
    });

    data.operationsRecentes = operations.slice(0, caps.operations).map(ligne);

    if (correspondantes.length > 0) {
      const listees = correspondantes.slice(0, caps.correspondances);
      data.correspondances = {
        motsCles,
        nombre: correspondantes.length,
        total: montant(Math.abs(totalNet)),
        sensDuTotal: totalNet < 0 ? "remboursement" : "depense",
        ...(listees.length < correspondantes.length ? { partielle: true as const } : {}),
        operations: listees.map(ligne),
      };
    }

    return { data, known };
  }

  // Réduction progressive : on refait la mise en forme avec des plafonds plus bas, ce qui garde le
  // registre des valeurs connues strictement égal à ce que le modèle voit (R6).
  const caps = { ...CAPS_DEPART };
  let resultat = rendre(caps);
  let json = JSON.stringify(resultat.data);

  for (const liste of ORDRE_DE_REDUCTION) {
    while (json.length > CONTEXT_MAX_CHARS && caps[liste] > 0) {
      caps[liste] = Math.floor(caps[liste] / 2);
      resultat = rendre(caps);
      json = JSON.stringify(resultat.data);
    }
  }

  return { data: resultat.data, known: resultat.known, json };
}
