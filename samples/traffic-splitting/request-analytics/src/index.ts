import * as Variables from '@spinframework/spin-variables';
import { AutoRouter } from 'itty-router';
import { Metadata } from './metadata';

let router = AutoRouter();

router.all('*', async (request: Request, { event }: { event: FetchEvent }) => {
    const upstreamUrl = new URL(request.url);
    // Reset the port to null, because setting `host` will only override the port if it's present in the new value.
    upstreamUrl.port = null!;
    upstreamUrl.host = Variables.get("upstream_host")!;
    console.log(`[request-analytics]: Using upstream url ${upstreamUrl}`);

    let metadata = new Metadata();
    const requestBody = metadata.processRequest(request, upstreamUrl);

    // Prepare upstream headers and inject the request id.
    const upstreamHeaders = new Headers(request.headers);
    // @radu: is this needed for the request sent to the upstream?
    upstreamHeaders.set('X-Request-Id', metadata.requestId!);


    // Forward request to upstream immediately
    const upstreamResponse = await fetch(upstreamUrl, {
        body: requestBody,
        method: request.method,
        headers: upstreamHeaders
    });

    let responseBody = metadata.processResponse(upstreamResponse);
    // Queue the metadata for sending off. It'll be sent off in the background,
    // starting once the response has been sent off in full.
    event.waitUntil(metadata.send());

    console.log(`[request-analytics]: Returning upstream response with status ${upstreamResponse.status}`);

    // Return the upstream response immediately with the original stream
    return new Response(responseBody, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers
    });
});

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => { event.respondWith(router.fetch(event.request, { event })) });
