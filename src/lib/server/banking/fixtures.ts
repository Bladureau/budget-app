/**
 * Jeux d'essai : transactions brutes au format d'Enable Banking.
 *
 * Voir specs/006-bank-sync/research.md (R7) et contracts/normalisation.md.
 *
 * **Synthétiques.** Ils reproduisent la **forme** exacte des opérations réelles de septembre
 * 2026 (libellés multilignes de LCL, codes de Revolut, montants en texte), mais aucun nom,
 * IBAN, référence ni numéro de carte de l'utilisateur. Les montants Revolut reprennent ceux du
 * contrat de normalisation, déjà publiés dans la spécification, pour vérifier les 9 fusions
 * d'arrondis à l'identique.
 *
 * Utilisé uniquement par les tests ; vit à côté du code qu'il exerce, sous `src/lib/server/`,
 * parce qu'il en partage la frontière : il ne doit pas rejoindre le graphe client.
 */

type Sens = "DBIT" | "CRDT";

interface Brute {
  entry_reference?: string | null;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: string;
  status: string;
  booking_date: string;
  value_date: string;
  remittance_information: string[];
  bank_transaction_code?: { code: string | null; description: null; sub_code: null };
  creditor?: { name: string | null };
  transaction_id: null;
  merchant_category_code: null;
}

// --- LCL --------------------------------------------------------------------------------------

/**
 * Transaction LCL : tout est dans un **seul** élément de `remittance_information`, dont les
 * lignes sont séparées par `\n` — c'est ce que renvoie la banque.
 */
export function lclBrute(
  reference: string,
  date: string,
  montant: string,
  sens: Sens,
  lignes: string[],
): Brute {
  return {
    entry_reference: reference,
    transaction_amount: { currency: "EUR", amount: montant },
    credit_debit_indicator: sens,
    status: "BOOK",
    booking_date: date,
    value_date: date,
    remittance_information: [lignes.join("\n")],
    transaction_id: null,
    merchant_category_code: null,
  };
}

export function lclCarte(reference: string, debit: string, montant: string, commercant: string, paiement: string): Brute {
  return lclBrute(reference, debit, montant, "DBIT", [
    "CARTE",
    "0000000",
    `CB  ${commercant.padEnd(16)} ${paiement}`,
    "PAIEMENT A TOULOUSE",
  ]);
}

/** Une transaction LCL de chaque nature du contrat de normalisation (§2). */
export const LCL_NATURES = {
  carte: lclCarte("l-carte", "2026-09-28", "33.82", "PETROLEC SUD", "26/09/26"),
  carteUberEats: lclCarte("l-uber", "2026-09-21", "58.46", "UBER   *EATS", "17/09/26"),
  rechargeRevolut: lclCarte("l-recharge", "2026-09-28", "50", "Revolut**0000*", "27/09/26"),
  remboursement: lclBrute("l-rembourse", "2026-09-07", "4.99", "CRDT", [
    "CARTE ANNUL./REGUL.",
    "0000000",
    "CB  Twitch Interacti 05/09/26",
  ]),
  virementSortant: lclBrute("l-vir-out", "2026-09-02", "350", "DBIT", [
    "VIREMENT",
    "",
    "VIR SEPA Mme JEANNE DUPONT OU",
    "MMS",
    "",
    "SCA6000000000000",
  ]),
  virementInstantane: lclBrute("l-vir-inst", "2026-09-09", "700", "DBIT", [
    "VIREMENT INSTANTANE",
    "",
    "VIR INST Jean Dupont",
    "Loyer Bureau",
  ]),
  virementEntrant: lclBrute("l-vir-in", "2026-09-04", "183.05", "CRDT", [
    "VIREMENT SEPA RECU",
    "",
    "VIREMENT CAF EXEMPLE",
    "0000000XDUPONT",
  ]),
  prelevement: lclBrute("l-prlv", "2026-09-15", "35.8", "DBIT", [
    "PRELVT SEPA RECU D/O CONFRERE",
    "",
    "PRLV SEPA UMS-ULYS MOBILITE",
  ]),
  cotisation: lclBrute("l-cotis", "2026-09-25", "2", "DBIT", [
    "COTISATION MENSUELLE CARTE",
    "",
    "COTISATION MENSUELLE CARTE 0000",
  ]),
  inconnue: lclBrute("l-autre", "2026-09-10", "1.50", "DBIT", ["AGIOS", "", "INTERETS DEBITEURS"]),
};

// --- Revolut -----------------------------------------------------------------------------------

export function revolutBrute(
  reference: string,
  date: string,
  montant: string,
  sens: Sens,
  code: string,
  libelle: string,
  creancier: string | null = libelle,
): Brute {
  return {
    entry_reference: reference,
    transaction_amount: { currency: "EUR", amount: montant },
    credit_debit_indicator: sens,
    status: "BOOK",
    booking_date: date,
    value_date: date,
    remittance_information: [libelle],
    bank_transaction_code: { code, description: null, sub_code: null },
    creditor: { name: creancier },
    transaction_id: null,
    merchant_category_code: null,
  };
}

const paiement = (ref: string, date: string, montant: string, commercant: string) =>
  revolutBrute(ref, date, montant, "DBIT", "CARD_PAYMENT", commercant);
const arrondi = (ref: string, date: string, montant: string) =>
  revolutBrute(ref, date, montant, "DBIT", "TRANSFER", "Revpoints Spare Change", "Jean Dupont");
const recharge = (ref: string, date: string, montant: string) =>
  revolutBrute(ref, date, montant, "CRDT", "TOPUP", "Top-Up by *0000", null);

/**
 * Les 28 opérations Revolut de septembre, dans l'ordre où la banque les rend (de la plus
 * récente à la plus ancienne), montants du contrat de normalisation §3.
 */
export const REVOLUT_SEPTEMBRE = [
  paiement("r-hold-1", "2026-09-29", "0.00", "Google *temporary Hold"),
  paiement("r-hold-2", "2026-09-29", "0.00", "Google *temporary Hold"),
  arrondi("r-a29", "2026-09-29", "0.55"),
  paiement("r-p29", "2026-09-29", "5.45", "Casino Shop"),
  recharge("r-t29", "2026-09-29", "10.00"),
  arrondi("r-a28", "2026-09-28", "0.01"),
  paiement("r-p28", "2026-09-28", "1.99", "Carrefour City"),
  paiement("r-fairtiq", "2026-09-27", "0.00", "Fairtiq"),
  arrondi("r-a27", "2026-09-27", "1.00"),
  paiement("r-bunq", "2026-09-27", "50.00", "Bunq"),
  recharge("r-t27", "2026-09-27", "50.00"),
  arrondi("r-a26", "2026-09-26", "1.00"),
  paiement("r-p26", "2026-09-26", "14.00", "Volterra"),
  recharge("r-t26", "2026-09-26", "10.00"),
  arrondi("r-a22", "2026-09-22", "0.45"),
  paiement("r-p22", "2026-09-22", "1.55", "Burger King"),
  recharge("r-t22", "2026-09-22", "10.00"),
  arrondi("r-a21", "2026-09-21", "0.80"),
  paiement("r-p21", "2026-09-21", "7.20", "Tisseo Voyageur"),
  arrondi("r-a16", "2026-09-16", "0.16"),
  paiement("r-p16", "2026-09-16", "4.84", "Carrefourmarket"),
  recharge("r-t16", "2026-09-16", "11.00"),
  arrondi("r-a15", "2026-09-15", "0.70"),
  paiement("r-p15", "2026-09-15", "15.30", "Sncf-voyageurs"),
  recharge("r-t15", "2026-09-15", "16.00"),
  arrondi("r-a12", "2026-09-12", "0.40"),
  paiement("r-p12", "2026-09-12", "30.60", "Carrefourmarket"),
  recharge("r-t12", "2026-09-12", "31.00"),
];

// --- Cas malformés -------------------------------------------------------------------------------

export const MALFORMEES = {
  montantVirgule: { ...lclCarte("m-virgule", "2026-09-28", "1,5", "X", "26/09/26") },
  montantTexte: { ...lclCarte("m-texte", "2026-09-28", "abc", "X", "26/09/26") },
  sansReference: { ...lclCarte("m-ref", "2026-09-28", "1.50", "X", "26/09/26"), entry_reference: null },
  enAttente: { ...lclCarte("m-pdng", "2026-09-28", "1.50", "X", "26/09/26"), status: "PDNG" },
  sensInconnu: { ...lclCarte("m-sens", "2026-09-28", "1.50", "X", "26/09/26"), credit_debit_indicator: "??" },
  pasUnObjet: "transaction",
};
