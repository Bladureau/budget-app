# Modèle de données : Menu de navigation par onglets

**Fonctionnalité** : `specs/007-navigation-menu` | **Date** : 2026-10-03

**Aucune donnée persistée n'est ajoutée ni modifiée.** Le document budgétaire reste dans sa version
actuelle, l'export et l'import sont inchangés, aucune migration n'est nécessaire (FR-019). Le seul
« état » introduit est l'onglet actif, qui n'existe que dans l'adresse de la page (recherche R1).

## Onglet (`Tab`)

Valeur d'énumération, définie une seule fois dans `src/features/navigation/navigation.ts`.

| Identifiant (`Tab`) | Valeur dans l'adresse | Libellé affiché | Pictogramme |
| --- | --- | --- | --- |
| `today` | *(absent)* | Aujourd'hui | soleil |
| `expenses` | `depenses` | Dépenses | liste |
| `month` | `mois` | Mois | calendrier |
| `settings` | `reglages` | Réglages | engrenage |

L'ordre du tableau est l'ordre du menu. Les identifiants de code sont en anglais et les valeurs
d'adresse en français, conformément au principe VIII : l'adresse est un texte visible par
l'utilisateur.

**Règles** :

- **Lecture** (`parseTab`) : la valeur du paramètre `onglet` est comparée **exactement** aux
  valeurs connues. Absente, vide, inconnue ou de casse différente : l'onglet est `today`
  (FR-004, FR-016). La lecture ne lève jamais d'erreur, puisque l'adresse est une frontière de
  confiance (principe IV) ; elle est validée et non transtypée.
- **Écriture** (`tabHref`) : `today` produit une adresse **sans** paramètre `onglet`. Les autres
  paramètres présents dans l'adresse ne sont pas conservés par un lien du menu : seul `banking`
  existe aujourd'hui, et il doit justement disparaître.
- **Section visée** (facultative) : identifiant d'élément porté par le fragment (`#a-classer`).
  Il n'influence pas l'onglet ; il ne sert qu'au défilement après l'affichage (recherche R6).

## Répartition des sections

Chaque section appartient à **exactement un** onglet (FR-002) :

| Onglet | Sections (composants existants, dans l'ordre) |
| --- | --- |
| `today` | `PremierLancement`, `BankAlerts`, `InboxCount`, `BudgetRing`, `DailyAllowance`, `ExpenseForm` |
| `expenses` | `Inbox`, `ExpenseJournal`, `EnvelopeList` |
| `month` | `MonthSummary`, `IncomeList`, `SubscriptionList`, `ChargeBreakdown`, `UpcomingDues`, `ForecastView` |
| `settings` | `BankPanel`, `DataTransfer` |
| *(hors onglets, toujours visibles)* | en-tête (titre, `MonthNavigator`), `SyncStatus`, `ConflictDialog`, `StorageNotice` |

Le repli `<details>` « Budget prévisionnel du mois » disparaît : son contenu devient l'onglet
`month` (FR-005).

## Ancres de section utilisées par des liens

| Ancre | Onglet | Visée par |
| --- | --- | --- |
| `a-classer` | `expenses` | `InboxCount` |
| `titre-banques` | `settings` | `BankAlerts` |
| `titre-donnees` | `settings` | `PremierLancement` |
| `titre-revenus` | `month` | `BudgetRing` (budget sans revenus) |
| `titre-saisie` | `today` | `ExpenseJournal` (journal vide) |
