# Phase 1 — Modèle de données : stockage centralisé

**Fonctionnalité** : [spec.md](./spec.md) | **Plan** : [plan.md](./plan.md) | **Date** : 2026-09-07

## Principe directeur

**Aucune entité du domaine n'est créée, modifiée ni supprimée.** La spécification l'énonce et le
répète : cette fonctionnalité déplace un stockage, elle ne touche pas au modèle. `Income`,
`Subscription`, `Expense`, `Envelope` et `BudgetDocument` de `src/features/budget/types.ts` restent
identiques au champ près, et `DOCUMENT_VERSION` reste à **3**.

Ce qui suit décrit donc uniquement ce qui **entoure** le document : l'enveloppe qui le persiste côté
serveur et les métadonnées qui suivent son état côté client.

---

## 1. Enveloppe persistée côté serveur

Le fichier central contient le document du domaine enveloppé dans le minimum nécessaire au verrou
optimiste.

```ts
/** Contenu du fichier central. Voir contracts/api-budget.md. */
export interface StoredBudget {
  /** Entier >= 1, incrémenté à chaque écriture acceptée. Jamais réutilisé, jamais décrémenté. */
  revision: number;
  /** Horodatage ISO 8601 de la dernière écriture acceptée. Informatif : jamais utilisé pour arbitrer. */
  updatedAt: string;
  /** Le document du domaine, inchangé, portant son propre `version`. */
  document: BudgetDocument;
}
```

### Champs

| Champ | Type | Règles de validation |
| --- | --- | --- |
| `revision` | `number` | Entier, `>= 1`. Un fichier absent équivaut à la révision **0** (budget neuf, pas une erreur). |
| `updatedAt` | `string` | Horodatage ISO 8601 valide. |
| `document` | `BudgetDocument` | Validé par `parseDocument()`, l'analyseur partagé. Migration appliquée à la lecture. |

### Pourquoi un seul numéro de version

L'enveloppe **ne porte pas** de numéro de version propre. Le versionnement du schéma exigé par
EF-006 est assuré par `document.version`, déjà en place et déjà pourvu d'un chemin de migration
(`migrer()`, versions 1 → 2 → 3). Ajouter un second numéro reviendrait à créer deux axes d'évolution
à tenir cohérents, pour une enveloppe de trois champs. Le principe VI l'interdit tant que le besoin
n'est pas démontré.

Si l'enveloppe devait évoluer, elle suivrait le même mécanisme : lecture depuis `unknown`, forme
inconnue refusée, jamais écrasée (D9).

### Invariants

1. `revision` est **strictement croissante**. Une lecture qui verrait une révision inférieure à la
   précédente signale un fichier restauré depuis une sauvegarde ; le cas est traité comme un conflit
   ordinaire, jamais comme une erreur silencieuse.
2. Le fichier est **toujours complet ou absent**, jamais tronqué : conséquence de l'écriture
   atomique (D8).
3. Un fichier illisible est **conservé**, renommé, jamais écrasé (D9).

### Représentation sur disque

| Élément | Valeur |
| --- | --- |
| Répertoire | `BUDGET_DATA_DIR`, défaut `./data` |
| Fichier de référence | `budget.json` |
| Fichier temporaire d'écriture | `budget.json.tmp` |
| Quarantaine | `budget.corrupted-<horodatage ISO>.json` |

`data/` **DOIT** être ignoré par Git : il contient les données financières réelles de l'utilisateur.

---

## 2. Métadonnées de synchronisation, côté client

Persistées dans `localStorage` sous une clé **distincte** de celle du budget (D5).

```ts
/** Clé `budget-app:sync:v1`. Voir contracts/synchronisation.md. */
export interface SyncMetadata {
  /** Révision serveur dont dérive la copie locale. 0 = jamais synchronisé. */
  baseRevision: number;
  /**
   * Vrai si la copie locale porte des modifications non encore acceptées par le serveur.
   * C'est ce drapeau, et non un journal d'opérations, qui porte l'état « en attente » (D1).
   */
  pendingChanges: boolean;
}
```

### Champs

| Champ | Type | Règles de validation |
| --- | --- | --- |
| `baseRevision` | `number` | Entier `>= 0`. Une valeur invalide est traitée comme `0`. |
| `pendingChanges` | `boolean` | Une valeur invalide est traitée comme `true`. |

### Pourquoi ces valeurs de repli

Elles ne sont pas arbitraires : **les deux échouent du côté prudent.**

- `baseRevision = 0` force l'application à considérer qu'elle n'a jamais vu le serveur. La prochaine
  écriture entrera donc en conflit plutôt que d'écraser un état plus récent.
- `pendingChanges = true` force une poussée qui se révélera peut-être inutile. Le coût d'une poussée
  superflue est une requête ; le coût de l'oubli inverse est une dépense perdue.

### Pourquoi une clé distincte du budget

Si ces métadonnées vivaient dans le document budgétaire, un contenu de synchronisation abîmé
déclencherait la mise en quarantaine du **budget entier** — une perte de données provoquée par la
corruption d'un entier et d'un booléen. Les deux contenus ont des conséquences d'échec sans commune
mesure ; ils sont donc stockés séparément et échouent indépendamment.

---

## 3. État de synchronisation, en mémoire

Jamais persisté : entièrement dérivé, à l'image des totaux du budget (EF-010).

```ts
export type SyncState =
  | "idle"        // aucune synchronisation en cours, tout est à jour
  | "syncing"     // lecture ou écriture en vol
  | "offline"     // le serveur est injoignable
  | "pending"     // modifications locales en attente de poussée
  | "conflict"    // écriture refusée : l'utilisateur doit trancher
  | "failed"      // échec non lié à la connectivité (autorisation, données refusées)
  | "unauthorized"; // cet appareil n'est pas autorisé
```

### Correspondance avec l'interface

Chaque état est porté par du **texte**, jamais par la couleur ou une icône seule (principe VII,
EF-018). Les libellés définitifs vivent dans `messages.ts`, aux côtés de ceux qui existent déjà.

| État | Ce que l'utilisateur doit comprendre | Exigence |
| --- | --- | --- |
| `idle` | Ce que je vois est à jour. | — |
| `syncing` | Un échange est en cours. | — |
| `offline` | Ce que je vois peut être périmé ; je peux continuer à saisir. | EF-017, EF-018 |
| `pending` | Mes saisies sont conservées mais pas encore parties. | EF-018 |
| `conflict` | Un autre appareil a modifié le budget ; je dois choisir. | EF-024, EF-025 |
| `failed` | Mon enregistrement a échoué — ce n'est pas un succès. | EF-012 |
| `unauthorized` | Cet appareil doit être autorisé. | EF-020 |

`offline` et `pending` se cumulent en pratique : hors connexion avec des saisies en attente est le
cas nominal du récit 3. L'interface affiche alors le message le plus actionnable — celui qui dit à la
fois que la donnée est conservée et qu'elle n'est pas partie.

---

## 4. Ce qui n'est pas stocké

Énoncé explicitement, parce que c'est là qu'une conception dérape :

- **Aucun total, reste, allocation ou état dérivé** ne rejoint le stockage central. EF-010 est
  inchangée : un total qui contredirait ses composantes est impossible s'il n'existe pas.
- **Aucun historique de versions** du document au-delà du point de restauration en mémoire déjà
  fourni par l'annulation d'import. Hors périmètre explicite.
- **Aucune identité, aucun profil, aucun appareil nommé.** Le stockage central détient **un** budget.
  Le jeton autorise, il n'identifie pas.
- **Aucun journal d'opérations.** Conséquence de D1 : le document local *est* l'état en attente.
