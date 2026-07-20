#!/bin/sh
set -eu

test "$(id -u)" = "10001"
test -r /run/sshd.pid
kill -0 "$(cat /run/sshd.pid)"
test -r /var/lib/possiblaw-worker/authorized_keys
test ! -e /var/run/docker.sock
