FROM node:24.14.0-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:24.14.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src

RUN groupadd --gid 11000 sftp-storage \
  && useradd --uid 10001 --gid sftp-storage --create-home menu-tv \
  && chown -R menu-tv:sftp-storage /app

USER menu-tv
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
