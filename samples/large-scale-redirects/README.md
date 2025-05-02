# redirects-rs

A high-performance, large-scale HTTP redirect service implemented as a Spin application.
It uses a Finite State Transducer (FST) for efficient source path lookups and a Fast Compressed Static Dictionary (FCSD)
for compact storage of target URLs.

## Overview

- **Fast redirects**: O(1) lookup times with minimal memory footprint
- **Scalable**: Easily handles large numbers of redirects (millions)
- **Flexible**: Supports custom status codes for all or individual redirects
- **Validation**: Prevents redirect loops and invalid URLs
- **Optimization**: Detects and shortens redirect chains
- **Wasm-native**: Designed for WebAssembly runtimes with WASI HTTP support
- **Pre-initialized**: Embeds optimized representations of redirect data at build time for zero-cost cold starts

## 1. Managing Redirect Rules (`rules-manager`)

The `rules-manager` CLI validates, merges, and encodes redirect rules from plain text to optimized binary formats.

### Build the CLI

```shell
cargo build --release -p rules-manager
```

### Prepare Rule Files

Create text files with redirect rules in the format:

```
/old/path /new/path
/another/old/path https://example.com/destination
# Comments start with hash
/with-query /destination  # trailing comments work too
/with-custom /status-code 301 # Use custom status code instead of the default

# Blank lines are ignored
```

Rules must follow these conventions:

- Source paths must start with `/`
- Target can be a relative path (`/new/path`) or absolute URL (`https://example.com/path`)
- Each line must contain either two or three whitespace-separated parts, ignoring comments:
  - Two parts: source and target (default status code is used)
  - Three parts: source, target, and status code
- Source and target cannot be the same (would cause a self-loop)
- If provided, status codes must be valid
  [HTTP Redirection messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status#redirection_messages)

### Run the CLI

```shell
./rules-manager \
  --existing-rules existing_validated.txt \   # Optional: One or more previously validated rule files
  --add-rules new_rules1.txt new_rules2.txt \ # Optional: One or more new rule files
  --default-status-code 302 \                 # Default status code for redirects (default: 302)
  --include-existing \                        # Optional: Include existing rules in output
  --output-dir ./output \                     # Store all output files here (default: current directory)
  --rules-output-file merged.txt \            # Where to store new validated rules (default: new_redirects.txt)
  --encoded-sources sources.fst \             # Binary FST output (default: sources.fst)
  --encoded-targets targets.fcsd              # Binary FCSD output (default: targets.fcsd)
```

#### Validation Options

Control how the tool handles different validation issues:

```shell
./rules-manager \
  # ...other arguments...
  --self-loops warn \      # How to handle self-referential loops (ignore|warn|error)
  --loops error \          # How to handle multi-step loops (ignore|warn|error)
  --invalid-lines error    # How to handle malformed lines (ignore|warn|error)
```

### Validation Process

1. Loads and validates existing rules file (must have header: `# Validated redirects...`)
2. Processes new rule files and validates each rule
3. Checks for duplicate sources (newer rules override older ones)
4. Detects redirect loops (A→B→C→A) which would cause infinite redirects
5. Shortens redirect chains (e.g., A→B→C→D to A→D) as long as the entries have the same status code
6. Generates optimized binary files for fast lookups

### Example Workflow

Typical workflow for deploying redirects:

1. **Maintain a central validated rules file**:
   ```shell
   # First-time setup
   ./rules-manager --add-rules initial_rules.txt --rules-output-file validated_rules.txt

   # Later, add more rules or update existing ones, and store the result in a new file
   ./rules-manager --existing-rules validated_rules.txt --add-rules new_batch.txt --rules-output-file validated_rules_2.txt

   # Alternatively, update the existing rules file
   ./rules-manager --existing-rules validated_rules.txt --add-rules new_batch.txt --rules-output-file validated_rules.txt --include-existing
   ```

2. **Generate optimized files for production**:
   ```shell
   ./rules-manager --existing-rules validated_rules.txt \
     --encoded-sources sources.fst \
     --encoded-targets targets.fcsd
   ```

## 2. Building & Running the Wasm Component

### Prerequisites

Besides Spin, building the redirecter component requires the [wizer](https://github.com/bytecodealliance/wizer)
WebAssembly snapshotting tool.

### Building

The Wasm component needs to be pre-initialized with the redirect data using the provided build script:

```shell
# Run the build script with paths to your FST and FCSD data files, the default status code, and the output path
# NOTE: The default status code provided here will be used for any rules missing an explicit status code,
#       regardless of the default status code used in the rules-manager.
./build.sh sources.fst targets.fcsd 302 target/redirect.wasm
```

The build process:

1. Compiles the Rust code to WebAssembly targeting wasip1
2. Uses Wizer to pre-initialize the Wasm module with your redirect data
3. Optionally optimizes the Wasm binary with wasm-opt if available
4. Outputs the final component to `target/redirect.wasm`

### Run with Spin

Using the included `spin.toml` file, you can run the redirect service locally:

```shell
spin up
```

Test redirects:

```shell
# Should return 302 Found with Location header
curl -I http://localhost:3000/old/path

# Should return 404 Not Found
curl -I http://localhost:3000/nonexistent
```

## 3. Architecture

### Data Structures

- **Finite State Transducer (FST)**: Maps source paths to target indices with minimal memory overhead
  - Perfect for URL paths - compresses common prefixes
  - O(n) where n is the length of the lookup key (not the number of redirects)
  - Provides ordered iteration and prefix searching capabilities

- **Fast Compressed Static Dictionary (FCSD)**: Stores unique target URLs in compressed format
  - Significantly reduces memory usage compared to storing URLs directly
  - Provides fast decoding using a pre-computed lookup table

### Component Design

- **rules-manager (Rust CLI)**
  - Handles rule parsing, validation, and encoding
  - Produces human-readable validated rules and optimized binary files

- **redirects-rs (Wasm Component)**
  - Pre-initialized static data structures via `wizer.initialize`
  - Implements `wasi:http/incoming-handler` interface
  - Keeps memory usage constant regardless of request volume
  - Process:
    1. Extract URL path from incoming request
    2. Look up path in FST to get target index
    3. Use index to retrieve target URL from FCSD
    4. Check for and potentially extract custom status code or use default
    4. Return HTTP redirect with the selected status code and Location header set to the rule's target URL (or 404 if
       not found)
