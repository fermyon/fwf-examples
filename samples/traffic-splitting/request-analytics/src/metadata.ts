import { Variables } from "@fermyon/spin-sdk";

export class Metadata {
  url?: string;
  method?: string;
  requestId?: string;
  requestHeaders?: Headers;
  requestLength?: Promise<number>;
  requestTimestamp?: string;

  responseId?: string;
  responseHeaders?: Headers;
  responseLength?: Promise<number>;
  statusCode?: number;
  responseTimestamp?: string;

  /**
   * Extracts metadata from the incoming request, including
   * - request id (taken from X-Request-Id header or generated UUID)
   * - headers
   * - timestamp (taken at the time of processing)
   * - body length (based on content-length header or actual body length)
   * @param request The incoming request
   * @returns The request body stream, or null if there is no body
   *
   * Note: the returned body stream is either the original body or a new body
   * that counts bytes as they pass through.
   */
  processRequest(request: Request, upstreamUrl: URL): ReadableStream<Uint8Array> | null {
    this.requestId = request.headers.get("X-Request-Id") || crypto.randomUUID();
    this.requestHeaders = request.headers;
    this.url = upstreamUrl.toString();
    this.method = request.method;
    let { body, length } = processBody(request);
    this.requestLength = length;
    this.requestTimestamp = new Date().toISOString();
    return body;
  }

  /**
   * Extracts metadata from the outgoing response, including
   * - headers
   * - timestamp (taken at the time of processing)
   * - body length (based on content-length header or actual body length)
   * @param request The outgoing response
   * @returns The request body stream, or null if there is no body
   *
   * Note: the returned body stream is either the original body or a new body
   * that counts bytes as they pass through.
   */
  processResponse(response: Response): ReadableStream<Uint8Array> | null {
    this.statusCode = response.status;
    this.responseId = crypto.randomUUID();
    this.responseHeaders = response.headers;
    let { body, length } = processBody(response);
    this.responseLength = length;
    this.responseTimestamp = new Date().toISOString();
    return body;
  }

  async send() {
    let fwafficUrl, fwafficAppId, fwafficKey;
    try {
      fwafficUrl = Variables.get("fwaffic_url");
      fwafficAppId = Variables.get("fwaffic_app_id");
      fwafficKey = Variables.get("fwaffic_key");
    } catch (error) {
      console.error(`[request-analytics]: Error getting variables: ${error}`);
      return;
    }

    let [requestLength, responseLength] = await Promise.all([
      this.requestLength,
      this.responseLength,
    ]);

    const requestPath = new URL(this.url!).pathname;
    let requestMetadata = {
      appId: fwafficAppId,
      id: this.requestId,
      timestamp: this.requestTimestamp,
      url: this.url,
      method: this.method,
      headers: stringifyHeaders(this.requestHeaders!),
      bodyLength: requestLength,
    };

    console.log(`[request-analytics]: Sending request metadata`);

    try {
      let response = await fetch(
        new Request(
          `${fwafficUrl}/api/logger/request/${fwafficAppId}${requestPath}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${fwafficKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestMetadata),
          }
        )
      );
      if (!response.ok) {
        console.error(
          `[request-analytics]: Error sending request metadata: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error(`[request-analytics]: Error sending request metadata: ${error}`);
    }

    let responseMetadata = {
      appId: fwafficAppId,
      id: this.responseId,
      requestId: this.requestId,
      timestamp: this.responseTimestamp,
      statusCode: this.statusCode,
      headers: stringifyHeaders(this.requestHeaders!),
      bodyLength: responseLength,
    };

    console.log(`[request-analytics]: Sending response metadata`);
    try {
      let response = await fetch(
        new Request(`${fwafficUrl}/api/logger/response/${fwafficAppId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fwafficKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(responseMetadata),
        })
      );
      if (!response.ok) {
        console.error(
          `[request-analytics]: Error sending response metadata: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error(
        `[request-analytics]: Error sending response metadata: ${error}`
      );
    }
  }
}

/**
 * Calculates the length of a body in the most efficient way possible for the
 * given request or response.
 * @param owner The request or response holding the body to measure
 * @returns an object with the body and a promise for the body's length
 *
 * The body is either the original body or a new body that counts bytes as they pass through.
 */
function processBody(owner: Request | Response): {
  body: ReadableStream<Uint8Array> | null;
  length: Promise<number>;
} {
  let contentLength = owner.headers.get("content-length");
  if (contentLength) {
    return {
      body: owner.body,
      length: Promise.resolve(parseInt(contentLength)),
    };
  }
  if (!owner.body) {
    return { body: null, length: Promise.resolve(0) };
  }
  let resolveFn: (length: number) => void;
  let lengthPromise = new Promise<number>((resolve, _reject) => {
    resolveFn = resolve;
  });

  let length = 0;
  let ts = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      length += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush(_controller) {
      resolveFn(length);
    },
  });
  return { body: owner.body.pipeThrough(ts), length: lengthPromise };
}

function stringifyHeaders(headers: Headers): string[] {
  let headersArray: string[] = [];
  headers.forEach((value, key) => {
    headersArray.push(`${key}: ${value}`);
  });
  return headersArray;
}
