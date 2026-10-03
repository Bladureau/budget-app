# Plan d'implémentation : Menu de navigation par onglets

**Branche** : `feat-007-navigation-menu` | **Date** : 2026-10-03 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/007-navigation-menu/spec.md`

## Résumé

Remplacer la page unique par quatre onglets (Aujourd'hui, Dépenses, Mois, Réglages) : une barre
fixée en bas sur téléphone, des onglets sous l'en-tête sur ordinateur. Ni les données ni les calculs
ne changent.

L'approche tient en trois choix :

1. **L'onglet vit dans l'adresse** (`/?onglet=mois`), écrit par `history.pushState` et lu par
   `useSyncExternalStore` (R1, R2). L'actualisation, le bouton retour et les liens directs
   viennent sans code dédié. Changer d'onglet n'émet aucune requête, donc c'est instantané, y compris
   hors connexion.
2. **Les quatre panneaux restent montés**, les inactifs portent `hidden` (R3). Une saisie en
   cours survit au changement d'onglet sans toucher aux formulaires.
3. **Un seul `<nav>` de liens** (R4, R5), placé en bas ou en haut selon la largeur par des classes
   adaptatives, avec `aria-current="page"` sur l'entrée active.

Les deux liens internes existants et le retour de banque sont redirigés vers le bon onglet (R6,
R7).

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8.

**Dépendances principales** : Next.js 16.3.4 (App Router), Tailwind CSS 4. **Aucune dépendance
ajoutée** : pictogrammes en SVG intégré (R8).

**Réutilisé de l'existant** :

| Élément existant | Rôle dans 007 |
| --- | --- |
| `BudgetView` (`budget-view.tsx`) | Devient la coquille : en-tête et bandeaux globaux, menu, quatre panneaux. |
| Tous les composants de section | Inchangés, seulement redistribués entre les panneaux. |
| Motif `useSyncExternalStore` de `budget-provider.tsx` | Modèle de lecture de l'onglet sans écart d'hydratation. |
| Jetons de couleur de `globals.css` (`--accent`, `--border`, `--surface`, `--muted`) | Style du menu dans les deux thèmes. |
| `replaceState` de `BankPanel` (retrait de `?banking=`) | Conservé tel quel : il préserve déjà les autres paramètres. |

**Stockage** : sans objet. Aucune donnée persistée, aucune migration (voir le
[modèle de données](./data-model.md)).

**Tests** : Vitest, React Testing Library, jsdom, déjà en place (R9).

**Plateforme cible** : inchangée (navigateurs mobiles et de bureau, serveur Node auto-hébergé).

**Type de projet** : application web existante ; modification de l'interface uniquement, plus une
ligne dans une route serveur (R7).

**Objectifs de performance** : changement d'onglet perçu comme immédiat (< 0,5 s, SC-003), sans
requête réseau.

**Contraintes** : utilisable dès 360 px avec cinq entrées (FR-010) ; zoom 200 % ; clavier seul ;
contraste AA en clair et en sombre ; fonctionnement hors connexion.

**Échelle / portée** : un utilisateur ; quatre onglets, puis cinq avec la fonctionnalité 008.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

### Avant la phase 0

| Principe | Verdict | Analyse |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Aucune donnée ne quitte l'appareil. Le changement d'onglet n'émet aucune requête, et la consultation hors connexion reste entière. |
| II. L'argent est exact | ✅ Sans objet | Aucun montant n'est créé, calculé ni transformé (FR-019). |
| III. Tester là où cela compte | ✅ Conforme | Aucune logique monétaire, donc aucun test exigé. Des tests ciblés protègent tout de même la lecture de l'adresse et la répartition des sections (R9). |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Nouvelle frontière de confiance : le paramètre `onglet` de l'adresse, **validé** par comparaison exacte à une liste fermée, jamais transtypé. |
| V. Documentation du framework | ✅ Conforme | Choix fondés sur les guides installés : intégration de `pushState` au routeur, exigence `Suspense` de `useSearchParams`, option `viewportFit` (voir [research.md](./research.md)). |
| VI. Simplicité et YAGNI | ✅ Conforme | Aucune dépendance, aucune bibliothèque de routage ni d'état. Pas de déduction de l'onglet depuis une ancre, pas de pastilles, pas de mémorisation hors de l'adresse. |
| VII. Accessibilité et adaptabilité | ✅ Conforme, **cœur de la fonctionnalité** | `<nav>` et liens natifs, `aria-current`, `hidden` pour retirer les panneaux inactifs de l'arbre d'accessibilité. Entrée active distinguée autrement que par la couleur. 360 px, zone système, zoom 200 %. |
| VIII. Le français | ✅ Conforme | Artefacts et commentaires en français ; identifiants en anglais (`Tab`, `useActiveTab`) ; valeurs d'adresse en français, car visibles par l'utilisateur. |

### Après la phase 1

Verdicts inchangés. Un point de vigilance relevé à la conception est consigné ici :

- **Principe VII — `viewport-fit=cover`** : ce réglage, nécessaire pour respecter la zone système
  en bas (FR-006), étend aussi la page sous les encoches latérales en paysage. Les marges
  horizontales intègrent donc `env(safe-area-inset-left/right)` (R5). À vérifier sur un profil
  iPhone en paysage ([quickstart](./quickstart.md), récit 2).

Aucune violation : la section « Suivi de la complexité » est sans objet.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/007-navigation-menu/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : décisions R1 à R9
├── data-model.md        # Phase 1 : onglets, répartition des sections, ancres
├── quickstart.md        # Phase 1 : guide de validation
├── contracts/
│   └── navigation.md    # Phase 1 : adresses, structure du menu, retour de banque
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Code source

```text
src/
├── app/
│   ├── layout.tsx                         # MODIFIÉ : export `viewport` (viewportFit: "cover")
│   └── api/banking/callback/route.ts      # MODIFIÉ : redirection vers /?onglet=reglages&banking=…
├── features/
│   ├── navigation/                        # NOUVEAU
│   │   ├── navigation.ts                  # Tab, TABS, parseTab, tabHref (fonctions pures)
│   │   ├── navigation.test.ts             # Tests unitaires de parseTab / tabHref
│   │   ├── use-active-tab.ts              # useSyncExternalStore + navigateTo (pushState)
│   │   └── components/
│   │       ├── tab-bar.tsx                # <nav> adaptatif, entrées, aria-current
│   │       ├── tab-link.tsx               # Lien interceptant le clic (menu et liens internes)
│   │       └── tab-icons.tsx              # 4 pictogrammes SVG
│   ├── budget/
│   │   ├── messages.ts                    # MODIFIÉ : NO_BUDGET_YET, EMPTY_JOURNAL sans renvoi de position
│   │   └── components/
│   │       ├── budget-view.tsx            # MODIFIÉ : coquille + 4 panneaux, fin du <details>,
│   │       │                              #   message de bienvenue → lien « Réglages »
│   │       ├── budget-ring.tsx            # MODIFIÉ : lien vers « Mois » (budget sans revenus)
│   │       └── expense-journal.tsx        # MODIFIÉ : lien vers la saisie (journal vide)
│   └── banking/components/
│       ├── inbox.tsx                      # MODIFIÉ : InboxCount → TabLink vers Dépenses
│       └── bank-panel.tsx                 # MODIFIÉ : BankAlerts → TabLink vers Réglages
└── test/
    └── navigation.ts                      # NOUVEAU : utilitaire ouvrirOnglet(nom) pour les tests

specs/006-bank-sync/contracts/api-banking.md   # MODIFIÉ : §4, nouvelle adresse de retour
```

**Décision de structure** : la navigation forme un petit domaine `src/features/navigation/`, à
côté de `budget` et `banking`. Elle ne dépend d'aucun des deux, mais tous deux l'utilisent (les liens
internes de `banking`, la coquille de `budget`). La placer dans `budget/components` créerait une
dépendance de `banking` vers un détail de `budget`.

Le dépôt n'a pas encore d'utilitaire de test partagé : chaque fichier de test rend sa vue
lui-même. `src/test/navigation.ts` est le premier, justifié par six fichiers qui en ont besoin.

## Ordre de mise en œuvre suggéré

1. `navigation.ts` + tests unitaires (pur, sans interface).
2. `use-active-tab.ts`, `tab-link.tsx`, `tab-icons.tsx`, `tab-bar.tsx`.
3. `budget-view.tsx` : coquille et panneaux (récit 1), puis disposition adaptative et `viewport`
   (récit 2).
4. Utilitaire `ouvrirOnglet` et adaptation des tests existants, pour que `npm test` repasse au vert
   avant d'aller plus loin.
5. Liens internes, textes à renvoi de position (bienvenue, anneau, journal vide), retour de
   banque et contrat 006 (récit 3).
6. Défilement après navigation, retour en haut, tests de conservation de saisie et de `popstate`
   (récit 4).
7. Validation manuelle selon le [quickstart](./quickstart.md).

## Suivi de la complexité

Sans objet : aucune violation de la constitution.
