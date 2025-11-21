#!/bin/bash
set -euo pipefail

# Some apps require extra setup steps
current_dir=$(basename "${PWD}")
if [[ "${current_dir}" == "geo-ip" || \
      "${current_dir}" == "large-scale-redirects" ]]; then
    make setup
fi

spin build
