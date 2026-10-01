# Contrat : traitement d'une opération par les règles

**Fonctionnalité** : [spec.md](../spec.md) · **Modèle** : [data-model.md](../data-model.md) §1.3

Une fonction **pure** décide du sort d'une `BankOperation` à partir du document budgétaire. Elle
ne lit ni horloge, ni réseau, ni stockage : c'est ce qui permet de la tester sur les opérations
de septembre sans rien simuler.

```text
decide(operation, document) → Décision
Décision = { outcome: "expense",  expense: Expense,  reason }
         | { outcome: "refund",   refund: Refund,    reason }
         | { outcome: "ignored",                     reason }
         | { outcome: "inbox",    item: InboxItem,   reason }
         | { outcome: "skip" }   // non traitée, non inscrite au registre
```

---

## 1. Ordre d'évaluation

La **première** étape qui tranche l'emporte.

| # | Condition | Sort | `reason` |
| --- | --- | --- | --- |
| 0 | `ref` déjà au registre | `skip` | — |
| 1 | date de paiement (ou de comptabilisation à défaut) **antérieure à `importFrom`**, ou `importFrom` nul | `skip` | — |
| 2 | `currency ≠ "EUR"` | `inbox` | `structural:foreignCurrency` |
| 3 | `kind = cardRefund` | `refund` | `structural:cardRefund` |
| 4 | `direction = credit` | `ignored` | `structural:income` |
| 5 | LCL, `kind = card`, libellé commençant par `Revolut` | `ignored` | `structural:revolutTopUp` |
| 6 | Revolut, `kind = topUp` | `ignored` | `structural:topUp` |
| 7 | `amountCents = 0` | `ignored` | `structural:zeroAmount` |
| 8 | `kind = roundUp` (non fusionné) | `inbox` (`why: ambiguousRoundUp`) | `structural:roundUp` |
| 9 | **première règle de traitement** de l'utilisateur qui correspond | selon l'action : `ignored`, `expense`, ou `ignored` (abonnement) | `rule:<id>` |
| 9 bis | `kind = card` ou `directDebit`, et le libellé normalisé **contient le libellé normalisé d'un abonnement** existant (3 caractères au moins) | `inbox` (`why: possibleSubscription`) | `structural:possibleSubscription` |
| 10 | `kind = card` et `paymentDate` connue | `expense` | `structural:card` |
| 11 | `kind = card` et `paymentDate` nulle | `inbox` (`why: unreadableDate`) | `structural:card` |
| 12 | tout le reste (virement sortant, prélèvement, frais, `other`) | `inbox` (`why: noRule`) | `structural:unknown` |

**Pourquoi l'étape 1 renvoie `skip` et non `ignored`** : une opération antérieure à la date de
début ne doit pas encombrer le registre. Le serveur la renvoie à chaque appel, puisqu'il remonte
7 jours avant `importFrom` ; elle est simplement écartée à nouveau, à coût nul.

**Pourquoi l'étape 9 bis** : un abonnement payé par carte (Spotify) serait sinon importé comme
dépense à sa première occurrence, et compté deux fois avec la charge déjà saisie. L'étape ne
**devine** rien : elle se contente d'envoyer l'opération « À classer » au lieu de l'importer,
et c'est l'utilisateur qui la rattache (R10). Un faux positif coûte un geste ; un faux négatif
reste couvert par le rattachement manuel.

**Pourquoi les remboursements passent avant les règles de l'utilisateur** : une règle « ignorer
Uber Eats » vise les dépenses. Un remboursement d'Uber Eats doit pourtant venir en déduction ;
l'ignorer gonflerait les dépenses à tort.

---

## 2. Production d'une dépense

| Champ | Valeur |
| --- | --- |
| `id` | `bank:<ref>` |
| `amountCents` | `amountCents + (roundUpCents ?? 0)` |
| `date` | `paymentDate`, ou `bookingDate` si elle est nulle (prélèvement ou virement importé par une règle, comme `UMS-ULYS`) |
| `label` | `label`, tronqué à 80 caractères |
| `category` | première règle de catégorie qui correspond, sinon `null` |
| `source` / `bankRef` | `bank` / `ref` |

Entrée au registre : `{ ref, outcome: "expense", reason, mergedRefs: [roundUpRef] si présent }`.

Un **remboursement** suit le même schéma, daté de `bookingDate` (un remboursement LCL porte la
date de l'achat initial dans son libellé, mais c'est le jour où l'argent revient qui compte pour
le reste à dépenser).

---

## 3. Application d'un lot

```text
processBatch(operations, document) → document'
```

- les opérations sont traitées dans l'ordre reçu, **chacune voyant les inscriptions au registre
  des précédentes** ;
- toutes les décisions d'un lot produisent **un seul** nouveau document, donc **une seule**
  mutation `appliquer()` et une seule poussée ;
- lot sans aucune décision autre que `skip` : document inchangé, aucune mutation.

**Propriétés exigées par les tests** :

1. **Idempotence** : `processBatch(ops, processBatch(ops, d)) = processBatch(ops, d)`.
2. **Indépendance à l'appareil** : deux appareils qui traitent les mêmes opérations sur le même
   document produisent des documents identiques (identifiants déterministes, R2).
3. **Respect des corrections** : une dépense importée modifiée ou supprimée n'est jamais
   recréée ni modifiée.

---

## 4. Classement manuel (« À classer »)

| Choix | Effet |
| --- | --- |
| « Dépense » (+ catégorie facultative) | dépense produite comme au §2, datée de `date` de l'élément ; registre → `expense`, `reason: user:classified` |
| « Ignorer » | registre → `ignored`, `reason: user:classified` |
| « Toujours ignorer » | idem, et règle `{ bank, contains, action: ignore }` ajoutée **en tête** ; `contains` est proposé (libellé lisible) et modifiable avant validation |
| « Rattacher à l'abonnement… » | idem, avec `action: subscription` |

Une nouvelle règle **ne s'applique qu'aux opérations futures** et aux autres éléments encore
« À classer » qu'elle viserait. Elle ne revient jamais sur un sort déjà tranché.

---

## 5. Jeu d'essai de référence (septembre 2026, `importFrom` = 2026-09-01)

Hypothèse : le document contient un abonnement libellé « Spotify ». Attendu après traitement des
39 opérations LCL et des 28 opérations Revolut (19 après fusion des 9 arrondis), avant tout
classement manuel :

| Sort | LCL (39) | Revolut (19) |
| --- | --- | --- |
| Dépense — paiement carte (étape 10) | 18 | 8, arrondis inclus |
| Dépense — règle initiale `UMS-ULYS` | 1 | — |
| Remboursement — Twitch 4,99 € | 1 | — |
| Ignorée — recharge `CB Revolut` | 6 | — |
| Ignorée — crédit | 7 | 7 recharges |
| Ignorée — 0,00 € | — | 3 |
| Ignorée — règle initiale | 1 (loyer) | 1 (Bunq, avec son arrondi) |
| « À classer » | 5 : Spotify (`possibleSubscription`), cotisation carte, virements vers un proche ×2, virement vers soi-même | 0 |

Total dépensé net attendu : à calculer dans le test à partir des montants du jeu d'essai
synthétique, jamais saisi en dur dans ce document.
