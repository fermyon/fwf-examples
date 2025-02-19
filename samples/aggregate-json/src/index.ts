async function aggregateJson(): Promise<Response> {
    const host = "https://random-data-api.fermyon.app";

    const animalsUrl = host + "/animals/json";
    const physicsUrl = host + "/physics/json";

    // Make the upstream requests in parallel and await the responses.
    const responses = await Promise.all([fetch(animalsUrl), fetch(physicsUrl)]);

    // Parse the upstream response bodies into JSON, and pull out the data
    // we need for our own response. In this case we extract a single property
    // and collect the values in an array.
    const bodies = await Promise.all(responses.map(r => r.json()));
    const facts = bodies.map(json => json.fact);

    // Serialise the response to JSON and return it.
    const response = JSON.stringify(facts, null, 2);
    return new Response(response, {
        headers: { "content-type": "application/json" }
    });
}

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
    event.respondWith(aggregateJson());
});

export {}
