FROM node:24.18.0-bookworm-slim

ENV HOME=/home/node

RUN corepack enable \
    && mkdir -p /app /var/lib/possiblaw-gate \
    && chown -R node:node /app /var/lib/possiblaw-gate

WORKDIR /app
COPY --chown=node:node gate-proxy/package.json gate-proxy/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY --chown=node:node gate-proxy/src ./src
COPY --chown=node:node --chmod=0555 deployments/firm-single-tenant/scripts/gate-entrypoint.sh /usr/local/bin/gate-entrypoint

ENV NODE_ENV=production
USER node
ENTRYPOINT ["/usr/local/bin/gate-entrypoint"]
CMD ["pnpm", "start"]
