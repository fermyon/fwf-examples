// This example was adapted from Cloudflare Workers as a familiar starting point for
// demonstrating how you can migrate your workload to a Spin app on Fermyon Wasm Functions.
// Source: https://developers.cloudflare.com/workers/examples/respond-with-another-site/
// The original example is provided by Cloudflare under the MIT License.

async function respondOther(request: Request): Promise<Response> {
    if (request.method !== "GET") {
        return methodNotAllowed();
    }
    return fetch(`https://random-data-api.fermyon.app/animals/json`);
}

function methodNotAllowed(): Response {
    return new Response("Method not allowed", {
        status: 405,
        headers: {
            Allow: "GET"
        }
    });
}

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(respondOther(event.request));
});
