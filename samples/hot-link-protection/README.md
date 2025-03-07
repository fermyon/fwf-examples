# Hot link protection

Hot linking is when one web site includes data served from another, for example
a scraper site incorporating images served by a news site. This is often unwelcome
because it means you pay for the bandwidth but another site gets the benefit.
This sample illustrates how to prevent third party sites hot linking to your site.

The sample acts as a proxy for the origin site, but when it detects an image
being served, it checks the `Referer` header to verify that the request is
coming from the proxy site.

## Try it out

Trying this sample out requires you to run a site that tries to hot link an image
that is protected by the proxy.  You can find some HTML for this in the `test-site`
directory.  (For illustrative purposes, this HTML hot links both the origin site and the
proxy. In a real world scenario, your origin site would not be accessible from the
public internet - it would be behind the proxy.)

In one terminal, start the proxy by running:

```sh
spin up --build
```

(You can visit `http://127.0.0.1:3000` to verify that images on the site appear correctly.)

In another terminal, start the test site by running:

```sh
cd test-site
python -m http.server 8080  # or python3
```

Then visit `http://127.0.0.1:8080` to see that the link via the proxy is blocked.

> Note: You may see different behaviour according to whether you visit `localhost` or `127.0.0.1`!
> This is because the way the sample checks for 'same site' doesn't cater for multiple sites
> on different ports. In a real deployment this would typically not be a concern; but also,
> it's a sample and we aimed to keep things simple rather than fully featured!)
