# Contrat : autorisation d'un appareil

**Fichiers** : `src/lib/server/authorization.ts`, `src/app/authorize/page.tsx`

**Exigences couvertes** : EF-020, EF-021, EF-022 | **Récit** : 4 (P2) | **Décisions** : D6, D7

## Ce que ce contrat n'est pas

Ni compte, ni profil, ni mot de passe utilisateur — les trois sont hors périmètre. Il n'existe **pas
d'identité** : le jeton autorise un appareil, il n'identifie personne. Le serveur ne sait pas qui
écrit, et n'a pas à le savoir : il détient **un** budget.

---

## Le secret

| Élément | Valeur |
| --- | --- |
| Variable d'environnement | `BUDGET_ACCESS_TOKEN` |
| Longueur minimale exigée | 32 caractères |
| Versionné | **Jamais.** `.env*` reste ignoré par Git. |
| Préfixe `NEXT_PUBLIC_` | **Interdit.** Tout ce qui le porte est public par définition (constitution, contraintes de données). |

### Fermeture par défaut (D7)

Si `BUDGET_ACCESS_TOKEN` est **absent, vide ou plus court que 32 caractères**, toute requête d'API
reçoit `401`. Le serveur ne démarre pas en mode ouvert, ne génère pas de secret de repli et ne
journalise pas le secret.

C'est délibérément le comportement le plus gênant possible : une erreur de configuration doit rendre
l'application inutilisable, jamais publique. Un secret de repli aurait exactement l'effet inverse —
une installation qui fonctionne, et que rien ne protège.

---

## Autoriser un appareil

Opération effectuée **une fois par appareil**.

1. L'utilisateur ouvre `/authorize` sur l'appareil.
2. Il colle le jeton dans le champ prévu et valide.
3. Le serveur compare, à temps constant, avec `BUDGET_ACCESS_TOKEN`.
4. En cas de correspondance, il pose le cookie et redirige vers `/`.

### Le cookie

| Attribut | Valeur | Motif |
| --- | --- | --- |
| Nom | `budget_access` | — |
| Valeur | Le jeton | Comparé à chaque requête. |
| `httpOnly` | `true` | Inaccessible au JavaScript de la page : le secret n'est jamais exposé au navigateur sous forme lisible (EF-022). |
| `sameSite` | `strict` | Aucune requête déclenchée par un autre site ne l'emporte. |
| `secure` | `true` en HTTPS | Sur un déploiement HTTP en réseau privé, `false` — sinon le cookie ne serait jamais posé et l'application serait inutilisable. |
| `path` | `/` | — |
| `maxAge` | 1 an | Autoriser une fois, pas à chaque ouverture. |

`cookies()` est **asynchrone** dans la version installée : `const cookieStore = await cookies()`
(R3 de [research.md](../research.md)).

### Réponses de `/authorize`

| Cas | Comportement |
| --- | --- |
| Jeton correct | Cookie posé, redirection vers `/`. |
| Jeton incorrect | Message d'erreur **textuel**, aucun cookie posé, aucune indication sur la longueur ou la forme attendue. |
| `BUDGET_ACCESS_TOKEN` non configuré | Message indiquant que le serveur n'est pas configuré. Aucun cookie posé. |

Le formulaire est utilisable au clavier, son champ porte une étiquette associée et l'erreur est
annoncée par du texte, non par la couleur (principe VII).

---

## Vérifier une requête

```ts
/** Renvoie `true` si la requête porte un cookie d'accès valide. */
export async function isAuthorized(): Promise<boolean>;
```

### Règles

1. **Appelée dans chaque gestionnaire de route**, jamais déléguée à `proxy.ts`. La documentation de
   la version installée est explicite : Proxy « should not be used as a full session management or
   authorization solution » (R4). Un contrôle placé là serait contournable par tout appel qui ne
   traverse pas le proxy.
2. **Comparaison à temps constant** : `crypto.timingSafeEqual`, précédée d'un contrôle d'égalité des
   longueurs — `timingSafeEqual` lève si les tampons diffèrent en taille, et cette levée serait
   elle-même un canal.
3. **Aucune journalisation du jeton**, ni en clair, ni tronqué, ni haché. Un jeton dans un fichier de
   journal est un jeton versionné en puissance.
4. **Aucun message différencié.** « Cookie absent » et « cookie erroné » renvoient la même réponse :
   distinguer les deux dirait à un tiers qu'il a trouvé le bon nom de cookie.

### Réponse de refus

```json
{ "error": "unauthorized" }
```

Statut `401`. Rien d'autre : ni montant, ni révision, ni horodatage, ni indication qu'un budget
existe (EF-021).

---

## Ce que ce contrat ne couvre pas

**L'isolation réseau**, seconde moitié de la réponse à Q3, relève du déploiement et non du code : le
service doit n'écouter que sur le réseau privé ou le VPN de l'utilisateur. Elle est documentée dans
[quickstart.md](../quickstart.md).

Les deux couches sont complémentaires et aucune ne remplace l'autre. L'isolation réseau seule
laisserait tout appareil du réseau lire le budget ; le jeton seul reposerait entièrement sur un
secret exposé à Internet. C'est pourquoi la réponse à Q3 exige les deux.
