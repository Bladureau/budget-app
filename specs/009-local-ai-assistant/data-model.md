# Modèle de données : Assistant du budget (IA locale)

Voir [spec.md](./spec.md) (entités clés) et [research.md](./research.md).

**Aucune donnée n'est persistée par cette fonctionnalité.** Le document budgétaire n'est pas modifié :
`DOCUMENT_VERSION` reste à 5, `parseDocument` et les migrations restent intacts, l'export et l'import
ne changent pas (EF-014, principe « Contraintes techniques et de données »). Tout ce qui suit est
**dérivé ou éphémère**.

Convention du projet : montants en `Cents` (entiers), dates en `IsoDate`, mois en `MonthKey`.

---

## 1. Contexte budgétaire — côté serveur, jamais stocké

Produit par `buildAssistantContext(doc, month, today, question)` (fonction pure, sans accès disque ni
réseau). Il se compose d'un **objet de données** envoyé au modèle, et d'un **registre des valeurs
connues** gardé côté serveur pour le contrôle des montants.

```ts
interface AssistantContext {
  /** Objet sérialisé en JSON dans le prompt. Tous les montants y sont déjà des chaînes formatées. */
  data: AssistantData;
  /** Valeurs réellement présentes dans `data`, pour le contrôle de fin de réponse (R6). */
  known: KnownValues;
}

interface KnownValues {
  /** Valeur absolue, en centimes, de chaque montant écrit dans `data`. */
  cents: ReadonlySet<Cents>;
  /** Chaque pourcentage écrit dans `data`, à une décimale (ex. 60.4). Le seul est le taux d'engagement. */
  percents: ReadonlySet<number>;
}
```

### `AssistantData` (contenu du prompt)

| Champ | Type | Source (fonction existante) |
|---|---|---|
| `mois` | `string` (« octobre 2026 ») | `formatMonthFr` |
| `moisCourant` | `boolean` | comparaison `month` / mois de `today` |
| `aujourdhui` | `string` (« 24/10/2026 ») | `formatIsoDateFr` (omis hors mois courant) |
| `budgetVide` | `boolean` | document sans revenu, abonnement, dépense ni enveloppe |
| `synthese.revenusDuMois`, `.totalAbonnements`, `.revenusNets`, `.disponible`, `.depense`, `.rembourse`, `.resteDuMois`, `.depassement?`, `.etatDuMois` | `string` | `computeMonthlyBudget`, `computeMonthlySpending` — **les noms reprennent les mots de l'utilisateur** (« reste du mois », « total des abonnements »), que les consignes relient explicitement aux champs (validation du 24/10 : le modèle confondait `reste` et `disponible`) |
| `synthese.tauxEngagement` | `string` (« 60,4 % ») ou absent si les revenus sont nuls | `computeMonthlyBudget().commitmentRate` via `formatRateFr` — **le seul pourcentage du contexte**, parce que c'est le seul affiché à l'écran (onglet Mois) |
| `jour` | `{ parJour, depenseAujourdhui, resteAujourdhui, report, joursRestants }` ou absent | `computeDailyAllowance` (mois courant uniquement) |
| `reserve` | `{ reserveEnDebutDeMois, partDEpargneDuMois, moisRestants, epargneEntameeCeMois, reserveEnFinDeMoisPrevue, horizonAtteint? }` — un solde négatif se dit « Réserve épuisée — découvert de X » comme à l'écran, jamais comme un montant négatif ; la part est bornée à zéro | `computeReserveState` |
| `enveloppes[]` | `{ categorie, plafond, depense, reste, depassement, etat }` — **sans pourcentage** : l'écran n'en affiche pas par enveloppe, et un pourcentage que l'écran ne montre pas n'aurait aucune référence pour CR-001 | `computeMonthlyEnvelopes` |
| `nonBudgete` | `{ total, categories[] }` (≤ 10) | `computeMonthlyEnvelopes().unbudgeted` |
| `abonnements[]` | `{ libelle, montant, echeance }` (≤ 25) | `computeMonthlyBudget().breakdown` |
| `revenus[]` | `{ libelle, montant, date }` (≤ 10) | `occurrencesInMonth` |
| `prochainesEcheances[]` | `{ libelle, montant, date }` (≤ 5) | `listUpcomingDues` |
| `operationsRecentes[]` | `OperationLigne` (≤ 25) | dépenses et remboursements du mois, du plus récent au plus ancien |
| `correspondances` | `{ motsCles, nombre, total, sensDuTotal, partielle?, operations[] (≤ 20) }` ou absent — le total est dépenses moins remboursements, calculé par l'application ; `sensDuTotal` vaut `remboursement` quand ceux-ci l'emportent | recherche par mots-clés (R4), `extractKeywords` et `normalizeForSearch` |
| `aClasser` | `number` | nombre d'`InboxItem` (le détail n'est pas transmis) |

### `OperationLigne`

| Champ | Règle |
|---|---|
| `date` | `formatIsoDateFr` |
| `libelle` | `Expense.label` (ou « Sans libellé »), **assaini** (R7) : sans retour à la ligne ni caractère de contrôle, espaces réduites, ≤ 60 caractères |
| `categorie` | `string` ou `"Sans catégorie"`, assainie de la même façon |
| `montant` | montant formaté ; un remboursement est marqué `sens: "remboursement"` et non par un signe |
| `sens` | `"depense"` \| `"remboursement"` |
| `origine` | `"manuelle"` \| `"banque"` (jamais `bankRef`, `source` ni identifiant) |

**Jamais transmis** (EF-016) : `rawLabel`, `bankRef`, `Expense.id`, états du registre bancaire, règles,
jeton d'accès, jetons Enable Banking, chemins.

### Règles de validation et de taille

- Toute chaîne de montant est produite par **une seule fonction** `montant(cents)` qui appelle
  `formatCents` (le seul point d'appel à `Intl.NumberFormat`, principe II) **et** enregistre la valeur
  absolue dans `known.cents`. De même `pourcentage(ratio)` pour `known.percents`.
- Le JSON sérialisé ne dépasse pas **10 000 caractères** (R5). Dépassement : on réduit, dans cet
  ordre, `operationsRecentes`, `revenus`, `abonnements`, `nonBudgete.categories`, `correspondances.operations`,
  jusqu'à tenir ; les agrégats (`synthese`, `jour`, `reserve`, `enveloppes`) ne sont jamais réduits. Si
  même eux dépassent (cas pathologique : des centaines d'enveloppes), `enveloppes` est tronquée aux 30
  plus consommées et le champ `enveloppesTronquees: true` l'indique au modèle.
- Les listes sont toujours triées de façon déterministe (comme les écrans), ce qui rend le contexte
  testable à l'octet près.

---

## 2. Question et historique — dans la requête

```ts
interface AssistantRequest {
  month: MonthKey;        // validé par isValidMonthKey
  today: IsoDate;         // validé par isValidIsoDate
  messages: ChatTurn[];   // la conversation, la dernière entrée étant la question
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
```

| Règle | Valeur | Origine |
|---|---|---|
| `messages` non vide, dernière entrée de rôle `user` | — | structure |
| Rôles alternés, en commençant par `user` | — | structure |
| Longueur de la dernière question | 1 à **500** caractères après `trim()` | EF-019 |
| Longueur d'un message passé | ≤ 6 000 caractères (réponse) / ≤ 500 (question) | borne de sécurité |
| Nombre de messages | ≤ 40 | borne de sécurité |
| Historique transmis au modèle | derniers échanges tenant dans **3 000** caractères | R5, récit 3 scénario 3 |

L'historique ne contient que des **échanges terminés** : une réponse annulée, interrompue ou en erreur
n'y figure pas (le client ne renvoie pas ces échanges ; sa question reste affichée).

---

## 3. Conversation — côté client, en mémoire du composant

État éphémère d'un composant React ; perdu au rechargement et au changement de mois (EF-014).

```ts
type ExchangeStatus =
  | "waiting"      // envoyée, aucun morceau reçu encore
  | "loading"      // le serveur signale que le modèle se charge
  | "streaming"    // des morceaux arrivent
  | "done"
  | "cancelled"    // annulée par l'utilisateur
  | "interrupted"  // flux coupé (IA arrêtée, coupure réseau)
  | "unavailable"  // IA absente, injoignable ou délai dépassé
  | "unauthorized" // 401
  | "failed";      // autre erreur serveur

interface Exchange {
  id: string;                  // identifiant local, jamais envoyé
  question: string;
  answer: string;              // texte reçu jusqu'ici
  status: ExchangeStatus;
  unverified: string[];        // montants non vérifiés, renseignés à la fin
}

interface ConversationState {
  exchanges: Exchange[];
}
```

### Transitions

```
waiting ──status──▶ loading ──text──▶ streaming ──done──▶ done
   │                   │                  │
   │                   │                  ├──abort utilisateur──▶ cancelled
   │                   │                  └──error / flux coupé──▶ interrupted
   ├──abort utilisateur──▶ cancelled
   ├──HTTP 503 ou error "unavailable"/"timeout"──▶ unavailable
   ├──HTTP 401──▶ unauthorized
   └──autre──▶ failed
```

Un échange est **en cours** tant que son statut est `waiting`, `loading` ou `streaming`. Au plus un
échange est en cours à la fois (EF-020).

### Actions (réducteur pur)

| Action | Préconditions | Effet |
|---|---|---|
| `send(question)` | aucun échange en cours ; question valide (1 à 500 caractères) | ajoute un échange `waiting` |
| `edit(exchangeId, question)` | aucun échange en cours ; question valide et différente de l'originale | **remplace** cet échange et tous les suivants par un nouvel échange `waiting` (EF-025) |
| `cancel()` | un échange en cours | passe l'échange à `cancelled`, conserve `answer` |
| `reset()` | aucun échange en cours (une réponse annulée n'est plus en cours) | vide `exchanges` (EF-013) |
| `receive(event)` | échange en cours | applique `status` / `text` / `done` / `error` |

Une action dont les préconditions ne sont pas remplies est **ignorée** (le réducteur ne lève pas) ; c'est
l'interface qui désactive les boutons correspondants et en donne la raison en texte.

### Historique envoyé

`messages = exchanges terminés (status "done") aplatis en [user, assistant, …] + la nouvelle question`.
Les échanges `cancelled`, `interrupted`, `unavailable`, `unauthorized` et `failed` sont omis.

---

## 4. Configuration — variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `OLLAMA_URL` | `http://ollama:11434` | Adresse interne d'Ollama (réseau Docker `ollama`) |
| `OLLAMA_MODEL` | `qwen3.5:9b` | Modèle interrogé |

Lues **à chaque appel** (comme `BUDGET_DATA_DIR`), pas au chargement du module, pour que les tests les
changent d'un cas à l'autre. Aucun secret : Ollama n'en a pas, et son port n'est pas publié. Constantes
non réglables : `num_ctx = 8192`, délai maximal 120 s, vérification de disponibilité 3 s, `think: false`.
