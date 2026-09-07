# Contrat : point d'entrée HTTP du budget central

**Fichier** : `src/app/api/budget/route.ts` | **Modèle** : [data-model.md](../data-model.md)

Un seul chemin, deux méthodes. Toute méthode non listée reçoit **405** de Next.js sans code de notre
part.

> **Runtime** : aucun `export const runtime`. `'nodejs'` est le défaut de la version installée et le
> runtime Edge y est déprécié (R1 de [research.md](../research.md)).
>
> **Cache** : aucun `export const dynamic`. La lecture de `cookies()` par le contrôle d'autorisation
> rend la route dynamique par construction (R2).

---

## `GET /api/budget`

Lit l'état central. N'écrit jamais, pas même pour créer le fichier.

### Réponses

| Code | Corps | Cas |
| --- | --- | --- |
| **200** | `{ revision, updatedAt, document }` | Lecture réussie. |
| **200** | `{ revision: 0, updatedAt: null, document: <document vide> }` | **Aucun fichier central.** Budget neuf, pas une erreur (cas limite de la spécification). |
| **401** | `{ "error": "unauthorized" }` | Cookie absent, invalide, ou `BUDGET_ACCESS_TOKEN` non configuré. |
| **500** | `{ "error": "storageUnreadable" }` | Contenu central illisible : mis en quarantaine, **jamais écrasé** (D9). |

Un fichier absent renvoie donc **200 avec la révision 0**, et non 404 : l'absence de budget est un
état normal du système, pas l'absence d'une ressource. C'est ce qui permet au premier appareil
d'écrire en se fondant sur la révision 0.

### Exemple

```json
{
  "revision": 42,
  "updatedAt": "2026-09-07T14:23:11.004Z",
  "document": {
    "version": 3,
    "incomes": [],
    "subscriptions": [],
    "expenses": [{ "id": "…", "amountCents": 1250, "date": "2026-09-07", "category": "Courses" }],
    "envelopes": []
  }
}
```

`amountCents` est un **entier**, transporté tel quel. Aucun montant décimal n'apparaît jamais dans un
corps de requête ou de réponse (EF-004).

---

## `PUT /api/budget`

Remplace l'état central, sous condition de révision.

### Requête

```json
{
  "baseRevision": 42,
  "document": { "version": 3, "incomes": [], "subscriptions": [], "expenses": [], "envelopes": [] }
}
```

| Champ | Règles |
| --- | --- |
| `baseRevision` | Entier `>= 0`. Révision sur laquelle l'appelant fonde son écriture. |
| `document` | Document complet, validé par l'analyseur partagé. **Jamais partiel** : il n'existe pas d'écriture par entité (D1). |

### Réponses

| Code | Corps | Cas |
| --- | --- | --- |
| **200** | `{ revision, updatedAt }` | Écriture acceptée. `revision` est la **nouvelle** valeur. |
| **400** | `{ "error": "invalidDocument" }` | Corps illisible, enveloppe mal formée, ou document refusé par l'analyseur. **Rien n'est écrit.** |
| **401** | `{ "error": "unauthorized" }` | Non autorisé. **Rien n'est écrit.** |
| **409** | `{ "error": "revisionMismatch", "revision", "updatedAt", "document" }` | `baseRevision` ne correspond plus. **Rien n'est écrit.** L'état courant est renvoyé pour que l'appelant présente le choix sans second aller-retour. |
| **500** | `{ "error": "writeFailed" }` | Écriture impossible (disque plein, droits). **L'état antérieur reste intact** (D8). |

### Règle de conflit

L'écriture est acceptée **si et seulement si** `baseRevision === revision courante`. Le fichier
absent compte pour la révision `0`, ce qui laisse le premier appareil écrire normalement.

Aucune tolérance, aucune fusion, aucun « si les documents sont proches ». C'est ce qui rend EF-025
vérifiable : l'écriture aboutit, ou l'appelant reçoit 409 et l'utilisateur est informé.

### Forcer une écriture

Il n'existe **aucun drapeau `force`**. Pour imposer ses modifications après un conflit, le client
relit (ou exploite le document renvoyé dans le 409) et rejoue son `PUT` avec la révision courante en
`baseRevision`. Le choix reste ainsi un acte explicite de l'utilisateur, tracé par une requête
ordinaire, et le serveur n'expose aucun moyen d'écraser sans avoir vu l'état courant.

---

## Garanties transverses

1. **Validation aux deux extrémités.** Le serveur valide ce qu'il reçoit avant d'écrire ; le client
   valide ce qu'il reçoit avant de l'afficher. Une réponse du serveur est une frontière de confiance
   au même titre que `localStorage` (principe IV).
2. **Revalidation avant écriture.** Le serveur ne persiste que le résultat de l'analyseur, jamais le
   corps brut — même règle que `saveDocument()` aujourd'hui.
3. **Atomicité.** Fichier temporaire puis `rename`. Une coupure laisse l'ancien fichier intact,
   jamais un fichier tronqué.
4. **Sérialisation.** Les écritures sont sérialisées par un verrou en mémoire : lire la révision et
   écrire le fichier forment une section critique. Suppose une instance unique du serveur.
5. **Aucune divulgation.** Les réponses `401` ne contiennent ni contenu financier, ni révision, ni
   indication sur l'existence d'un budget (EF-021).
6. **Migration à la lecture.** Un fichier en version antérieure est migré par `migrer()` avant
   d'être servi ; un fichier en version postérieure est refusé et **jamais écrasé** (EF-016, EF-007).
