import { AutoRouter as Router } from 'itty-router';
import { AkamaiTokenGenerator } from './akamai';
import { Variables } from '@fermyon/spin-sdk';

let router = Router();

router
    .get("/", () => new Response("Akamai URL Token Generation Service"))

    // Simple endpoint to generate a token for a specific URL
    .get('/token', async (request) => {
        let key = Variables.get('encryption_key');
        if (!key) {
            console.error('Encryption key is not set');
            return new Response(JSON.stringify({ error: 'Encryption key is not set' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const tokenGenerator = new AkamaiTokenGenerator(key);
        try {
            const url = new URL(request.url);
            const params = url.searchParams;

            // Get URL parameter
            const contentUrl = params.get('url');

            if (!contentUrl) {
                return new Response(JSON.stringify({ error: 'Missing required parameter: url' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Get optional parameters
            const windowSecondsParam = params.get('window');
            const windowSeconds = windowSecondsParam ? parseInt(windowSecondsParam) : 3600;

            const startTimeParam = params.get('start_time');
            const startTime = startTimeParam ? parseInt(startTimeParam) : undefined;

            const ip = params.get('ip');
            const sessionId = params.get('session_id');

            const token = await tokenGenerator.generateUrlToken({
                url: contentUrl,
                windowSeconds: windowSeconds,
                startTime: startTime,
                ip: ip || undefined,
                sessionId: sessionId || undefined,
                verbose: true
            });

            // Create a full URL with the token as a query parameter
            const contentUrlObj = new URL(contentUrl);
            contentUrlObj.searchParams.append(tokenGenerator.getTokenName(), token);
            const fullUrl = contentUrlObj.toString();

            return new Response(JSON.stringify({
                token,
                url: fullUrl
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error: any) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    });

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(router.fetch(event.request));
});
