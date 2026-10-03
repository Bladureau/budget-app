// @vitest-environment node

/**
 * Gestion des règles par l'utilisateur (specs/006-bank-sync, récit 6).
 *
 * Comme dans `rules.test.ts`, les opérations viennent des vrais normalisateurs appliqués aux
 * jeux d'essai synthétiques.
 */

import { describe, expect, it } from "vitest";

import {
  addCategoryRule,
  processBatch,
  removeRule,
  updateCategoryRule,
  updateTreatmentRule,
} from "@/features/banking/rules";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";
import { normalizeLclBatch } from "@/lib/server/banking/normalize-lcl";
import { lclBrute, lclCarte } from "@/lib/server/banking/fixtures";

function budget(): BudgetDocument {
  const doc = emptyDocument();
  return { ...doc, banking: { ...doc.banking, importFrom: "2026-09-01" } };
}

const lcl = (brutes: unknown[]) => normalizeLclBatch(brutes).operations;

describe("addCategoryRule", () => {
  it("ajoute la règle en tête, motif et catégorie nettoyés", () => {
    const resultat = addCategoryRule(budget(), {
      id: "r1",
      contains: " Carrefour City ",
      category: " Dépannage ",
    });
    if (!resultat.ok) throw new Error("règle refusée");

    const regles = resultat.document.banking.categoryRules;
    expect(regles[0]).toEqual({ id: "r1", contains: "Carrefour City", category: "Dépannage" });
    expect(regles).toHaveLength(budget().banking.categoryRules.length + 1);
  });

  it("l'emporte sur une règle plus générale déjà présente", () => {
    const regle = addCategoryRule(budget(), {
      id: "r1",
      contains: "Carrefour City",
      category: "Dépannage",
    });
    if (!regle.ok) throw new Error("règle refusée");

    const [city, hyper] = lcl([
      lclCarte("c1", "2026-09-10", "8.20", "CARREFOUR CITY", "09/09/26"),
      lclCarte("c2", "2026-09-11", "64.10", "CARREFOUR", "10/09/26"),
    ]);
    const apres = processBatch([city, hyper], regle.document);
    expect(apres.expenses.map((d) => d.category)).toEqual(["Dépannage", "Courses"]);
  });

  it("donne sa catégorie aux dépenses importées ensuite, sans toucher aux précédentes", () => {
    const [premiere, suivante] = lcl([
      lclCarte("c1", "2026-09-10", "12.24", "PETROLEC SUD", "08/09/26"),
      lclCarte("c2", "2026-09-20", "40.00", "PETROLEC SUD", "19/09/26"),
    ]);
    const avant = processBatch([premiere], budget());
    expect(avant.expenses[0].category).toBeNull();

    const regle = addCategoryRule(avant, { id: "r1", contains: "petrolec", category: "Carburant" });
    if (!regle.ok) throw new Error("règle refusée");
    // La dépense déjà importée garde sa catégorie : une règle ne vaut que pour l'avenir.
    expect(regle.document.expenses[0].category).toBeNull();

    const apres = processBatch([suivante], regle.document);
    expect(apres.expenses[1].category).toBe("Carburant");
    expect(apres.expenses[0].category).toBeNull();
  });

  it("refuse un motif trop court ou trop long, et une catégorie vide ou trop longue", () => {
    const doc = budget();
    const refus = (contains: string, category: string) =>
      addCategoryRule(doc, { id: "r", contains, category });

    expect(refus("a", "X")).toEqual({ ok: false, reason: "invalidPattern" });
    expect(refus("  a  ", "X")).toEqual({ ok: false, reason: "invalidPattern" });
    expect(refus("a".repeat(81), "X")).toEqual({ ok: false, reason: "invalidPattern" });
    expect(refus("Carrefour", "   ")).toEqual({ ok: false, reason: "invalidCategory" });
    expect(refus("Carrefour", "c".repeat(81))).toEqual({ ok: false, reason: "invalidCategory" });
  });

  it("accepte les longueurs limites", () => {
    expect(addCategoryRule(budget(), { id: "r", contains: "ab", category: "X" }).ok).toBe(true);
    expect(
      addCategoryRule(budget(), { id: "r", contains: "a".repeat(80), category: "c".repeat(80) }).ok,
    ).toBe(true);
  });

  it("ne modifie pas le document reçu", () => {
    const doc = budget();
    const nombre = doc.banking.categoryRules.length;
    addCategoryRule(doc, { id: "r1", contains: "Carrefour City", category: "Dépannage" });
    expect(doc.banking.categoryRules).toHaveLength(nombre);
  });
});

describe("updateCategoryRule et updateTreatmentRule", () => {
  it("modifie motif et catégorie d'une règle de catégorie sans changer son rang", () => {
    const doc = budget();
    const rang = doc.banking.categoryRules.findIndex((r) => r.id === "initial:cat-sncf");
    const resultat = updateCategoryRule(doc, "initial:cat-sncf", {
      contains: "SNCF Connect",
      category: "Voyages",
    });
    if (!resultat.ok) throw new Error("modification refusée");

    expect(resultat.document.banking.categoryRules[rang]).toEqual({
      id: "initial:cat-sncf",
      contains: "SNCF Connect",
      category: "Voyages",
    });
    expect(resultat.document.banking.categoryRules).toHaveLength(doc.banking.categoryRules.length);
  });

  it("modifie le motif d'une règle de traitement sans changer sa banque ni son action", () => {
    const resultat = updateTreatmentRule(budget(), "initial:loyer", " LOYER DUPONT ");
    if (!resultat.ok) throw new Error("modification refusée");

    expect(resultat.document.banking.rules[0]).toEqual({
      id: "initial:loyer",
      bank: "lcl",
      contains: "LOYER DUPONT",
      action: { type: "ignore" },
    });
  });

  it("refuse une modification invalide", () => {
    const doc = budget();
    expect(updateTreatmentRule(doc, "initial:loyer", " a ")).toEqual({
      ok: false,
      reason: "invalidPattern",
    });
    expect(updateCategoryRule(doc, "initial:cat-sncf", { contains: "S", category: "X" })).toEqual({
      ok: false,
      reason: "invalidPattern",
    });
    expect(updateCategoryRule(doc, "initial:cat-sncf", { contains: "SNCF", category: "" })).toEqual({
      ok: false,
      reason: "invalidCategory",
    });
  });

  it("laisse les règles inchangées pour un identifiant inconnu", () => {
    const doc = budget();
    const resultat = updateTreatmentRule(doc, "inconnu", "MOTIF");
    if (!resultat.ok) throw new Error("modification refusée");
    expect(resultat.document.banking.rules).toEqual(doc.banking.rules);
  });
});

describe("removeRule", () => {
  it("supprime une règle initiale comme une autre, de traitement ou de catégorie", () => {
    const doc = budget();

    const sansLoyer = removeRule(doc, "initial:loyer");
    expect(sansLoyer.banking.rules.map((r) => r.id)).not.toContain("initial:loyer");
    expect(sansLoyer.banking.rules).toHaveLength(doc.banking.rules.length - 1);
    expect(sansLoyer.banking.categoryRules).toEqual(doc.banking.categoryRules);

    const sansSncf = removeRule(doc, "initial:cat-sncf");
    expect(sansSncf.banking.categoryRules.map((r) => r.id)).not.toContain("initial:cat-sncf");
    expect(sansSncf.banking.rules).toEqual(doc.banking.rules);
  });

  it("ne revient pas sur ce que la règle a déjà tranché", () => {
    const [loyer] = lcl([
      lclBrute("v1", "2026-09-05", "650.00", "DBIT", ["VIREMENT", "LOYER SEPTEMBRE"]),
    ]);
    const traite = processBatch([loyer], budget());
    expect(traite.banking.ledger).toHaveLength(1);
    expect(traite.banking.ledger[0].outcome).toBe("ignored");

    // La règle supprimée, la même opération revient : ni réimportée, ni « à classer ».
    const apres = processBatch([loyer], removeRule(traite, "initial:loyer"));
    expect(apres.expenses).toEqual([]);
    expect(apres.banking.inbox).toEqual([]);
    expect(apres.banking.ledger).toEqual(traite.banking.ledger);
  });

  it("laisse partir « à classer » les opérations futures que la règle supprimée ignorait", () => {
    const [loyer] = lcl([
      lclBrute("v2", "2026-10-05", "650.00", "DBIT", ["VIREMENT", "LOYER OCTOBRE"]),
    ]);
    const apres = processBatch([loyer], removeRule(budget(), "initial:loyer"));
    expect(apres.banking.inbox).toHaveLength(1);
    expect(apres.expenses).toEqual([]);
  });

  it("ne fait rien pour un identifiant inconnu", () => {
    const doc = budget();
    expect(removeRule(doc, "inconnu").banking).toEqual(doc.banking);
  });
});
