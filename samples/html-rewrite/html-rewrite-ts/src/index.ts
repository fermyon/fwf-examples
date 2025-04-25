import { Kv, Variables } from '@fermyon/spin-sdk';
import { AutoRouter, html } from 'itty-router';
import * as cheerio from 'cheerio'

let router = AutoRouter();
router
    .all("*", async (req: Request, { config }) => rewriteHtml(req, config))
    ;
const rewriteHtml = async (req: Request, config: Config): Promise<Response> => {
    let url = new URL(config.upstreamUrl);
    url.pathname = new URL(req.url).pathname;
    const kv = Kv.openDefault();

    if (config.useKeyValueStore && kv.exists(url.toString())) {
        const original = kv.getJson(url.toString()) as CacheItem;
        if (isCachedItemValid(original, config.ttlInMinutes)) {
            console.log(`valid cached item found.`)
            return html(rewrite(original.value))
        } else {
            console.log(`expired cached item found, will send request to upstream`)
            kv.delete(url.toString())
        }
    }
    console.log(`requesting`)
    let res = await fetch(url);
    if (res.status != 200) {
        return res;
    }
    console.log(`content-type is ${res.headers.get("content-type")}`);
    // only rewrite the response if it's an HTML response
    if (res.headers.get("content-type")?.includes("text/html")) {
        let originalHtml = await res.text();
        if (config.useKeyValueStore) {
            kv.setJson(url.toString(), {
                value: originalHtml,
                timestamp: Date.now(),
            } as CacheItem)
        }
        return html(rewrite(originalHtml), { headers: res.headers })
    }
    console.log('non-html content type')
    return res;
}

const rewrite = (original: string): string => {
    let doc = cheerio.load(original)
    doc("h1").text("Hello Bot Protection this is Fermyon Wasm Functions")
    return doc.html();
}

interface CacheItem {
    timestamp: number,
    value: string,
}

interface Config {
    ttlInMinutes: number,
    upstreamUrl: string,
    useKeyValueStore: boolean,
}

const isCachedItemValid = (item: CacheItem | undefined | null, ttlInMinutes: number): boolean => {
    if (!item || !item.value) {
        return false;
    }
    const now = Date.now();
    const ttl = ttlInMinutes * 60 * 1000;
    console.log(`Cache Item age is: ${now - item.timestamp}ms (max age: ${ttl}ms)`)
    if (now - item.timestamp > ttl) {
        return false;
    }
    return true;
}

//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {

    let upstreamUrl = Variables.get("upstream_url");
    const ttl = Variables.get("ttl_in_minutes") || "24";
    const ttlInMinutes = Number(ttl);
    const useKeyValueStore = (Variables.get("use_kv_store") || "false") === "true";

    if (!upstreamUrl || Number.isNaN(ttlInMinutes)) {
        event.respondWith(new Response("Bad Configuration", { status: 500 }));
    }

    event.respondWith(router.fetch(event.request, {
        config: {
            upstreamUrl,
            ttlInMinutes,
            useKeyValueStore
        } as Config
    }));
});
