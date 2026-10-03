/**
 * Moteur de règles : le sort de chaque opération bancaire.
 *
 * Voir specs/006-bank-sync/contracts/regles.md.
 *
 * Module **pur** : ni horloge, ni réseau, ni stockage. Il prend un document et des opérations,
 * il rend un nouveau document. C'est ce qui permet de le tester sur les opérations de septembre
 * sans rien simuler, et ce qui le rend **idempotent** et **indépendant de l'appareil** (R2) :
 *
 *  - une référence inscrite au registre n'est jamais retraitée ;
 *  - l'entité produite porte un identifiant déterministe, `bank:<référence>` ;
 *  - deux appareils qui traitent le même lot sur le même document produisent donc le même
 *    document.
 *
 * Il ne crée **rien à l'insu de l'utilisateur** : ce qu'aucune règle ne tranche part « À
 * classer », sans effet sur le budget tant que l'utilisateur n'a pas décidé.
 */

import { compareIso } from "@/lib/date";
import { normalizeForSearch } from "@/features/budget/expenses";
import type { BankOperation } from "@/features/banking/types";
import type {
  BudgetDocument,
  Expense,
  Id,
  InboxItem,
  InboxReason,
  LedgerEntry,
  Refund,
  TreatmentAction,
  TreatmentRule,
} from "@/features/budget/types";

const LABEL_MAX = 80;
const RAW_MAX = 500;
const MOTIF_MIN = 2;
/** Un libellé d'abonnement plus court rapprocherait tout et n'importe quoi (étape 9 bis). */
const ABONNEMENT_MIN = 3;

export type Decision =
  | { outcome: "expense"; expense: Expense; reason: string }
  | { outcome: "refund"; refund: Refund; reason: string }
  | { outcome: "ignored"; reason: string }
  | { outcome: "inbox"; item: InboxItem; reason: string }
  | { outcome: "skip" };

// --- Outils ----------------------------------------------------------------------------------

function contient(texte: string, motif: string): boolean {
  const recherche = normalizeForSearch(motif);
  return recherche !== "" && normalizeForSearch(texte).includes(recherche);
}

function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : texte.slice(0, max).trimEnd();
}

/** Libellé utilisable dans le document : non vide après nettoyage, 80 caractères au plus. */
function libelle(texte: string): string | undefined {
  const propre = tronquer(texte.trim(), LABEL_MAX);
  return propre === "" ? undefined : propre;
}

export function entityId(ref: string): Id {
  return `bank:${ref}`;
}

/** Références déjà traitées : celles du registre et les arrondis fusionnés. */
function referencesTraitees(doc: BudgetDocument): Set<string> {
  const refs = new Set<string>();
  for (const entree of doc.banking.ledger) {
    refs.add(entree.ref);
    for (const fusion of entree.mergedRefs ?? []) refs.add(fusion);
  }
  return refs;
}

function regleCorrespond(regle: TreatmentRule, bank: string, label: string, rawLabel: string): boolean {
  if (regle.bank !== null && regle.bank !== bank) return false;
  return contient(label, regle.contains) || contient(rawLabel, regle.contains);
}

function categorie(doc: BudgetDocument, label: string): string | null {
  const regle = doc.banking.categoryRules.find((r) => contient(label, r.contains));
  return regle ? regle.category : null;
}

function montantTotal(operation: BankOperation): number {
  return operation.amountCents + (operation.roundUpCents ?? 0);
}

// --- Production des entités -------------------------------------------------------------------

function depense(doc: BudgetDocument, operation: BankOperation, date: string): Expense {
  const resultat: Expense = {
    id: entityId(operation.ref),
    amountCents: montantTotal(operation),
    date,
    category: categorie(doc, operation.label),
    source: operation.bank,
    bankRef: operation.ref,
  };
  const texte = libelle(operation.label);
  if (texte !== undefined) resultat.label = texte;
  return resultat;
}

function remboursement(doc: BudgetDocument, operation: BankOperation): Refund {
  const resultat: Refund = {
    id: entityId(operation.ref),
    amountCents: operation.amountCents,
    // Le jour où l'argent revient, et non celui de l'achat initial : c'est ce jour-là que le
    // reste à dépenser augmente réellement.
    date: operation.bookingDate,
    category: categorie(doc, operation.label),
    source: operation.bank,
    bankRef: operation.ref,
  };
  const texte = libelle(operation.label);
  if (texte !== undefined) resultat.label = texte;
  return resultat;
}

function aClasser(operation: BankOperation, why: InboxReason): InboxItem {
  return {
    ref: operation.ref,
    bank: operation.bank,
    date: operation.paymentDate ?? operation.bookingDate,
    amountCents: montantTotal(operation),
    direction: operation.direction,
    kind: operation.kind,
    label: tronquer(operation.label.trim() || operation.rawLabel.trim(), LABEL_MAX),
    rawLabel: tronquer(operation.rawLabel, RAW_MAX),
    why,
  };
}

// --- Décision ----------------------------------------------------------------------------------

/**
 * Sort d'une opération. La **première** étape qui tranche l'emporte (contrat des règles, §1).
 */
export function decide(operation: BankOperation, doc: BudgetDocument): Decision {
  // 0. Déjà traitée.
  if (referencesTraitees(doc).has(operation.ref)) return { outcome: "skip" };

  // 1. Antérieure à la date de début d'import (EF-039, EF-040) : la date de paiement fait foi.
  const importFrom = doc.banking.importFrom;
  if (importFrom === null) return { outcome: "skip" };
  if (compareIso(operation.paymentDate ?? operation.bookingDate, importFrom) < 0) {
    return { outcome: "skip" };
  }

  // 7, avancée ici : un montant nul (pré-autorisation) n'a rien à compter, et ne peut pas être
  // « à classer », dont le montant est strictement positif. L'avancer ne change aucun sort.
  if (montantTotal(operation) === 0) return { outcome: "ignored", reason: "structural:zeroAmount" };

  // 2. Autre devise que l'euro (EF-038).
  if (operation.currency !== "EUR") {
    return {
      outcome: "inbox",
      item: aClasser(operation, "foreignCurrency"),
      reason: "structural:foreignCurrency",
    };
  }

  // 3. Remboursement carte : avant les règles de l'utilisateur, une règle « ignorer » visant
  //    les dépenses d'un commerçant ne doit pas faire perdre ses remboursements.
  if (operation.kind === "cardRefund") {
    return {
      outcome: "refund",
      refund: remboursement(doc, operation),
      reason: "structural:cardRefund",
    };
  }

  // 4. Tout autre crédit : les revenus restent saisis à part (EF-020).
  if (operation.direction === "credit") return { outcome: "ignored", reason: "structural:income" };

  // 5. Recharge de Revolut vue depuis LCL (EF-016) : la vraie dépense viendra de Revolut.
  if (operation.bank === "lcl" && operation.kind === "card" && /^revolut/i.test(operation.label)) {
    return { outcome: "ignored", reason: "structural:revolutTopUp" };
  }

  // 6. Recharge reçue par Revolut.
  if (operation.kind === "topUp") return { outcome: "ignored", reason: "structural:topUp" };

  // 8. Arrondi que le serveur n'a pas su rattacher à un paiement unique.
  if (operation.kind === "roundUp") {
    return {
      outcome: "inbox",
      item: aClasser(operation, "ambiguousRoundUp"),
      reason: "structural:roundUp",
    };
  }

  // 9. Règles de l'utilisateur, dans l'ordre.
  const regle = doc.banking.rules.find((r) =>
    regleCorrespond(r, operation.bank, operation.label, operation.rawLabel),
  );
  if (regle) {
    const reason = `rule:${regle.id}`;
    if (regle.action.type === "expense") {
      return {
        outcome: "expense",
        // Un prélèvement ou un virement n'a pas de date de paiement : celle du débit s'applique.
        expense: depense(doc, operation, operation.paymentDate ?? operation.bookingDate),
        reason,
      };
    }
    // `ignore`, et `subscription` — y compris vers un abonnement supprimé depuis : l'opération
    // reste un paiement d'abonnement, déjà compté dans les charges.
    return { outcome: "ignored", reason };
  }

  // 9 bis. Probable paiement d'un abonnement déjà saisi : on ne l'importe pas, on demande.
  if (operation.kind === "card" || operation.kind === "directDebit") {
    const ressemble = doc.subscriptions.some(
      (abonnement) =>
        normalizeForSearch(abonnement.label).length >= ABONNEMENT_MIN &&
        contient(operation.label, abonnement.label),
    );
    if (ressemble) {
      return {
        outcome: "inbox",
        item: aClasser(operation, "possibleSubscription"),
        reason: "structural:possibleSubscription",
      };
    }
  }

  // 10 et 11. Paiement carte : importé à la date du paiement, ou « à classer » sans elle.
  if (operation.kind === "card") {
    if (operation.paymentDate !== null) {
      return {
        outcome: "expense",
        expense: depense(doc, operation, operation.paymentDate),
        reason: "structural:card",
      };
    }
    return {
      outcome: "inbox",
      item: aClasser(operation, "unreadableDate"),
      reason: "structural:card",
    };
  }

  // 12. Tout le reste : virement sortant, prélèvement, frais, nature inconnue.
  return { outcome: "inbox", item: aClasser(operation, "noRule"), reason: "structural:unknown" };
}

// --- Application -------------------------------------------------------------------------------

function inscrire(doc: BudgetDocument, entree: LedgerEntry): BudgetDocument {
  return { ...doc, banking: { ...doc.banking, ledger: [...doc.banking.ledger, entree] } };
}

function appliquer(doc: BudgetDocument, operation: BankOperation, decision: Decision): BudgetDocument {
  if (decision.outcome === "skip") return doc;

  const entree: LedgerEntry = { ref: operation.ref, outcome: decision.outcome, reason: decision.reason };
  if (operation.roundUpRef !== undefined) entree.mergedRefs = [operation.roundUpRef];
  const inscrit = inscrire(doc, entree);

  switch (decision.outcome) {
    case "expense":
      return { ...inscrit, expenses: [...inscrit.expenses, decision.expense] };
    case "refund":
      return { ...inscrit, refunds: [...inscrit.refunds, decision.refund] };
    case "inbox":
      return { ...inscrit, banking: { ...inscrit.banking, inbox: [...inscrit.banking.inbox, decision.item] } };
    case "ignored":
      return inscrit;
  }
}

/**
 * Arrondi arrivé **après** le traitement de son paiement (R8) : la fusion n'est plus possible
 * sans modifier une dépense que l'utilisateur a pu corriger. L'arrondi part « À classer ».
 */
function arrondiTardif(doc: BudgetDocument, operation: BankOperation): BudgetDocument {
  const reference = operation.roundUpRef;
  const montant = operation.roundUpCents;
  if (reference === undefined || montant === undefined) return doc;
  if (referencesTraitees(doc).has(reference)) return doc;

  const item: InboxItem = {
    ref: reference,
    bank: operation.bank,
    date: operation.bookingDate,
    amountCents: montant,
    direction: "debit",
    kind: "roundUp",
    label: tronquer(`Arrondi · ${operation.label}`, LABEL_MAX),
    rawLabel: "Revpoints Spare Change",
    why: "ambiguousRoundUp",
  };
  const inscrit = inscrire(doc, { ref: reference, outcome: "inbox", reason: "structural:lateRoundUp" });
  return { ...inscrit, banking: { ...inscrit.banking, inbox: [...inscrit.banking.inbox, item] } };
}

/**
 * Traite un lot d'opérations. Chaque opération voit les inscriptions des précédentes.
 *
 * Rend **le même objet** si rien n'a changé : l'appelant n'écrit alors rien et ne déclenche
 * aucune synchronisation.
 */
export function processBatch(
  operations: readonly BankOperation[],
  doc: BudgetDocument,
): BudgetDocument {
  let courant = doc;
  for (const operation of operations) {
    const decision = decide(operation, courant);
    if (decision.outcome === "skip") {
      // Un paiement déjà traité peut revenir complété d'un arrondi arrivé entre-temps.
      if (referencesTraitees(courant).has(operation.ref)) courant = arrondiTardif(courant, operation);
      continue;
    }
    courant = appliquer(courant, operation, decision);
  }
  return courant;
}

// --- Classement manuel (« À classer », contrat §4) ------------------------------------------------

function retirerDeLaListe(doc: BudgetDocument, ref: string, outcome: "expense" | "ignored", reason: string): BudgetDocument {
  return {
    ...doc,
    banking: {
      ...doc.banking,
      inbox: doc.banking.inbox.filter((item) => item.ref !== ref),
      ledger: doc.banking.ledger.map((entree) =>
        entree.ref === ref ? { ...entree, outcome, reason } : entree,
      ),
    },
  };
}

function trouver(doc: BudgetDocument, ref: string): InboxItem | undefined {
  return doc.banking.inbox.find((item) => item.ref === ref);
}

/** « Dépense » : l'élément devient une dépense à sa date. */
export function classifyAsExpense(
  doc: BudgetDocument,
  ref: string,
  category: string | null,
): BudgetDocument {
  const item = trouver(doc, ref);
  if (!item) return doc;

  const nouvelle: Expense = {
    id: entityId(ref),
    amountCents: item.amountCents,
    date: item.date,
    category: category !== null && category.trim() !== "" ? tronquer(category.trim(), LABEL_MAX) : categorie(doc, item.label),
    source: item.bank,
    bankRef: ref,
  };
  const texte = libelle(item.label);
  if (texte !== undefined) nouvelle.label = texte;

  const classe = retirerDeLaListe(doc, ref, "expense", "user:classified");
  return { ...classe, expenses: [...classe.expenses, nouvelle] };
}

/** « Ignorer » : l'élément quitte la liste sans effet sur le budget, définitivement. */
export function classifyAsIgnored(doc: BudgetDocument, ref: string): BudgetDocument {
  if (!trouver(doc, ref)) return doc;
  return retirerDeLaListe(doc, ref, "ignored", "user:classified");
}

export type RuleOutcome = { ok: true; document: BudgetDocument } | { ok: false; reason: "invalidPattern" };

/**
 * « Toujours ignorer » ou « Rattacher à l'abonnement » : l'élément est ignoré, et une règle est
 * ajoutée **en tête**. Elle s'applique aux opérations futures et aux autres éléments encore « À
 * classer » qu'elle vise ; elle ne revient jamais sur un sort déjà tranché.
 */
export function classifyWithRule(
  doc: BudgetDocument,
  ref: string,
  regle: { id: Id; contains: string; action: Exclude<TreatmentAction, { type: "expense" }> },
): RuleOutcome {
  const item = trouver(doc, ref);
  const motif = regle.contains.trim();
  if (motif.length < MOTIF_MIN || motif.length > LABEL_MAX) return { ok: false, reason: "invalidPattern" };
  if (!item) return { ok: true, document: doc };

  const nouvelle: TreatmentRule = { id: regle.id, bank: item.bank, contains: motif, action: regle.action };
  let courant: BudgetDocument = {
    ...doc,
    banking: { ...doc.banking, rules: [nouvelle, ...doc.banking.rules] },
  };

  const reason = `rule:${regle.id}`;
  for (const autre of doc.banking.inbox) {
    const visee =
      autre.ref === ref ||
      // Un crédit n'est jamais visé par une règle (contrat : étape 4 avant l'étape 9).
      (autre.direction === "debit" &&
        regleCorrespond(nouvelle, autre.bank, autre.label, autre.rawLabel));
    if (visee) courant = retirerDeLaListe(courant, autre.ref, "ignored", reason);
  }
  return { ok: true, document: courant };
}

// --- Gestion des règles par l'utilisateur (récit 6) -----------------------------------------------
//
// Les règles sont celles de l'utilisateur, initiales comprises : il peut toutes les modifier et
// les supprimer. Aucune de ces fonctions ne revient sur un sort déjà tranché ni sur une dépense
// déjà importée : une règle ne vaut que pour les opérations à venir.

export type RuleEditFailure = "invalidPattern" | "invalidCategory";

export type RuleEditOutcome =
  | { ok: true; document: BudgetDocument }
  | { ok: false; reason: RuleEditFailure };

function motifValide(motif: string): boolean {
  return motif.length >= MOTIF_MIN && motif.length <= LABEL_MAX;
}

function categorieValide(nom: string): boolean {
  return nom.length >= 1 && nom.length <= LABEL_MAX;
}

/**
 * « Appliquer à ce commerçant » : nouvelle règle de catégorie, ajoutée **en tête** pour
 * l'emporter sur une règle plus générale déjà présente. Les dépenses passées ne changent pas.
 */
export function addCategoryRule(
  doc: BudgetDocument,
  regle: { id: Id; contains: string; category: string },
): RuleEditOutcome {
  const contains = regle.contains.trim();
  const category = regle.category.trim();
  if (!motifValide(contains)) return { ok: false, reason: "invalidPattern" };
  if (!categorieValide(category)) return { ok: false, reason: "invalidCategory" };

  return {
    ok: true,
    document: {
      ...doc,
      banking: {
        ...doc.banking,
        categoryRules: [{ id: regle.id, contains, category }, ...doc.banking.categoryRules],
      },
    },
  };
}

/** Modifie le motif ou la catégorie d'une règle de catégorie, sans changer son rang. */
export function updateCategoryRule(
  doc: BudgetDocument,
  id: Id,
  modification: { contains: string; category: string },
): RuleEditOutcome {
  const contains = modification.contains.trim();
  const category = modification.category.trim();
  if (!motifValide(contains)) return { ok: false, reason: "invalidPattern" };
  if (!categorieValide(category)) return { ok: false, reason: "invalidCategory" };

  return {
    ok: true,
    document: {
      ...doc,
      banking: {
        ...doc.banking,
        categoryRules: doc.banking.categoryRules.map((regle) =>
          regle.id === id ? { ...regle, contains, category } : regle,
        ),
      },
    },
  };
}

/**
 * Modifie le motif d'une règle de traitement, sans changer son rang, sa banque ni son action.
 * Le registre garde la trace des opérations que l'ancien motif a tranchées : elles ne sont pas
 * retraitées.
 */
export function updateTreatmentRule(doc: BudgetDocument, id: Id, contains: string): RuleEditOutcome {
  const motif = contains.trim();
  if (!motifValide(motif)) return { ok: false, reason: "invalidPattern" };

  return {
    ok: true,
    document: {
      ...doc,
      banking: {
        ...doc.banking,
        rules: doc.banking.rules.map((regle) =>
          regle.id === id ? { ...regle, contains: motif } : regle,
        ),
      },
    },
  };
}

export type TagOutcome =
  | { ok: true; document: BudgetDocument }
  | { ok: false; reason: "invalidPattern" | "unknownExpense" | "unknownSubscription" };

/**
 * « Marquer comme abonnement » : la dépense est en réalité le paiement d'un abonnement, déjà
 * compté dans les charges du mois. Elle est donc **retirée** des dépenses — la garder la
 * compterait deux fois.
 *
 * Pour une dépense importée, une règle de rattachement est ajoutée en tête : les prochains
 * paiements du même commerçant seront ignorés à l'import, et les éléments encore « À classer »
 * qu'elle vise le sont aussitôt. Le registre retient que l'opération a été tranchée, si bien
 * qu'elle n'est jamais réimportée. Les dépenses déjà importées d'autres mois ne sont pas
 * retouchées : une règle ne vaut que pour l'avenir.
 *
 * Pour une dépense saisie à la main, il n'y a ni banque ni libellé bancaire : aucune règle,
 * la dépense est simplement retirée.
 */
export function tagExpenseAsSubscription(
  doc: BudgetDocument,
  expenseId: Id,
  regle: { id: Id; subscriptionId: Id; contains: string },
): TagOutcome {
  const visee = doc.expenses.find((d) => d.id === expenseId);
  if (!visee) return { ok: false, reason: "unknownExpense" };
  if (!doc.subscriptions.some((a) => a.id === regle.subscriptionId)) {
    return { ok: false, reason: "unknownSubscription" };
  }

  const sansLaDepense: BudgetDocument = {
    ...doc,
    expenses: doc.expenses.filter((d) => d.id !== expenseId),
  };
  if (visee.source === undefined || visee.bankRef === undefined) {
    return { ok: true, document: sansLaDepense };
  }

  const motif = regle.contains.trim();
  if (!motifValide(motif)) return { ok: false, reason: "invalidPattern" };

  const nouvelle: TreatmentRule = {
    id: regle.id,
    bank: visee.source,
    contains: motif,
    action: { type: "subscription", subscriptionId: regle.subscriptionId },
  };
  const reason = `rule:${regle.id}`;
  const reference = visee.bankRef;

  let courant: BudgetDocument = {
    ...sansLaDepense,
    banking: {
      ...sansLaDepense.banking,
      rules: [nouvelle, ...sansLaDepense.banking.rules],
      ledger: sansLaDepense.banking.ledger.map((entree) =>
        entree.ref === reference ? { ...entree, outcome: "ignored", reason } : entree,
      ),
    },
  };

  for (const element of doc.banking.inbox) {
    // Un crédit n'est jamais visé par une règle (contrat : étape 4 avant l'étape 9).
    if (
      element.direction === "debit" &&
      regleCorrespond(nouvelle, element.bank, element.label, element.rawLabel)
    ) {
      courant = retirerDeLaListe(courant, element.ref, "ignored", reason);
    }
  }
  return { ok: true, document: courant };
}

/**
 * Supprime une règle, de traitement ou de catégorie. Ce qu'elle a déjà tranché reste tranché :
 * une opération ignorée par cette règle ne réapparaît pas.
 */
export function removeRule(doc: BudgetDocument, id: Id): BudgetDocument {
  return {
    ...doc,
    banking: {
      ...doc.banking,
      rules: doc.banking.rules.filter((regle) => regle.id !== id),
      categoryRules: doc.banking.categoryRules.filter((regle) => regle.id !== id),
    },
  };
}
