---

description: "Liste de tâches — Menu de navigation par onglets"
---

# Tâches : Menu de navigation par onglets

**Entrée** : documents de conception de `specs/007-navigation-menu/`

**Prérequis** : [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/navigation.md](./contracts/navigation.md),
[quickstart.md](./quickstart.md)

**Tests** : le principe III n'en exige pas (aucune logique monétaire). Le plan (R9) retient
pourtant des tests ciblés sur la lecture de l'adresse, la répartition des sections et la
conservation de saisie. Surtout, les tests existants qui rendent `<BudgetView />` **doivent**
être adaptés, car `getByRole` ignore les éléments `hidden`.

**Organisation** : par récit utilisateur, pour que chacun soit implémentable et testable
indépendamment.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichier distinct, aucune dépendance sur une tâche inachevée)
- **[Story]** : récit auquel la tâche se rattache (US1 à US4)
- Chaque description porte un chemin de fichier exact

## Conventions de chemins

Application Next.js existante : code sous `src/`, tests à côté du code (`*.test.ts`,
`*.test.tsx`). Nouveau domaine `src/features/navigation/`, qui ne dépend ni de `budget` ni de
`banking`.

> **Documentation du framework** (principe V) : avant d'écrire le crochet de navigation, relire
> `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
> § « Native History API ». Avant de modifier `layout.tsx`, relire
> `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`.

> **jsdom** : `Element.prototype.scrollIntoView` et `window.scrollTo` n'y sont pas implémentés.
> Les tests qui déclenchent un défilement les remplacent par `vi.fn()` (dans le test, pas dans
> `vitest.setup.ts`, pour ne pas masquer un appel inattendu ailleurs).

---

## Phase 1 : Préparation

**Objet** : figer une référence de non-régression avant la première ligne.

- [X] T001 Enregistrer la référence : exécuter `npm run build`, `npm run lint` et `npm test` sur
      la branche `feat-007-navigation-menu` encore vierge, et consigner le nombre de tests au vert
      dans `specs/007-navigation-menu/quickstart.md` (nouvelle section « Référence » sous
      « Contrôles automatiques »).

---

## Phase 2 : Fondations (bloquantes)

**Objet** : le modèle d'onglet, la lecture et l'écriture de l'adresse, le lien de navigation,
utilisés par tous les récits.

**⚠️ CRITIQUE** : aucun récit ne commence avant la fin de cette phase.

- [X] T002 [P] Créer `src/features/navigation/navigation.ts` selon
      [data-model.md](./data-model.md) § « Onglet » : type `Tab` (`"today" | "expenses" |
      "month" | "settings"`), constante ordonnée `TABS` (identifiant, valeur d'adresse — `null`
      pour `today`, puis `depenses`, `mois`, `reglages` —, libellé), `parseTab(search: string):
      Tab` (comparaison exacte de `URLSearchParams.get("onglet")`, tout le reste → `"today"`,
      jamais d'exception) et `tabHref(tab: Tab, section?: string): string` (`"/"` pour `today`,
      `"/?onglet=<valeur>"` sinon, `#<section>` ajouté si fourni ; aucun autre paramètre conservé).
      Commentaires en français, JSDoc renvoyant à R1.
- [X] T003 [P] Écrire `src/features/navigation/navigation.test.ts` : `parseTab` sur `""`, `"?"`,
      chaque valeur connue, `"?onglet="`, `"?onglet=MOIS"`, `"?onglet=inconnu"`,
      `"?banking=connected&onglet=reglages"`, `"?onglet=mois&onglet=depenses"` (première valeur,
      comportement de `URLSearchParams.get`) ; `tabHref` pour chaque onglet, avec et sans section ;
      aller-retour `parseTab(new URL(tabHref(t), "http://x").search) === t` pour tout `t`.
- [X] T004 Créer `src/features/navigation/use-active-tab.ts` (`"use client"`) selon R2 :
      - un abonnement `subscribe` qui écoute `popstate` et un événement propre
        (`NAVIGATION_EVENT`, constante exportée), avec un retrait propre des écouteurs ;
      - `useActiveTab(): { tab: Tab; section: string | null }` via `useSyncExternalStore`, dont
        l'instantané client est `window.location.search + window.location.hash` (une chaîne, pour
        un instantané stable), dérivé ensuite par `parseTab` et le fragment sans `#`, et dont
        l'instantané serveur vaut `""` (donc `today`) ;
      - `navigateTo(href: string): void`, qui appelle `window.history.pushState(null, "", href)`
        puis émet `NAVIGATION_EVENT`.
      Commentaire expliquant pourquoi `useSearchParams` est écarté (frontière `Suspense`, `null`
      hors routeur dans les tests).
- [X] T005 [P] Créer `src/features/navigation/components/tab-icons.tsx` : quatre composants SVG
      (soleil, liste, calendrier, engrenage), 24 × 24, `viewBox="0 0 24 24"`, `fill="none"`,
      `stroke="currentColor"`, `strokeWidth={1.75}`, `aria-hidden="true"`, `focusable="false"`,
      et une table `TAB_ICONS: Record<Tab, () => JSX.Element>` (R8).
- [X] T006 Créer `src/features/navigation/components/tab-link.tsx` (`"use client"`) :
      `<TabLink tab section? className? aria-current? onNavigate?>` rend un `<a href={tabHref(tab,
      section)}>`. Au clic, **sauf** clic avec modificateur (`ctrlKey`, `metaKey`, `shiftKey`,
      `altKey`) ou bouton ≠ 0, il appelle `preventDefault()`, puis :
      - si l'adresse cible est déjà l'adresse courante, il n'ajoute pas d'entrée d'historique et
        fait défiler directement la section visée, ou le haut de page sans section ;
      - sinon, il appelle `navigateTo(href)`.
      Il appelle ensuite `onNavigate` s'il est fourni. Dépend de T002 et T004.
- [X] T007 [P] Créer l'utilitaire de test `src/test/navigation.ts` : `ouvrirOnglet(nom: string)`
      qui clique, avec `@testing-library/user-event`, sur le lien de nom accessible `nom` dans
      `screen.getByRole("navigation", { name: "Sections du budget" })`, puis attend que le
      panneau de même nom soit visible. Plus `reinitialiserAdresse()`, qui remet l'adresse à `/`
      par `window.history.replaceState` ; à appeler dans `afterEach`, sinon un onglet ouvert fuit
      d'un test à l'autre puisque jsdom conserve l'adresse. JSDoc en français.

**Point de contrôle** : `npm test -- navigation` passe ; aucun composant existant n'est encore
modifié.

---

## Phase 3 : Récit 1 — Naviguer entre les quatre onglets (Priorité : P1) 🎯 MVP

**Objectif** : quatre onglets, un seul visible, chaque section dans exactement un onglet,
l'onglet « Mois » sans repli.

**Test indépendant** : ouvrir l'application, constater que seul « Aujourd'hui » s'affiche, puis
parcourir les quatre onglets ([quickstart](./quickstart.md), récit 1).

### Mise en œuvre — Récit 1

- [X] T008 [US1] Créer `src/features/navigation/components/tab-bar.tsx` (`"use client"`) :
      `<nav aria-label="Sections du budget">` contenant un `<ul>` de quatre `<li>`, chacun avec
      un `TabLink` (pictogramme `TAB_ICONS[tab]` au-dessus du libellé de `TABS`) et
      `aria-current="page"` sur l'entrée active, lue par `useActiveTab()`. Dans ce récit,
      disposition simple en ligne dans le flux ; le placement adaptatif vient en US2 (T014).
      L'entrée active est distinguée par le gras, `text-[var(--accent)]` **et** un trait
      indicateur (`border-b-2` dans ce récit). Les entrées inactives sont en
      `text-[var(--muted)]`. Le focus est visible (`focus-visible:outline`), comme dans les
      boutons existants de `form-field.tsx`.
- [X] T009 [US1] Restructurer `src/features/budget/components/budget-view.tsx` selon
      [data-model.md](./data-model.md) § « Répartition des sections » :
      - en-tête, `SyncStatus`, `ConflictDialog` et `StorageNotice` restent au-dessus de tout ;
      - `<TabBar />` vient sous l'en-tête, rendu seulement quand `ready` ;
      - quatre conteneurs `<section aria-label="Aujourd'hui | Dépenses | Mois | Réglages"
        hidden={tab !== …} className="space-y-8">`, tous montés en permanence (R3) ;
      - suppression du `<details>` « Budget prévisionnel du mois », dont le contenu forme le
        panneau « Mois » (FR-005).
      Mettre à jour le JSDoc de `BudgetView` : la hiérarchie d'usage passe désormais par les
      onglets, non plus par l'ordre et le repli. Ne pas toucher au texte de `PremierLancement`
      (traité en US3, T019).
- [X] T010 [US1] Ajouter à `src/features/budget/budget-view.test.tsx` un bloc « Navigation par
      onglets » :
      (a) à l'ouverture, le panneau « Aujourd'hui » est visible et les trois autres non ;
      `aria-current="page"` est sur « Aujourd'hui » uniquement ;
      (b) pour chaque onglet, `ouvrirOnglet` puis vérification que ses sections (par leur titre
      `h2`) sont visibles et que celles des autres onglets ne le sont pas — FR-002 ;
      (c) « Mois » ne contient plus de `<details>` ni de « Budget prévisionnel du mois » ;
      (d) changer de mois avec la « Navigation entre les mois » garde l'onglet « Mois » ;
      (e) une dépense saisie sur « Aujourd'hui » apparaît dans le journal de « Dépenses ».
      `reinitialiserAdresse()` en `afterEach`.
- [X] T011 [US1] Adapter `src/features/budget/budget-view.test.tsx` et
      `src/features/budget/dashboard.test.tsx` : avant toute requête sur une section hors
      « Aujourd'hui », appeler `ouvrirOnglet(...)`. Ajouter `reinitialiserAdresse()` en
      `afterEach`. Ne modifier aucune attente de montant.
- [X] T012 [P] [US1] Même adaptation dans `src/features/budget/data-transfer.test.tsx` (onglet
      « Réglages ») et `src/features/budget/envelopes.integration.test.tsx` (onglet « Dépenses »).
- [X] T013 [P] [US1] Même adaptation dans `src/features/budget/sync.integration.test.tsx` et
      `src/features/banking/bank-sync.integration.test.tsx` (« Dépenses » pour « À classer » et le
      journal, « Réglages » pour « Mes banques »). Les attentes `href` de `#a-classer` et
      `#titre-banques` restent inchangées dans ce récit ; elles changent en US3 (T018).

**Point de contrôle** : `npm test` revient au nombre de tests de T001 plus les nouveaux, tous au
vert ; le MVP est livrable.

---

## Phase 4 : Récit 2 — Un menu adapté au téléphone comme à l'ordinateur (Priorité : P1)

**Objectif** : barre fixe en bas sous 640 px, onglets en haut au-delà, contenu jamais masqué,
zone système respectée, cinq entrées possibles à 360 px.

**Test indépendant** : 360 px puis 1280 px dans les outils de développement
([quickstart](./quickstart.md), récit 2).

### Mise en œuvre — Récit 2

- [X] T014 [US2] Rendre `src/features/navigation/components/tab-bar.tsx` adaptatif (R5) :
      - **sous `sm`** : `fixed inset-x-0 bottom-0 z-10`, fond `bg-[var(--background)]`, bordure
        supérieure `border-[var(--border)]`, `pb-[env(safe-area-inset-bottom)]`, marges
        latérales `px-[max(0.5rem,env(safe-area-inset-left))]` (et droite) ; entrées en grille
        de colonnes égales (`grid grid-flow-col auto-cols-fr`), pictogramme au-dessus du libellé
        `text-xs` ; trait indicateur **au-dessus** de l'entrée active ; cible tactile d'au moins
        44 px de haut ;
      - **à partir de `sm`** : `sm:static`, dans le flux, `sm:border-b`, entrées en ligne,
        pictogramme à gauche du libellé `sm:text-sm`, trait indicateur **en dessous**.
      Le libellé ne doit jamais être tronqué ni passer à la ligne (`whitespace-nowrap`).
- [X] T015 [US2] Dans `src/features/budget/components/budget-view.tsx`, réserver sous `sm`
      l'espace de la barre en bas de `<main>` :
      `pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-8`. Remplacer `px-4` par
      `px-[max(1rem,env(safe-area-inset-left))]` (et l'équivalent à droite avec
      `env(safe-area-inset-right)`), en conservant `sm:px-6`.
- [X] T016 [P] [US2] Dans `src/app/layout.tsx`, exporter
      `export const viewport: Viewport = { width: "device-width", initialScale: 1,
      viewportFit: "cover" }` (import `type Viewport` depuis `next`), avec un commentaire
      expliquant que sans `cover`, `env(safe-area-inset-*)` vaut 0 sur iOS. **Ne pas** fixer
      `maximumScale` ni `userScalable` : le zoom doit rester possible (principe VII).
- [ ] T017 [US2] Vérifier manuellement selon le [quickstart](./quickstart.md), récit 2,
      points 1 à 7, y compris la cinquième entrée temporaire à 360 px (FR-010), le profil
      iPhone en paysage (encoches latérales) et la mesure de longueur de SC-002 (point 7). Corriger `tab-bar.tsx` ou `budget-view.tsx` si
      besoin. Aucune modification temporaire ne doit rester.

**Point de contrôle** : l'application est confortable sur téléphone et sur ordinateur ; les
récits 1 et 2 fonctionnent ensemble.

---

## Phase 5 : Récit 3 — Les liens internes mènent au bon onglet (Priorité : P2)

**Objectif** : le compteur « À classer », les alertes bancaires, le message de bienvenue et le
retour de banque ouvrent le bon onglet et la bonne section.

**Test indépendant** : avec une opération à classer et une alerte bancaire, suivre chaque lien
depuis « Aujourd'hui » ([quickstart](./quickstart.md), récit 3).

### Mise en œuvre — Récit 3

- [X] T018 [US3] Remplacer les ancres internes par `TabLink` (R6) :
      - dans `src/features/banking/components/inbox.tsx`, `InboxCount` →
        `<TabLink tab="expenses" section="a-classer">` ;
      - dans `src/features/banking/components/bank-panel.tsx`, `BankAlerts` →
        `<TabLink tab="settings" section="titre-banques">`.
      Conserver classes et textes. Mettre à jour les deux attentes `href` de
      `src/features/banking/bank-sync.integration.test.tsx` (`/?onglet=depenses#a-classer`,
      `/?onglet=reglages#titre-banques`).
- [X] T019 [US3] Réécrire les trois textes à renvoi de position (FR-013, tableau de
      [research.md](./research.md) R6). Chaque phrase garde son début, sur lequel s'appuient
      `dashboard.test.tsx:207` et `:272` :
      - `src/features/budget/components/budget-view.tsx` : dans `PremierLancement`, remplacer
        « depuis la section « Vos données » en bas de page » par un
        `TabLink tab="settings" section="titre-donnees"` libellé « l'onglet Réglages » ;
      - `src/features/budget/messages.ts` : `NO_BUDGET_YET` devient « Renseignez vos revenus et
        vos abonnements pour connaître ce qu'il vous reste à dépenser. », et `EMPTY_JOURNAL`
        devient « Aucune dépense enregistrée. » ;
      - `src/features/budget/components/budget-ring.tsx` : à la suite de `NO_BUDGET_YET`,
        ajouter `TabLink tab="month" section="titre-revenus"` libellé « Ouvrir l'onglet Mois » ;
      - `src/features/budget/components/expense-journal.tsx` : à la suite de `EMPTY_JOURNAL`,
        ajouter `TabLink tab="today" section="titre-saisie"` libellé « Saisir une dépense ».
      Classe des liens : `underline`, comme les liens internes existants.
- [X] T020 [US3] Défilement vers la section visée : dans
      `src/features/budget/components/budget-view.tsx`, ajouter un `useEffect` dépendant de
      `[ready, tab, section]` (de `useActiveTab()`). Quand `ready` et `section` sont définis,
      il appelle `document.getElementById(section)?.scrollIntoView({ block: "start" })`. Il
      s'exécute après validation du rendu, quand le panneau n'est plus `hidden` (R6). Couvre aussi
      l'ouverture directe d'une adresse avec fragment.
- [X] T021 [P] [US3] Dans `src/app/api/banking/callback/route.ts`, changer `retour()` pour
      produire `Location: /?onglet=reglages&banking=${issue}`, et mettre à jour le commentaire
      d'en-tête (« redirection `303` vers `/?onglet=reglages` »). Mettre à jour les neuf
      attentes `Location` de `src/app/api/banking/routes.test.ts`.
- [X] T022 [P] [US3] Mettre à jour `specs/006-bank-sync/contracts/api-banking.md` §4 : nouvelle
      adresse de retour, avec un renvoi vers `specs/007-navigation-menu/contracts/navigation.md`
      §4.
- [X] T023 [US3] Ajouter à `src/features/budget/budget-view.test.tsx` (avec `scrollIntoView`
      remplacé par `vi.fn()`) :
      (a) avec une opération dans `banking.inbox`, un clic sur le compteur « À classer » rend
      visible le panneau « Dépenses » et appelle `scrollIntoView` sur `#a-classer` ;
      (b) avec une alerte bancaire, un clic sur « Aller à « Mes banques » » rend visible
      « Réglages » ;
      (c) budget vide : le message de bienvenue contient un lien vers `/?onglet=reglages#titre-donnees`
      et plus le texte « bas de page » ;
      (d) adresse initiale `/?onglet=reglages&banking=connected` : le panneau « Réglages » est
      visible et le message de retour de banque est affiché ;
      (e) mois sans revenus : l'anneau ne contient plus « ci-dessous » ; un clic sur « Ouvrir
      l'onglet Mois » rend visible le panneau « Mois » ;
      (f) journal vide : le texte ne contient plus « ci-dessus » ; un clic sur « Saisir une
      dépense » rend visible « Aujourd'hui » et appelle `scrollIntoView` sur `#titre-saisie`.
      Réutiliser les jeux d'essai déjà présents dans `bank-sync.integration.test.tsx` si possible,
      sans les dupliquer.

**Point de contrôle** : plus aucun lien interne mort ; le parcours de liaison bancaire revient sur
« Réglages ».

---

## Phase 6 : Récit 4 — Garder sa place (Priorité : P3)

**Objectif** : actualisation, bouton retour, saisie en cours et adresse inconnue.

**Test indépendant** : [quickstart](./quickstart.md), récit 4.

### Mise en œuvre — Récit 4

- [X] T024 [US4] Retour en haut lors d'un changement d'onglet par le menu : dans
      `src/features/navigation/components/tab-bar.tsx`, passer à chaque `TabLink` un
      `onNavigate={() => window.scrollTo({ top: 0 })}`. Ce n'est pas le cas des liens internes,
      qui défilent vers leur section (T020). Le retour du navigateur n'est **pas** concerné : il
      garde le comportement natif.
- [X] T025 [US4] Ajouter à `src/features/budget/budget-view.test.tsx` (avec `window.scrollTo`
      remplacé par `vi.fn()`) :
      (a) **saisie conservée** (FR-017) : remplir le montant et le libellé du formulaire de
      dépense sans valider, `ouvrirOnglet("Réglages")`, `ouvrirOnglet("Aujourd'hui")`, puis
      vérifier que les champs ont gardé leurs valeurs ;
      (b) **retour** (FR-015) : ouvrir « Dépenses », puis `window.history.back()` et attendre
      l'événement `popstate` (jsdom le déclenche de façon asynchrone) : « Aujourd'hui » est de
      nouveau visible ;
      (c) **actualisation** (FR-014) : adresse `/?onglet=mois` posée avant le rendu → panneau
      « Mois » visible dès le chargement ;
      (d) **adresse inconnue** (FR-016) : `/?onglet=nimportequoi` → « Aujourd'hui », sans
      message d'erreur ;
      (e) un clic sur une entrée du menu appelle `window.scrollTo({ top: 0 })`.

**Point de contrôle** : les quatre récits fonctionnent ensemble.

---

## Phase 7 : Finitions et contrôles transverses

- [X] T026 Supprimer de `src/features/budget/components/budget-view.tsx` les imports devenus
      inutiles et tout reste de l'ancienne disposition (principe de contrôle n° 5 : aucun code
      mort).
- [X] T027 [P] Relire les commentaires et JSDoc ajoutés ou modifiés dans `src/features/navigation/`,
      `budget-view.tsx`, `budget-ring.tsx`, `expense-journal.tsx`, `messages.ts`, `inbox.tsx`,
      `bank-panel.tsx`, `route.ts` et `layout.tsx` : en français, et sans référence à la « page
      unique » ou au « bas de page » (principe VIII). Relancer une recherche de
      `ci-dessus|ci-dessous|bas de page|plus bas` dans `src/` (hors tests) : chaque occurrence
      restante doit désigner un élément du même onglet (FR-013).
- [X] T028 Exécuter `npm run lint`, `npm run build` et `npm test` : aucune erreur. Le build ne
      doit signaler aucune frontière `Suspense` manquante, et `/` doit rester prérendue. Comparer
      le nombre de tests à la référence de T001.
- [ ] T029 Dérouler l'intégralité du [quickstart](./quickstart.md) dans l'application en
      fonctionnement : récits 1 à 4, accessibilité (clavier, lecteur d'écran, thèmes clair et
      sombre), hors connexion (aucune requête au changement d'onglet), zoom 200 %.
- [ ] T030 Si `next dev` a régénéré le bloc d'`AGENTS.md`, le versionner avec le travail.
      Commits par modification logique, messages en français.

---

## Dépendances et ordre d'exécution

### Dépendances entre phases

- **Préparation (phase 1)** : aucune dépendance.
- **Fondations (phase 2)** : après la phase 1 ; **bloque tous les récits**.
- **Récit 1 (phase 3)** : après la phase 2. C'est le MVP.
- **Récit 2 (phase 4)** : après T008 et T009 (il modifie la barre et la coquille du récit 1).
- **Récit 3 (phase 5)** : après T009 (panneaux en place). T021 et T022 peuvent commencer dès la
  phase 2.
- **Récit 4 (phase 6)** : après T008 et T009. Indépendant des récits 2 et 3.
- **Finitions (phase 7)** : après les récits retenus.

### Dépendances internes

- T002 → T003, T004, T006 ; T004 → T006 ; T005 et T006 → T008 ; T008 → T009 → T010, T011.
- T007 est requis par T010 à T013, T023 et T025.
- T014 et T015 touchent des fichiers différents mais se valident ensemble (T017).
- T018, T019 et T020 précèdent T023 ; T024 précède T025.

### Parallélisme

- **Phase 2** : T002, T005 et T007 en parallèle ; puis T003 et T004 ; puis T006.
- **Phase 3** : après T009, T012 et T013 en parallèle de T010 et T011.
- **Phase 4** : T016 en parallèle de T014 et T015.
- **Phase 5** : T021 et T022 en parallèle de tout le reste du récit.
- Les récits 2, 3 et 4 peuvent avancer en parallèle une fois le récit 1 terminé, en dehors des
  conflits sur `budget-view.tsx` (T015, T019, T020) et `tab-bar.tsx` (T014, T024), à enchaîner.

### Exemple de lancement parallèle — Phase 2

```text
T002 Créer src/features/navigation/navigation.ts
T005 Créer src/features/navigation/components/tab-icons.tsx
T007 Créer src/test/navigation.ts
```

---

## Stratégie de mise en œuvre

### MVP d'abord (récit 1)

1. Phases 1 et 2.
2. Phase 3 : les quatre onglets fonctionnent, les tests sont au vert.
3. **S'arrêter et valider** : le défilement interminable a disparu. Sur téléphone, le menu est
   encore en haut et les deux liens internes ne changent pas d'onglet.

### Livraison incrémentale

1. Récit 1 → MVP.
2. Récit 2 → confort sur téléphone : c'est l'incrément qui donne sa forme finale au menu.
3. Récit 3 → plus aucun lien mort, retour de banque correct.
4. Récit 4 → actualisation, retour, saisie conservée vérifiés par les tests.

Les récits 1 et 2 étant tous deux P1, livrer le premier commit déployé avec les deux.

---

## Notes

- **Écarts à l'implémentation** :
  - les tests de T023 et T025 sont dans `src/features/navigation/navigation.integration.test.tsx`
    plutôt que dans `budget-view.test.tsx`. Ils ont besoin d'un serveur simulé (élément « À
    classer », alerte bancaire, budget vide synchronisé), absent de `budget-view.test.tsx` ;
  - T014 (disposition adaptative) et T024 (retour en haut) ont été écrits avec T008, dans le
    même fichier `tab-bar.tsx` ; T015 et T020 avec T009, dans `budget-view.tsx` ;
  - les panneaux s'appellent « Onglet <libellé> » et non « <libellé> » : la section du reste
    du jour s'appelle déjà « Aujourd'hui » (contrat mis à jour, §2) ;
  - les tests de `sync.integration` et `bank-sync.integration` lisent le journal avec
    `hidden: true` : ils vérifient des données synchronisées, pas la navigation.

- La saisie conservée (FR-017), l'actualisation (FR-014) et le retour (FR-015) découlent de la
  conception (R1 à R3) : le récit 4 les **prouve** par des tests plus qu'il ne les construit.
- Aucun montant ni aucune donnée ne change (FR-019) : si une attente de montant doit être
  modifiée dans un test existant, c'est une régression, pas une adaptation.
