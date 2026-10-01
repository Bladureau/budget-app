# Modèle de données : Synchronisation bancaire automatique

**Fonctionnalité** : [spec.md](./spec.md) · **Recherche** : [research.md](./research.md)

Deux espaces de données, délibérément séparés (R1) :

| Espace | Fichier | Contenu | Synchronisé entre appareils | Exporté |
| --- | --- | --- | --- | --- |
| **Budget** | `budget.json` (serveur) + `localStorage` | Dépenses, remboursements, registre, règles, « À classer » | Oui (protocole 005) | **Oui** (EF-035) |
| **Banque** | `banking.json` (serveur uniquement) | Autorisations, opérations normalisées en cache, dates de récupération | Non | **Non** |

Le budget contient tout ce qui relève des **choix de l'utilisateur**. La banque contient tout ce qui
peut être **récupéré à nouveau** ou qui est **secret**.

---

## 1. Document budgétaire, version 4

`DOCUMENT_VERSION` passe de 3 à 4. La migration 3 → 4 est **purement additive**, comme les deux
précédentes : rien d'existant n'est transformé.

```text
BudgetDocument v4
├── version: 4
├── incomes        (inchangé)
├── subscriptions  (inchangé)
├── expenses       (étendu — §1.1)
├── envelopes      (inchangé)
├── refunds        NOUVEAU — §1.2
└── banking        NOUVEAU — §1.3
```

### 1.1 `Expense`, étendue

| Champ | Type | Règle |
| --- | --- | --- |
| *(champs existants)* | | inchangés : `amountCents > 0`, `date`, `label?`, `category` |
| `source` | `"lcl" \| "revolut"` *(facultatif)* | **Absent = saisie manuelle.** Aucune valeur `"manual"` n'est stockée, ce qui laisse les dépenses existantes valides sans migration. |
| `bankRef` | `string` *(facultatif)* | Référence de l'opération d'origine (§2). Présent si et seulement si `source` l'est. |

L'identifiant d'une dépense importée est **déterministe** : `bank:<bankRef>`, par exemple
`bank:lcl:6abba36b-1d06-a805-9b52-98862d861695` (moins de 100 caractères, limite actuelle de
`identifiantValide`).

**Fusion des arrondis** : `amountCents` vaut paiement + arrondi (5,45 € + 0,55 € → `600`). La
somme est faite en centimes entiers (EF-037).

### 1.2 `Refund` (nouvelle)

| Champ | Type | Règle |
| --- | --- | --- |
| `id` | `Id` | `bank:<bankRef>` pour un remboursement importé |
| `amountCents` | `Cents` | **Strictement positif.** Le sens « déduction » est porté par la collection, jamais par le signe (R9). |
| `date` | `IsoDate` | Date de comptabilisation du remboursement |
| `label` | `string` *(facultatif)* | Nom du commerçant |
| `category` | `string \| null` | Déterminée par les règles de catégorie, comme une dépense |
| `source` | `"lcl" \| "revolut"` | Toujours présent : seul l'import crée un remboursement |
| `bankRef` | `string` | Référence de l'opération d'origine |

**Effet sur les calculs** (EF-031, EF-032) :

- **dépensé net** d'un jour, d'un mois ou d'une enveloppe = Σ dépenses − Σ remboursements de ce
  périmètre ;
- l'anneau, l'allocation quotidienne et l'état d'une enveloppe utilisent le dépensé net **borné
  à 0** ;
- un excédent de remboursement (net < 0) est exposé séparément, jamais présenté comme une
  dépense négative.

### 1.3 `banking` (nouveau)

```text
banking
├── importFrom:     IsoDate | null
├── ledger:         LedgerEntry[]
├── inbox:          InboxItem[]
├── rules:          TreatmentRule[]
└── categoryRules:  CategoryRule[]
```

#### `importFrom`

Date de début d'import (R12, EF-039). `null` tant qu'aucune banque n'a été reliée. **Modifiable
seulement tant que `ledger` est vide** : la changer ensuite ferait réapparaître ou disparaître
des opérations déjà tranchées.

#### `LedgerEntry` (registre)

| Champ | Type | Règle |
| --- | --- | --- |
| `ref` | `string` | Référence d'opération (§2). **Unique** dans le registre. |
| `outcome` | `"expense" \| "refund" \| "ignored" \| "inbox"` | Sort de l'opération |
| `reason` | `string` | Code de la règle qui a tranché (`structural:revolutTopUp`, `rule:<id>`, `user:classified`…). Sert à expliquer le sort, jamais à recalculer. |
| `mergedRefs` | `string[]` *(facultatif)* | Arrondis fusionnés dans cette opération, eux aussi réputés traités |

**Invariants** :

- une référence présente au registre n'est **jamais** retraitée (R2) ;
- `outcome: "expense"` n'implique **pas** que la dépense existe encore : l'utilisateur a pu la
  supprimer, et c'est précisément ce qui l'empêche de revenir (EF-034).

**Transitions** : `inbox` → `expense` | `ignored` (classement par l'utilisateur). Aucune autre
transition : un sort tranché est définitif. Pour revenir sur une opération ignorée par erreur,
l'utilisateur saisit la dépense à la main.

#### `InboxItem` (« À classer »)

Instantané de l'opération, pour que la liste s'affiche sans le serveur, hors connexion comprise.

| Champ | Type |
| --- | --- |
| `ref` | `string` (figure aussi au registre avec `outcome: "inbox"`) |
| `bank` | `"lcl" \| "revolut"` |
| `date` | `IsoDate` (date de paiement si connue, sinon de comptabilisation) |
| `amountCents` | `Cents > 0` |
| `direction` | `"debit" \| "credit"` |
| `kind` | nature normalisée (§2) |
| `label` | libellé lisible (commerçant ou bénéficiaire) |
| `rawLabel` | libellé bancaire complet, pour décider en connaissance de cause |
| `why` | `"noRule" \| "possibleSubscription" \| "ambiguousRoundUp" \| "foreignCurrency" \| "unreadableDate"` |

Classer un élément le **retire** de `inbox` et met à jour `ledger`.

#### `TreatmentRule` (règle de traitement)

| Champ | Type | Règle |
| --- | --- | --- |
| `id` | `Id` | |
| `bank` | `"lcl" \| "revolut" \| null` | `null` = les deux banques |
| `contains` | `string` | Recherché **sans tenir compte de la casse ni des accents** (réutilise `normalizeForSearch`) dans le libellé lisible **et** le libellé brut. 2 à 80 caractères. |
| `action` | `{ type: "ignore" }` \| `{ type: "expense" }` \| `{ type: "subscription"; subscriptionId: Id }` | Une action `subscription` vers un abonnement supprimé se comporte comme `ignore` |

#### `CategoryRule` (règle de catégorie)

| Champ | Type | Règle |
| --- | --- | --- |
| `id` | `Id` | |
| `contains` | `string` | Recherché dans le **libellé lisible**, même normalisation |
| `category` | `string` | Texte libre, comme partout ailleurs (D3 de la fonctionnalité 001) |

**Ordre d'évaluation** : dans l'ordre du tableau ; la **première** règle qui correspond l'emporte.
« Appliquer à ce commerçant » (récit 6) insère la règle **en tête**.

### 1.4 Migration 3 → 4

```text
v3 ──► v4 :  + refunds: []
             + banking: { importFrom: null, ledger: [], inbox: [],
                          rules: RÈGLES_INITIALES, categoryRules: CATÉGORIES_INITIALES }
```

Les règles initiales sont celles de R11. Un document **déjà** en v4 n'est pas complété : si
l'utilisateur a supprimé une règle initiale, elle ne revient pas.

L'export suit : `FORMAT_VERSION` (`transfer.ts`) passe à 4. Un export v1 à v3 reste importable et
migré ; un export v5 reste refusé (EF-016 de 005, inchangée).

### 1.5 Validation (`parseDocument`)

S'ajoutent aux contrôles existants :

- `refunds[]` : mêmes règles qu'une dépense, plus `source` et `bankRef` obligatoires ;
- `ledger[].ref` unique ; `inbox[].ref` unique et présent au registre avec `outcome: "inbox"` ;
- `bankRef` unique sur l'ensemble dépenses + remboursements ;
- les identifiants des remboursements et des règles entrent dans le contrôle d'unicité global
  existant ;
- `importFrom` : date valide ou `null`.

---

## 2. Opération bancaire normalisée (`BankOperation`)

Produite par le serveur (R7), transportée vers le navigateur, **jamais persistée dans le budget**
autrement que par son sort et, pour « À classer », son instantané.

| Champ | Type | Règle |
| --- | --- | --- |
| `ref` | `string` | `"<bank>:<entry_reference>"` |
| `bank` | `"lcl" \| "revolut"` | |
| `bookingDate` | `IsoDate` | Date de comptabilisation |
| `paymentDate` | `IsoDate \| null` | LCL carte : date du libellé ; Revolut : `bookingDate` ; sinon `null` |
| `amountCents` | `Cents` | **≥ 0**, converti depuis le texte (EF-036). Zéro est possible (pré-autorisation). |
| `currency` | `string` | Code ISO 4217 ; seul `EUR` est importé (EF-038) |
| `direction` | `"debit" \| "credit"` | |
| `kind` | `BankOperationKind` | voir ci-dessous |
| `label` | `string` | Libellé lisible : commerçant ou bénéficiaire |
| `rawLabel` | `string` | Libellé bancaire complet, lignes jointes par ` · ` |
| `roundUpCents` | `Cents` *(facultatif)* | Arrondi Revolut fusionné (R8) |
| `roundUpRef` | `string` *(facultatif)* | Référence de cet arrondi |

`BankOperationKind` :
`card` · `cardRefund` · `transferOut` · `transferIn` · `directDebit` · `bankFee` ·
`topUp` · `roundUp` · `other`

Les tables de correspondance par banque sont dans
[contracts/normalisation.md](./contracts/normalisation.md).

---

## 3. État bancaire du serveur (`banking.json`)

Écrit atomiquement et sérialisé, selon le même schéma que `budget.json` (D8 de 005), mais dans
un **fichier distinct** : un incident sur l'un ne touche pas l'autre.

```text
banking.json
├── version: 1
└── connections: BankConnection[]   (au plus une par banque)
```

### `BankConnection`

| Champ | Type | Règle |
| --- | --- | --- |
| `bank` | `"lcl" \| "revolut"` | |
| `sessionId` | `string` | Session Enable Banking. **Donnée sensible** : jamais renvoyée au navigateur. |
| `accountUid` | `string` | Identifiant du compte **pour cette session** (il change à chaque autorisation) |
| `ibanHash` | `string` | Empreinte SHA-256 (hexadécimal) de l'IBAN **normalisé** (majuscules, sans espaces). Sert seule à reconnaître le compte (EF-003). |
| `ibanSuffix` | `string` | 4 derniers caractères, pour l'affichage uniquement. L'IBAN complet n'est conservé nulle part. |
| `validUntil` | `string` (ISO 8601) | Fin de l'autorisation |
| `lastFetchAt` | `string \| null` | Dernière récupération réussie |
| `lastAttemptAt` | `string \| null` | Dernière tentative, réussie ou non (bornes de R3) |
| `lastError` | `BankError \| null` | `"expired"`, `"revoked"`, `"noAccount"`, `"rateLimited"`, `"unavailable"` |
| `operations` | `BankOperation[]` | Cache des opérations comptabilisées depuis `importFrom − 7 jours`, dédupliqué par `ref` |

**Reconnaître le compte** (EF-003) :

- **renouvellement** : le compte retenu est celui dont l'empreinte d'IBAN égale `ibanHash`. Sans
  correspondance, la connexion passe en erreur `noAccount` et l'ancienne session n'est pas
  remplacée ;
- **première liaison** : le compte retenu est le compte de la session **s'il est seul**, quelle
  que soit la devise annoncée — LCL annonce `XXX` (« sans devise ») pour un compte courant en
  euros, constaté à la mise en service. Sinon, l'**unique** compte en `EUR`. Aucun, ou plusieurs
  sans moyen de les départager : erreur `noAccount`, rien n'est enregistré.

Un suffixe de 4 caractères ne suffit pas à identifier un compte : il ne sert qu'à l'affichage.

**Liaisons en cours** : les `state` de R4 vivent **en mémoire**, jamais dans ce fichier.

---

## 4. Ce qui n'est stocké nulle part

- les **totaux nets**, restes et états d'enveloppe : toujours dérivés (EF-010 de 005) ;
- le **JWT** : recalculé à chaque appel ;
- la **clé privée** et l'**identifiant d'application** : environnement et fichier monté (R6) ;
- l'**IBAN complet** : seuls son empreinte et son suffixe sont conservés, côté serveur ; ni l'un
  ni l'autre ne sont renvoyés au navigateur, à l'exception du suffixe affiché.
