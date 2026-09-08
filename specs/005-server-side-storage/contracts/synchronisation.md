# Contrat : protocole de synchronisation, côté client

**Fichiers** : `src/features/budget/sync.ts`, `src/lib/sync-metadata.ts`

**Exigences couvertes** : EF-017 à EF-019, EF-024, EF-025, EF-012, EF-018 | **Récits** : 1, 3

## Règle qui prime sur toutes les autres

**Une mutation locale n'attend jamais le réseau.**

```text
mutation → écriture localStorage → notification de l'interface → (puis) synchronisation
                                    ▲
                                    └── l'utilisateur voit sa dépense ici
```

C'est le principe I et EF-011 réunis. Aucun chemin de code ne rend `appliquer()` dépendant d'une
réponse du serveur. Si la synchronisation échoue, la dépense est saisie quand même — elle est
simplement marquée non synchronisée.

---

## Opérations

```ts
/** Lit l'état central. Ne touche jamais au stockage local. */
export async function fetchRemote(): Promise<FetchOutcome>;

/** Pousse le document local. Ne touche jamais au stockage local. */
export async function pushLocal(
  document: BudgetDocument,
  baseRevision: number,
): Promise<PushOutcome>;
```

Ces deux fonctions sont **pures vis-à-vis du stockage** : elles parlent au réseau et rendent un
résultat. Décider quoi écrire revient au fournisseur. Cette séparation est ce qui les rend testables
sans simuler `localStorage`, et c'est la même que celle déjà pratiquée entre `prepareImport()` et
`confirmImport()` — un analyseur qui n'écrit pas, un appelant qui décide.

### Résultats

```ts
export type FetchOutcome =
  | { ok: true; revision: number; document: BudgetDocument }
  | { ok: false; reason: "offline" | "unauthorized" | "invalidResponse" | "serverError" };

export type PushOutcome =
  | { ok: true; revision: number }
  | { ok: false; reason: "offline" | "unauthorized" | "rejected" | "serverError" }
  | { ok: false; reason: "conflict"; revision: number; document: BudgetDocument };
```

`conflict` porte l'état courant du serveur : il provient du corps du **409**, ce qui évite une
seconde requête pour afficher le choix.

### Correspondance des codes HTTP

| Situation | `reason` |
| --- | --- |
| `fetch` lève (réseau coupé, serveur éteint) | `offline` |
| `401` | `unauthorized` |
| `409` | `conflict` |
| `400` | `rejected` |
| `500`, ou tout autre code inattendu | `serverError` |
| `200` dont le corps ne passe pas l'analyseur | `invalidResponse` |

**`invalidResponse` n'est pas de la paranoïa.** Un intermédiaire réseau, un portail captif ou une
version dépareillée du serveur peuvent renvoyer `200` avec n'importe quoi. Le principe IV impose de
traiter la réponse comme une frontière de confiance : elle part d'`unknown` et passe par l'analyseur
partagé, exactement comme un contenu `localStorage`.

---

## Déclencheurs

| Déclencheur | Opération |
| --- | --- |
| Montage du fournisseur | `fetchRemote()` |
| Mutation locale | `pushLocal()` |
| Événement `online` | `pushLocal()` si des modifications sont en attente |
| `visibilitychange` → visible | `fetchRemote()` |

Aucune poussée depuis le serveur, aucun sondage périodique : explicitement hors périmètre. Le
déclencheur `visibilitychange` traite le cas limite de « l'onglet resté ouvert plusieurs jours » et
satisfait CS-001, dont l'énoncé parle de « après rafraîchissement ».

### Coalescence

Si une poussée est déjà en vol, la suivante n'est **pas mise en file** : elle est notée comme « à
refaire au retour ». Le document poussé étant toujours le dernier état complet, une poussée
intermédiaire serait périmée avant d'aboutir.

Cela borne le nombre de requêtes en vol à une, sans introduire de délai avant la première — un
anti-rebond aurait retardé la toute première poussée, la seule que l'utilisateur puisse attendre.

---

## Réconciliation à la lecture

Au retour d'un `fetchRemote()` réussi, trois cas et trois seulement :

| Condition | Décision |
| --- | --- |
| `pendingChanges === false` | Adopter le document distant. `baseRevision ← revision`. |
| `pendingChanges === true` **et** `revision === baseRevision` | Le serveur n'a pas bougé : conserver le local et pousser. |
| `pendingChanges === true` **et** `revision !== baseRevision` | **Conflit.** Ne rien écraser, passer en état `conflict`. |

Le troisième cas est celui de l'appareil hors connexion depuis longtemps pendant que le budget a
évolué ailleurs. Il n'est pas traité automatiquement : voir ci-dessous.

Noter que `revision !== baseRevision` couvre aussi la révision **inférieure** — un serveur restauré
depuis une sauvegarde. Le traiter comme un conflit ordinaire évite qu'une restauration n'écrase
silencieusement des saisies plus récentes.

---

## Conflit : le choix appartient à l'utilisateur

L'application **n'arbitre jamais** (D4). Elle présente deux actions, libellées sans ambiguïté sur ce
que chacune perd :

| Action | Effet |
| --- | --- |
| **Conserver mes modifications** | `pushLocal(documentLocal, revisionDistante)`. Les modifications faites sur l'autre appareil sont perdues, délibérément. |
| **Reprendre la version du serveur** | Adopter le document distant. Les modifications locales sont perdues, délibérément. |

Un troisième chemin reste ouvert et doit être proposé : **exporter avant de trancher**. L'export
fonctionne déjà hors connexion et sur l'état courant, sans code nouveau. Il donne une porte de sortie
à qui refuse de perdre l'un ou l'autre — c'est exactement le rôle que la constitution assigne à
l'export.

Tant que l'utilisateur n'a pas choisi, la copie locale reste intacte et l'application reste
utilisable. Un conflit ne bloque pas la saisie.

---

## Métadonnées : quand elles changent

`SyncMetadata` (voir [data-model.md](../data-model.md)) n'est écrit qu'à ces moments :

| Moment | `baseRevision` | `pendingChanges` |
| --- | --- | --- |
| Mutation locale | inchangé | `true` |
| Poussée acceptée (`200`) | ← nouvelle `revision` | `false` |
| Lecture adoptée | ← `revision` distante | `false` |
| Poussée refusée, quelle qu'en soit la raison | inchangé | **reste `true`** |

La dernière ligne porte la garantie de EF-025 : **aucun échec ne baisse le drapeau.** Tant que le
serveur n'a pas accepté, l'application considère que les modifications sont en attente. Une saisie ne
peut donc pas être oubliée à la faveur d'une erreur réseau.

Ordre d'écriture, dans ce sens et pas l'autre : le budget d'abord, les métadonnées ensuite. Une
coupure entre les deux laisse `pendingChanges` à `true` et provoque au pire une poussée inutile —
idempotente (D1). L'ordre inverse aurait pu marquer synchronisé un budget qui ne l'était pas.

---

## Ce que le protocole ne fait pas

- **Aucune fusion**, à aucun moment, sous aucune condition.
- **Aucune reprise automatique après conflit** : seul un choix de l'utilisateur le résout.
- **Aucun journal d'opérations** : le document local est l'état en attente (D1).
- **Aucune nouvelle tentative en boucle** : les déclencheurs listés plus haut suffisent. Une boucle
  de réessai sur un serveur éteint viderait la batterie pour rien.
