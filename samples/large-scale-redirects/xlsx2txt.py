import pandas as pd
import argparse
import os
import re
from urllib.parse import urlparse, quote, urlunparse

def encode_full_path(path, query="", fragment=""):
    """Encode path, query, and fragment safely — ensures all spaces become %20."""
    if query:
        path += "?" + query
    if fragment:
        path += "#" + fragment

    # Strip and encode
    path = path.strip()
    return quote(path, safe="/?=&#+%")

def parse_xlsx_to_txt(input_file, output_dir, source_col=None, target_col=None, status_col=None):
    print(f"📂 Loading file: {input_file}")
    
    # Load Excel or CSV
    if input_file.endswith(".csv"):
        df = pd.read_csv(input_file)
    else:
        excel_file = pd.ExcelFile(input_file)
        all_data = []
        for sheet in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet, usecols=[0, 1], skiprows=1, header=None)
            all_data.append(df)

        # Concatenate all DataFrames
        df = pd.concat(all_data, ignore_index=True)

        # Rename the columns
        df.columns = [source_col, target_col]

        # # Save to a new Excel file
        # df.to_excel('combined_output.xlsx', index=False)

    print(f"✅ Loaded {len(df)} rows from {input_file}")
    print(f"📊 Columns found: {list(df.columns)}")

    # Infer columns if not provided
    if not source_col or not target_col:
        cols = df.columns.tolist()
        source_col, target_col = cols[0], cols[1]
        if not status_col and len(cols) > 2:
            status_col = cols[2]

    # Validate columns
    for col in [source_col, target_col, status_col]:
        if col and col not in df.columns:
            raise ValueError(f"❌ Column '{col}' not found in input file")

    print(f"✅ Using columns → source: '{source_col}', target: '{target_col}', status: '{status_col}'")

    os.makedirs(output_dir, exist_ok=True)
    print(f"📁 Output directory ready: {os.path.abspath(output_dir)}")

    grouped = {}
    for idx, row in df.iterrows():
        source = str(row[source_col]).strip()
        target = str(row[target_col]).strip()
        if not source or not target or source.lower() == "nan" or target.lower() == "nan":
            print(f"⚠️  Skipping row {idx+1}: invalid source or target")
            continue

        # Ensure parseable URL
        if "://" not in source:
            source = "http://" + source

        parsed = urlparse(source)
        hostname = (parsed.hostname or "unknown").replace("www.", "").lower()

        # --- SOURCE (encoded path only) ---
        encoded_path = encode_full_path(parsed.path or "/", parsed.query or "", parsed.fragment or "")

        # --- TARGET (full encoded URL) ---
        if "://" not in target:
            target = "http://" + target

        parsed_target = urlparse(target)
        encoded_target = urlunparse((
            parsed_target.scheme,
            parsed_target.netloc,
            quote(parsed_target.path.strip(), safe="/"),
            parsed_target.params,
            quote(parsed_target.query.strip(), safe="/?=&#+%") if parsed_target.query else "",
            quote(parsed_target.fragment.strip(), safe="/?=&#+%") if parsed_target.fragment else "",
        ))

        print(f"🧩 Row {idx+1}: host={hostname}, path={encoded_path}")

        # --- Format line ---
        if status_col:
            status = str(row[status_col]).strip()
            if status and status.lower() != "nan":
                line = f"{encoded_path} {encoded_target} {status}\n"
            else:
                line = f"{encoded_path} {encoded_target}\n"
        else:
            line = f"{encoded_path} {encoded_target}\n"

        grouped.setdefault(hostname, []).append(line)

    # --- Write per hostname ---
    for host, lines in grouped.items():
        output_file = os.path.join(output_dir, f"{host}_{os.path.basename(input_file).split('.')[0]}.txt")
        with open(output_file, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print(f"✅ Written {len(lines)} entries to: {os.path.abspath(output_file)}")

    print("🎉 Done! All files written successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert XLSX/CSV mappings into per-host text files")
    parser.add_argument("input", help="Path to input .xlsx or .csv file")
    parser.add_argument("output_dir", help="Directory for output text files")
    args = parser.parse_args()

    parse_xlsx_to_txt(args.input, args.output_dir, 'Source URLs', 'Target URLs')
