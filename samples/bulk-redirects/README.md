# Bulk redirect requests

This sample illustrates how you could bulk redirect requests using an object to map incoming requests to a configured redirection target.

## Run the Spin App on your machine

Once you've cloned the repository and moved to the `./samples/bulk-redirects`, build and run the Spin app:

```console
spin build
spin up
```

### Trigger the redirect

Send a request to the `/bulk4` route, which will redirect you to `https://www.google.com`.

```console
curl -i http://localhost:3000/bulk4

HTTP/1.1 301 Moved Permanently
location: https://google.com
content-length: 0
date: Fri, 14 Feb 2025 21:25:33 GMT

```