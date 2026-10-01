# Synchronisation bancaire nocturne

Réveiller le NAS à heure fixe, récupérer les opérations bancaires, puis le remettre en veille.

```text
Téléphone relais (Termux, cron 00:00)          NAS
  sync-nuit.sh
    ├─ NAS déjà allumé ? → ne rien faire
    ├─ wake.sh (WOL via Tailscale)  ───────────► démarrage, conteneur relancé seul
    ├─ attendre la réponse SSH
    └─ ssh nas sudo budget-sync-et-veille ─────► attend l'application
                                                 récupère les opérations bancaires
                                                 s'éteint
```

**Ce que ça apporte, et ce que ça n'apporte pas.** Les opérations sont récupérées et gardées
par le serveur ; elles n'entrent dans le budget qu'à la prochaine ouverture de l'application,
comme sans ce dispositif. L'intérêt réel est d'éviter un **trou d'historique** si le NAS reste
éteint longtemps : certaines banques ne donnent plus accès aux opérations de plus de 90 jours
sans nouvelle validation.

La récupération de minuit se fait **sans utilisateur présent** : elle compte dans la limite de
4 consultations par jour que la plupart des banques appliquent dans ce cas. Une par nuit en
laisse largement assez.

## 1. Sur le NAS

Installer le script, appartenant à root et non modifiable par un autre utilisateur :

```bash
sudo install -o root -g root -m 700 deploy/synchro-nocturne/budget-sync-et-veille.sh \
  /usr/local/sbin/budget-sync-et-veille
sudo nano /usr/local/sbin/budget-sync-et-veille   # ajuster PROJET et DEPUIS
```

Autoriser **ce script seul** à être lancé sans mot de passe :

```bash
echo 'user_nas ALL=(root) NOPASSWD: /usr/local/sbin/budget-sync-et-veille' \
  | sudo tee /etc/sudoers.d/budget-sync
sudo chmod 440 /etc/sudoers.d/budget-sync
sudo visudo -c                                    # doit répondre « parsed OK »
```

C'est ce qui règle l'erreur `Access denied as the requested operation requires interactive
authentication` : `shutdown` n'est pas ouvert à votre utilisateur, seul ce script l'est, et il
appartient à root — votre utilisateur ne peut pas le modifier pour lui faire faire autre chose.

Vérifier sans éteindre : commenter temporairement la ligne `/usr/bin/systemctl poweroff`, lancer
`sudo /usr/local/sbin/budget-sync-et-veille`, puis lire `/var/log/budget-sync.log`.

## 2. Sur le téléphone (Termux)

Clé SSH sans phrase de passe vers le NAS, si ce n'est pas déjà fait :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N ""
ssh-copy-id user_nas@nasmaison
ssh -o BatchMode=yes nasmaison true && echo OK
```

Installer le script et la planification :

```bash
cp sync-nuit.sh ~/sync-nuit.sh && chmod 700 ~/sync-nuit.sh   # ajuster NAS et WAKE
pkg install cronie termux-services
sv-enable crond
(crontab -l 2>/dev/null; echo '0 0 * * * $HOME/sync-nuit.sh >> $HOME/sync-nuit.log 2>&1') | crontab -
```

Pour qu'Android ne tue pas Termux pendant la nuit :

- exécuter `termux-wake-lock` ;
- désactiver l'optimisation de batterie pour Termux dans les réglages d'Android ;
- installer **Termux:Boot** pour relancer `crond` après un redémarrage du téléphone.

## 3. Contrôle

- Téléphone : `~/sync-nuit.log` ;
- NAS : `/var/log/budget-sync.log` ;
- application : « Mes banques » affiche la date de dernière récupération réussie, qui doit
  indiquer minuit.
