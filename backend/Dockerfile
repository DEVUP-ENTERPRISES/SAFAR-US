# ── build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first: this layer is cached until dependencies actually
# change, so ordinary source edits don't reinstall node_modules.
COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies so they're never copied into the runtime image.
RUN npm prune --omit=dev

# ── runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Fail fast on unhandled rejections rather than limping on in a bad state.
ENV NODE_OPTIONS=--unhandled-rejections=strict

# Run as an unprivileged user: a container compromise shouldn't mean root.
RUN addgroup -g 1001 -S nodejs && adduser -S cato -u 1001 -G nodejs

COPY --from=build --chown=cato:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=cato:nodejs /app/dist ./dist
COPY --chown=cato:nodejs package.json ./

USER cato
EXPOSE 8080

# Uses the readiness endpoint, which 503s when Mongo/Redis are unreachable —
# so an orchestrator stops routing traffic to a container that can't serve it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/v1/system/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No npm wrapper: node runs as PID 1 and receives SIGTERM directly, which the
# app already handles for graceful shutdown. `npm start` would swallow it.
CMD ["node", "dist/main.js"]
