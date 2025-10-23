## Rewriting Content for Bots - Price Hiding

This sample shows a Wasm Function that defends against price scraping while still enabling scraper bots to 'see' product information. How it works:

* The CDN has bot detection functionality.
* When the CDN detects a bot, instead of rejecting the request outright, it passes it to the Wasm Function
* The Wasm Function downloads the page from the origin, and replaces CSS or text patterns as specified in its rules set.
* The modified page is returned to the CDN to be returned to the bot.

**NOTE:** To make it easy to demonstrate the solution, this sample has a couple of things that don't reflect a production environment:

1. The sample includes an example back end ("shirt shop"). In reality, the back end would be the customer's origin. The origin is **not** expected be hosted on Fermyon Wasm Functions, and generally should not have to be modified in any way.

2. All requests pass through the bot protection front end, and you pretend to be a bot by using the query string `content-type=bot`. In a real deployment only requests that the CDN determined to be bots would be passed through bot protection; human requests would pass directly to the origin.

3. A home page is provided which lets you view "as for humans" and "as for bots" by toggling a drop-down. In "humans" mode the frame displays the content from the "shirt shop" back end with bot protection **not** activated; in "bots" mode, bot protection **is** activated.

## Running Locally

You will need Spin 3.5 or above and Rust 1.89 or above. Run:

```
spin up --build --variable replacements_json=@rules.json
```

Then visit `http://localhost:3000` to see the home page with the human/bot toggle.

## Deploying to Fermyon Wasm Functions

You will additionally need `spin aka` version _TBA_ or above. Run:

```
spin aka deploy --build --variable replacements_json=@rules.json
```

Then visit the URL shown in the output.
