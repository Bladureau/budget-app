# Plan d'implémentation : Assistant du budget (IA locale)

**Branche** : `feat-009-local-ai-assistant` | **Date** : 2026-10-24 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de `specs/009-local-ai-assistant/spec.md`, guide
[docs/ia-locale-ollama.md](../../docs/ia-locale-ollama.md).

## Résumé

Un cinquième onglet « Assistant » permet de poser des questions en français sur le budget du mois
affiché. La route `POST /api/assistant` lit le budget central, **construit un contexte borné dont
chaque montant est calculé et formaté par les fonctions existantes de l'application**, l'injecte dans le
prompt d'une IA locale (Ollama, `qwen3.5:9b`, joignable seulement depuis le réseau Docker du NAS) et
renvoie la réponse **en flux NDJSON**. Le modèle ne fait que recopier : à la fin, un contrôle compare
chaque montant de la réponse aux valeurs fournies et avertit des montants non vérifiés.

Choix structurants (détails dans [research.md](./research.md)) :

- **V1 renforcée** : contexte injecté + récupération d'opérations par mots-clés, un seul appel, aucun
  outil, aucune écriture (R1, R4).
- **Aucune persistance** : ni conversation, ni nouveau champ du document ; `DOCUMENT_VERSION` reste à 5.
- **Annulation réelle** : l'abandon de la requête ferme la connexion vers l'IA, qui arrête de générer
  (R8) ; à valider sur le NAS.
- **Mode dégradé** : IA absente → `503` en moins de 10 s, « Assistant indisponible », reste de
  l'application intact (R8, R11).
- **Aucune dépendance ajoutée** : `fetch`, `ReadableStream` et `AbortSignal` de la plateforme.

## Contexte technique

**Langage / version** : TypeScript 5 (mode strict), Node 22 (image Docker `node:22-alpine`).

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19.2.8 — **aucune dépendance
d'exécution ajoutée** (principe VI). Service externe : Ollama sur le NAS, appelé en HTTP interne avec
`fetch`.

**Stockage** : néant. La fonctionnalité lit `readBudget()` (fichier central de la 005) et ne persiste
rien ; la conversation vit dans l'état d'un composant React.

**Tests** : Vitest 5 (jsdom par défaut, `// @vitest-environment node` pour les routes), Testing Library.
`fetch` simulé avec des réponses Ollama enregistrées ; le vrai modèle n'est jamais appelé (R12).

**Plateforme cible** : navigateur (mobile et ordinateur) + serveur Next.js auto-hébergé en Docker sur le
NAS, derrière Tailscale Serve.

**Type de projet** : application web (Next.js, un seul dépôt) — composants client + route serveur.

**Objectifs de performance** : début de réponse en moins de 5 s dans 95 % des cas quand le modèle est
chargé ; indicateur d'attente en moins d'1 s quand il doit l'être (~30 s) ; indisponibilité signalée en
moins de 10 s (CR-003, CR-004).

**Contraintes** : fenêtre de contexte 8192 jetons (R5) ; une génération à la fois côté IA ; délai
maximal 120 s ; GPU de 8 Go partagé avec Jellyfin ; aucun port d'Ollama publié ; accès au budget
identique au reste de l'application (cookie d'autorisation).

**Échelle / périmètre** : un utilisateur, un budget de quelques milliers d'opérations au plus ; une
route, un onglet, ~10 modules.

## Vérification de la constitution

*Porte : à franchir avant la recherche (phase 0) ; réévaluée après la conception (phase 1).*

| Principe | Verdict | Justification |
|---|---|---|
| I. Propriété locale des données | ✅ | L'IA tourne sur la machine de l'utilisateur ; le seul `fetch` sortant vise `OLLAMA_URL` (réseau Docker interne). Aucun service tiers. Mode dégradé obligatoire : l'application reste pleinement utilisable sans l'IA (EF-009). **Point de vigilance** : un réseau Docker `external` absent bloquerait le démarrage de `budget-app` ; mitigé et documenté (R11). |
| II. L'argent est exact | ✅ | Aucun montant calculé par le modèle : tout passe par les fonctions existantes en centimes et par `formatCents` (seul point d'appel à `Intl.NumberFormat`). Le registre des valeurs connues permet de détecter un chiffre inventé (R6). Arrondis inchangés. |
| III. Tester là où cela compte | ✅ | Tests exigés pour le constructeur de contexte (agrège des montants), le contrôle des montants (analyse des montants) et l'assainissement ; chacun avec cas nominal, cas limite (zéro, négatif, très grand montant) et entrée malformée. Voir la liste dans [research.md](./research.md) R12. |
| IV. Typage strict et lint sans erreur | ✅ | Corps de requête et lignes Ollama validés à l'exécution avant d'être typés, jamais transtypés. Aucun `any`, `!` ni désactivation de règle prévus. |
| V. Documentation du framework | ✅ | `route.md` lu : gestionnaire `POST` avec `Request`, réponse `Response` portant un `ReadableStream`, `cookies()` rend la route dynamique. Compression gzip identifiée comme risque pour le flux (R3, R13). |
| VI. Simplicité et YAGNI | ✅ | Pas d'outils, pas de boucle, pas de SDK, pas de bibliothèque d'état, pas de persistance, pas de réglage. Constantes nommées plutôt que configuration. Cinquième onglet plutôt qu'un nouveau motif d'interface. |
| VII. Accessibilité et adaptabilité | ✅ | Contrat d'interface dédié ([interface.md](./contracts/interface.md) §5) : liste non `aria-live`, région de statut distincte, focus géré, texte d'explication, cinq onglets à 360 px à vérifier. |
| VIII. Le français | ✅ | Spécification, plan, commentaires, textes d'interface et messages de commit en français ; identifiants en anglais. |

**Résultat** : aucune violation, **section « Suivi de la complexité » vide**. Réévaluation après la
conception : inchangée — la conception n'a ajouté ni dépendance, ni abstraction, ni persistance.

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/009-local-ai-assistant/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 : décisions R1 à R13
├── data-model.md        # Phase 1 : contexte, requête, conversation, configuration
├── quickstart.md        # Phase 1 : validation automatique et manuelle sur le NAS
├── contracts/
│   ├── api-assistant.md # POST /api/assistant, flux NDJSON, appel à l'IA
│   └── interface.md     # onglet, états, textes, accessibilité
├── checklists/
│   └── requirements.md  # qualité de la spécification
└── tasks.md             # Phase 2 : /speckit-tasks (non créé ici)
```

### Code source (racine du dépôt)

```text
src/
├── app/
│   └── api/
│       └── assistant/
│           ├── route.ts                 # POST : autorisation, validation, lecture du budget, flux
│           └── route.test.ts            # 401, 400, 503, flux simulé, annulation
├── features/
│   ├── assistant/                       # NOUVEAU — logique pure et interface
│   │   ├── types.ts                     # ChatTurn, AssistantRequest, événements de flux, Exchange
│   │   ├── fixtures.ts                  # jeu de référence et valeurs attendues (tests)
│   │   ├── context.ts                   # buildAssistantContext (pur) + registre des valeurs connues
│   │   ├── context.test.ts
│   │   ├── sanitize.ts                  # assainissement des libellés (R7)
│   │   ├── sanitize.test.ts
│   │   ├── keywords.ts                  # mots-clés de la question, mots vides (R4)
│   │   ├── keywords.test.ts
│   │   ├── prompt.ts                    # consignes système, assemblage des messages, historique tronqué
│   │   ├── prompt.test.ts
│   │   ├── verify-amounts.ts            # contrôle des montants (R6)
│   │   ├── verify-amounts.test.ts
│   │   ├── request.ts                   # validation de la requête (frontière de confiance)
│   │   ├── request.test.ts
│   │   ├── conversation.ts              # réducteur pur : send, edit, cancel, reset, receive
│   │   ├── conversation.test.ts
│   │   ├── client.ts                    # fetch + lecture NDJSON + AbortController
│   │   ├── client.test.ts
│   │   ├── components/
│   │   │   ├── assistant-panel.tsx      # panneau de l'onglet
│   │   │   ├── exchange-view.tsx        # un échange : question, réponse, états, avertissement
│   │   │   └── question-form.tsx        # champ, envoi, annulation, compteur
│   │   └── assistant.integration.test.tsx
│   ├── navigation/
│   │   ├── navigation.ts                # + onglet « assistant » dans Tab et TABS
│   │   ├── navigation.test.ts           # mis à jour (cinq onglets)
│   │   └── components/tab-icons.tsx     # + pictogramme de bulle
│   └── budget/components/budget-view.tsx # + Panneau « assistant » monté avec key={selectedMonth}
└── lib/
    └── server/
        └── assistant/
            ├── ollama.ts                # client minimal : disponibilité, flux, annulation, délai
            ├── ollama.test.ts           # fetch simulé
            └── stream.ts                # NDJSON Ollama → événements de flux, contrôle final

docker-compose.yml                       # + réseau « ollama », OLLAMA_URL, OLLAMA_MODEL
README.md                                # + fonctionnalité et prérequis de déploiement
```

**Décision de structure** : projet web unique de la forme existante `src/features/<domaine>` pour la
logique et l'interface, `src/lib/server/<domaine>` pour ce qui touche le réseau interne (jamais dans le
graphe client, comme `banking`). La logique pure (`context`, `prompt`, `verify-amounts`, `request`,
`conversation`) est volontairement séparée de tout accès réseau, pour être testée sans simulacre.

Le seul fichier existant modifié dans son comportement est `budget-view.tsx` (un panneau de plus) ;
`navigation.ts` et ses tests changent parce que la liste fermée des onglets s'allonge.

## Ordre de réalisation (indicatif, détaillé par `/speckit-tasks`)

1. **Socle pur** : types, assainissement, mots-clés, constructeur de contexte, contrôle des montants,
   validation de la requête, assemblage du prompt — tout testé sans réseau (récits 1 et 4).
2. **Client Ollama et route** : disponibilité, flux, annulation, délai, `401`/`400`/`503` (récits 1 et 2).
3. **Conversation et interface** : réducteur, client NDJSON, panneau, nouvel onglet (récits 1 à 3).
4. **Récit 4** : récupération par mots-clés injectée dans le contexte, avec son total.
5. **Déploiement et validation sur le NAS** : `docker-compose.yml`, README, parties D à H du
   [quickstart](./quickstart.md).

Le récit 1 (P1) et le récit 2 (P1) forment le MVP : sans mode dégradé, l'assistant n'est pas livrable.

## Risques et points ouverts

| Risque | Parade |
|---|---|
| Ollama ne coupe pas la génération à la fermeture de la connexion | Test manuel F.2 du quickstart ; bloque la fusion si faux |
| Compression ou mandataire inverse retiennent le flux | En-têtes `no-transform` / `identity` (R3) ; test manuel G |
| Cinq onglets trop serrés à 360 px | Test manuel H ; repli : libellé raccourci ou icône seule avec nom accessible |
| Réseau Docker `ollama` absent → `budget-app` ne démarre pas | Commande préalable documentée (R11) ; pas de dépendance dure autrement |
| Réponse juste mais mal attribuée non détectée par le contrôle R6 | Jeu de questions types vérifié à la main (quickstart D) |
| Budget non synchronisé : l'assistant voit la version du serveur | Bandeau explicite (R2) ; écart transitoire |
| Qualité du français ou fidélité de `qwen3.5:9b` insuffisante | Jeu de questions D ; `think: false` et `temperature` basse ; le modèle est remplaçable par variable d'environnement sans changer le code |

## Suivi de la complexité

*Aucune violation de la constitution : rien à justifier.*
