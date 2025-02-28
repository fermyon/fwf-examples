# Altering response headers

This sample shows how to alter the headers as you stream a response from an origin
server back to a client.

You can set the origin site via the `origin_host` variable, either by editing `spin.toml`
or by overriding it on the command line:

```
SPIN_VARIABLE_ORIGIN_HOST=example.com spin up --build
```

(Note this should _not_ include the `https://` prefix - just the host name.)
