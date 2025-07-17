// https://itty.dev/itty-router/routers/autorouter
import { AutoRouter } from 'itty-router';
import * as Kv from '@spinframework/spin-kv';

const decoder = new TextDecoder();
let router = AutoRouter();

// Route ordering matters, the first route that matches will be used
// Any route that does not return will be treated as a middleware
// Any unmatched route will return a 404
router
    .get("/get/:key", ({ key }) => handleGetValue(key))
    .post('/set/:key', async (req) => handleSetValue(req.params.key, await req.arrayBuffer()));

addEventListener('fetch', async (event) => {
    event.respondWith(router.fetch(event.request));
});


function handleGetValue(key) {
    const store = Kv.openDefault();
    if (!store.exists(key)) {
        return new Response(null, { status: 404 });
    }
    let found = store.getJson(key);
    return new Response(JSON.stringify(found), { status: 200, headers: { "content-type": "application/json" } });
}

function handleSetValue(key, requestBody) {
    let payload = JSON.parse(decoder.decode(requestBody));

    if (!payload || !payload.firstName || !payload.lastName) {
        return new Response("Invalid payload received.\nExpecting {\"firstName\": \"some\", \"lastName\": \"some\"}", { status: 400 });
    }
    const store = Kv.openDefault();
    store.setJson(key, payload);

    return new Response(null, { status: 200 });
}