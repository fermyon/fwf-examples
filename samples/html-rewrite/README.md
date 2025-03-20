# HTML Rewrite Samples

This TypeScript and Rust implementations for a Spin app that does HTML rewriting using CSS selectors. 

Both implementations accept the following configuration parameters:


| Parameter Name | Type | Description |
|----------------|------|-------------|
| `upstream_url` | `string` | The desired upstream URL (request path will be appended before requests are sent to upstream) |
| `use_kv_store` | `boolean` | Indicating if key-value store should be used |


## Key-Value Store usage

If enabled, the app will cache the original HTML from upstream in key-value store and retrieve it from there for recurring requests to the same upstream url.

## Rewrite behavior

The Spin app does rewriting **only** if the upstream server responds with an status code `200` and a `content-type` header containing `text/html`. Different upstream responses will be forwarded as-is to the callee. 

Both sample implementations will replace contents of all `h1` tags in the HTML with `Hello Bot Protection this is Fermyon Wasm Functions`

## Running the Apps locally

Move to the application directory (either `html-rewrite-rust` or `html-rewrite-ts`) and execute the following commands:

```bash
cd html-rewrite-ts
spin up --build
```

This will start the HTML rewrite application on `http://localhost:3000`. With the default configuration, the app will send requests to `https://www.fermyon.com` (see `upstream_url` in `spin.toml`).

To request a re-written version of the `index.html` use the following curl command:

```bash
curl -iX GET http://localhost:3000/index.html
```