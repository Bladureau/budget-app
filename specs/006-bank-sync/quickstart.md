# Guide de mise en service et de validation : Synchronisation bancaire

**Fonctionnalité** : [spec.md](./spec.md) · **Contrats** : [contracts/](./contracts/)

Ce guide prouve que la fonctionnalité marche de bout en bout. Il ne décrit pas l'implémentation.

---

## 1. Prérequis

- La fonctionnalité 005 est déployée : conteneur `budget-app` derrière Caddy, joignable sur
  `https://VOTRE-NAS.VOTRE-TAILNET.ts.net:PORT`.
- Application Enable Banking « Budget perso » **active en production** (mode restreint), avec
  **LCL et Revolut tous deux listés** parmi les comptes liés du portail.
- URL de redirection déclarée dans le portail, **sans coquille** :
  `https://VOTRE-NAS.VOTRE-TAILNET.ts.net:PORT/api/banking/callback`.
- Clé privée `<id d'application>.pem` copiée sur le NAS, hors du dépôt.

## 2. Configuration

Dans `.env` sur le NAS (jamais versionné) :

```dotenv
ENABLE_BANKING_APP_ID=<identifiant d'application>
ENABLE_BANKING_KEY_FILE=./data/enable-banking.pem
BANKING_REDIRECT_URL=https://VOTRE-NAS.VOTRE-TAILNET.ts.net:PORT/api/banking/callback
```

La clé est rangée dans le répertoire `data/` **du projet** sur le NAS. Ce répertoire est déjà
exclu de Git (`.gitignore`) et du contexte de construction Docker (`.dockerignore`) : la clé
n'entre donc ni dans le dépôt, ni dans l'image. Elle est montée **en lecture seule** dans le
conteneur. Ce n'est **pas** le volume Docker `budget-data`, où l'application écrit le budget :
l'application ne doit pas pouvoir modifier sa propre clé.

Le fichier de clé doit être lisible par l'uid 1001 du conteneur (R6) :

```sh
sudo chown 1001 ./data/enable-banking.pem
sudo chmod 400  ./data/enable-banking.pem
docker compose up -d --build
```

**Contrôle** : `GET /api/banking/status` (navigateur autorisé) renvoie `"configured": true`.

**Contrôle de fermeture par défaut** : retirer `ENABLE_BANKING_APP_ID`, redémarrer.
L'application s'ouvre normalement, et le panneau bancaire affiche « Synchronisation bancaire non
configurée ». Remettre la variable.

## 3. Tests automatisés

```sh
npm test
npm run lint
npm run build
```

Doivent notamment passer :

| Suite | Prouve |
| --- | --- |
| Normalisation LCL et Revolut | Extraction des dates, des libellés, des montants depuis le texte ; les 9 fusions d'arrondis du [contrat](./contracts/normalisation.md) §3 ; le cas ambigu |
| Règles | Ordre d'évaluation du [contrat](./contracts/regles.md) §1 ; jeu d'essai §5 ; idempotence ; indépendance à l'appareil ; respect des corrections |
| Calculs nets | Remboursements au jour, au mois, par enveloppe ; borne à zéro ; excédent exposé |
| Document v4 | Migration 3 → 4 sans perte ; règles initiales présentes ; export v3 réimportable ; export v5 refusé |
| Magasin bancaire serveur | Écriture atomique ; quarantaine ; dédoublonnage du cache par `ref` |
| Points d'entrée | 401 sans cookie ; retour de banque avec `state` invalide, expiré, rejoué ; aucun secret dans les réponses |

## 4. Validation de bout en bout

À dérouler dans l'application réelle, dans cet ordre.

| # | Action | Résultat attendu | Exigences |
| --- | --- | --- | --- |
| 1 | Ouvrir « Banques », choisir « Relier LCL » | La date de début d'import est proposée au 1ᵉʳ du mois courant (2026-10-01 en octobre) | EF-039, R12 |
| 2 | Valider chez LCL | Retour dans l'application, message « LCL reliée », suffixe IBAN `XXXX` affiché | EF-001, EF-003 |
| 3 | Idem pour Revolut | Suffixe `YYYY` affiché | EF-001 |
| 4 | Attendre la première synchronisation | Les paiements carte depuis le 1ᵉʳ octobre apparaissent au journal, au jour du **paiement**, marqués LCL ou Revolut | EF-014, EF-021, EF-029, CS-001 |
| 5 | Comparer avec l'app LCL | Aucune recharge `CB Revolut`, aucun virement entrant, aucun loyer dans les dépenses | EF-016, EF-019, EF-020, CS-002 |
| 6 | Comparer un achat Revolut | Montant = achat + arrondi (exemple : 5,45 € → 6,00 €) | EF-022 |
| 7 | Ouvrir « À classer » | Le nombre est affiché à l'accueil ; Spotify y figure s'il est passé | EF-025, EF-026 |
| 8 | Rattacher Spotify à son abonnement | Il quitte la liste ; le passage suivant est ignoré automatiquement | EF-024, EF-027 |
| 9 | Corriger la catégorie d'une dépense importée, en supprimer une autre, puis « Synchroniser maintenant » | La correction tient, la suppression aussi | EF-033, EF-034 |
| 10 | Appuyer deux fois de suite sur « Synchroniser maintenant » | La seconde demande est servie depuis le cache (moins de 5 minutes) | EF-008, R3 |
| 11 | Ouvrir l'application sur un second appareil | Mêmes dépenses, aucun doublon | EF-010, CS-003 |
| 12 | Exporter, puis réimporter le fichier | Règles, registre, remboursements et « À classer » restitués ; aucun secret ni identifiant de session dans le fichier | EF-035, CS-009 |
| 13 | Couper le réseau, ouvrir l'application | Consultation et saisie manuelle possibles ; « À classer » consultable | Principe I |

## 5. Expiration de l'autorisation

Sans attendre 166 jours : modifier `validUntil` d'une connexion dans `banking.json` (conteneur
arrêté) à J + 10, redémarrer.

- L'avertissement « L'accès à LCL expire le … » apparaît (EF-004, CS-008).
- « Reconnecter LCL » mène à la banque, puis rétablit l'accès **sans réimporter** d'opération
  déjà traitée (EF-012, récit 5 scénario 4).

Puis à J − 1 : la synchronisation échoue avec « L'accès à LCL a expiré », et la date de dernière
récupération réussie est affichée (EF-005).

## 6. Données réelles

Les opérations réelles de l'utilisateur **ne sont jamais versionnées**. Les jeux d'essai des tests
sont synthétiques et reproduisent seulement la forme des données de septembre (R7).
