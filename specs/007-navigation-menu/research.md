# Recherche : Menu de navigation par onglets

**Fonctionnalité** : `specs/007-navigation-menu` | **Date** : 2026-10-03

Aucune inconnue technique bloquante : la fonctionnalité ne touche qu'à l'affichage. Les décisions
ci-dessous tranchent les choix d'implémentation, après lecture de la documentation de Next.js
16.3.4 installée (principe V) :

- `01-app/01-getting-started/04-linking-and-navigating.md` § « Native History API » ;
- `01-app/02-guides/single-page-applications.md` § « Shallow routing on the client » ;
- `01-app/03-api-reference/04-functions/use-search-params.md` § « Prerendering » ;
- `01-app/03-api-reference/04-functions/generate-viewport.md`.

---

## R1 — L'onglet actif vit dans l'adresse, en paramètre `?onglet=`

**Décision** : l'onglet actif est porté par le paramètre de requête `onglet` (`/?onglet=mois`).
L'onglet « Aujourd'hui » correspond à l'adresse nue `/`. Une section visée s'exprime par le
fragment habituel : `/?onglet=depenses#a-classer`.

**Justification** : l'adresse donne à elle seule trois exigences de la spécification —
l'actualisation (FR-014), le bouton retour (FR-015) et les liens directs (FR-011, FR-012, FR-018)
— sans rien mémoriser ailleurs. Le fragment reste libre pour son rôle naturel, désigner une
section, ce qui permet de garder les ancres existantes (`a-classer`, `titre-banques`).

**Alternatives écartées** :

- *Une route par onglet* (`/depenses`, `/mois`…) : chaque changement de route est une navigation
  App Router, qui demande la charge utile serveur de la page cible. Hors connexion, elle échoue si
  la route n'a pas été préchargée — contraire au cas limite « hors connexion » et au principe I.
  Elle imposerait aussi de remonter `BudgetProvider` dans un `layout`. Beaucoup de structure pour
  un simple affichage.
- *Le fragment seul* (`/#mois`) : il entre en concurrence avec les ancres de section ; un lien
  vers « À classer » devrait coder l'onglet et la section dans le même fragment.
- *Un état React sans adresse* : perd l'onglet à l'actualisation et ignore le bouton retour.

---

## R2 — Écriture par `history.pushState`, lecture par `useSyncExternalStore`

**Décision** : changer d'onglet appelle `window.history.pushState(null, "", url)`. L'onglet est
lu par un petit crochet `useActiveTab()` construit sur `useSyncExternalStore`, abonné à
l'événement `popstate` (retour / avance) et à un événement propre émis après chaque `pushState`.

**Justification** :

- La documentation installée indique que `pushState` et `replaceState` « s'intègrent au routeur
  Next.js » : ils mettent l'adresse à jour **sans rechargement ni requête serveur**. C'est donc
  instantané (SC-003) et fonctionne hors connexion.
- `useSearchParams`, la lecture que suggère la documentation, est écarté pour deux raisons
  propres à ce projet :
  1. la page est prérendue ; la documentation exige alors une frontière `<Suspense>` autour du
     composant qui l'appelle, faute de quoi le build échoue ;
  2. hors du routeur, c'est-à-dire dans les tests Vitest qui rendent `<BudgetView />`, il renvoie
     `null` et ne réagit jamais à `pushState` : chaque test de navigation devrait simuler
     `next/navigation`.
- `useSyncExternalStore` est déjà le motif du projet pour lire un état du navigateur sans écart
  d'hydratation (`budget-provider.tsx`). L'instantané serveur vaut « Aujourd'hui » ; de toute
  façon, les onglets ne s'affichent qu'une fois le budget prêt, après l'hydratation.

**Alternatives écartées** : `useSearchParams` + `<Suspense>` (raisons ci-dessus) ;
`router.push("?onglet=…")` (navigation complète avec requête serveur, comme les routes).

---

## R3 — Les quatre panneaux restent montés ; seul l'actif est visible

**Décision** : les quatre panneaux sont rendus en permanence ; les panneaux inactifs portent
l'attribut HTML `hidden`.

**Justification** : les formulaires (dépense, revenu, abonnement, enveloppe) gardent leur saisie
dans un état local. Démonter un panneau effacerait une saisie en cours : FR-017 serait violée.
Garder les panneaux montés satisfait FR-017 **sans toucher à un seul formulaire**. Le coût est nul :
c'est exactement ce que l'application rend aujourd'hui sur sa page unique. `hidden` retire aussi le
contenu inactif de l'arbre d'accessibilité et de l'ordre de tabulation.

**Alternatives écartées** : remonter les brouillons dans le fournisseur (modifie quatre
formulaires et le fournisseur pour un bénéfice identique) ; rendu conditionnel (perd la saisie).

---

## R4 — Un `<nav>` de liens, pas le motif ARIA « onglets »

**Décision** : le menu est un `<nav aria-label="Sections du budget">` contenant une liste de liens
`<a href="?onglet=…">`. L'entrée active porte `aria-current="page"`. Un clic sans touche de
modification est intercepté pour appeler `pushState` ; avec Ctrl ou Cmd, ou au clic du milieu, le
navigateur ouvre normalement l'onglet dans une nouvelle fenêtre.

**Justification** : une barre de navigation mobile est sémantiquement une **navigation**. Le
principe VII impose les éléments sémantiques avant ARIA : des liens donnent le clavier (Tab,
Entrée), le focus et l'annonce « lien, page actuelle » sans code. Le motif `role="tablist"` impose
en plus la gestion des flèches et un focus itinérant, une complexité qu'aucune exigence ne
réclame.

**Distinction de l'entrée active** (FR-008) : texte en gras, couleur d'accent **et** un trait
indicateur (au-dessus de l'entrée sur mobile, en dessous sur ordinateur). L'entrée active ne se
lit donc pas à la couleur seule.

---

## R5 — Un seul menu, placé selon la largeur

**Décision** : un unique élément `<nav>`, positionné par classes adaptatives :

- sous `sm` (640 px) : `fixed inset-x-0 bottom-0`, fond opaque, bordure supérieure ;
- à partir de `sm` : `static`, dans le flux, sous l'en-tête.

`sm` est le point de rupture que l'application utilise déjà pour ses marges (hypothèse de la
spécification).

**Zone système et contenu masqué** (FR-006) :

- `layout.tsx` exporte `viewport = { viewportFit: "cover" }` (type `Viewport`, option
  `viewportFit` présente dans la version installée) ; sans ce réglage, `env(safe-area-inset-*)`
  vaut toujours 0 sur iOS.
- La barre ajoute `padding-bottom: env(safe-area-inset-bottom)`.
- Sur mobile, `<main>` réserve en bas la hauteur de la barre plus cette même marge, pour que le
  dernier élément d'un onglet ne soit jamais recouvert. À partir de `sm`, la marge habituelle
  revient.
- `viewport-fit=cover` étend aussi la page sous les encoches latérales en paysage : les marges
  horizontales de `<main>` et de la barre prennent `max(1rem, env(safe-area-inset-left/right))`.

**Cinq entrées à 360 px** (FR-010) : la barre répartit ses entrées en colonnes égales (72 px
chacune avec cinq entrées). Pictogramme de 24 px au-dessus d'un libellé en `text-xs` : le plus long,
« Aujourd'hui », mesure environ 60 px. Il tient sans troncature.

**Alternative écartée** : deux menus distincts, affichés ou masqués selon la largeur. Cela
doublerait les liens dans le DOM et dans l'arbre d'accessibilité.

---

## R6 — Liens internes et défilement

**Décision** : une fonction pure `tabHref(tab, section?)` construit les adresses. Les deux liens
existants deviennent :

| Lien | Avant | Après |
| --- | --- | --- |
| Compteur « À classer » (`InboxCount`) | `#a-classer` | `?onglet=depenses#a-classer` |
| Alerte bancaire (`BankAlerts`) | `#titre-banques` | `?onglet=reglages#titre-banques` |

Ces liens passent par le même composant que le menu (`TabLink`), qui intercepte le clic.
`pushState` ne fait pas défiler la page : après l'affichage du panneau, un effet amène l'élément
visé à l'écran (`scrollIntoView`). Un élément `hidden` ne peut pas défiler, d'où l'effet après
validation du rendu plutôt qu'un défilement dans le gestionnaire de clic.

**Changement d'onglet par le menu** : retour en haut de la page, pour qu'on ne tombe pas au
milieu du nouvel onglet à la hauteur où l'on avait laissé le précédent.

**Textes à renvoi de position** (FR-013) : trois textes désignent un élément qui change
d'onglet. Chacun garde son début de phrase, sur lequel s'appuient les tests existants, et
remplace le renvoi par un `TabLink` :

| Texte | Composant (onglet) | Avant | Après |
| --- | --- | --- | --- |
| Bienvenue | `PremierLancement` (Aujourd'hui) | « … depuis la section « Vos données » en bas de page » | lien « l'onglet Réglages » → `settings`, `titre-donnees` |
| `NO_BUDGET_YET` | `BudgetRing` (Aujourd'hui) | « Renseignez vos revenus et vos abonnements ci-dessous… » | phrase sans « ci-dessous » + lien « Ouvrir l'onglet Mois » → `month`, `titre-revenus` |
| `EMPTY_JOURNAL` | `ExpenseJournal` (Dépenses) | « Aucune dépense enregistrée. Saisissez-en une ci-dessus… » | « Aucune dépense enregistrée. » + lien « Saisir une dépense » → `today`, `titre-saisie` |

Les constantes de `messages.ts` restent du texte simple : le lien est rendu par le composant, à
la suite de la phrase.

---

## R7 — Le retour de banque désigne l'onglet « Réglages »

**Décision** : la route `/api/banking/callback` redirige vers
`/?onglet=reglages&banking=<issue>` au lieu de `/?banking=<issue>`.

**Justification** : FR-018. Désigner l'onglet dans l'adresse de retour est explicite. L'autre
option serait de déduire « Réglages » de la présence du paramètre `banking` : une règle cachée de
plus dans la lecture de l'onglet. `BankPanel` retire déjà `banking` de l'adresse avec
`replaceState` en conservant les autres paramètres, donc `onglet=reglages` reste en place.

**Impact** : le [contrat de l'API bancaire](../006-bank-sync/contracts/api-banking.md) §4 et les
assertions `Location` de `routes.test.ts` sont mis à jour.

---

## R8 — Pictogrammes en SVG intégré

**Décision** : quatre pictogrammes SVG écrits dans le code (soleil, liste, calendrier, engrenage),
24 × 24, `stroke="currentColor"`, `aria-hidden="true"` (le libellé visible suffit).

**Justification** : principe VI. Une bibliothèque d'icônes serait une dépendance d'exécution pour
quatre tracés.

---

## R9 — Tests

La fonctionnalité ne comporte aucune logique monétaire : le principe III n'impose pas de test.
Les tests existants **doivent** cependant être adaptés, et quelques tests ciblés protègent ce qui
casserait silencieusement :

- **Unitaires** (`navigation.test.ts`) : `parseTab` (absent → aujourd'hui, valeur inconnue →
  aujourd'hui, chaque valeur connue) et `tabHref` (avec et sans section).
- **Composant** (`budget-view.test.tsx`) : onglet par défaut ; chaque section dans son onglet et
  dans un seul (FR-002) ; `aria-current` ; clic sur le compteur « À classer » → « Dépenses » ;
  saisie de dépense conservée après un aller-retour d'onglet (FR-017) ; `popstate` → onglet
  précédent.
- **Adaptation des tests existants** : `getByRole` ignore les éléments `hidden`. Les tests qui
  rendent `<BudgetView />` puis cherchent une section hors de « Aujourd'hui » (journal,
  enveloppes, revenus, abonnements, export…) ouvrent d'abord l'onglet voulu, au moyen d'un
  utilitaire de test commun `ouvrirOnglet(nom)`. Sont concernés : `dashboard.test.tsx`,
  `data-transfer.test.tsx`, `envelopes.integration.test.tsx`, `sync.integration.test.tsx`,
  `bank-sync.integration.test.tsx`, `budget-view.test.tsx`, ainsi que les assertions d'adresse
  de `routes.test.ts`.

Le comportement en largeur réelle (barre fixe, zone système, zoom 200 %) ne se teste pas dans
jsdom : il est vérifié à la main selon le [guide de validation](./quickstart.md).
