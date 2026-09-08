# Phase 0 — Recherche et décisions techniques

**Fonctionnalité** : `004-data-export-import` | **Date** : 2026-09-06

Aucun marqueur « NEEDS CLARIFICATION » ne subsistait dans le contexte technique. Ce document consigne
les décisions, leur justification et les alternatives écartées.

Sources consultées dans la version installée (`node_modules/next/dist/docs/`), conformément au
principe V :

- `01-app/01-getting-started/05-server-and-client-components.md`
- recherche de pages traitant du téléchargement de fichier : aucune page dédiée (voir D6)

Code existant relu avant de décider : `src/lib/storage.ts`, `src/features/budget/types.ts`,
`src/features/budget/budget-provider.tsx`.

---

## D1 — Format du fichier : enveloppe autour du document interne

**Décision** : le fichier exporté est un objet JSON enveloppant le document interne :

```json
{
  "application": "budget-app",
  "formatVersion": 1,
  "exportedAt": "2026-09-06T09:12:33.000Z",
  "data": { "version": 1, "incomes": [], "subscriptions": [] }
}
```

Le champ `application` est un **marqueur d'identification**, pas une décoration.

**Justification** : trois exigences distinctes convergent vers cette forme.

- EF-004 impose un en-tête portant version de format et date d'export : `formatVersion` et
  `exportedAt`.
- EF-022 et EF-023 imposent deux messages de refus **distincts** — « ce n'est pas un export
  reconnu » et « ce fichier est abîmé ». Sans marqueur, ces deux cas sont indiscernables : un JSON
  quelconque et un export tronqué échouent tous deux à la validation. Le marqueur `application`
  tranche : absent → fichier étranger ; présent mais contenu invalide → fichier abîmé.
- EF-011 et CS-003 imposent l'identité de l'aller-retour. Séparer l'enveloppe (`exportedAt` change à
  chaque export) du contenu (`data`, stable) rend la comparaison possible : on compare `data`, pas le
  fichier entier.

**Alternatives écartées** :

- *Exporter le document nu, sans enveloppe* — écarté : impossible de porter la date d'export
  (EF-004), et impossible de distinguer un fichier étranger d'un fichier abîmé (CS-007).
- *En-tête sur une première ligne, données ensuite (format hybride)* — écarté : complique l'analyse
  sans rien apporter, et casse la lisibilité dans un éditeur, contraire à EF-003.

---

## D2 — Réutiliser `parseDocument` plutôt qu'écrire un second analyseur

**Décision** : `transfer.ts` analyse l'enveloppe, puis délègue **intégralement** la validation du
contenu à `parseDocument()` de `src/lib/storage.ts`, déjà écrit et testé pour la fonctionnalité 002.

**Justification** : c'est la décision structurante du plan.

- **Correction.** Un second analyseur diverge du premier au premier changement de modèle, et cette
  divergence se manifeste par un import qui accepte des données que le stockage refusera ensuite —
  exactement le genre de bogue silencieux que le principe II cherche à éviter.
- **Principe VI.** Écrire deux fois la même validation est la duplication la plus coûteuse possible
  ici : une centaine de lignes de règles métier.
- **Principe III.** Les vingt tests de `storage.test.ts` couvrant les documents malformés protègent
  automatiquement l'import.
- **Gratuit** : `parseDocument` part déjà d'`unknown` et renvoie des motifs d'échec exploitables.
  Aucune adaptation n'est nécessaire.

**Alternative écartée** : *un analyseur dédié à l'import, plus permissif, qui « répare » ce qu'il
peut* — écarté par EF-013, qui interdit l'import partiel. Réparer signifie deviner, et deviner sur
des montants est précisément ce que la constitution proscrit.

---

## D3 — Déterminisme de la sérialisation, et donc de l'aller-retour

**Décision** : la garantie d'identité de CS-003 repose sur une propriété du code existant :
`parseDocument` ne renvoie **pas** l'objet reçu, il en reconstruit un nouveau, champ par champ, dans
un ordre de clés fixe :

```ts
return { ok: true, value: { version: DOCUMENT_VERSION, incomes, subscriptions } };
```

Il s'ensuit que `JSON.stringify(parseDocument(x).value)` est identique pour deux entrées portant les
mêmes données, quel que soit l'ordre des clés dans le fichier d'origine. L'export sérialise donc
toujours un document normalisé, et l'aller-retour est stable octet pour octet.

**Justification** : cette propriété n'avait pas été recherchée pour elle-même en 002 — elle découlait
de la validation exhaustive. Elle se révèle ici être exactement ce dont CS-003 a besoin, et elle
transforme une exigence délicate en simple comparaison de chaînes.

**Conséquence à protéger** : un test d'aller-retour explicite verrouille cette propriété. Si un jour
`parseDocument` se met à propager l'objet d'entrée plutôt qu'à le reconstruire, ce test tombera —
c'est voulu.

**Alternative écartée** : *un sérialiseur à clés triées, spécifique à l'export* — écarté comme
redondant, la normalisation étant déjà acquise.

---

## D4 — Trois motifs de refus, trois messages

**Décision** : l'import expose exactement les trois motifs qu'exige CS-007, dérivés du couple
(enveloppe, `ParseFailure`) :

| Motif | Déclencheur | Ce que l'utilisateur peut faire |
| --- | --- | --- |
| `notAnExport` | JSON illisible, ou `application` absent ou différent de `budget-app` | Vérifier qu'il s'agit bien d'un fichier exporté depuis cette application |
| `futureVersion` | `formatVersion` supérieure à la version connue | Mettre l'application à jour avant d'importer |
| `corrupted` | Marqueur correct mais contenu refusé par `parseDocument` | Le fichier est abîmé ; utiliser une autre sauvegarde |

**Justification** : un refus muet ou générique laisse l'utilisateur sans action corrective. Chaque
motif est relié à une action différente, ce qui est le critère de CS-007. La correspondance avec les
`ParseFailure` existants est directe : `futureVersion` remonte tel quel, les trois autres
(`notAnObject`, `unknownVersion`, `invalidData`) se rangent sous `corrupted` dès lors que le marqueur
est présent.

**Alternative écartée** : *afficher le motif technique brut* — écarté : `invalidData` n'aide pas
l'utilisateur à décider quoi faire.

---

## D5 — Point de restauration en mémoire

**Décision** : avant d'écrire les données importées, le document antérieur est conservé dans l'état
React du fournisseur. Le retour arrière le réécrit par le chemin normal. Rien n'est persisté pour
cela.

**Justification** : la spécification pose que le point de restauration est temporaire et vaut pour la
session (EF-020 et son hypothèse). Une sauvegarde persistée doublerait l'occupation du stockage,
poserait la question de sa péremption, et reviendrait à construire un historique de versions — hors
périmètre par le principe VI.

**Sécurité du remplacement** : `saveDocument` écrit par un unique `setItem`, opération atomique. Il
n'existe pas d'état intermédiaire où une partie des anciennes données aurait été effacée sans que les
nouvelles soient écrites. EF-021 est donc satisfait par construction : si l'écriture échoue, rien n'a
été détruit, et le document en mémoire reste l'ancien.

**Alternative écartée** : *écrire une clé `budget-app:backup` avant l'import* — écartée pour les
raisons ci-dessus. À reconsidérer seulement si un retour arrière après fermeture de l'application
devenait un besoin exprimé.

---

## D6 — Déclenchement du téléchargement et lecture du fichier

**Décision** : export par `Blob` + `URL.createObjectURL()` + ancre synthétique portant l'attribut
`download`, l'URL étant révoquée après usage. Import par `<input type="file" accept="application/json,.json">`
et `File.text()`. Le tout isolé dans `src/lib/download.ts` pour l'export.

**Justification et vérification au titre du principe V** : la recherche dans la documentation de la
version installée ne fait apparaître **aucune page traitant du téléchargement de fichier côté
client** — seul `03-api-reference/02-components/form.md` mentionne les fichiers, et pour l'envoi de
formulaires, ce qui ne s'applique pas ici. Il s'agit d'API de plateforme, pas d'API Next.js : le
principe V n'impose donc rien de plus que ce qui a déjà été relevé, à savoir que ces API relèvent des
Composants Client (`05-server-and-client-components.md`, ligne 26, qui cite nommément les API
navigateur). Aucune Fonction Serveur, aucune route d'API, aucun `route.ts` n'est employé — ce serait
contraire au principe I.

**Isolement de `URL.createObjectURL`** : jsdom ne l'implémente pas. En le cantonnant à
`src/lib/download.ts`, `transfer.ts` reste une fonction pure de données vers chaîne, testable sans
aucune simulation. Seul `download.test.ts` a besoin d'un doublon.

**Alternative écartée** : *`showSaveFilePicker()` de l'API File System Access* — écartée : non
disponible sur Firefox ni Safari, elle aurait exigé un repli de toute façon. Le repli seul suffit.

---

## D7 — Nom du fichier exporté

**Décision** : `budget-AAAA-MM-JJ-HHmm.json`, en heure locale. Exemple :
`budget-2026-09-06-1112.json`.

**Justification** : EF-005 exige date et heure dans le nom pour que deux sauvegardes ne se masquent
pas. Le format retenu trie correctement par ordre alphabétique dans un explorateur de fichiers, ce
qui est le comportement attendu d'une liste de sauvegardes. L'heure locale plutôt qu'UTC : c'est
l'heure que l'utilisateur a vue au moment de l'export.

Noter la dissymétrie assumée avec `exportedAt`, qui est en UTC dans le fichier : un horodatage
machine gagne à être sans ambiguïté, un nom de fichier gagne à être familier.

---

## D8 — Traitement des fichiers volumineux

**Décision** : le fichier est lu intégralement en mémoire par `File.text()`, puis analysé. Un état
« traitement en cours » est affiché pendant l'opération et annoncé aux lecteurs d'écran.

**Justification** : à l'échelle attendue — quelques centaines de kilo-octets pour trois années de
données — la lecture intégrale est instantanée et l'analyse par flux serait une complexité sans
contrepartie (principe VI). L'indicateur de traitement satisfait EF-029 et CS-009 sans dépendre du
temps réellement passé.

**Alternative écartée** : *analyse par flux ou dans un `Worker`* — écartée faute de besoin démontré à
cette échelle. Le seuil qui la justifierait serait un fichier de plusieurs dizaines de méga-octets,
soit deux ordres de grandeur au-dessus du réaliste.

---

## D9 — Aucune dépendance ajoutée

**Décision** : cette fonctionnalité n'ajoute **aucune** dépendance, ni d'exécution ni de
développement.

**Justification** : tout ce dont elle a besoin existe déjà — `JSON`, `Blob`, `File` côté plateforme ;
`parseDocument` et l'outillage Vitest côté projet. C'est le résultat attendu du principe VI lorsqu'on
réutilise au lieu de reconstruire.
