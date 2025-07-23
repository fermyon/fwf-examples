#!/bin/bash
set -beuo pipefail

spin up &

timeout ${TIMEOUT:-30s} bash -c 'until curl -q 127.0.0.1:3000 &>/dev/null; do sleep 1; done'

trap 'kill -s SIGTERM $(jobs -p)' EXIT