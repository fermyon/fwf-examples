// This example was adapted from Cloudflare Workers as a familiar starting point for
// demonstrating how you can migrate your workload to a Spin app on Fermyon Wasm Functions.
// Source: https://developers.cloudflare.com/workers/examples/geolocation-app-weather/
// The original example is provided by Cloudflare under the MIT License.

// For AutoRouter documentation refer to https://itty.dev/itty-router/routers/autorouter
import { AutoRouter } from 'itty-router';
import { getClientAddressFromRequest, cleanupIpAddress } from "./helpers";
import { Variables } from "@fermyon/spin-sdk";


let router = AutoRouter();

// Route ordering matters, the first route that matches will be used
// Any route that does not return will be treated as a middleware
// Any unmatched route will return a 404
router.get("/", (request, {token}) => getWeather(request, token)) 

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
   let token = Variables.get("waqi_api_token");
   if (!token) {
     console.log("required waqi_api_token variable not found");
     event.respondWith(new Response("Internal Server Error", {status: 500}));
   }
    event.respondWith(router.fetch(event.request, {token}));
});

async function getWeather(request: Request, token: string): Promise<Response> {
  console.log("Request received");

  const clientAddress = getClientAddressFromRequest(request);
  if (!clientAddress) {
      return new Response("Could not determine client ip address", { status: 500 });
  }

  let ip = cleanupIpAddress(clientAddress);
  console.log(`Client IP: ${ip}`);
  ip = ip === "127.0.0.1" ? Variables.get("test_ip_addr") ?? ip : ip;

  let longitude, latitude;
  try {
      [latitude, longitude] = await getGeolocation(ip);
  } catch (error) {
    if (ip == "127.0.0.1") {
      return new Response("Unable to get geolocation data for localhost, try using test_ip_addr variable", { status: 500 });
    }
    return new Response("Failed to get geolocation data", { status: 500 });
  }

  
  let endpoint = "https://api.waqi.info/feed/geo:";
  let html_style = `body{padding:6em; font-family: sans-serif;} h1{color:#f6821f}`;

  let html_content = "<h1>Weather 🌦</h1>";

  endpoint += `${latitude};${longitude}/?token=${token}`;
  const init = {
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  };

  const response = await fetch(endpoint, init);
  if (response.status !== 200) {
    return new Response("Failed to get weather info", { status: 500 });
  }
  const content = await response.json();

  html_content += `<p>This is a demo using geolocation data. </p>`;
  html_content += `You are located at: ${latitude},${longitude}.</p>`;
  html_content += `<p>Based off sensor data from <a href="${content.data.city.url}">${content.data.city.name}</a>:</p>`;
  html_content += `<p>The temperature is: ${content.data.iaqi.t?.v}°C.</p>`;
  html_content += `<p>The AQI level is: ${content.data.aqi}.</p>`;
  html_content += `<p>The N02 level is: ${content.data.iaqi.no2?.v}.</p>`;
  html_content += `<p>The O3 level is: ${content.data.iaqi.o3?.v}.</p>`;

  let html = `
    <!DOCTYPE html>
    <head>
      <title>Geolocation: Weather</title>
    </head>
    <body>
      <style>${html_style}</style>
      <div id="container">
      ${html_content}
      </div>
    </body>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
    },
  });
}

async function getGeolocation(ip: string): Promise<[number, number]> {
  console.log("Fetching geolocation data for", ip);
  const response = await fetch(`https://ip-api.io/json/${ip}`);
  if (!response.ok) {
      throw new Error(`Failed to fetch geolocation data: ${response.status}`);
  }
  const data = await response.json();
  return [data.latitude, data.longitude];
}