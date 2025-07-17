import { AutoRouter, json } from 'itty-router';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as Variables from '@spinframework/spin-variables';

const dec = new TextDecoder();
const enc = new TextEncoder();

let router = AutoRouter();

interface Config {
  region: string,
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucketName: string
}

router
  .get("/files", async (_, { config }) => await listFiles(config))
  .get('/files/:name', async ({ name }, { config }) => await streamFile(name, config))
  .get("/transformed-files/:name", async ({ name }, { config }) => await streamAndTransformFile(name, config));

const streamAndTransformFile = async (name: string, config: Config): Promise<Response> => {
  const upperCaseTransform = new TransformStream({
    transform(chunk, controller) {
      const txt = dec.decode(chunk, { stream: true });
      controller.enqueue(enc.encode(txt.toUpperCase()));
    }
  });
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    }
  });

  try {
    const input = { Bucket: config.bucketName, Key: name };
    const { Body } = await s3.send(new GetObjectCommand(input));
    const transformed = (Body as ReadableStream).pipeThrough(upperCaseTransform);
    return new Response(transformed, {
      status: 200,
    });
  } catch (error: any) {
    return new Response(`error : ${error.message}`, { status: 500 });
  }
}

const streamFile = async (name: string, config: Config): Promise<Response> => {
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    }
  });

  try {
    const input = { Bucket: config.bucketName, Key: name };
    const { Body } = await s3.send(new GetObjectCommand(input));

    return new Response(Body as ReadableStream, {
      status: 200,
    });

  } catch (error: any) {
    return new Response(`error : ${error.message}`, { status: 500 });
  }
}

const listFiles = async (config: Config): Promise<Response> => {
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    }
  });

  try {
    const input = { Bucket: config.bucketName };
    const { Contents } = await s3.send(new ListObjectsV2Command(input));
    const files = Contents?.map((file) => file.Key) || [];
    return json({ files });
  } catch (error) {
    console.log(error);
    return new Response(JSON.stringify(error), { status: 500 })
  }
}
//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
  const endpoint = Variables.get("endpoint");
  const accessKeyId = Variables.get("access_key_id");
  const secretAccessKey = Variables.get("secret_access_key");
  const bucketName = Variables.get("bucket_name");
  const region = Variables.get("region");

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !region) {
    return new Response("Application not configured correctly", { status: 500 });
  }
  event.respondWith(router.fetch(event.request, {
    config: {
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucketName,
      region
    } as Config
  }));
});
