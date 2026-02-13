#!/bin/bash
set -beuo pipefail

# TODO: some apps have specific instructions for their requests, eg headers, paths, variables, etc.
# Perhaps ensure each app dir has a Makefile or script with specific test steps, defaulting to something like below?

# find free port, to support concurrent invocations on the same host
# (although 'spin up' has a '--find-free-port' option, we need to know it ahead of time for the subsequent curl request)
port=$(python3 -c "import socket; s=socket.socket(); s.bind(('', 0)); print(s.getsockname()[1]); s.close()")

spin up --listen "127.0.0.1:${port}" &

timeout ${TIMEOUT:-30s} bash -c 'until [ "$(curl -sL -o /dev/null -w "%{http_code}" 127.0.0.1:$0)" = "200" ]; do sleep 1; done' "${port}"

trap 'kill -s SIGTERM $(jobs -p)' EXIT
