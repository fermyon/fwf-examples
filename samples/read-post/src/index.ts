// This example was adapted from Cloudflare Workers as a familiar starting point for
// demonstrating how you can migrate your workload to a Spin app on Fermyon Wasm Functions.
// Source: https://developers.cloudflare.com/workers/examples/read-post/
// The original example is provided by Cloudflare under the MIT License.

function rawHtmlResponse(html: string): Response {
    return new Response(html, {
        headers: {
            "content-type": "text/html",
        },
    });
}

async function readRequestBody(request: Request): Promise<string> {
    const contentType = request.headers.get("content-type") || '';
    if (contentType.includes("application/json")) {
        return JSON.stringify(await request.json());
    } else if (contentType.includes("application/text")) {
        return request.text();
    } else if (contentType.includes("text/html")) {
        return request.text();
    } else if (contentType.includes("image/")) {
        let body = (await request.body?.getReader().read())?.value;
        if (body) {
            return `a ${body.length}-byte picture, probably of a cat`;
        } else {
            return "an empty picture";
        }
    } else if (contentType.includes("form")) {
        const formData = await request.formData();
        const body: { [key: string]: any } = {};
        formData.forEach((value, key, _) => {
            body[key] = value;
        });
        return JSON.stringify(body);
    } else {
        return "unrecognised body content";
    }
}

function testForm(): string {
    // This is just a way to send data to the form reader.
    let lines = [
        '<html>',
        '  <head><title>Test form</title></head>',
        '  <body>',
        '    <form action="/" method="post">',
        '      <p><label for="name">Enter your name: </label><input type="text" name="name" id="name" required /></p>',
        '      <p><label for="subscribe">Subscribe? </label><input type="checkbox" name="subscribe" id="subscribe" /></p>',
        '      <p><input type="submit" value="Submit" /></p>',
        '    </form>',
        '  </body>',
        '</html>',
    ];
    return lines.join('\n');
}

async function readPostRequest(request: Request): Promise<Response> {
    const { url } = request;

    if (request.method === "POST") {
        const requestInfo = await readRequestBody(request);
        const responseBody = `The POST body sent was ${requestInfo}`;
        return new Response(responseBody);
    }

    // So that you can localhost:3000/form to exercise the form behaviour
    if (request.method == "GET") {
        if (url.includes("form")) {
            return rawHtmlResponse(testForm());
        } else {
            return new Response(`The request was a ${request.method}. Visit /form if you wanted to run the test form.`);
        }
    }

    return new Response(`The request was a ${request.method}`);
}

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(readPostRequest(event.request));
});
