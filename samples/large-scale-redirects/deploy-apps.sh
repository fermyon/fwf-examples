#!/bin/bash

UNPROCESSED_XLSX=${1:-"data.xlsx"}
FALLBACKS_JSON=${2:-"fallbacks.json"}

python3 xlsx2txt.py $UNPROCESSED_XLSX processed 

# Remove any files with spaces in their names -- noticed this was caused by some uncleaned data in the spreadsheet
find processed -type f -name "* *" -delete

# for each *.txt file in ./processed
for file in processed/*.txt; do
    # Check if files exist (in case no .txt files are present)
    [ -e "$file" ] || continue
    
    # Extract just the filename without the path
    filename=$(basename "$file")
    
    rm redirects.txt || true
    ./target/release/rules-manager --add-rules "$file" --rules-output-file redirects.txt 
    # TODO: the fallbacks.json file may be different for each domain, so one file may not be sufficient
    ./build.sh sources.fst targets.fcsd $FALLBACKS_JSON 302 redirects.wasm
    # Unlink the workspace from the previous deployment
    spin aka app unlink || true
    filename_lower=$(echo "$filename" | tr '[:upper:]' '[:lower:]')
    spin aka deploy --create-name $filename_lower --no-confirm
done
