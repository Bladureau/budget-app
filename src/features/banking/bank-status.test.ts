/**
 * État affichable d'une banque — seuil des 14 jours, erreurs, date de dernière récupération.
 */

import { describe, expect, it } from "vitest";

import { EXPIRY_WARNING_DAYS, bankDisplay, daysUntil } from "@/features/banking/bank-status";
import type { BankConnectionStatus } from "@/features/banking/types";

const MAINTENANT = new Date("2027-03-01T12:00:00Z");

function etat(surcharge: Partial<BankConnectionStatus> = {}): BankConnectionStatus {
  return {
    bank: "lcl",
    connected: true,
    ibanSuffix: "XXXX",
    validUntil: "2027-03-30T12:00:00.000Z",
    lastFetchAt: "2027-02-28T08:30:00.000Z",
    lastError: null,
    discardedCount: 0,
    historyGap: false,
    ...surcharge,
  };
}

const dansJours = (jours: number) =>
  new Date(MAINTENANT.getTime() + jours * 86_400_000).toISOString();

describe("daysUntil", () => {
  it("compte les jours entiers restants", () => {
    expect(daysUntil(dansJours(14), MAINTENANT)).toBe(14);
    expect(daysUntil(dansJours(13.9), MAINTENANT)).toBe(13);
    expect(daysUntil(dansJours(-1), MAINTENANT)).toBe(-1);
  });
});

describe("bankDisplay — seuil d'avertissement (EF-004, CS-008)", () => {
  it("ne signale rien à 14 jours pleins", () => {
    expect(bankDisplay(etat({ validUntil: dansJours(EXPIRY_WARNING_DAYS) }), MAINTENANT)).toEqual({
      health: "ok",
      needsReconnect: false,
      alert: false,
      message: null,
    });
  });

  it("avertit à moins de 14 jours, en alerte dès l'ouverture", () => {
    const affichage = bankDisplay(etat({ validUntil: dansJours(13.9) }), MAINTENANT);
    expect(affichage).toMatchObject({ health: "expiringSoon", needsReconnect: true, alert: true });
    expect(affichage.message).toContain("L’accès à LCL expire dans 13 jours");
  });

  it("dit « demain » et « aujourd'hui » en toutes lettres", () => {
    expect(bankDisplay(etat({ validUntil: dansJours(1.5) }), MAINTENANT).message).toContain("expire demain");
    expect(bankDisplay(etat({ validUntil: dansJours(0.5) }), MAINTENANT).message).toContain("expire aujourd’hui");
  });

  it("considère comme expirée une autorisation échue, même sans erreur rapportée", () => {
    // Cas du serveur resté éteint : aucune récupération n'a encore échoué.
    const affichage = bankDisplay(etat({ validUntil: dansJours(-2) }), MAINTENANT);
    expect(affichage).toMatchObject({ health: "expired", needsReconnect: true, alert: true });
    expect(affichage.message).toContain("L’accès à LCL a expiré le");
  });
});

describe("bankDisplay — erreurs rapportées", () => {
  it.each([
    ["expired", "expired", true],
    ["revoked", "revoked", true],
    ["noAccount", "noAccount", true],
    ["rateLimited", "rateLimited", false],
    ["unavailable", "unavailable", false],
  ] as const)("%s → %s, reconnexion demandée : %s", (erreur, sante, reconnecter) => {
    const affichage = bankDisplay(etat({ lastError: erreur }), MAINTENANT);
    expect(affichage.health).toBe(sante);
    expect(affichage.needsReconnect).toBe(reconnecter);
    expect(affichage.alert).toBe(reconnecter);
  });

  it("donne toujours la date de dernière récupération réussie avec une erreur (EF-005)", () => {
    for (const erreur of ["expired", "revoked", "noAccount", "rateLimited", "unavailable"] as const) {
      expect(bankDisplay(etat({ lastError: erreur }), MAINTENANT).message).toMatch(
        /Dernière récupération réussie le \d{2}\/\d{2}\/\d{4}/,
      );
    }
  });

  it("dit qu'aucune récupération n'a réussi quand c'est le cas", () => {
    const affichage = bankDisplay(etat({ lastError: "revoked", lastFetchAt: null }), MAINTENANT);
    expect(affichage.message).toContain("Aucune récupération réussie pour l’instant.");
  });

  it("ne cite pas une date d'expiration encore à venir quand la banque déclare l'accès expiré", () => {
    const affichage = bankDisplay(etat({ lastError: "expired" }), MAINTENANT);
    expect(affichage.message).toMatch(/^L’accès à LCL a expiré\. Reconnectez la banque\./);
  });

  it("fait passer l'expiration avant une erreur passagère", () => {
    expect(bankDisplay(etat({ lastError: "unavailable", validUntil: dansJours(-1) }), MAINTENANT).health)
      .toBe("expired");
  });
});

describe("bankDisplay — banque non reliée", () => {
  it("demande une liaison, sans alerte", () => {
    expect(
      bankDisplay(etat({ connected: false, validUntil: null, lastFetchAt: null }), MAINTENANT),
    ).toEqual({ health: "notConnected", needsReconnect: true, alert: false, message: null });
  });
});
