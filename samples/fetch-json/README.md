# Fetch JSON

This example shows how to fetch data via a GET request, read in JSON and return the results.

## Configuring `allowed_outbound_hosts` in `spin.toml`

Spin blocks outbound hosts by default. The `allowed_outbound_hosts` needs to include the address of the host to which the guest tried to call. In the case of this example, the host is `https://random-data-api.fermyon.app/` which is added in the `spin.toml`

```
[component.fetch-json]
allowed_outbound_hosts = ["https://random-data-api.fermyon.app/"]
```

## Building and Running the Example

```bash
spin build
spin up
```

Use e.g. `curl -v http://127.0.0.1:3000/` to test the endpoint.
