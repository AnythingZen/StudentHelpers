# Mastery Grove — the deploy image: C's server, B's brain, and the web app.
# One container, one always-on process: all state is in memory, so this must
# never run serverless or with more than one replica.
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

# ---- stage 2: server + brain + OCR ----
FROM node:22-slim
ENV NODE_ENV=production
# Python for B's OCR of scanned worksheets (server/brain/ocr.py). libgl1 and
# libglib2.0-0 are the system libraries opencv (a rapidocr dependency) links against.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/brain/package.json server/brain/package-lock.json ./brain/
RUN cd brain && npm ci --omit=dev
# Only the OCR packages — not browser-use: the headless scraper stays off in production.
RUN python3 -m venv brain/.venv \
 && brain/.venv/bin/pip install --no-cache-dir pypdfium2==5.13.0 rapidocr-onnxruntime==1.4.4

COPY server/src ./src
COPY server/brain ./brain
COPY server/tsconfig.json ./
COPY shared/types.ts /app/shared/types.ts
# The fallback brain builds worlds from the committed fixtures.
COPY mockWorld.json mockWorldReading.json /app/
COPY --from=web /app/backup-client/dist /app/backup-client/dist
# OCR results are cached by content hash; the non-root user needs to write them.
RUN mkdir -p brain/.ocr-cache && chown -R node:node brain/.ocr-cache
USER node
# Railway injects PORT. BRAIN=zen and the API key come from Railway's variables.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
