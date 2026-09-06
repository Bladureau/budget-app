/**
 * Persistance du document budgétaire.
 *
 * Voir specs/002-income-subscriptions-budget/contracts/stockage.md.
 *
 * Deux règles gouvernent ce module :
 *  - Principe IV : `localStorage` est une frontière de confiance. Tout ce qui en sort part
 *    d'`unknown` et passe par un analyseur ; aucun transtypage.
 *  - Constitution, contraintes de données : la perte de données n’est jamais acceptable. Un
 *    document illisible n’est PAS écrasé, il est mis en quarantaine sous une clé distincte.
 */

import { compareIso, isValidIsoDate } from "@/lib/date";
import {
  DOCUMENT_VERSION,
  MONTHS_PER_PERIOD,
  emptyDocument,
} from "@/features/budget/types";
import type {
  AmountPeriod,
  BudgetDocument,
  Income,
  IsoDate,
  PausePeriod,
  Periodicity,
  Subscription,
} from "@/features/budget/types";

export const STORAGE_KEY = "budget-app:v1";
export const CORRUPTED_KEY_PREFIX = "budget-app:corrupted:";

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

export type SaveResult = { ok: true } | { ok: false; reason: "invalidData" | "writeFailed" };

export interface LoadResult {
  document: BudgetDocument;
  /** Vrai si un contenu illisible a été écarté et conservé sous une clé de quarantaine. */
  quarantined: boolean;
}

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

// --- Migrations -------------------------------------------------------------------------

/**
 * Migration ascendante. Aucune migration n’existe encore : la version 1 est la première.
 * La fonctionnalité 003 ajoutera la version 2 (collection `expenses`, ajout purement
 * additif). Voir contracts/stockage.md.
 */
function migrer(brut: Record<string, unknown>, depuis: number): Record<string, unknown> | null {
  if (depuis === DOCUMENT_VERSION) return brut;
  return null;
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

  if (!Array.isArray(migre.incomes) || !Array.isArray(migre.subscriptions)) {
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

  const identifiants = [...incomes, ...subscriptions].map((e) => e.id);
  if (new Set(identifiants).size !== identifiants.length) {
    return { ok: false, reason: "invalidData" };
  }

  return { ok: true, value: { version: DOCUMENT_VERSION, incomes, subscriptions } };
}

// --- Accès au stockage ------------------------------------------------------------------

function stockageDisponible(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Navigation privée ou stockage désactivé : l’accès lui-même peut lever.
    return null;
  }
}

function mettreEnQuarantaine(stockage: Storage, brut: string): void {
  try {
    stockage.setItem(`${CORRUPTED_KEY_PREFIX}${new Date().toISOString()}`, brut);
    stockage.removeItem(STORAGE_KEY);
  } catch {
    // Si la quarantaine échoue faute de place, on laisse le document d’origine en place :
    // mieux vaut redémarrer à vide à chaque ouverture que détruire des données.
  }
}

export function loadDocument(): LoadResult {
  const stockage = stockageDisponible();
  if (!stockage) return { document: emptyDocument(), quarantined: false };

  const brut = stockage.getItem(STORAGE_KEY);
  if (brut === null || brut.trim() === "") {
    return { document: emptyDocument(), quarantined: false };
  }

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    mettreEnQuarantaine(stockage, brut);
    return { document: emptyDocument(), quarantined: true };
  }

  const resultat = parseDocument(analyse);
  if (!resultat.ok) {
    mettreEnQuarantaine(stockage, brut);
    return { document: emptyDocument(), quarantined: true };
  }

  return { document: resultat.value, quarantined: false };
}

export function saveDocument(document: BudgetDocument): SaveResult {
  // Revalidation avant écriture : un document invalide n’est jamais persisté.
  const controle = parseDocument(document);
  if (!controle.ok) return { ok: false, reason: "invalidData" };

  const stockage = stockageDisponible();
  if (!stockage) return { ok: false, reason: "writeFailed" };

  try {
    stockage.setItem(STORAGE_KEY, JSON.stringify(controle.value));
    return { ok: true };
  } catch {
    // Quota dépassé ou stockage indisponible : l’échec remonte, il n’est jamais silencieux.
    return { ok: false, reason: "writeFailed" };
  }
}

/** Identifiant opaque pour une nouvelle entité. */
export function newId(): string {
  return crypto.randomUUID();
}
