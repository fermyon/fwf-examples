#!/usr/bin/env bash
set -e

# Check if the correct number of arguments is provided
if [ "$#" -ne 5 ]; then
    echo "Usage: $0 <sources.fst file> <targets.fcsd file> <default status code> <fallbacks.json> <output wasm file>"
    exit 1
fi


cargo build --target wasm32-wasip1 --release
echo "$1 $2 $3 $4" | wizer --allow-wasi --wasm-bulk-memory true --dir . -o "$5" target/wasm32-wasip1/release/redirects_rs.wasm
# If wasm-opt is installed, run it to optimize the output
if command -v wasm-opt &> /dev/null
then
    wasm-opt -O3 --enable-bulk-memory-opt -o "$5" "$5"
fi
echo -n "Component size: "
ls -lh "$5" | awk '{print $5}'