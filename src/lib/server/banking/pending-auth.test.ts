// @vitest-environment node

import { describe, expect, it } from "vitest";

import { consumePendingAuth, createPendingAuth } from "@/lib/server/banking/pending-auth";

const T0 = new Date("2026-10-01T18:00:00Z");
const FIN = "2027-03-30T18:00:00.000Z";
const apres = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("state de liaison", () => {
  it("rend la liaison associée", () => {
    const state = createPendingAuth({ bank: "lcl", validUntil: FIN }, T0);
    expect(consumePendingAuth(state, apres(1))).toEqual({ bank: "lcl", validUntil: FIN });
  });

  it("ne sert qu'une fois", () => {
    const state = createPendingAuth({ bank: "revolut", validUntil: FIN }, T0);
    expect(consumePendingAuth(state, apres(1))).toEqual({ bank: "revolut", validUntil: FIN });
    expect(consumePendingAuth(state, apres(2))).toBeNull();
  });

  it("expire après 15 minutes", () => {
    const state = createPendingAuth({ bank: "lcl", validUntil: FIN }, T0);
    expect(consumePendingAuth(state, apres(15))).toBeNull();
  });

  it("est encore valide juste avant 15 minutes", () => {
    const state = createPendingAuth({ bank: "lcl", validUntil: FIN }, T0);
    expect(consumePendingAuth(state, new Date(apres(15).getTime() - 1))).toEqual({ bank: "lcl", validUntil: FIN });
  });

  it("refuse un state inconnu", () => {
    expect(consumePendingAuth("inconnu", T0)).toBeNull();
  });

  it("engendre des states distincts et longs", () => {
    const a = createPendingAuth({ bank: "lcl", validUntil: FIN }, T0);
    const b = createPendingAuth({ bank: "lcl", validUntil: FIN }, T0);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });
});
