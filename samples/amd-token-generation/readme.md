# Wasm Function for Akamai Adaptive Media Delivery Token Generation

Implementation that aims to be compatible with Akamai's [token generation for Adaptive Media Delivery](https://techdocs.akamai.com/adaptive-media-delivery/docs/generate-a-token-and-apply-it-to-content).

### Overview

This service provides an HTTP endpoint for generating Akamai authorization tokens for URL protection. It follows the token format and cryptographic requirements specified by Akamai's documentation.

### Features

- Generates URL-based tokens (no ACL support)
- Supports HMAC-SHA256 for token signing
- Configurable token parameters:
  - Expiration time
  - Start time
  - IP address restriction
  - Session ID
- Returns both the raw token and a URL with the token appended

### Usage

To generate a token, make a GET request to the `/token` endpoint with the following parameters:

| Parameter  | Required | Description                                                |
| ---------- | -------- | ---------------------------------------------------------- |
| url        | Yes      | The URL path to generate a token for                       |
| window     | No       | Token validity duration in seconds (default: 3600)         |
| start_time | No       | Token start time as Unix timestamp (default: current time) |
| ip         | No       | Restrict token to specific IP address                      |
| session_id | No       | Associate token with a session ID                          |
| verbose    | No       | Enable verbose logging                                     |

### Example Usage

```bash
# Basic token generation
curl "http://localhost:3000/token?url=https://example.com/video/sample.mp4"

# Token with custom window (2 hours)
curl "http://localhost:3000/token?url=https://example.com/video/sample.mp4&window=7200"

# Token with specific start time, IP restriction, and session ID
curl "http://localhost:3000/token?url=https://example.com/video/sample.mp4&start_time=1718483200&ip=203.0.113.1&session_id=user123"
```

### Building from source and running locally

```bash
$ spin build
$ export SPIN_VARIABLE_ENCRYPTION_KEY="your_encryption_key_here"
$ spin up
Serving http://0.0.0.0:3000
Available Routes:
  amd-token-generation: http://0.0.0.0:3003 (wildcard)
Token Configuration:
  Token Name: hdnts
  Algorithm: SHA-256
  Field Delimiter: ~
  Current Time: 1741006470
  Start Time: 1718483200
  End Time: 1718490400
  Window Seconds: 7200
  URL: https://example.com/video/sample.mp4
  IP: 203.0.113.1
  Session ID: user123
Token Generation:
  Token String: exp=1718490400~st=1718483200~url=https%3A%2F%2Fexample.com%2Fvideo%2Fsample.mp4~ip=203.0.113.1~id=user123
  HMAC: 8a3087fac0750644335e8a7aa9ae6a61b64fc3999fd9265c14b6baf8a39bd2b5
  Final Token: hdnts=exp=1718490400~st=1718483200~url=https%3A%2F%2Fexample.com%2Fvideo%2Fsample.mp4~ip=203.0.113.1~id=user123~hmac=8a3087fac0750644335e8a7aa9ae6a61b64fc3999fd9265c14b6baf8a39bd2b5
Token Configuration:
```

### Deploying to Fermyon Wasm Functions

```bash
$ spin aka deploy --variable encryption_key=$SPIN_VARIABLE_ENCRYPTION_KEY 
```
