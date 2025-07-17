import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as Variables from "@spinframework/spin-variables";
import { AutoRouter as Router } from "itty-router";

let router = Router();

router.get('/stream/:bucket/:file', async ({ bucket, file }) => {

    let region = Variables.get("region")!;
    let client = new S3Client({
        region: region,
        endpoint: Variables.get("endpoint")!,
        credentials: {
            accessKeyId: Variables.get("access_key_id")!,
            secretAccessKey: Variables.get("secret_access_key")!,
        },
    });

    let params = {
        Bucket: bucket,
        Key: file,
    };

    let command = new GetObjectCommand(params);
    let data = await client.send(command);

    let stream = data.Body as ReadableStream;


    let headers = new Headers();
    headers.set('Content-Type', data.ContentType || 'application/octet-stream');
    if (data.ContentLength) headers.set('Content-Length', data.ContentLength.toString());

    // Create a TransformStream to prepend text on each chunk
    let prependText = "\n\n\nbeginning of chunk>>>: \n\n\n\n";
    let appendText = "\n\n\nend of chunk<<<\n\n\n\n";
    let textEncoder = new TextEncoder();
    let textDecoder = new TextDecoder();

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            // Decode chunk to text
            let originalText = textDecoder.decode(chunk);

            let text = prependText + originalText + appendText;

            // Re-encode to Uint8Array
            let reEncodedChunk = textEncoder.encode(text);

            // Enqueue the modified chunk
            controller.enqueue(reEncodedChunk);
        },
    });

    // Pipe the original stream through our transform
    const pipedStream = stream.pipeThrough(transformStream);

    // Return the streamed response
    return new Response(pipedStream, {
        status: 200,
        headers,
    });



})
    .get("/largetxt", async () => {
        const res = await fetch("https://raw.githubusercontent.com/dscape/spell/refs/heads/master/test/resources/big.txt");
        const { status, headers, body } = res;

        // Create a TransformStream to log chunks and pass them along
        const transformStream = new TransformStream({
            transform(chunk, controller) {
                console.log('Chunk:', chunk.length); // Log the chunk
                controller.enqueue(chunk); // Pass the chunk along
            }
        });

        // Use pipeThrough to process the body through the TransformStream
        const transformedBody = body!.pipeThrough(transformStream);

        return new Response(transformedBody, { status, headers });
    });
;

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
    event.respondWith(router.fetch(event.request));
});
