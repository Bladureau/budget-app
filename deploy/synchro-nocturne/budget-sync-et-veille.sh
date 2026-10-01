#!/usr/bin/env bash
#
# Synchronisation bancaire nocturne, puis mise en veille du NAS.
#
# À installer sur le NAS, appartenant à root, et lancé par le téléphone relais via
#   ssh nas sudo /usr/local/sbin/budget-sync-et-veille
# Voir deploy/synchro-nocturne/LISEZMOI.md.
#
# Ce script ne fait que deux choses : demander au serveur du budget de récupérer les
# opérations bancaires, puis éteindre la machine. Il ne lit le jeton d'accès que dans le
# `.env` du projet : aucun secret n'est recopié ailleurs.
#
# Il éteint le NAS **même si la synchronisation échoue** : un échec est consigné, et sera
# rattrapé à la prochaine ouverture de l'application. Laisser le NAS allumé toute la nuit pour
# une banque indisponible n'apporterait rien.

set -euo pipefail

# --- À adapter --------------------------------------------------------------------------------
# Racine du projet sur le NAS (celle qui contient docker-compose.yml et .env).
PROJET="/home/user_nas/budget-app"
# Date de début d'import enregistrée dans l'application.
DEPUIS="2026-10-01"
# ------------------------------------------------------------------------------------------------

URL="http://127.0.0.1:3000"
JOURNAL="/var/log/budget-sync.log"
ATTENTE_MAX_S=300

journal() {
  printf '%s %s\n' "$(date -Iseconds)" "$*" >> "$JOURNAL"
}

eteindre() {
  journal "mise en veille"
  /usr/bin/systemctl poweroff
}

# Le jeton est relu dans le .env du projet, jamais passé en argument : un argument serait
# visible de tous dans la liste des processus.
JETON="$(grep -E '^BUDGET_ACCESS_TOKEN=' "$PROJET/.env" | head -n 1 | cut -d '=' -f 2- | tr -d '"'"'" )"
if [ -z "$JETON" ]; then
  journal "échec : BUDGET_ACCESS_TOKEN introuvable dans $PROJET/.env"
  eteindre
  exit 1
fi

# Le conteneur redémarre seul au démarrage du NAS (restart: unless-stopped). On attend qu'il
# réponde : un 401 sans cookie prouve qu'il tourne, exactement comme son contrôle de santé.
debut=$(date +%s)
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/budget" || true)" = "401" ]; do
  if [ $(( $(date +%s) - debut )) -ge "$ATTENTE_MAX_S" ]; then
    journal "échec : l'application n'a pas répondu en ${ATTENTE_MAX_S} s"
    eteindre
    exit 1
  fi
  sleep 5
done

# `refresh=manual` : borne de 5 minutes au lieu de 6 heures, pour que la synchronisation de
# minuit ne soit pas sautée parce qu'une ouverture de l'application a eu lieu dans la soirée.
# Le cookie est passé par un fichier temporaire lisible de root seul, pour la même raison
# que ci-dessus : jamais sur la ligne de commande.
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT
chmod 600 "$COOKIE"
printf '127.0.0.1\tFALSE\t/\tFALSE\t0\tbudget_access\t%s\n' "$JETON" > "$COOKIE"

statut="$(curl -s -o /dev/null -w '%{http_code}' --max-time 120 -b "$COOKIE" \
  "$URL/api/banking/operations?since=$DEPUIS&refresh=manual" || true)"

if [ "$statut" = "200" ]; then
  journal "synchronisation bancaire réussie"
else
  journal "échec de la synchronisation bancaire (HTTP $statut), rattrapée à la prochaine ouverture"
fi

eteindre
