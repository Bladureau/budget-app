import { describe, expect, it } from "vitest";
import { parseTab, tabHref, TABS } from "@/features/navigation/navigation";

describe("parseTab", () => {
  it("ramène à « Aujourd'hui » sans paramètre", () => {
    expect(parseTab("")).toBe("today");
    expect(parseTab("?")).toBe("today");
  });

  it("reconnaît chaque valeur connue", () => {
    expect(parseTab("?onglet=depenses")).toBe("expenses");
    expect(parseTab("?onglet=mois")).toBe("month");
    expect(parseTab("?onglet=reglages")).toBe("settings");
  });

  it("ramène à « Aujourd'hui » une valeur vide, inconnue ou de casse différente (FR-016)", () => {
    expect(parseTab("?onglet=")).toBe("today");
    expect(parseTab("?onglet=inconnu")).toBe("today");
    expect(parseTab("?onglet=MOIS")).toBe("today");
  });

  it("ignore les autres paramètres", () => {
    expect(parseTab("?banking=connected&onglet=reglages")).toBe("settings");
  });

  it("retient la première valeur d'un paramètre répété", () => {
    expect(parseTab("?onglet=mois&onglet=depenses")).toBe("month");
  });
});

describe("tabHref", () => {
  it("donne l'adresse nue pour « Aujourd'hui »", () => {
    expect(tabHref("today")).toBe("/");
    expect(tabHref("today", "titre-saisie")).toBe("/#titre-saisie");
  });

  it("porte l'onglet en paramètre, et la section en fragment", () => {
    expect(tabHref("expenses")).toBe("/?onglet=depenses");
    expect(tabHref("month")).toBe("/?onglet=mois");
    expect(tabHref("settings")).toBe("/?onglet=reglages");
    expect(tabHref("expenses", "a-classer")).toBe("/?onglet=depenses#a-classer");
  });

  it("fait l'aller-retour avec parseTab pour chaque onglet", () => {
    for (const { tab } of TABS) {
      const url = new URL(tabHref(tab), "http://exemple.test");
      expect(parseTab(url.search)).toBe(tab);
    }
  });
});
