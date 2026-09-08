import { BudgetProvider } from "@/features/budget/budget-provider";
import { BudgetView } from "@/features/budget/components/budget-view";

/**
 * Composant Serveur : il ne fait que poser le fournisseur, qui porte la frontière cliente.
 * Aucune directive `"use client"` ici — la coquille reste rendue sur le serveur.
 */
export default function Home() {
  return (
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>
  );
}
