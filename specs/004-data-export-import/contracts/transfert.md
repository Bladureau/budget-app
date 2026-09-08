# Contrat — Modules de transfert

**Fonctionnalité** : `004-data-export-import`

Tout ce qui figure ici relève de la **logique monétaire** au sens du principe III : ce code analyse
et persiste des montants. Les tests sont obligatoires, avec cas nominal, bornes et entrée malformée.

---

## `src/features/budget/transfer.ts`

Module **pur** : ne touche ni au DOM, ni à `localStorage`, ni à l'horloge. La date d'export lui est
fournie en paramètre, ce qui le rend testable sans simulation.

```ts
const FORMAT_VERSION = 1;
const APPLICATION_MARKER = "budget-app";

type ImportRefusal = "notAnExport" | "futureVersion" | "corrupted";

type ImportResult =
  | { ok: true; document: BudgetDocument; exportedAt: string | null }
  | { ok: false; reason: ImportRefusal };

serializeExport(doc: BudgetDocument, exportedAt: Date): string
buildExportFilename(exportedAt: Date): string
parseImport(raw: string): ImportResult
```

| Fonction | Comportement contractuel |
| --- | --- |
| `serializeExport` | Produit le JSON du fichier décrit par [fichier-export.md](./fichier-export.md), indenté de deux espaces, avec `exportedAt` en ISO 8601 UTC. Le document est **revalidé et normalisé** par `parseDocument()` avant sérialisation : on n'exporte jamais un document que l'on refuserait de relire. |
| `buildExportFilename` | `budget-AAAA-MM-JJ-HHmm.json`, en heure **locale**. |
| `parseImport` | Applique les cinq règles de validation du modèle de données, dans l'ordre, et renvoie soit le document validé, soit l'un des trois motifs de refus. Ne renvoie **jamais** un document partiel. `exportedAt` vaut `null` si l'horodatage est absent ou illisible — sans que le fichier soit refusé pour autant. |

**Interdit dans ce module** : tout accès à `localStorage`, au DOM, à `new Date()` sans paramètre, et
toute réimplémentation d'une règle de validation du document. `parseImport` **doit** déléguer à
`parseDocument()`.

---

## `src/lib/download.ts`

Isole l'unique API navigateur non testable directement, pour que `transfer.ts` reste pur.

```ts
triggerDownload(contents: string, filename: string, mimeType?: string): boolean
```

| Fonction | Comportement contractuel |
| --- | --- |
| `triggerDownload` | Crée un `Blob`, en obtient une URL, déclenche le téléchargement par une ancre synthétique portant `download`, puis **révoque l'URL**. Renvoie `false` plutôt que de lever si l'environnement ne le permet pas — un échec d'export doit être signalé, jamais silencieux (EF-007). |

La révocation de l'URL n'est pas une politesse : sans elle, chaque export retient son contenu en
mémoire jusqu'au rechargement de la page.

---

## Extensions de `src/features/budget/budget-provider.tsx`

```ts
exportData: () => boolean;
prepareImport: (raw: string) => ImportResult;
confirmImport: (doc: BudgetDocument) => boolean;
undoImport: () => boolean;
canUndoImport: boolean;
```

| Action | Comportement contractuel |
| --- | --- |
| `exportData` | Sérialise le document courant et déclenche le téléchargement. Renvoie `false` si l'export a échoué, ce que l'interface signale. N'écrit rien. |
| `prepareImport` | Analyse le contenu **sans rien écrire**. C'est la séparation qui garantit qu'un fichier refusé ne touche pas les données (EF-026). |
| `confirmImport` | Capture le point de restauration, **puis** écrit. Dans cet ordre : inverser reviendrait à perdre le filet au moment précis où il sert. Renvoie `false` si l'écriture échoue, l'état antérieur restant alors en place (EF-021). |
| `undoImport` | Réécrit le document du point de restauration par le chemin normal. Renvoie `false` s'il n'y en a pas. |
| `canUndoImport` | Vrai tant qu'un point de restauration existe dans la session. |

**Invariant** : aucun chemin ne mène de `prepareImport` à une écriture. Seul `confirmImport` écrit, et
seule l'interface l'appelle, après confirmation explicite de l'utilisateur.

---

## Cas de test obligatoires

Dérivés du principe III, des cas limites de la spécification et des critères de succès.

**Aller-retour — le cœur de la fonctionnalité**

- Export puis import puis export : les champs `data` sérialisés sont **identiques** (CS-003).
- Aller-retour sur un jeu d'au moins 200 éléments de tous types : 100 % restitués, aucun montant,
  date ou libellé altéré (CS-002).
- Exactitude au centime après aller-retour, y compris sur le montant maximal réaliste (CS-004).
- Libellés comportant accents et emoji : restitués à l'identique (CS-010).
- Un fichier dont les clés sont dans un ordre différent produit le même export normalisé (D3).
- Import du même fichier deux fois : résultat identique, aucun doublon.

**Refus — aucun ne doit modifier les données (CS-005)**

- Fichier non analysable en JSON → `notAnExport`.
- JSON valide sans champ `application` → `notAnExport`.
- `application` valant autre chose → `notAnExport`.
- `formatVersion` supérieure à la version connue → `futureVersion`.
- `data.version` supérieure à la version connue → `futureVersion`.
- Fichier vide, de taille nulle → `notAnExport`.
- Marqueur correct, `data` avec un montant négatif, non entier, une date impossible, un identifiant
  en double, une périodicité inconnue → `corrupted`.
- Pour **chacun** des cas ci-dessus : vérifier explicitement qu'aucun élément n'a été importé.

**Cas limites**

- Fichier valide dont les collections sont vides : **accepté**, restaure un état vide.
- `exportedAt` absent ou illisible : fichier **accepté**, `exportedAt` à `null`.
- Export d'une application vide : produit un fichier valide, réimportable (EF-006).

**Nom de fichier**

- Format `budget-AAAA-MM-JJ-HHmm.json`, avec remplissage à deux chiffres des mois, jours, heures et
  minutes.

**Point de restauration**

- `confirmImport` puis `undoImport` restitue exactement le document antérieur.
- `undoImport` sans import préalable renvoie `false` et ne modifie rien.
- Le point de restauration est capturé **avant** l'écriture : vérifiable en simulant un échec
  d'écriture et en constatant que l'état antérieur est intact.
