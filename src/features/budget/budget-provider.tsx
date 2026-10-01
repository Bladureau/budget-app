"use client";

/**
 * Frontière cliente de la fonctionnalité budgétaire.
 *
 * Seul fichier de la fonctionnalité portant `"use client"` : la documentation de la version
 * installée (01-app/01-getting-started/05-server-and-client-components.md) indique que les
 * API navigateur — `localStorage` y est citée nommément — relèvent des Composants Client, et
 * qu’une fois un fichier marqué, ses imports rejoignent le graphe client.
 *
 * L’état initial est lu par `useSyncExternalStore` et JAMAIS pendant le rendu : le serveur ne
 * dispose pas de `localStorage`, une lecture au rendu provoquerait une divergence
 * d’hydratation.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { loadDocument, newId, saveDocument } from "@/lib/storage";
import { readSyncMetadata, writeSyncMetadata } from "@/lib/sync-metadata";
import { fetchRemote, pushLocal } from "@/features/budget/sync";
import type { ServerCode } from "@/features/budget/sync";
import { addMonthsToKey, monthKeyOf } from "@/lib/date";
import { copyEnvelopesToMonth, findEnvelope } from "@/features/budget/envelopes";
import { emptyDocument } from "@/features/budget/types";
import {
  withAmountChange,
  withPause,
  withTermination,
} from "@/features/budget/calculs";
import {
  buildExportFilename,
  parseImport,
  serializeExport,
} from "@/features/budget/transfer";
import type { ImportResult } from "@/features/budget/transfer";
import { triggerDownload } from "@/lib/download";
import { fetchBankStatus, fetchOperations, startConnect } from "@/features/banking/client";
import type { ClientFailure } from "@/features/banking/client";
import {
  classifyAsExpense,
  classifyAsIgnored,
  classifyWithRule,
  processBatch,
} from "@/features/banking/rules";
import type { BankStatus } from "@/features/banking/types";
import type {
  BankSource,
  BudgetDocument,
  Cents,
  Envelope,
  Expense,
  Income,
  IsoDate,
  MonthKey,
  Subscription,
  SyncState,
} from "@/features/budget/types";

/**
 * État de la synchronisation bancaire (fonctionnalité 006), distinct de `SyncState` : la
 * banque et le stockage central échouent indépendamment, et les confondre cacherait lequel
 * appelle un geste de l'utilisateur.
 */
export type BankSyncState = "idle" | "syncing" | ClientFailure;

/**
 * Motif d’alerte présenté à l’utilisateur (voir contracts/interface.md).
 *
 * La fonctionnalité 005 y ajoute les échecs venus du stockage central. Ils **rejoignent ce
 * mécanisme** plutôt que d’en ouvrir un second : deux systèmes d’alerte concurrents
 * finiraient par s’afficher ensemble et par se contredire.
 */
export type BudgetNotice =
  | "quarantined"
  | "writeFailed"
  | "remoteUnreadable"
  | "remoteFutureVersion"
  | null;

/** État courant du budget distant, retenu le temps que l'utilisateur tranche (EF-024). */
export interface BudgetConflict {
  revision: number;
  document: BudgetDocument;
}

interface BudgetContextValue {
  document: BudgetDocument;
  /** Faux tant que le premier chargement client n’a pas eu lieu. */
  ready: boolean;
  notice: BudgetNotice;
  dismissNotice: () => void;

  /**
   * Synchronisation avec le stockage central (fonctionnalité 005). Entièrement dérivé,
   * jamais persisté.
   */
  syncState: SyncState;
  /** Vrai si des saisies locales n’ont pas encore rejoint le stockage central. */
  pendingChanges: boolean;
  /** Non nul quand une écriture a été refusée : l’utilisateur doit choisir. */
  conflict: BudgetConflict | null;
  /** Relance une lecture du stockage central. */
  refreshFromServer: () => void;
  /**
   * Les deux seules issues d’un conflit, toutes deux déclenchées par l’utilisateur.
   * L’application n’arbitre jamais d’elle-même (EF-025).
   */
  resolveConflictKeepLocal: () => void;
  resolveConflictTakeRemote: () => void;
  today: IsoDate;
  selectedMonth: MonthKey;
  setSelectedMonth: (month: MonthKey) => void;
  goToAdjacentMonth: (offset: number) => void;
  goToCurrentMonth: () => void;

  addIncome: (income: Omit<Income, "id">) => void;
  updateIncome: (income: Income) => void;
  removeIncome: (id: string) => void;

  addSubscription: (subscription: Omit<Subscription, "id">) => void;
  updateSubscription: (subscription: Subscription) => void;
  removeSubscription: (id: string) => void;

  /** Enveloppes budgétaires (fonctionnalité 001). */
  setEnvelopeLimit: (category: string, month: MonthKey, limitCents: Cents) => void;
  removeEnvelope: (id: string) => void;
  /** Renvoie `false` si le mois précédent ne comporte aucun plafond. */
  copyEnvelopesFromPreviousMonth: (month: MonthKey) => boolean;

  /** Dépenses (fonctionnalité 003). */
  addExpense: (expense: Omit<Expense, "id">) => void;
  updateExpense: (expense: Expense) => void;
  removeExpense: (id: string) => void;

  /**
   * Export et import des données (fonctionnalité 004).
   *
   * `prepareImport` n’écrit jamais : c’est cette séparation d’avec `confirmImport` qui
   * garantit qu’un fichier refusé ne touche pas les données (EF-026).
   */
  exportData: () => boolean;
  prepareImport: (raw: string) => ImportResult;
  confirmImport: (doc: BudgetDocument) => boolean;
  undoImport: () => boolean;
  canUndoImport: boolean;

  /**
   * Synchronisation bancaire (fonctionnalité 006). `null` tant que l'état n'a pas été lu.
   */
  bankStatus: BankStatus | null;
  bankSyncState: BankSyncState;
  /** Date de début d'import ; modifiable tant qu'aucune opération n'a été traitée (D12). */
  setImportFrom: (date: IsoDate) => boolean;
  /** Ouvre la page de la banque ; rend le motif d'échec, ou rien si la page s'ouvre. */
  connectBank: (bank: BankSource) => Promise<ClientFailure | null>;
  /** Bouton « Synchroniser maintenant » des banques. */
  syncBanks: () => void;
  /** Classement d'un élément « À classer ». */
  classifyInboxAsExpense: (ref: string, category: string | null) => void;
  classifyInboxAsIgnored: (ref: string) => void;
  /** Rend `false` si le motif est invalide (moins de 2 caractères). */
  classifyInboxWithRule: (
    ref: string,
    contains: string,
    subscriptionId: string | null,
  ) => boolean;

  /** Renvoient `false` si l’opération viole un invariant du modèle. */
  changeSubscriptionAmount: (
    id: string,
    amountCents: Cents,
    effectiveFrom: IsoDate,
  ) => boolean;
  pauseSubscription: (id: string, from: IsoDate, to: IsoDate | null) => boolean;
  terminateSubscription: (id: string, endDate: IsoDate) => boolean;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

// --- Magasin externe -------------------------------------------------------------------

let instantane: BudgetDocument | null = null;
let quarantaineDetectee = false;
const abonnes = new Set<() => void>();

function notifier(): void {
  for (const abonne of abonnes) abonne();
}

function souscrire(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

function lireInstantaneClient(): BudgetDocument {
  if (instantane === null) {
    const resultat = loadDocument();
    instantane = resultat.document;
    quarantaineDetectee = resultat.quarantined;
  }
  return instantane;
}

// Instantané servi au rendu serveur et au premier rendu client, avant hydratation. Doit être
// stable : le renvoyer depuis une constante évite toute boucle de rendu.
const DOCUMENT_SERVEUR = emptyDocument();

function lireInstantaneServeur(): BudgetDocument {
  return DOCUMENT_SERVEUR;
}

function ecrire(suivant: BudgetDocument): "ok" | "writeFailed" {
  const resultat = saveDocument(suivant);
  if (!resultat.ok) return "writeFailed";
  instantane = suivant;
  notifier();
  return "ok";
}

/**
 * Traduit le motif technique du serveur en alerte destinée à l'utilisateur.
 *
 * `writeFailed` n'y figure pas : il est déjà porté par l'état de synchronisation, et
 * l'annoncer deux fois ferait croire à deux problèmes.
 */
function alerteDepuisCode(code: ServerCode | undefined): BudgetNotice {
  if (code === "storageUnreadable") return "remoteUnreadable";
  if (code === "storageFutureVersion") return "remoteFutureVersion";
  return null;
}

/**
 * Vrai si le document ne contient aucune entité.
 *
 * Sert un seul cas, mais il compte : un appareil qui n'a jamais ouvert l'application n'a
 * **rien à perdre**. Adopter l'état distant y est donc sans risque, alors que le traiter en
 * conflit imposerait un choix à quelqu'un qui n'a aucune modification locale à défendre.
 */
function documentEstVide(document: BudgetDocument): boolean {
  // Les règles bancaires ne comptent pas : un budget neuf en porte déjà, celles fournies
  // d'office. Le registre et la date de début d'import, eux, sont des traces d'usage.
  return (
    document.incomes.length === 0 &&
    document.subscriptions.length === 0 &&
    document.expenses.length === 0 &&
    document.envelopes.length === 0 &&
    document.refunds.length === 0 &&
    document.banking.importFrom === null &&
    document.banking.ledger.length === 0
  );
}

// --- Fournisseur -----------------------------------------------------------------------

function moisCourant(): MonthKey {
  return monthKeyOf(dateDuJour());
}

/** Date du jour au format `AAAA-MM-JJ`, dans le fuseau local. */
function dateDuJour(): IsoDate {
  const maintenant = new Date();
  const mois = String(maintenant.getMonth() + 1).padStart(2, "0");
  const jour = String(maintenant.getDate()).padStart(2, "0");
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const document = useSyncExternalStore(
    souscrire,
    lireInstantaneClient,
    lireInstantaneServeur,
  );

  // `ready` distingue « pas encore hydraté » de « réellement vide », ce qui évite d’afficher
  // l’invitation à saisir pendant une fraction de seconde à chaque chargement.
  const ready = document !== DOCUMENT_SERVEUR;

  const [erreurEcriture, setErreurEcriture] = useState(false);
  // Point de restauration en mémoire, pour la session (EF-019, EF-020). Non persisté :
  // le conserver durablement reviendrait à construire un historique de versions.
  const [pointRestauration, setPointRestauration] = useState<BudgetDocument | null>(null);
  const [alerteMasquee, setAlerteMasquee] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(moisCourant);

  // La date du jour est un état, pas une lecture au rendu : une application de budget peut
  // rester ouverte dans un onglet pendant des jours, et une allocation figée sur une date
  // périmée afficherait un montant faux — pire que de ne rien afficher (EF-023).
  const [today, setToday] = useState<IsoDate>(dateDuJour);

  useEffect(() => {
    const minuterie = setInterval(() => {
      const maintenant = dateDuJour();
      setToday((precedent) => {
        if (precedent === maintenant) return precedent;
        // Bascule du mois consulté uniquement si l'utilisateur était sur le mois courant :
        // s'il consulte délibérément un autre mois, on ne le déplace pas.
        setSelectedMonth((mois) =>
          mois === monthKeyOf(precedent) ? monthKeyOf(maintenant) : mois,
        );
        return maintenant;
      });
    }, 30_000);

    return () => clearInterval(minuterie);
  }, []);

  // --- Synchronisation avec le stockage central (fonctionnalité 005) --------------------

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [pendingChanges, setPendingChanges] = useState(false);
  const [conflict, setConflict] = useState<BudgetConflict | null>(null);
  // Alerte venue du stockage central. Distincte de `syncState` : celui-ci dit où en est
  // l'échange, celle-ci dit ce qui s'est passé du côté du serveur et ce qu'il faut en faire.
  const [alerteDistante, setAlerteDistante] = useState<BudgetNotice>(null);

  // Coalescence : une seule poussée en vol à la fois. La suivante n'est pas mise en file mais
  // notée « à refaire », le document poussé étant toujours le dernier état complet.
  const pousseeEnVol = useRef(false);
  const pousseeARefaire = useRef(false);

  // --- Synchronisation bancaire (fonctionnalité 006) ----------------------------------------

  const [bankStatus, setBankStatus] = useState<BankStatus | null>(null);
  const [bankSyncState, setBankSyncState] = useState<BankSyncState>("idle");
  // Déclenchée après chaque lecture réussie du budget. Passée par une référence parce qu'elle
  // dépend d'`appliquer`, défini plus bas, alors que `reconcilier` en a besoin plus haut.
  const declencherBanques = useRef<() => void>(() => {});
  // Miroir du conflit, lisible après un `await` sans attendre un nouveau rendu.
  const conflitEnCours = useRef(false);

  const etatDEchec = (raison: "offline" | "unauthorized" | "rejected" | "serverError"): SyncState =>
    raison === "offline" ? "offline" : raison === "unauthorized" ? "unauthorized" : "failed";

  const pousser = useCallback(async () => {
    if (pousseeEnVol.current) {
      pousseeARefaire.current = true;
      return;
    }
    pousseeEnVol.current = true;

    try {
      do {
        pousseeARefaire.current = false;

        const metadonnees = readSyncMetadata();
        if (!metadonnees.pendingChanges) {
          setSyncState("idle");
          setPendingChanges(false);
          break;
        }

        setSyncState("syncing");
        const resultat = await pushLocal(lireInstantaneClient(), metadonnees.baseRevision);

        if (resultat.ok) {
          writeSyncMetadata({ baseRevision: resultat.revision, pendingChanges: false });
          setPendingChanges(false);
          setConflict(null);
          setAlerteDistante(null);
          setSyncState("idle");
          continue;
        }

        // AUCUN échec ne baisse le drapeau « en attente » : c'est la garantie de EF-025.
        // Tant que le serveur n'a pas accepté, les modifications restent réputées à pousser.
        if (resultat.reason === "conflict") {
          setConflict({ revision: resultat.revision, document: resultat.document });
          setSyncState("conflict");
          break;
        }

        setSyncState(etatDEchec(resultat.reason));
        setAlerteDistante(alerteDepuisCode(resultat.serverCode));
        break;
      } while (pousseeARefaire.current);
    } finally {
      pousseeEnVol.current = false;
    }
  }, []);

  /**
   * Applique le résultat d'une lecture. Séparé de `tirer` pour que la lecture initiale
   * puisse l'appeler **après** son `await` : modifier l'état directement dans le corps d'un
   * effet provoque des rendus en cascade, ce que `react-hooks/set-state-in-effect` interdit
   * à juste titre.
   */
  const reconcilier = useCallback((resultat: Awaited<ReturnType<typeof fetchRemote>>) => {
    if (!resultat.ok) {
      setSyncState(etatDEchec(resultat.reason === "invalidResponse" ? "serverError" : resultat.reason));
      setAlerteDistante(alerteDepuisCode(resultat.serverCode));
      return;
    }

    // Une lecture réussie lève l'alerte : le problème signalé n'existe plus.
    setAlerteDistante(null);

    const metadonnees = readSyncMetadata();
    const local = lireInstantaneClient();

    // Rien à défendre localement : on adopte l'état distant. `documentEstVide` couvre
    // l'appareil qui découvre l'application, dont les métadonnées valent par défaut
    // « jamais synchronisé, modifications en attente » alors qu'il n'a rien saisi.
    if (!metadonnees.pendingChanges || documentEstVide(local)) {
      if (ecrire(resultat.document) === "writeFailed") {
        setErreurEcriture(true);
        setSyncState("failed");
        return;
      }
      writeSyncMetadata({ baseRevision: resultat.revision, pendingChanges: false });
      setPendingChanges(false);
      setConflict(null);
      setSyncState("idle");
      // La copie locale est à jour : c'est le seul moment où traiter les opérations bancaires
      // (R13). Sur une copie périmée, deux appareils produiraient plus souvent un conflit.
      declencherBanques.current();
      return;
    }

    // Le serveur n'a pas bougé depuis notre dernière synchronisation : nos modifications
    // sont les seules, il n'y a pas de conflit, il suffit de les pousser.
    if (resultat.revision === metadonnees.baseRevision) {
      void pousser();
      return;
    }

    // Le serveur a bougé ET nous avons des modifications : personne ne tranche à la place de
    // l'utilisateur. Rien n'est écrasé, ni ici ni là-bas.
    setConflict({ revision: resultat.revision, document: resultat.document });
    setSyncState("conflict");
  }, [pousser]);

  const tirer = useCallback(async () => {
    setSyncState("syncing");
    reconcilier(await fetchRemote());
  }, [reconcilier]);

  /**
   * Déclencheurs de synchronisation (R6). Aucune poussée depuis le serveur, aucun sondage
   * périodique : la spécification les exclut du périmètre, et ces deux événements suffisent.
   *
   *  - `online` : le réseau revient, ce qui attend part enfin.
   *  - `visibilitychange` : l'onglet redevient visible. Traite le cas limite de l'onglet
   *    resté ouvert plusieurs jours, qui afficherait sinon des données périmées sans le dire.
   *
   * Une boucle de réessai serait un mauvais échange : sur un serveur éteint, elle viderait la
   * batterie sans rien accomplir.
   */
  useEffect(() => {
    const auRetourDuReseau = () => {
      if (readSyncMetadata().pendingChanges) void pousser();
      else void tirer();
    };

    const auRetourDeLOnglet = () => {
      if (window.document.visibilityState === "visible") void tirer();
    };

    window.addEventListener("online", auRetourDuReseau);
    window.document.addEventListener("visibilitychange", auRetourDeLOnglet);

    return () => {
      window.removeEventListener("online", auRetourDuReseau);
      window.document.removeEventListener("visibilitychange", auRetourDeLOnglet);
    };
  }, [pousser, tirer]);

  // Lecture initiale. Le résultat n'est appliqué qu'après l'`await`, et seulement si le
  // composant est toujours monté : une réponse arrivant après un démontage n'a plus personne
  // à qui parler.
  useEffect(() => {
    let annule = false;

    void (async () => {
      const resultat = await fetchRemote();
      if (!annule) reconcilier(resultat);
    })();

    return () => {
      annule = true;
    };
  }, [reconcilier]);

  /**
   * Conserver les modifications locales : elles sont rejouées sur la révision courante du
   * serveur, ce qui les fait accepter. **Les modifications faites sur l'autre appareil sont
   * perdues** — délibérément, et parce que l'utilisateur l'a demandé.
   */
  const resolveConflictKeepLocal = useCallback(() => {
    if (!conflict) return;

    // La révision de base devient celle que le serveur vient d'annoncer : c'est ce qui
    // transforme un rejeu en écriture acceptable, sans qu'aucun drapeau `force` n'existe.
    writeSyncMetadata({ baseRevision: conflict.revision, pendingChanges: true });
    setConflict(null);
    setPendingChanges(true);
    void pousser();
  }, [conflict, pousser]);

  /**
   * Reprendre la version du serveur. **Les modifications locales sont perdues** —
   * délibérément. L'export reste disponible avant de choisir, ce qui donne une porte de
   * sortie à qui refuse de perdre l'un ou l'autre.
   */
  const resolveConflictTakeRemote = useCallback(() => {
    if (!conflict) return;

    if (ecrire(conflict.document) === "writeFailed") {
      setErreurEcriture(true);
      setSyncState("failed");
      return;
    }
    writeSyncMetadata({ baseRevision: conflict.revision, pendingChanges: false });
    setConflict(null);
    setPendingChanges(false);
    setSyncState("idle");
  }, [conflict]);

  /**
   * Applique une mutation : écriture locale d'abord, réseau ensuite.
   *
   * **L'ordre est la garantie du principe I.** L'utilisateur voit sa saisie dès que
   * `localStorage` l'a acceptée ; la poussée est lancée après, sans être attendue. Une panne
   * réseau ne peut donc jamais empêcher une saisie.
   *
   * Le budget est écrit avant les métadonnées : une coupure entre les deux laisse
   * `pendingChanges` à `true` et provoque au pire une poussée inutile — idempotente. L'ordre
   * inverse aurait pu marquer synchronisé un budget qui ne l'était pas.
   */
  const appliquer = useCallback(
    (suivant: BudgetDocument): boolean => {
      const resultat = ecrire(suivant);
      if (resultat === "writeFailed") {
        setErreurEcriture(true);
        return false;
      }
      setErreurEcriture(false);

      writeSyncMetadata({ ...readSyncMetadata(), pendingChanges: true });
      setPendingChanges(true);
      void pousser();
      return true;
    },
    [pousser],
  );

  const addIncome = useCallback(
    (revenu: Omit<Income, "id">) => {
      const nouveau = { ...revenu, id: newId() } as Income;
      appliquer({ ...lireInstantaneClient(), incomes: [...lireInstantaneClient().incomes, nouveau] });
    },
    [appliquer],
  );

  const updateIncome = useCallback(
    (revenu: Income) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        incomes: actuel.incomes.map((element) => (element.id === revenu.id ? revenu : element)),
      });
    },
    [appliquer],
  );

  const removeIncome = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({ ...actuel, incomes: actuel.incomes.filter((element) => element.id !== id) });
    },
    [appliquer],
  );

  const addSubscription = useCallback(
    (abonnement: Omit<Subscription, "id">) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: [...actuel.subscriptions, { ...abonnement, id: newId() }],
      });
    },
    [appliquer],
  );

  const updateSubscription = useCallback(
    (abonnement: Subscription) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.map((element) =>
          element.id === abonnement.id ? abonnement : element,
        ),
      });
    },
    [appliquer],
  );

  const removeSubscription = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.filter((element) => element.id !== id),
      });
    },
    [appliquer],
  );

  /**
   * Applique une transformation pure à un abonnement. La transformation peut refuser
   * l’opération (`null`) : l’appelant en informe alors l’utilisateur au lieu d’écrire un
   * document que le stockage rejetterait de toute façon.
   */
  const transformerAbonnement = useCallback(
    (id: string, transformation: (abonnement: Subscription) => Subscription | null) => {
      const actuel = lireInstantaneClient();
      const cible = actuel.subscriptions.find((element) => element.id === id);
      if (!cible) return false;

      const transforme = transformation(cible);
      if (!transforme) return false;

      appliquer({
        ...actuel,
        subscriptions: actuel.subscriptions.map((element) =>
          element.id === id ? transforme : element,
        ),
      });
      return true;
    },
    [appliquer],
  );

  const changeSubscriptionAmount = useCallback(
    (id: string, amountCents: Cents, effectiveFrom: IsoDate) =>
      transformerAbonnement(id, (abonnement) =>
        withAmountChange(abonnement, amountCents, effectiveFrom),
      ),
    [transformerAbonnement],
  );

  const pauseSubscription = useCallback(
    (id: string, from: IsoDate, to: IsoDate | null) =>
      transformerAbonnement(id, (abonnement) => withPause(abonnement, from, to)),
    [transformerAbonnement],
  );

  const terminateSubscription = useCallback(
    (id: string, endDate: IsoDate) =>
      transformerAbonnement(id, (abonnement) => withTermination(abonnement, endDate)),
    [transformerAbonnement],
  );

  // --- Enveloppes budgétaires (fonctionnalité 001) --------------------------------------

  /** Crée l'enveloppe du couple, ou met à jour son plafond : jamais de doublon (EF-005). */
  const setEnvelopeLimit = useCallback(
    (category: string, month: MonthKey, limitCents: Cents) => {
      const actuel = lireInstantaneClient();
      const existante = findEnvelope(actuel.envelopes, category, month);

      const envelopes: Envelope[] = existante
        ? actuel.envelopes.map((e) =>
            e.id === existante.id ? { ...e, limitCents } : e,
          )
        : [...actuel.envelopes, { id: newId(), category, month, limitCents }];

      appliquer({ ...actuel, envelopes });
    },
    [appliquer],
  );

  const removeEnvelope = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({ ...actuel, envelopes: actuel.envelopes.filter((e) => e.id !== id) });
    },
    [appliquer],
  );

  /**
   * Copie les plafonds du mois précédent vers `month`, en **remplaçant** ceux qui s'y
   * trouvent. La confirmation est recueillie par l'interface (EF-021) : ce fournisseur ne
   * fait qu'appliquer une décision déjà prise.
   */
  const copyEnvelopesFromPreviousMonth = useCallback(
    (month: MonthKey) => {
      const actuel = lireInstantaneClient();
      const precedent = addMonthsToKey(month, -1);
      const copies = copyEnvelopesToMonth(actuel.envelopes, precedent, month);
      if (copies.length === 0) return false;

      appliquer({
        ...actuel,
        envelopes: [...actuel.envelopes.filter((e) => e.month !== month), ...copies],
      });
      return true;
    },
    [appliquer],
  );

  // --- Dépenses (fonctionnalité 003) ---------------------------------------------------

  const addExpense = useCallback(
    (depense: Omit<Expense, "id">) => {
      const actuel = lireInstantaneClient();
      appliquer({ ...actuel, expenses: [...actuel.expenses, { ...depense, id: newId() }] });
    },
    [appliquer],
  );

  const updateExpense = useCallback(
    (depense: Expense) => {
      const actuel = lireInstantaneClient();
      appliquer({
        ...actuel,
        expenses: actuel.expenses.map((e) => (e.id === depense.id ? depense : e)),
      });
    },
    [appliquer],
  );

  const removeExpense = useCallback(
    (id: string) => {
      const actuel = lireInstantaneClient();
      appliquer({ ...actuel, expenses: actuel.expenses.filter((e) => e.id !== id) });
    },
    [appliquer],
  );

  // --- Synchronisation bancaire (fonctionnalité 006) ----------------------------------------

  /**
   * Récupère les opérations et les traite **en un seul lot, une seule mutation** (D11).
   *
   * Le traitement n'a lieu que si la copie locale est à jour : ni modification en attente, ni
   * conflit (R13). La vérification est refaite **après** l'appel réseau, l'état ayant pu changer
   * pendant l'attente. L'import passe ensuite par `appliquer`, comme une saisie : aucun nouveau
   * type de conflit n'apparaît (R1).
   */
  const synchroniserBanques = useCallback(
    async (manuelle: boolean) => {
      const importFrom = lireInstantaneClient().banking.importFrom;
      if (importFrom === null) return;

      setBankSyncState("syncing");
      const resultat = await fetchOperations(importFrom, manuelle);
      if (!resultat.ok) {
        setBankSyncState(resultat.reason);
        return;
      }
      setBankStatus(resultat.value.status);
      setBankSyncState("idle");

      if (readSyncMetadata().pendingChanges || conflitEnCours.current) return;

      const actuel = lireInstantaneClient();
      const suivant = processBatch(resultat.value.operations, actuel);
      if (suivant !== actuel) appliquer(suivant);
    },
    [appliquer],
  );

  useEffect(() => {
    declencherBanques.current = () => void synchroniserBanques(false);
  }, [synchroniserBanques]);

  useEffect(() => {
    conflitEnCours.current = conflict !== null;
  }, [conflict]);

  // État des banques au chargement, pour afficher le panneau même avant toute date de début.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const resultat = await fetchBankStatus();
      if (annule) return;
      if (resultat.ok) setBankStatus(resultat.value);
      else setBankSyncState(resultat.reason);
    })();
    return () => {
      annule = true;
    };
  }, []);

  const setImportFrom = useCallback(
    (date: IsoDate) => {
      const actuel = lireInstantaneClient();
      // Figée dès la première opération traitée : la déplacer ensuite ferait réapparaître ou
      // disparaître des opérations déjà tranchées.
      if (actuel.banking.ledger.length > 0) return false;
      return appliquer({ ...actuel, banking: { ...actuel.banking, importFrom: date } });
    },
    [appliquer],
  );

  const connectBank = useCallback(async (bank: BankSource) => {
    const resultat = await startConnect(bank);
    if (!resultat.ok) return resultat.reason;
    window.location.assign(resultat.value);
    return null;
  }, []);

  const classifyInboxAsExpense = useCallback(
    (ref: string, category: string | null) => {
      const actuel = lireInstantaneClient();
      const suivant = classifyAsExpense(actuel, ref, category);
      if (suivant !== actuel) appliquer(suivant);
    },
    [appliquer],
  );

  const classifyInboxAsIgnored = useCallback(
    (ref: string) => {
      const actuel = lireInstantaneClient();
      const suivant = classifyAsIgnored(actuel, ref);
      if (suivant !== actuel) appliquer(suivant);
    },
    [appliquer],
  );

  const classifyInboxWithRule = useCallback(
    (ref: string, contains: string, subscriptionId: string | null) => {
      const resultat = classifyWithRule(lireInstantaneClient(), ref, {
        id: newId(),
        contains,
        action:
          subscriptionId === null
            ? { type: "ignore" }
            : { type: "subscription", subscriptionId },
      });
      if (!resultat.ok) return false;
      appliquer(resultat.document);
      return true;
    },
    [appliquer],
  );

  // --- Export et import (fonctionnalité 004) -------------------------------------------

  const exportData = useCallback(() => {
    const maintenant = new Date();
    const contenu = serializeExport(lireInstantaneClient(), maintenant);
    return triggerDownload(contenu, buildExportFilename(maintenant));
  }, []);

  /**
   * Analyse un fichier SANS rien écrire. C'est cette séparation d'avec `confirmImport` qui
   * garantit qu'un fichier refusé ne touche jamais les données (EF-026).
   */
  const prepareImport = useCallback((raw: string) => parseImport(raw), []);

  /**
   * L'import emprunte **le chemin de mutation ordinaire** (`appliquer`), et non une écriture
   * qui lui serait propre. C'est ce qui lui fait atteindre le stockage central sans une ligne
   * de code de synchronisation dédiée (EF-014, EF-015) — et ce qui garantit qu'il ne pourra
   * pas diverger du reste si le protocole évolue.
   */
  const confirmImport = useCallback(
    (doc: BudgetDocument) => {
      // Le point de restauration est capturé AVANT l'écriture : l'inverse le perdrait au
      // moment précis où il sert.
      const anterieur = lireInstantaneClient();
      if (!appliquer(doc)) return false;
      setPointRestauration(anterieur);
      return true;
    },
    [appliquer],
  );

  const undoImport = useCallback(() => {
    if (!pointRestauration) return false;
    if (!appliquer(pointRestauration)) return false;
    setPointRestauration(null);
    return true;
  }, [appliquer, pointRestauration]);

  const notice: BudgetNotice = alerteMasquee
    ? null
    : erreurEcriture
      ? "writeFailed"
      : ready && quarantaineDetectee
        ? "quarantined"
        : // Les alertes du stockage central rejoignent le mécanisme existant plutôt que d'en
          // ouvrir un second, mais passent après les échecs locaux : ce qui menace la copie
          // de travail est plus urgent que ce qui menace la copie partagée.
          alerteDistante;

  const valeur = useMemo<BudgetContextValue>(
    () => ({
      document,
      ready,
      notice,
      dismissNotice: () => setAlerteMasquee(true),
      syncState,
      pendingChanges,
      conflict,
      refreshFromServer: () => void tirer(),
      resolveConflictKeepLocal,
      resolveConflictTakeRemote,
      today,
      selectedMonth,
      setSelectedMonth,
      goToAdjacentMonth: (offset: number) =>
        setSelectedMonth((precedent) => addMonthsToKey(precedent, offset)),
      goToCurrentMonth: () => setSelectedMonth(moisCourant()),
      addIncome,
      updateIncome,
      removeIncome,
      addSubscription,
      updateSubscription,
      removeSubscription,
      changeSubscriptionAmount,
      pauseSubscription,
      terminateSubscription,
      setEnvelopeLimit,
      removeEnvelope,
      copyEnvelopesFromPreviousMonth,
      addExpense,
      updateExpense,
      removeExpense,
      exportData,
      prepareImport,
      confirmImport,
      undoImport,
      canUndoImport: pointRestauration !== null,
      bankStatus,
      bankSyncState,
      setImportFrom,
      connectBank,
      syncBanks: () => void synchroniserBanques(true),
      classifyInboxAsExpense,
      classifyInboxAsIgnored,
      classifyInboxWithRule,
    }),
    [
      document,
      ready,
      notice,
      syncState,
      pendingChanges,
      conflict,
      tirer,
      resolveConflictKeepLocal,
      resolveConflictTakeRemote,
      today,
      selectedMonth,
      addIncome,
      updateIncome,
      removeIncome,
      addSubscription,
      updateSubscription,
      removeSubscription,
      changeSubscriptionAmount,
      pauseSubscription,
      terminateSubscription,
      setEnvelopeLimit,
      removeEnvelope,
      copyEnvelopesFromPreviousMonth,
      addExpense,
      updateExpense,
      removeExpense,
      exportData,
      prepareImport,
      confirmImport,
      undoImport,
      pointRestauration,
      bankStatus,
      bankSyncState,
      setImportFrom,
      connectBank,
      synchroniserBanques,
      classifyInboxAsExpense,
      classifyInboxAsIgnored,
      classifyInboxWithRule,
    ],
  );

  return <BudgetContext.Provider value={valeur}>{children}</BudgetContext.Provider>;
}

export function useBudget(): BudgetContextValue {
  const valeur = useContext(BudgetContext);
  if (!valeur) {
    throw new Error("useBudget doit être appelé à l’intérieur de <BudgetProvider>.");
  }
  return valeur;
}
