FROM node:24.18.0-bookworm-slim

ARG CODEX_CLI_VERSION
ARG CLAUDE_CODE_VERSION

RUN test -n "$CODEX_CLI_VERSION" \
    && test -n "$CLAUDE_CODE_VERSION" \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
         ca-certificates curl git jq openssh-server procps python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global --omit=dev \
         "@openai/codex@${CODEX_CLI_VERSION}" \
         "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && groupadd --gid 10001 possiblaw \
    && useradd --uid 10001 --gid 10001 --home-dir /home/possiblaw --create-home --shell /bin/sh possiblaw \
    && mkdir -p /workspace /var/lib/possiblaw-worker \
    && chown -R 10001:10001 /workspace /var/lib/possiblaw-worker /home/possiblaw

COPY deployments/firm-single-tenant/config/sshd_config /etc/possiblaw/sshd_config
COPY --chmod=0555 deployments/firm-single-tenant/scripts/worker-entrypoint.sh /usr/local/bin/worker-entrypoint
COPY --chmod=0555 deployments/firm-single-tenant/scripts/worker-healthcheck.sh /usr/local/bin/worker-healthcheck
COPY --chmod=0555 deployments/firm-single-tenant/scripts/gate-request.sh /usr/local/bin/possiblaw-gate-request
COPY --chmod=0555 deployments/firm-single-tenant/scripts/isolation_probe.py /usr/local/bin/possiblaw-isolation-probe

USER 10001:10001
WORKDIR /workspace
EXPOSE 2222
ENTRYPOINT ["/usr/local/bin/worker-entrypoint"]
