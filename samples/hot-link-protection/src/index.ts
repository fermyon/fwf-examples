// This example was adapted from Cloudflare Workers as a familiar starting point for
// demonstrating how you can migrate your workload to a Spin app on Fermyon Wasm Functions.
// Source: https://developers.cloudflare.com/workers/examples/hot-link-protection/
// The original example is provided by Cloudflare under the MIT License.

import * as spin from '@fermyon/spin-sdk';

async function protect(request: Request): Promise<Response> {
    const PROTECTED_TYPE = "image/";

    const originHost = spin.Variables.get('origin_host');
    if (!originHost) {
        return internalServerError("Origin site not configured");
    }

    let requestUrl = new URL(request.url);

    // These are useful for local testing, where the protocol and port won't match upstream.
    requestUrl.protocol = "https:";
    requestUrl.port = "";

    requestUrl.host = originHost;
    
    const originResponse = await fetch(requestUrl.toString(), request);

    const contentType = originResponse.headers.get("Content-Type") || "";
    const isProtected = contentType.startsWith(PROTECTED_TYPE);

    if (isProtected) {
        const referrer = request.headers.get("Referer");
        if (referrer) {
            const isExternalReferrer = new URL(referrer).hostname !== new URL(request.url).hostname;
            if (isExternalReferrer) {
                // It's an external hotlink - decide what to do with it. In this example, we redirect to the
                // origin host root path. You could also return an error code or (for images) an image saying "blocked", etc.
                let redirect_url = `https://${originHost}/`;
                return Response.redirect(redirect_url, 302);
            }
        }
    }

    // Everything is fine, return the response normally.
    return originResponse;
}

function internalServerError(message: string): Response {
    return new Response(message, {
        status: 500,
    });
}

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(protect(event.request));
});
