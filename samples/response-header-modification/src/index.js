// https://itty.dev/itty-router/routers/autorouter
import { AutoRouter } from 'itty-router';
import * as Variables from '@spinframework/spin-variables';

let router = AutoRouter();

// Route ordering matters, the first route that matches will be used
// Any route that does not return will be treated as a middleware
// Any unmatched route will return a 404
router
    .get("*", (req, { origin }) => modifyOriginResponseHeaders(req, origin))

//@ts-ignore
addEventListener('fetch', async (event) => {
    const origin = Variables.get("origin");
    if (!origin) {
        event.respondWith(new Response("origin variable not set", { status: 500 }))
    }
    event.respondWith(router.fetch(event.request));
});

async function modifyOriginResponseHeaders(req, origin) {
    const url = buildOriginUrl(origin, req)

    const accept = getAcceptHeaderValue(req);
    const response = await fetch(url, {
        headers: {
            "accept": accept
        }
    });
    const payload = await response.text();
    return new Response(payload, {
        status: response.status,
        headers: {
            "content-type": response.headers.get("content-type"),
            "x-intercepted-value": "foobar"
        }
    });
}

function getAcceptHeaderValue(req) {
    let accept = req.headers.get("accept");
    if (!accept) {
        accept = "*/*";
    }
    return accept
}

function buildOriginUrl(origin, req) {
    var requested = new URL(req.url);
    return `${origin}${requested.pathname}${requested.search}`;
}