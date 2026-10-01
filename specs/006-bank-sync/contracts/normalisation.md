# Contrat : normalisation des opérations bancaires

**Fonctionnalité** : [spec.md](../spec.md) · **Modèle** : [data-model.md](../data-model.md) §2

Deux fonctions **pures**, une par banque, transforment une transaction brute d'Enable Banking en
`BankOperation`. Elles sont la frontière où des données externes entrent dans le domaine
(principes III et IV) : toute transaction mal formée est **écartée et comptée**, jamais devinée.

Exemples tirés des opérations réelles de septembre 2026, **anonymisés** (noms et références
modifiés).

---

## 1. Règles communes

| Élément | Règle |
| --- | --- |
| Statut | Seul `status: "BOOK"` est retenu (EF-009) |
| `ref` | `"<bank>:" + entry_reference`. Transaction sans `entry_reference` : écartée. |
| Montant | `transaction_amount.amount` est du **texte**. Accepté : `^\d+(\.\d{1,2})?$`. Conversion : partie entière × 100 + décimales complétées à 2 chiffres. `"35.8"` → 3580 ; `"50"` → 5000 ; `"0.00"` → 0. **Jamais `parseFloat`** (EF-036). Un signe éventuel est ignoré : le sens vient de `credit_debit_indicator`. |
| Sens | `DBIT` → `debit`, `CRDT` → `credit`. Toute autre valeur : transaction écartée. |
| Devise | `transaction_amount.currency`, transmise telle quelle |
| `bookingDate` | `booking_date`, sinon `value_date`, sinon transaction écartée |

---

## 2. LCL

Toute l'information utile est dans `remittance_information`, un tableau de lignes. On appelle
`L0`, `L1`, `L2`… ses lignes, espaces de bord retirés.

### Nature

| `L0` commence par | Sens | `kind` |
| --- | --- | --- |
| `CARTE ANNUL` | crédit | `cardRefund` |
| `CARTE` | débit | `card` |
| `VIREMENT` / `VIR ` | débit | `transferOut` |
| `VIREMENT` / `VIR ` | crédit | `transferIn` |
| `PRELVT` / `PRLV` | débit | `directDebit` |
| `COTISATION` / `FRAIS` / `COMMISSION` | débit | `bankFee` |
| *(autre)* | — | `other` |

L'ordre compte : `CARTE ANNUL` est testé avant `CARTE`.

### Carte (`card`, `cardRefund`)

`L2` a la forme `CB  <COMMERÇANT>  <JJ/MM/AA>`.

| Champ | Extraction | Exemple (`CB  PETROLEC SUD     26/09/26`) |
| --- | --- | --- |
| `paymentDate` | `(\d{2})/(\d{2})/(\d{2})\s*$` → `20AA-MM-JJ`, **validée** comme date réelle | `2026-09-26` |
| `label` | `L2` sans le préfixe `CB`, sans la date, espaces multiples réduits | `PETROLEC SUD` |

`UBER   *EATS` devient `UBER *EATS`. Date absente ou invalide : `paymentDate = null`, et les
règles enverront l'opération « À classer » avec `why: "unreadableDate"` (EF-014).

### Virements et prélèvements

`label` : première ligne non vide après `L0` qui n'est pas une référence technique
(`SCR…`, `SCA…`, suite de chiffres), espaces réduits.
`VIR INST Jean Dupont` → `VIR INST Jean Dupont` ; `PRLV SEPA UMS-ULYS MOBILI…` →
inchangé. `paymentDate = null`.

### `rawLabel`

Toutes les lignes non vides, jointes par ` · `. C'est sur lui que portent les règles
contenant un motif comme `LOYER`, qui figure dans une ligne de motif du virement.

---

## 3. Revolut

### Nature

| `bank_transaction_code.code` | Condition | `kind` |
| --- | --- | --- |
| `CARD_PAYMENT` | débit | `card` |
| `CARD_PAYMENT` | crédit | `cardRefund` |
| `TOPUP` | | `topUp` |
| `TRANSFER` | libellé `Revpoints Spare Change` | `roundUp` |
| `TRANSFER` | débit / crédit | `transferOut` / `transferIn` |
| *(autre)* | | `other` |

| Champ | Extraction |
| --- | --- |
| `paymentDate` | `booking_date` |
| `label` | `creditor.name` si présent, sinon `remittance_information[0]` |
| `rawLabel` | `remittance_information` joint par ` · ` |

### Fusion des arrondis (R8)

Appliquée sur **l'ensemble des opérations Revolut en cache**, après ajout des nouvelles :

```text
pour chaque opération a de kind roundUp :
  candidats = opérations p telles que
      p.kind = card, p.direction = debit, p.amountCents > 0,
      p.bookingDate = a.bookingDate, p sans roundUpRef,
      1 ≤ a.amountCents ≤ 100,
      (p.amountCents + a.amountCents) mod 100 = 0
  si |candidats| = 1 :
      p.roundUpCents ← a.amountCents ; p.roundUpRef ← a.ref ; retirer a
  sinon :
      laisser a (kind roundUp)
```

**Cas vérifiés (septembre 2026)** :

| Jour | Paiement | Arrondi | Résultat |
| --- | --- | --- | --- |
| 29/09 | Casino Shop 5,45 | 0,55 | fusion → 6,00 (deux pré-autorisations à 0,00 € écartées) |
| 28/09 | Carrefour City 1,99 | 0,01 | fusion → 2,00 |
| 27/09 | Bunq 50,00 · Fairtiq 0,00 | 1,00 | fusion avec Bunq seul candidat → 51,00 |
| 26/09 | Volterra 14,00 | 1,00 | fusion → 15,00 |
| 22/09 | Burger King 1,55 | 0,45 | fusion → 2,00 |
| 21/09 | Tisseo Voyageur 7,20 | 0,80 | fusion → 8,00 |
| 16/09 | Carrefourmarket 4,84 | 0,16 | fusion → 5,00 |
| 15/09 | Sncf-voyageurs 15,30 | 0,70 | fusion → 16,00 |
| 12/09 | Carrefourmarket 30,60 | 0,40 | fusion → 31,00 |

**Cas d'ambiguïté à tester** : deux paiements du même jour à 2,30 € et 4,30 €, un arrondi de
0,70 € → les deux sommes sont rondes, l'arrondi reste `roundUp`.

---

## 4. Transactions écartées

Une transaction écartée par la normalisation (champ obligatoire absent, montant illisible) n'est
ni importée ni envoyée « À classer » : elle n'a pas de forme exploitable. Son **nombre** est
consigné dans la connexion et affiché (« 1 opération illisible ignorée »), pour qu'aucune
disparition ne soit silencieuse.
