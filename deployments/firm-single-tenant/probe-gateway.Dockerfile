FROM python:3.14.0-alpine3.22

RUN addgroup -S -g 65532 probe \
    && adduser -S -D -H -u 65532 -G probe probe

COPY --chmod=0555 deployments/firm-single-tenant/scripts/probe_gateway.py /usr/local/bin/probe-gateway

USER 65532:65532
ENTRYPOINT ["python3", "/usr/local/bin/probe-gateway"]
