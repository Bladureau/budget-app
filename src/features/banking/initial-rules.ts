/**
 * Règles fournies d'office à un budget (fonctionnalité 006).
 *
 * Voir specs/006-bank-sync/research.md (R11).
 *
 * Ce sont des **règles de l'utilisateur**, pas des règles du code : elles sont écrites dans le
 * document à sa création ou à la migration 3 → 4, puis modifiables, supprimables et exportées
 * comme toutes les autres. Ce qui découle du fonctionnement des banques (recharges, crédits,
 * pré-autorisations) n'est pas ici : c'est dans le moteur de règles, et non modifiable.
 *
 * Les identifiants sont **stables** (`initial:…`) plutôt qu'aléatoires : deux appareils qui
 * migrent le même document v3 chacun de leur côté produisent ainsi le même document v4, et
 * leur synchronisation ne voit aucune différence.
 *
 * Chaque appel rend de **nouvelles** copies : un appelant qui modifierait le tableau rendu ne
 * doit pas altérer les règles d'un autre document.
 */

import type { CategoryRule, TreatmentRule } from "@/features/budget/types";

export function initialTreatmentRules(): TreatmentRule[] {
  return [
    // Le loyer transite par le compte : les parents le versent, l'utilisateur le reverse au
    // bailleur. Ni dépense, ni revenu (EF-019).
    { id: "initial:loyer", bank: "lcl", contains: "LOYER", action: { type: "ignore" } },
    // Paiement exceptionnel vers un autre compte de l'utilisateur, à ne pas compter.
    { id: "initial:bunq", bank: "revolut", contains: "Bunq", action: { type: "ignore" } },
    // Télépéage : un prélèvement à montant variable, donc une dépense et non un abonnement
    // (EF-017).
    { id: "initial:ulys", bank: "lcl", contains: "UMS-ULYS", action: { type: "expense" } },
  ];
}

export function initialCategoryRules(): CategoryRule[] {
  return [
    { id: "initial:cat-carrefour", contains: "Carrefour", category: "Courses" },
    { id: "initial:cat-casino", contains: "Casino", category: "Courses" },
    { id: "initial:cat-sncf", contains: "SNCF", category: "Transport" },
    { id: "initial:cat-tisseo", contains: "Tisseo", category: "Transport" },
    { id: "initial:cat-fairtiq", contains: "Fairtiq", category: "Transport" },
    { id: "initial:cat-ulys", contains: "Ulys", category: "Transport" },
    // LCL écrit `UBER *EATS`, Revolut `Uber Eats` : deux motifs, plutôt que `Uber` seul qui
    // classerait aussi les courses en VTC dans la restauration.
    { id: "initial:cat-uber-eats-lcl", contains: "Uber *Eats", category: "Restauration" },
    { id: "initial:cat-uber-eats", contains: "Uber Eats", category: "Restauration" },
    { id: "initial:cat-burger-king", contains: "Burger King", category: "Restauration" },
  ];
}
