import * as Variables from '@spinframework/spin-variables';
import * as Kv from '@spinframework/spin-kv';
import { AutoRouter } from 'itty-router';
import { Config, RequestTacking } from './models';

let router = AutoRouter();

router.all("*", async (req, { event, config }) => await guard(req, event, config));

const guard = async function (req: Request, event: FetchEvent, config: Config): Promise<Response> {
  try {
    const now = new Date().getTime();
    const blockUntil = Date.parse(config.blockUntil);
    if (now < blockUntil) {
      if (config.trackBlockedRequests) {
        event.waitUntil(trackBlockedRequest(req));
      }
      let headers: any = {};
      if (!!config.blockLocation) {
        headers['location'] = config.blockLocation;
      }
      return new Response(null, {
        status: config.blockStatusCode,
        headers: headers
      });
    }
  } catch (err) {
    console.log(`Error while checking block window: ${err}`);
    return new Response(null, { status: 500 });
  }

  const url = buildTargetUrl(req, config);
  const response = await fetch(url, {
    method: req.method,
    headers: req.headers,
    body: req.body as ReadableStream
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
};

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
  const origin = Variables.get("origin");
  const blockUntil = Variables.get("block_until");
  const trackBlockedRequests = Variables.get("track_blocked_requests");
  const blockLocation = Variables.get("block_location");
  let blockStatusCode = Variables.get("block_status_code");

  if (!origin || !blockUntil || !isValidDate(blockUntil)) {
    console.log("Terminating with 500 as origin or blockUntil are not configured");
    return new Response(null, { status: 500 });
  }

  if (!blockStatusCode) {
    blockStatusCode = "404";
  }
  event.respondWith(router.fetch(event.request, {
    event,
    config: {
      origin,
      blockUntil,
      blockLocation,
      // variables are read as strings, convert status to number
      blockStatusCode: +blockStatusCode,
      // variables are read as string check if tracking of blocked requests is set to true
      trackBlockedRequests: trackBlockedRequests === "true"
    } as Config
  }));
});

const isValidDate = (value: string): boolean => {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

const buildTargetUrl = (req: Request, config: Config): string => {
  const incomingUrl = new URL(req.url);
  const origin = new URL(config.origin);

  const incomingPath = incomingUrl.pathname;
  const originPath = origin.pathname;
  let destinationPath = originPath + incomingPath;
  destinationPath = destinationPath.replace(/\/+/g, '/');
  const destinationUrl = origin.origin + destinationPath + incomingUrl.search + incomingUrl.hash;
  return destinationUrl;
}

const trackBlockedRequest = async (req: Request) => {
  // Force this operation to be async
  // This allows to background tracking the request in KV, without adding latency to the user response
  await new Promise(resolve => setTimeout(resolve));
  const key = `${req.method.toLowerCase()}_${req.url}`;
  const store = Kv.openDefault();
  let value = { count: 1 } as RequestTacking;
  if (store.exists(key)) {
    value = store.getJson(key);
    value.count += 1;
  }
  store.setJson(key, value)
}

