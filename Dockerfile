# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS deps

WORKDIR /app

# better-sqlite3 may fall back to source build; ensure tools are present.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline

FROM node:24-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN mkdir -p /app/data/images

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
