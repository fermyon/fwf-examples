// This example was adapted from Cloudflare Workers as a familiar starting point for
// demonstrating how you can migrate your workload to a Spin app on Fermyon Wasm Functions.
// Source: https://developers.cloudflare.com/workers/examples/alter-headers/
// The original example is provided by Cloudflare under the MIT License.

import * as spin from '@fermyon/spin-sdk';

async function fetchAltered(request: Request): Promise<Response> {
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

    // This is needed to make the response mutable.
    let response = new Response(originResponse.body, originResponse);

    // Add a header
    response.headers.append("friendly-message", "Hello from FWF");

    // Delete a header
    response.headers.delete("content-type");

    // Modify a header
    response.headers.set("date", "the eleventy-sixth of June");

    return response;
}

function internalServerError(message: string): Response {
    return new Response(message, {
        status: 500,
    });
}

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(fetchAltered(event.request));
});
