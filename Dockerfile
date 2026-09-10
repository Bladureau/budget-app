# Image de production de Budget App.
#
# Trois étapes, pour que l'image finale ne contienne ni les sources, ni les dépendances de
# construction, ni l'outillage de test.
#
# Le budget lui-même ne vit **jamais** dans l'image : il est écrit dans le volume monté sur
# /data. Une image reconstruite ne doit rien effacer.

# --- Dépendances ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# `npm ci` plutôt que `npm install` : il installe exactement le verrou, sans le réécrire.
COPY package.json package-lock.json ./
RUN npm ci

# --- Construction --------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Aucune télémétrie ne quitte cette machine, y compris à la construction (principe I).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Exécution -----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# L'application ne tourne pas en root : si elle est compromise, elle ne dispose que de ses
# propres fichiers et du volume de données.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: "standalone"` ne copie ni `public` ni `.next/static` : sans ces deux lignes,
# l'application démarre mais s'affiche sans styles ni images.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Créé et donné à l'utilisateur ici : un volume monté par Docker hériterait sinon de root, et
# l'application ne pourrait pas y écrire.
RUN mkdir -p /data && chown nextjs:nodejs /data
VOLUME ["/data"]

USER nextjs

ENV PORT=3000
# Sans 0.0.0.0, le serveur n'écouterait que sur la boucle locale *du conteneur* et resterait
# injoignable depuis l'hôte. L'exposition réelle est bornée par docker-compose et par Caddy.
ENV HOSTNAME=0.0.0.0
ENV BUDGET_DATA_DIR=/data

EXPOSE 3000

# `BUDGET_ACCESS_TOKEN` n'est délibérément pas défini ici : un secret dans une image est un
# secret publié. Il est fourni à l'exécution, et son absence fait refuser tout accès.
CMD ["node", "server.js"]
