# MiniTroopers remake: self-hosted server image (linux/amd64 and linux/arm64, see deploy/README.md).
# The image contains Motion-Twin assets (SWF, images): never push it to a public registry.
FROM node:24.12-bookworm-slim

WORKDIR /app

# Dependencies first (cached layer): runtime only (hono, @hono/node-server), no Playwright, no install scripts.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/game/package.json packages/game/
COPY tools/oracle/package.json tools/oracle/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Sources (filtered by .dockerignore: no var/, .git, tests, golden files, tools/bin).
COPY . .

ENV NODE_ENV=production PORT=8080 LISTEN_HOST=0.0.0.0 DATA_DIR=/data URL_MODE=path

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node","apps/server/src/main.ts"]
