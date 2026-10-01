# Contrat : points d'entrée HTTP de la synchronisation bancaire

**Fonctionnalité** : [spec.md](../spec.md) · **Modèle** : [data-model.md](../data-model.md)

Tous les points d'entrée vivent sous `/api/banking/`. Ils suivent les conventions de
`/api/budget` (fonctionnalité 005) :

- autorisation vérifiée **dans chaque gestionnaire**, par `isAuthorized()`, **sauf** le retour
  de banque (§4), autorisé par `state` (R4) ;
- refus : `401 { "error": "unauthorized" }`, sans aucune autre information ;
- corps de réponse en JSON, montants en **centimes entiers** ;
- **aucune** réponse ne contient `sessionId`, la clé, le JWT, un IBAN complet ou son empreinte
  (`ibanHash`).

Si la synchronisation bancaire n'est pas configurée (R6), tous les points d'entrée sauf
`status` répondent `503 { "error": "notConfigured" }`.

---

## 1. `GET /api/banking/status`

État des liaisons, sans déclencher de récupération.

**200** :

```json
{
  "configured": true,
  "banks": [
    {
      "bank": "lcl",
      "connected": true,
      "ibanSuffix": "XXXX",
      "validUntil": "2027-03-30T16:05:35Z",
      "lastFetchAt": "2026-10-01T18:00:00Z",
      "lastError": null
    },
    { "bank": "revolut", "connected": false, "ibanSuffix": null, "validUntil": null,
      "lastFetchAt": null, "lastError": null }
  ]
}
```

`configured: false` : identifiant ou clé absents. Les autres champs sont alors vides.

---

## 2. `POST /api/banking/connect`

Démarre une liaison ou un renouvellement.

**Requête** : `{ "bank": "lcl" | "revolut" }`

**Effet** : demande à Enable Banking une autorisation de **180 jours** (ou du maximum annoncé par
la banque s'il est inférieur), `psu_type: "personal"`, redirection vers l'URL de retour
configurée. Le `state` engendré est conservé en mémoire 15 minutes (R4).

**200** : `{ "url": "https://tilisy.enablebanking.com/ais/start?sessionid=…" }`, à ouvrir
par le navigateur en navigation de premier niveau.

**400** : `{ "error": "invalidBank" }` · **502** : `{ "error": "providerUnavailable" }`

---

## 3. `GET /api/banking/operations?since=AAAA-MM-JJ[&refresh=manual]`

Point d'entrée principal : rend les opérations normalisées et, si les bornes de R3 le
permettent, les récupère d'abord auprès des banques.

| Paramètre | Règle |
| --- | --- |
| `since` | Obligatoire : `banking.importFrom` du document. Le serveur récupère et rend à partir de `since − 7 jours` (R12). Le filtrage fin par date de paiement est fait par le navigateur. |
| `refresh=manual` | Bouton « Synchroniser maintenant ». Borne de 5 minutes au lieu de 6 heures. |

**Récupération** (par banque reliée, indépendamment l'une de l'autre) :

1. ignorée si la dernière tentative date de moins que la borne applicable ;
2. sinon `GET /accounts/{uid}/transactions?date_from=…&transaction_status=BOOK`, avec
   pagination par `continuation_key` et en-têtes `Psu-Ip-Address` / `Psu-User-Agent` repris de
   la requête entrante ;
3. normalisation (voir [normalisation.md](./normalisation.md)), fusion des arrondis, ajout au
   cache dédupliqué par `ref` ;
4. en cas d'échec, le cache existant est **conservé** et l'erreur est consignée dans
   `lastError`. Un échec d'une banque n'empêche pas de rendre l'autre.

**200** :

```json
{
  "operations": [
    {
      "ref": "revolut:6abb9415-f34e-a3d3-96f3-364b7a636fea",
      "bank": "revolut",
      "bookingDate": "2026-10-02",
      "paymentDate": "2026-10-02",
      "amountCents": 545,
      "currency": "EUR",
      "direction": "debit",
      "kind": "card",
      "label": "Casino Shop",
      "rawLabel": "Casino Shop",
      "roundUpCents": 55,
      "roundUpRef": "revolut:6abba320-…"
    }
  ],
  "banks": [ /* même forme que §1 */ ]
}
```

Les opérations sont triées par `bookingDate` puis `ref`. Le navigateur traite **tout ce qui
n'est pas déjà au registre** : le point d'entrée n'a pas de notion de curseur, ce qui le rend
idempotent.

**400** : `{ "error": "invalidSince" }`

**Toute réponse est une entrée non fiable** pour le navigateur : elle est validée champ par champ
avant usage (principe IV).

---

## 4. `GET /api/banking/callback?state=…&code=…` (ou `&error=…`)

Retour de la banque. **Seul point d'entrée non contrôlé par le cookie** (R4).

| Cas | Effet | Réponse |
| --- | --- | --- |
| `state` inconnu, expiré ou déjà consommé | aucun | `303` vers `/?banking=invalidState` |
| `error` présent (refus, `server_error`) | `state` consommé | `303` vers `/?banking=error` |
| `code` valide, session sans compte | `state` consommé, connexion en erreur `noAccount` | `303` vers `/?banking=noAccount` |
| `code` valide, première liaison, plusieurs comptes `EUR` ou aucun | `state` consommé, rien enregistré | `303` vers `/?banking=noAccount` |
| `code` valide, renouvellement, aucun compte d'empreinte `ibanHash` | `state` consommé, ancienne session **conservée**, `lastError: noAccount` | `303` vers `/?banking=noAccount` |
| `code` valide, compte trouvé (data-model §3) | session créée, connexion enregistrée ou **remplacée** (renouvellement) | `303` vers `/?banking=connected` |

Le paramètre `banking` sert uniquement à afficher un message ; l'application le retire de
l'URL après lecture. Le cas `noAccount` est celui constaté lors de l'essai quand le compte
n'était pas lié dans le portail d'Enable Banking : le message l'explique.

**Remplacement d'une connexion** : le cache d'opérations est **conservé**, puisque les `ref`
sont stables d'une autorisation à l'autre (R2). Seuls `sessionId`, `accountUid` et
`validUntil` changent.

---

## 5. Erreurs du fournisseur et `lastError`

| Situation | `lastError` | Message dans l'application |
| --- | --- | --- |
| Autorisation expirée | `expired` | « L'accès à LCL a expiré le … Reconnectez la banque. » |
| Autorisation révoquée côté banque | `revoked` | « L'accès à LCL a été retiré. Reconnectez la banque. » |
| Session sans le compte attendu | `noAccount` | « LCL n'a renvoyé aucun compte. Vérifiez qu'il est lié dans le portail Enable Banking. » |
| Limite de consultation | `rateLimited` | « LCL limite les consultations. Nouvel essai plus tard. » |
| Banque ou fournisseur injoignable | `unavailable` | « LCL est momentanément indisponible. » |

Chaque message est accompagné de la date de **dernière récupération réussie** (EF-005, EF-013).
