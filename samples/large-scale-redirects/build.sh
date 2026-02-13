#!/usr/bin/env bash
set -e

ENABLE_WASM_OPT="${ENABLE_WASM_OPT:-true}"

# Check if the correct number of arguments is provided
if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <sources.fst file> <targets.fcsd file> <default status code> <output wasm file>"
    exit 1
fi


cargo build --target wasm32-wasip1 --release
echo "$1 $2 $3" | wizer --allow-wasi --wasm-bulk-memory true --dir . -o "$4" target/wasm32-wasip1/release/redirects_rs.wasm
# If wasm-opt is installed, run it to optimize the output
if [[ "${ENABLE_WASM_OPT}" == "true" ]] && command -v wasm-opt &> /dev/null
then
    wasm-opt -O3 --enable-bulk-memory-opt -o "$4" "$4"
fi
echo -n "Component size: "
ls -lh "$4" | awk '{print $5}'