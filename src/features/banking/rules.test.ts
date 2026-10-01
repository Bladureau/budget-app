// @vitest-environment node

/**
 * Moteur de règles — contrat des règles.
 *
 * Les opérations sont produites par les **vrais** normalisateurs à partir des jeux d'essai
 * synthétiques : le test couvre ainsi la chaîne complète, de la transaction brute au sort.
 */

import { describe, expect, it } from "vitest";

import {
  classifyAsExpense,
  classifyAsIgnored,
  classifyWithRule,
  decide,
  entityId,
  processBatch,
} from "@/features/banking/rules";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Subscription } from "@/features/budget/types";
import type { BankOperation } from "@/features/banking/types";
import { normalizeLclBatch } from "@/lib/server/banking/normalize-lcl";
import { mergeRoundUps, normalizeRevolutBatch } from "@/lib/server/banking/normalize-revolut";
import {
  LCL_NATURES,
  REVOLUT_SEPTEMBRE,
  lclBrute,
  lclCarte,
  revolutBrute,
} from "@/lib/server/banking/fixtures";

const spotify: Subscription = {
  id: "abo-spotify",
  label: "Spotify",
  periodicity: "monthly",
  startDate: "2026-01-14",
  endDate: null,
  amounts: [{ amountCents: 707, effectiveFrom: "2026-01-14" }],
  pauses: [],
};

function budget(importFrom: string | null = "2026-09-01", surcharge: Partial<BudgetDocument> = {}): BudgetDocument {
  const doc = emptyDocument();
  return { ...doc, banking: { ...doc.banking, importFrom }, ...surcharge };
}

const lcl = (brutes: unknown[]) => normalizeLclBatch(brutes).operations;
const revolut = (brutes: unknown[]) => mergeRoundUps(normalizeRevolutBatch(brutes).operations);
const une = (operations: BankOperation[]) => operations[0];

// --- Étapes du contrat, une à une -------------------------------------------------------------

describe("decide — ordre d'évaluation", () => {
  it("0. ne retraite jamais une référence inscrite au registre", () => {
    const operation = une(lcl([LCL_NATURES.carte]));
    const doc = processBatch([operation], budget());
    expect(decide(operation, doc)).toEqual({ outcome: "skip" });
  });

  it("0. ne retraite jamais un arrondi déjà fusionné", () => {
    const [paiement] = revolut([
      revolutBrute("a", "2026-10-02", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      revolutBrute("p", "2026-10-02", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"),
    ]);
    const doc = processBatch([paiement], budget());
    const arrondiSeul = une(revolut([revolutBrute("a", "2026-10-02", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change")]));
    expect(decide(arrondiSeul, doc)).toEqual({ outcome: "skip" });
  });

  it("1. ignore sans l'inscrire une opération payée avant la date de début", () => {
    // Payé le 30/09, débité le 02/10 : c'est la date de paiement qui fait foi (EF-040).
    const operation = une(lcl([lclCarte("x", "2026-10-02", "8.00", "BOULANGERIE", "30/09/26")]));
    expect(decide(operation, budget("2026-10-01"))).toEqual({ outcome: "skip" });
  });

  it("1. ne traite rien tant que la date de début n'est pas fixée", () => {
    expect(decide(une(lcl([LCL_NATURES.carte])), budget(null))).toEqual({ outcome: "skip" });
  });

  it("2. envoie « À classer » une opération dans une autre devise", () => {
    const operation: BankOperation = { ...une(lcl([LCL_NATURES.carte])), currency: "USD" };
    expect(decide(operation, budget())).toMatchObject({ outcome: "inbox", item: { why: "foreignCurrency" } });
  });

  it("3. fait d'un remboursement carte un remboursement daté du jour de crédit", () => {
    const decision = decide(une(lcl([LCL_NATURES.remboursement])), budget());
    expect(decision).toEqual({
      outcome: "refund",
      reason: "structural:cardRefund",
      refund: {
        id: "bank:lcl:l-rembourse",
        amountCents: 499,
        date: "2026-09-07",
        label: "Twitch Interacti",
        category: null,
        source: "lcl",
        bankRef: "lcl:l-rembourse",
      },
    });
  });

  it("3. passe avant une règle de l'utilisateur qui viserait le commerçant", () => {
    const doc = budget();
    doc.banking.rules.unshift({ id: "r", bank: null, contains: "Twitch", action: { type: "ignore" } });
    expect(decide(une(lcl([LCL_NATURES.remboursement])), doc).outcome).toBe("refund");
  });

  it("4. ignore un crédit, même visé par une règle « dépense »", () => {
    const doc = budget();
    doc.banking.rules.unshift({ id: "r", bank: null, contains: "CAF", action: { type: "expense" } });
    expect(decide(une(lcl([LCL_NATURES.virementEntrant])), doc)).toEqual({
      outcome: "ignored",
      reason: "structural:income",
    });
  });

  it("5. ignore une recharge Revolut vue depuis LCL", () => {
    expect(decide(une(lcl([LCL_NATURES.rechargeRevolut])), budget())).toEqual({
      outcome: "ignored",
      reason: "structural:revolutTopUp",
    });
  });

  it("6. ignore une recharge reçue par Revolut", () => {
    const operation = une(revolut([revolutBrute("t", "2026-10-02", "10.00", "CRDT", "TOPUP", "Top-Up by *0000", null)]));
    // Un crédit : l'étape 4 tranche avant l'étape 6, pour le même sort.
    expect(decide(operation, budget()).outcome).toBe("ignored");
  });

  it("7. ignore un paiement à 0,00 €", () => {
    const operation = une(revolut([revolutBrute("h", "2026-10-02", "0.00", "DBIT", "CARD_PAYMENT", "Google *temporary Hold")]));
    expect(decide(operation, budget())).toEqual({ outcome: "ignored", reason: "structural:zeroAmount" });
  });

  it("8. envoie « À classer » un arrondi non fusionné", () => {
    const operation = une(revolut([revolutBrute("a", "2026-10-02", "0.70", "DBIT", "TRANSFER", "Revpoints Spare Change")]));
    expect(decide(operation, budget())).toMatchObject({ outcome: "inbox", item: { why: "ambiguousRoundUp" } });
  });

  it("9. applique la première règle de l'utilisateur, sans tenir compte de la casse", () => {
    const decision = decide(une(lcl([LCL_NATURES.virementInstantane])), budget());
    expect(decision).toEqual({ outcome: "ignored", reason: "rule:initial:loyer" });
  });

  it("9. respecte la banque d'une règle", () => {
    const operation = une(revolut([revolutBrute("v", "2026-10-02", "700.00", "DBIT", "TRANSFER", "Loyer")]));
    // La règle « LOYER » est réservée à LCL : côté Revolut, le virement reste à classer.
    expect(decide(operation, budget()).outcome).toBe("inbox");
  });

  it("9. importe en dépense un prélèvement visé par une règle, daté du débit", () => {
    const decision = decide(une(lcl([LCL_NATURES.prelevement])), budget());
    expect(decision).toMatchObject({
      outcome: "expense",
      reason: "rule:initial:ulys",
      expense: { amountCents: 3580, date: "2026-09-15", category: "Transport", source: "lcl" },
    });
  });

  it("9. ignore une opération rattachée à un abonnement, même supprimé depuis", () => {
    const doc = budget();
    doc.banking.rules.unshift({
      id: "r",
      bank: "lcl",
      contains: "Spotify",
      action: { type: "subscription", subscriptionId: "abo-disparu" },
    });
    const operation = une(lcl([lclCarte("s", "2026-09-15", "7.07", "Spotify France", "14/09/26")]));
    expect(decide(operation, doc)).toEqual({ outcome: "ignored", reason: "rule:r" });
  });

  it("9 bis. envoie « À classer » un paiement qui ressemble à un abonnement saisi", () => {
    const operation = une(lcl([lclCarte("s", "2026-09-15", "7.07", "Spotify France", "14/09/26")]));
    expect(decide(operation, budget("2026-09-01", { subscriptions: [spotify] }))).toMatchObject({
      outcome: "inbox",
      item: { why: "possibleSubscription", amountCents: 707 },
    });
  });

  it("9 bis. ne rapproche pas un libellé d'abonnement de moins de 3 caractères", () => {
    const court = { ...spotify, id: "abo-tv", label: "TV" };
    const operation = une(lcl([lclCarte("s", "2026-09-15", "7.07", "TVA REMBOURSABLE", "14/09/26")]));
    expect(decide(operation, budget("2026-09-01", { subscriptions: [court] })).outcome).toBe("expense");
  });

  it("10. importe un paiement carte à la date du paiement, avec sa catégorie", () => {
    const decision = decide(une(lcl([LCL_NATURES.carteUberEats])), budget());
    expect(decision).toEqual({
      outcome: "expense",
      reason: "structural:card",
      expense: {
        id: "bank:lcl:l-uber",
        amountCents: 5846,
        date: "2026-09-17",
        label: "UBER *EATS",
        category: "Restauration",
        source: "lcl",
        bankRef: "lcl:l-uber",
      },
    });
  });

  it("10. ajoute l'arrondi fusionné au montant de la dépense", () => {
    const [paiement] = revolut([
      revolutBrute("a", "2026-10-02", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      revolutBrute("p", "2026-10-02", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"),
    ]);
    expect(decide(paiement, budget())).toMatchObject({
      outcome: "expense",
      expense: { amountCents: 600, category: "Courses" },
    });
  });

  it("11. envoie « À classer » un paiement carte sans date de paiement lisible", () => {
    const operation = une(lcl([lclCarte("x", "2026-09-28", "1.00", "ICI", "31/02/26")]));
    expect(decide(operation, budget())).toMatchObject({
      outcome: "inbox",
      item: { why: "unreadableDate", date: "2026-09-28" },
    });
  });

  it("12. envoie « À classer » un virement sortant inconnu", () => {
    expect(decide(une(lcl([LCL_NATURES.virementSortant])), budget())).toMatchObject({
      outcome: "inbox",
      item: { why: "noRule", kind: "transferOut", amountCents: 35000 },
    });
  });
});

// --- Lot : propriétés -------------------------------------------------------------------------

describe("processBatch", () => {
  const lot = lcl([LCL_NATURES.carte, LCL_NATURES.virementSortant, LCL_NATURES.remboursement]);

  it("rend le même objet quand rien ne change", () => {
    const doc = budget(null);
    expect(processBatch(lot, doc)).toBe(doc);
  });

  it("est idempotent", () => {
    const une = processBatch(lot, budget());
    expect(processBatch(lot, une)).toBe(une);
  });

  it("est indépendant de l'appareil", () => {
    expect(processBatch(lot, budget())).toEqual(processBatch(lot, budget()));
  });

  it("ne recrée ni ne modifie une dépense corrigée ou supprimée", () => {
    const traite = processBatch(lot, budget());
    const corrige: BudgetDocument = {
      ...traite,
      expenses: traite.expenses.map((d) => ({ ...d, amountCents: 1, category: "Perso" })),
    };
    expect(processBatch(lot, corrige)).toBe(corrige);

    const supprime: BudgetDocument = { ...traite, expenses: [] };
    expect(processBatch(lot, supprime)).toBe(supprime);
  });

  it("envoie « À classer » un arrondi arrivé après son paiement", () => {
    const paiementSeul = revolut([revolutBrute("p", "2026-10-02", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop")]);
    const traite = processBatch(paiementSeul, budget());

    const complete = revolut([
      revolutBrute("a", "2026-10-02", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      revolutBrute("p", "2026-10-02", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"),
    ]);
    const suivant = processBatch(complete, traite);

    expect(suivant.expenses[0].amountCents).toBe(545);
    expect(suivant.banking.inbox).toMatchObject([{ ref: "revolut:a", amountCents: 55, why: "ambiguousRoundUp" }]);
    // Et une seule fois.
    expect(processBatch(complete, suivant)).toBe(suivant);
  });
});

// --- Jeu de référence : septembre 2026 (contrat §5) ---------------------------------------------

describe("jeu de référence de septembre", () => {
  const carte = (ref: string, jour: number, montant: string, commercant: string) =>
    lclCarte(ref, `2026-09-${String(Math.min(jour + 2, 30)).padStart(2, "0")}`, montant, commercant, `${String(jour).padStart(2, "0")}/09/26`);
  const credit = (ref: string, jour: string, montant: string, ligne: string) =>
    lclBrute(ref, `2026-09-${jour}`, montant, "CRDT", ["VIREMENT", "", ligne]);

  const lclSeptembre = lcl([
    // 18 paiements carte
    carte("c1", 26, "33.82", "PETROLEC SUD"),
    carte("c2", 17, "58.46", "UBER   *EATS"),
    carte("c3", 19, "26.25", "UBER   *EATS"),
    carte("c4", 14, "20.00", "IZLY SMONEY"),
    carte("c5", 13, "16.00", "I CAVALIERI 5F"),
    carte("c6", 12, "33.62", "UBER   *EATS"),
    carte("c7", 8, "1.50", "CASINO SHOP"),
    carte("c8", 6, "19.14", "UBER   *EATS"),
    carte("c9", 5, "31.90", "UBER   *EATS"),
    carte("c10", 4, "13.90", "BOHEBON J D ARC"),
    carte("c11", 3, "3.83", "CARREFOUR CITY"),
    carte("c12", 1, "10.94", "UBER   *EATS"),
    carte("c13", 3, "4.85", "MP*CARREFOUR"),
    carte("c14", 2, "7.20", "APPLIS TISSEO"),
    carte("c15", 2, "13.52", "PARA-LAFAYETTE"),
    carte("c16", 1, "20.00", "IZLY SMONEY"),
    carte("c17", 1, "12.24", "MP*CARREFOUR"),
    carte("c18", 1, "2.45", "RU ARSENAL"),
    // 6 recharges Revolut
    carte("r1", 27, "50", "Revolut**0000*"),
    carte("r2", 26, "10", "Revolut**0000*"),
    carte("r3", 22, "10", "Revolut**0000*"),
    carte("r4", 16, "11", "Revolut**0000*"),
    carte("r5", 15, "16", "Revolut**0000*"),
    carte("r6", 12, "31", "Revolut**0000*"),
    // 7 crédits
    credit("v1", "27", "50", "VIREMENT M JEAN DUPONT"),
    credit("v2", "26", "70", "VIREMENT M JEAN DUPONT"),
    credit("v3", "18", "300", "VIREMENT M JEAN DUPONT"),
    credit("v4", "17", "50", "VIREMENT M JEAN DUPONT"),
    credit("v5", "09", "700", "VIREMENT M PAUL DUPONT"),
    credit("v6", "09", "700", "VIREMENT M JEAN DUPONT"),
    credit("v7", "04", "183.05", "VIREMENT CAF EXEMPLE"),
    // Remboursement, Ulys, loyer
    LCL_NATURES.remboursement,
    LCL_NATURES.prelevement,
    LCL_NATURES.virementInstantane,
    // 5 à classer
    carte("s1", 14, "7.07", "Spotify France"),
    LCL_NATURES.cotisation,
    lclBrute("p1", "2026-09-19", "300", "DBIT", ["VIREMENT", "", "VIR SEPA Mme JEANNE DUPONT OU", "caution"]),
    LCL_NATURES.virementSortant,
    lclBrute("p3", "2026-09-09", "700", "DBIT", ["VIREMENT", "", "VIR SEPA M JEAN DUPONT"]),
  ]);

  const revolutSeptembre = revolut(REVOLUT_SEPTEMBRE);
  const doc = processBatch([...lclSeptembre, ...revolutSeptembre], budget("2026-09-01", { subscriptions: [spotify] }));

  const sorts = (banque: "lcl" | "revolut") => {
    const compte: Record<string, number> = {};
    for (const entree of doc.banking.ledger.filter((e) => e.ref.startsWith(`${banque}:`))) {
      compte[entree.outcome] = (compte[entree.outcome] ?? 0) + 1;
    }
    return compte;
  };

  it("contient 39 opérations LCL et 19 Revolut après fusion des arrondis", () => {
    expect(lclSeptembre).toHaveLength(39);
    expect(revolutSeptembre).toHaveLength(19);
  });

  it("donne les sorts LCL attendus", () => {
    // 18 cartes + Ulys = 19 dépenses ; 6 recharges + 7 crédits + loyer = 14 ignorées.
    expect(sorts("lcl")).toEqual({ expense: 19, refund: 1, ignored: 14, inbox: 5 });
  });

  it("donne les sorts Revolut attendus", () => {
    // 8 dépenses ; 7 recharges + 3 pré-autorisations + Bunq = 11 ignorées.
    expect(sorts("revolut")).toEqual({ expense: 8, ignored: 11 });
  });

  it("n'importe aucune recharge, aucun crédit, aucun loyer, aucun Spotify (CS-002)", () => {
    const libelles = doc.expenses.map((d) => d.label ?? "");
    expect(libelles.some((l) => /revolut|spotify|virement|loyer|bunq|top-up/i.test(l))).toBe(false);
  });

  it("met Spotify « À classer » comme abonnement probable", () => {
    expect(doc.banking.inbox.find((i) => i.ref === "lcl:s1")?.why).toBe("possibleSubscription");
  });

  it("additionne exactement les dépenses attendues, au centime", () => {
    const attendu =
      [3382, 5846, 2625, 2000, 1600, 3362, 150, 1914, 3190, 1390, 383, 1094, 485, 720, 1352, 2000, 1224, 245].reduce((a, b) => a + b, 0) +
      3580 + // Ulys
      [600, 200, 1500, 200, 800, 500, 1600, 3100].reduce((a, b) => a + b, 0); // Revolut, arrondis inclus
    expect(doc.expenses.reduce((somme, d) => somme + d.amountCents, 0)).toBe(attendu);
  });
});

// --- Classement manuel (contrat §4) -------------------------------------------------------------

describe("classement manuel", () => {
  const operations = lcl([
    LCL_NATURES.virementSortant,
    lclBrute("p1", "2026-09-19", "300", "DBIT", ["VIREMENT", "", "VIR SEPA Mme JEANNE DUPONT OU", "caution"]),
    LCL_NATURES.cotisation,
  ]);
  const depart = processBatch(operations, budget());

  it("« Dépense » crée la dépense à la date de l'élément et le retire de la liste", () => {
    const doc = classifyAsExpense(depart, "lcl:l-vir-out", "Famille");

    expect(doc.expenses).toEqual([
      {
        id: entityId("lcl:l-vir-out"),
        amountCents: 35000,
        date: "2026-09-02",
        label: "VIR SEPA Mme JEANNE DUPONT OU",
        category: "Famille",
        source: "lcl",
        bankRef: "lcl:l-vir-out",
      },
    ]);
    expect(doc.banking.inbox.map((i) => i.ref)).not.toContain("lcl:l-vir-out");
    expect(doc.banking.ledger.find((e) => e.ref === "lcl:l-vir-out")).toMatchObject({
      outcome: "expense",
      reason: "user:classified",
    });
  });

  it("« Dépense » sans catégorie reprend les règles de catégorie", () => {
    const doc = classifyAsExpense(depart, "lcl:l-vir-out", null);
    expect(doc.expenses[0].category).toBeNull();
  });

  it("« Ignorer » retire l'élément sans effet sur le budget", () => {
    const doc = classifyAsIgnored(depart, "lcl:l-cotis");
    expect(doc.expenses).toEqual([]);
    expect(doc.banking.inbox).toHaveLength(2);
    expect(doc.banking.ledger.find((e) => e.ref === "lcl:l-cotis")?.outcome).toBe("ignored");
  });

  it("« Toujours ignorer » ajoute une règle en tête et classe les autres éléments visés", () => {
    const resultat = classifyWithRule(depart, "lcl:l-vir-out", {
      id: "regle-1",
      contains: "JEANNE DUPONT",
      action: { type: "ignore" },
    });

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.document.banking.rules[0]).toEqual({
      id: "regle-1",
      bank: "lcl",
      contains: "JEANNE DUPONT",
      action: { type: "ignore" },
    });
    // Les deux virements vers la même personne sont classés ; la cotisation reste.
    expect(resultat.document.banking.inbox.map((i) => i.ref)).toEqual(["lcl:l-cotis"]);
  });

  it("« Toujours ignorer » s'applique aux opérations futures", () => {
    const resultat = classifyWithRule(depart, "lcl:l-vir-out", {
      id: "regle-1",
      contains: "JEANNE DUPONT",
      action: { type: "ignore" },
    });
    if (!resultat.ok) throw new Error("refus inattendu");

    const futur = lcl([lclBrute("p9", "2026-10-02", "50", "DBIT", ["VIREMENT", "", "VIR SEPA Mme JEANNE DUPONT OU"])]);
    expect(decide(une(futur), resultat.document)).toEqual({ outcome: "ignored", reason: "rule:regle-1" });
  });

  it("« Toujours ignorer » ne revient pas sur un sort déjà tranché", () => {
    const avecDepense = classifyAsExpense(depart, "lcl:l-vir-out", null);
    const resultat = classifyWithRule(avecDepense, "lcl:p1", {
      id: "regle-1",
      contains: "JEANNE DUPONT",
      action: { type: "ignore" },
    });
    if (!resultat.ok) throw new Error("refus inattendu");
    expect(resultat.document.expenses).toHaveLength(1);
  });

  it("« Rattacher à l'abonnement » ignore l'élément et crée une règle d'abonnement", () => {
    const resultat = classifyWithRule(depart, "lcl:l-cotis", {
      id: "regle-2",
      contains: "COTISATION MENSUELLE",
      action: { type: "subscription", subscriptionId: "abo-carte" },
    });
    if (!resultat.ok) throw new Error("refus inattendu");
    expect(resultat.document.banking.rules[0].action).toEqual({ type: "subscription", subscriptionId: "abo-carte" });
    expect(resultat.document.banking.ledger.find((e) => e.ref === "lcl:l-cotis")?.outcome).toBe("ignored");
  });

  it("refuse un motif de moins de 2 caractères", () => {
    expect(
      classifyWithRule(depart, "lcl:l-cotis", { id: "r", contains: " a ", action: { type: "ignore" } }),
    ).toEqual({ ok: false, reason: "invalidPattern" });
  });

  it("ne fait rien pour une référence absente de la liste", () => {
    expect(classifyAsIgnored(depart, "lcl:inconnue")).toBe(depart);
    expect(classifyAsExpense(depart, "lcl:inconnue", null)).toBe(depart);
  });
});
