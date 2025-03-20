import { Kv, Variables } from '@fermyon/spin-sdk';
import { AutoRouter, html } from 'itty-router';
import * as cheerio from 'cheerio'

const dec = new TextDecoder();
let router = AutoRouter();
router
    .all("*", async (req: Request) => {
        let url = new URL(Variables.get("upstream_url") || "");
        url.pathname = new URL(req.url).pathname;
        const useKvStore = (Variables.get("use_kv_store") || "false") === "true";
        const kv = Kv.openDefault();

        if (useKvStore) {
            const original = kv.get(url.toString());
            if (!!original) {
                console.log('cache hit')
                const originalHtml = dec.decode(original!)
                return html(rewrite(originalHtml))
            }
        }
        let res = await fetch(url);
        if (res.status != 200) {
            return res;
        }
        console.log(`content-type is ${res.headers.get("content-type")}`);
        // only rewrite the response if it's an HTML response
        if (res.headers.get("content-type")?.includes("text/html")) {
            let originalHtml = await res.text();
            if (useKvStore) {
                kv.set(url.toString(), originalHtml)
            }
            return html(rewrite(originalHtml), { headers: res.headers })
        }
        console.log('non-html content type')
        return res;
    });

const rewrite = (original: string): string => {
    let doc = cheerio.load(original)
    doc("h1").text("Hello Bot Protection this is Fermyon Wasm Functions")
    return doc.html();
}
//@ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(router.fetch(event.request));
});