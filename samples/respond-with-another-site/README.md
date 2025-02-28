# Respond with another site

This sample shows a Fermyon Wasm Function that responds to all `GET` requests
with the response from another site (in this case a 'random animal facts' sample).

Note that the `spin.toml` file lists the upstream site as an allowed outbound
request destination for the component:

```toml
allowed_outbound_hosts = ["https://random-data-api.fermyon.app"]
```

By default, components are sandboxed, so you must enable the outbound site, or you'll
get an "access denied" error.  (Constraining the hosts in this way prevents the component
from sending data to unwanted sites, for example in the event of a NPM package being
compromised.)
