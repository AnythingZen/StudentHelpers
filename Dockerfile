# Mastery Grove — Builder C's deploy image.
# One container, one always-on process: the Express server holds all state in
# memory, so this must never run on serverless or with more than one replica.
# Node 22 because ai@7 requires >=22 and Vite 8 requires >=22.12.

# ---- stage 1: build the web app (student forest + teacher console) ----
FROM node:22-slim AS web
WORKDIR /app/backup-client
COPY backup-client/package.json backup-client/package-lock.json ./
RUN npm ci
# The client bundles the server's pure rules and types, so they must be present to build.
COPY server/src /app/server/src
COPY backup-client/ ./
RUN npm run build

# ---- stage 2: the server ----
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/tsconfig.json ./
# The fallback brain builds worlds from the committed fixtures.
COPY mockWorld.json mockWorldReading.json /app/
COPY --from=web /app/backup-client/dist /app/backup-client/dist
USER node
# Railway injects PORT; the server reads it.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
