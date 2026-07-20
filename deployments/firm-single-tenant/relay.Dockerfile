FROM alpine:3.22.1

RUN apk add --no-cache socat \
    && addgroup -S -g 65532 relay \
    && adduser -S -D -H -u 65532 -G relay relay

USER 65532:65532
ENTRYPOINT ["socat"]
