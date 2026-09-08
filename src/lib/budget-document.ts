/**
 * Analyse et migration du document budgétaire.
 *
 * Voir specs/005-server-side-storage/plan.md (décision D10).
 *
 * Ce module est **pur** : il ne touche ni `localStorage`, ni le système de fichiers, ni le
 * réseau. Il tient une seule responsabilité — transformer une valeur `unknown` en
 * `BudgetDocument` valide, ou la refuser en disant pourquoi.
 *
 * Cette pureté est ce qui lui permet d'avoir **deux** consommateurs :
 *  - `src/lib/storage.ts`, qui lit le navigateur ;
 *  - `src/lib/server/budget-store.ts`, qui lit le stockage central.
 *
 * Les deux franchissent une frontière de confiance au sens du principe IV. En écrire un second
 * analyseur garantirait leur divergence : c'est la seule raison de cette extraction, et elle
 * suffit — le module a deux appelants réels dès aujourd'hui, il n'anticipe rien.
 */

import { compareIso, isValidIsoDate, isValidMonthKey } from "@/lib/date";
import {
  DOCUMENT_VERSION,
  MONTHS_PER_PERIOD,
} from "@/features/budget/types";
import type {
  AmountPeriod,
  BudgetDocument,
  Envelope,
  Expense,
  Income,
  IsoDate,
  PausePeriod,
  Periodicity,
  Subscription,
} from "@/features/budget/types";

const LABEL_MAX = 80;
const MAX_CENTS = 9_000_000_000;

export type ParseFailure =
  | "notAnObject"
  | "unknownVersion"
  | "futureVersion"
  | "invalidData";

export type ParseResult =
  | { ok: true; value: BudgetDocument }
  | { ok: false; reason: ParseFailure };

// --- Analyseurs élémentaires -----------------------------------------------------------

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function libelleValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.trim().length >= 1 && valeur.length <= LABEL_MAX;
}

function montantValide(valeur: unknown): valeur is number {
  return (
    typeof valeur === "number" &&
    Number.isInteger(valeur) &&
    valeur > 0 &&
    valeur <= MAX_CENTS
  );
}

function dateValide(valeur: unknown): valeur is IsoDate {
  return typeof valeur === "string" && isValidIsoDate(valeur);
}

function dateOuNull(valeur: unknown): valeur is IsoDate | null {
  return valeur === null || dateValide(valeur);
}

function identifiantValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length <= 100;
}

function periodiciteValide(valeur: unknown): valeur is Periodicity {
  return typeof valeur === "string" && valeur in MONTHS_PER_PERIOD;
}

// --- Analyseurs d’entités ---------------------------------------------------------------

function analyserRevenu(brut: unknown): Income | null {
  if (!estObjet(brut)) return null;
  if (!identifiantValide(brut.id)) return null;
  if (!libelleValide(brut.label)) return null;
  if (!montantValide(brut.amountCents)) return null;

  if (brut.kind === "oneOff") {
    if (!dateValide(brut.date)) return null;
    return {
      id: brut.id,
      label: brut.label,
      amountCents: brut.amountCents,
      kind: "oneOff",
      date: brut.date,
    };
  }

  if (brut.kind === "recurring") {
    if (!periodiciteValide(brut.periodicity)) return null;
    if (!dateValide(brut.startDate)) return null;
    if (!dateOuNull(brut.endDate)) return null;
    if (brut.endDate !== null && compareIso(brut.endDate, brut.startDate) < 0) return null;
    return {
      id: brut.id,
      label: brut.label,
      amountCents: brut.amountCents,
      kind: "recurring",
      periodicity: brut.periodicity,
      startDate: brut.startDate,
      endDate: brut.endDate,
    };
  }

  return null;
}

function analyserPeriodesMontant(brut: unknown, debut: IsoDate): AmountPeriod[] | null {
  if (!Array.isArray(brut) || brut.length === 0) return null;

  const periodes: AmountPeriod[] = [];
  for (const element of brut) {
    if (!estObjet(element)) return null;
    if (!montantValide(element.amountCents)) return null;
    if (!dateValide(element.effectiveFrom)) return null;
    periodes.push({
      amountCents: element.amountCents,
      effectiveFrom: element.effectiveFrom,
    });
  }

  // Invariants du modèle : tri strictement croissant, et première période alignée sur le
  // début de l’abonnement. Un historique désordonné rendrait `amountAt` indéterminé.
  for (let i = 1; i < periodes.length; i += 1) {
    if (compareIso(periodes[i - 1].effectiveFrom, periodes[i].effectiveFrom) >= 0) return null;
  }
  if (periodes[0].effectiveFrom !== debut) return null;

  return periodes;
}

function analyserPauses(brut: unknown): PausePeriod[] | null {
  if (brut === undefined) return [];
  if (!Array.isArray(brut)) return null;

  const pauses: PausePeriod[] = [];
  for (const element of brut) {
    if (!estObjet(element)) return null;
    if (!dateValide(element.from)) return null;
    if (!dateOuNull(element.to)) return null;
    if (element.to !== null && compareIso(element.to, element.from) < 0) return null;
    pauses.push({ from: element.from, to: element.to });
  }

  const triees = [...pauses].sort((a, b) => compareIso(a.from, b.from));
  for (let i = 1; i < triees.length; i += 1) {
    const precedente = triees[i - 1];
    if (precedente.to === null) return null; // une pause sans terme ne peut être suivie
    if (compareIso(triees[i].from, precedente.to) <= 0) return null; // chevauchement
  }

  return pauses;
}

function analyserAbonnement(brut: unknown): Subscription | null {
  if (!estObjet(brut)) return null;
  if (!identifiantValide(brut.id)) return null;
  if (!libelleValide(brut.label)) return null;
  if (!periodiciteValide(brut.periodicity)) return null;
  if (!dateValide(brut.startDate)) return null;
  if (!dateOuNull(brut.endDate)) return null;
  if (brut.endDate !== null && compareIso(brut.endDate, brut.startDate) < 0) return null;

  const amounts = analyserPeriodesMontant(brut.amounts, brut.startDate);
  if (!amounts) return null;

  const pauses = analyserPauses(brut.pauses);
  if (!pauses) return null;

  return {
    id: brut.id,
    label: brut.label,
    periodicity: brut.periodicity,
    startDate: brut.startDate,
    endDate: brut.endDate,
    amounts,
    pauses,
  };
}

function analyserDepense(brut: unknown): Expense | null {
  if (!estObjet(brut)) return null;
  if (!identifiantValide(brut.id)) return null;
  if (!montantValide(brut.amountCents)) return null;
  if (!dateValide(brut.date)) return null;

  // Le libellé est facultatif, mais s'il est présent il doit être exploitable : une chaîne
  // vide serait un libellé « présent et inutile », pire qu'une absence.
  let label: string | undefined;
  if (brut.label !== undefined && brut.label !== null) {
    if (!libelleValide(brut.label)) return null;
    label = brut.label;
  }

  let category: string | null = null;
  if (brut.category !== undefined && brut.category !== null) {
    if (!libelleValide(brut.category)) return null;
    category = brut.category;
  }

  const depense: Expense = {
    id: brut.id,
    amountCents: brut.amountCents,
    date: brut.date,
    category,
  };
  if (label !== undefined) depense.label = label;
  return depense;
}

function analyserEnveloppe(brut: unknown): Envelope | null {
  if (!estObjet(brut)) return null;
  if (!identifiantValide(brut.id)) return null;
  if (!libelleValide(brut.category)) return null;
  if (typeof brut.month !== "string" || !isValidMonthKey(brut.month)) return null;

  // Seule exception du projet à `montantValide` : un plafond de zéro est une intention
  // explicite — « ne rien dépenser ici » — et non l'absence de valeur, laquelle se traduit
  // par l'absence d'enveloppe.
  const plafond = brut.limitCents;
  if (
    typeof plafond !== "number" ||
    !Number.isInteger(plafond) ||
    plafond < 0 ||
    plafond > MAX_CENTS
  ) {
    return null;
  }

  return {
    id: brut.id,
    category: brut.category,
    month: brut.month,
    limitCents: plafond,
  };
}

// --- Migrations -------------------------------------------------------------------------

/**
 * Migration ascendante. Voir specs/002-income-subscriptions-budget/contracts/stockage.md.
 *
 * La fonctionnalité 005 déplace le stockage sans toucher au schéma : le document reste en
 * version 3, et ces deux étapes servent désormais **aussi** au stockage central, qui peut
 * détenir un fichier écrit par une version antérieure de l'application (EF-006, EF-007).
 */
function migrer(brut: Record<string, unknown>, depuis: number): Record<string, unknown> | null {
  let document = brut;
  let version = depuis;

  // 1 → 2 : ajout de la collection `expenses`, PUREMENT ADDITIF. `incomes` et
  // `subscriptions` sont repris tels quels, sans transformation : une migration qui ne
  // modifie rien ne peut rien perdre. C'est ce qui la rend sûre, et c'est pourquoi il ne
  // faut pas en profiter pour « nettoyer » autre chose au passage.
  if (version === 1) {
    document = { ...document, version: 2, expenses: [] };
    version = 2;
  }

  // 2 → 3 : ajout de la collection `envelopes`, également purement additif. Les deux étapes
  // se composent : un document en version 1 les traverse toutes les deux.
  if (version === 2) {
    document = { ...document, version: 3, envelopes: [] };
    version = 3;
  }

  return version === DOCUMENT_VERSION ? document : null;
}

// --- Analyseur du document --------------------------------------------------------------

export function parseDocument(brut: unknown): ParseResult {
  if (!estObjet(brut)) return { ok: false, reason: "notAnObject" };

  const version = brut.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "unknownVersion" };
  }
  // Une version supérieure signale un document écrit par une version plus récente de
  // l’application : l’écraser détruirait des données que celle-ci ne sait pas lire.
  if (version > DOCUMENT_VERSION) return { ok: false, reason: "futureVersion" };

  const migre = migrer(brut, version);
  if (!migre) return { ok: false, reason: "unknownVersion" };

  if (
    !Array.isArray(migre.incomes) ||
    !Array.isArray(migre.subscriptions) ||
    !Array.isArray(migre.expenses) ||
    !Array.isArray(migre.envelopes)
  ) {
    return { ok: false, reason: "invalidData" };
  }

  const incomes: Income[] = [];
  for (const element of migre.incomes) {
    const revenu = analyserRevenu(element);
    if (!revenu) return { ok: false, reason: "invalidData" };
    incomes.push(revenu);
  }

  const subscriptions: Subscription[] = [];
  for (const element of migre.subscriptions) {
    const abonnement = analyserAbonnement(element);
    if (!abonnement) return { ok: false, reason: "invalidData" };
    subscriptions.push(abonnement);
  }

  const expenses: Expense[] = [];
  for (const element of migre.expenses) {
    const depense = analyserDepense(element);
    if (!depense) return { ok: false, reason: "invalidData" };
    expenses.push(depense);
  }

  const envelopes: Envelope[] = [];
  for (const element of migre.envelopes) {
    const enveloppe = analyserEnveloppe(element);
    if (!enveloppe) return { ok: false, reason: "invalidData" };
    envelopes.push(enveloppe);
  }

  // L'unicité des identifiants porte sur le document entier : aucune entité ne peut
  // partager le sien avec une autre, quel qu'en soit le type.
  const identifiants = [...incomes, ...subscriptions, ...expenses, ...envelopes].map(
    (e) => e.id,
  );
  if (new Set(identifiants).size !== identifiants.length) {
    return { ok: false, reason: "invalidData" };
  }

  // Invariant propre aux enveloppes : au plus une par couple catégorie/mois (EF-005).
  const couples = envelopes.map((e) => `${e.month} ${e.category}`);
  if (new Set(couples).size !== couples.length) {
    return { ok: false, reason: "invalidData" };
  }

  return {
    ok: true,
    value: { version: DOCUMENT_VERSION, incomes, subscriptions, expenses, envelopes },
  };
}
