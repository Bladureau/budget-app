import { describe, expect, it } from "vitest";
import { KEYWORDS_MAX, extractKeywords } from "@/features/assistant/keywords";

describe("extractKeywords", () => {
  it("retient le commerçant d'une question", () => {
    expect(extractKeywords("Qu'ai-je payé chez Carrefour ?")).toEqual(["carrefour"]);
  });

  it("retient une catégorie", () => {
    expect(extractKeywords("Combien ai-je dépensé en courses ce mois-ci ?")).toEqual(["courses"]);
  });

  it("ignore les accents et la casse, comme le journal", () => {
    expect(extractKeywords("CAFÉ")).toEqual(["cafe"]);
    expect(extractKeywords("Où ai-je pris un café ?")).toEqual(["cafe"]);
  });

  it("retire les mots vides et les mots de moins de trois caractères", () => {
    expect(extractKeywords("Quels sont les achats de la semaine chez le boulanger ?")).toEqual([
      "boulanger",
    ]);
    expect(extractKeywords("où est le ma de la")).toEqual([]);
  });

  it("ne retient pas les mots qui désignent la structure du budget", () => {
    expect(extractKeywords("Quels sont mes abonnements ?")).toEqual([]);
    expect(extractKeywords("Donne-moi le total de mes dépenses et de mes revenus")).toEqual([]);
    expect(extractKeywords("Combien d'opérations sont à classer ?")).toEqual(["classer"]);
  });

  it("retire les doublons en gardant l'ordre d'apparition", () => {
    expect(extractKeywords("Monoprix, carrefour, MONOPRIX et encore carrefour")).toEqual([
      "monoprix",
      "carrefour",
    ]);
  });

  it("sépare sur la ponctuation, les apostrophes et les traits d'union", () => {
    expect(extractKeywords("l'amazon,leclerc;auchan-drive")).toEqual([
      "amazon",
      "leclerc",
      "auchan",
      "drive",
    ]);
  });

  it("plafonne le nombre de mots", () => {
    const resultat = extractKeywords("alpha bravo charlie delta echo foxtrot golf hotel");
    expect(resultat).toHaveLength(KEYWORDS_MAX);
    expect(resultat).toEqual(["alpha", "bravo", "charlie", "delta", "echo"]);
  });

  it("garde les nombres et les mots mêlant lettres et chiffres", () => {
    expect(extractKeywords("paiement 3xcb et B&B 2024")).toEqual(["paiement", "3xcb", "2024"]);
  });

  it("rend une liste vide pour une question vide, d'espaces ou de ponctuation", () => {
    expect(extractKeywords("")).toEqual([]);
    expect(extractKeywords("   ")).toEqual([]);
    expect(extractKeywords("?!…")).toEqual([]);
  });

  it("traite une question de 500 caractères sans échouer", () => {
    const longue = "carrefour ".repeat(50);
    expect(extractKeywords(longue)).toEqual(["carrefour"]);
  });

  it("garde les caractères hors alphabet latin", () => {
    expect(extractKeywords("Заплатил в магазине")).toEqual(["заплатил", "магазине"]);
  });
});
