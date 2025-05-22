use lol_html::{element, rewrite_str, RewriteStrSettings};
use spin_sdk::http::{send, IntoResponse, Request, RequestBuilder, Response, ResponseBuilder};
use spin_sdk::key_value::Store;
use spin_sdk::{http_component, variables};

#[http_component]
async fn handle_html_rewrite(req: Request) -> anyhow::Result<impl IntoResponse> {
    let upstream_url = variables::get("upstream_url").expect("Upstream URL not configured");
    let path = req
        .path_and_query()
        .filter(|&s| !s.is_empty() && s != "/")
        .unwrap_or("/index.html");
    let url = format!("{upstream_url}{path}");

    let use_kv_store = variables::get("use_kv_store")
        .and_then(|v| Ok(v == "true"))
        .unwrap_or_default();
    if (use_kv_store) {
        let kv = Store::open_default()?;
        let found = kv.get(url.as_str())?;
        if found.is_some() {
            println!("Cache hit");
            let original = String::from_utf8_lossy(&found.unwrap()).to_string();
            return Ok(ResponseBuilder::new(200)
                .header("content-type", "text/html")
                .body(rewrite_html(original))
                .build());
        }
    }

    let response: Response = send(RequestBuilder::new(
        spin_sdk::http::Method::Get,
        url.clone(),
    ))
    .await?;
    // if we receive a non 200 status code
    // or if the content type is not text/html
    // return the response as is
    if response.status() != &200
        || response
            .header("content-type")
            .is_none_or(|hv| hv.as_str().is_none_or(|v| !v.contains("text/html")))
    {
        println!("Either status != 200 or non-html");
        return Ok(response);
    }
    let input = String::from_utf8_lossy(response.body()).to_string();

    if use_kv_store {
        let kv = Store::open_default()?;
        kv.set(&url, input.as_bytes())?;
    }
    Ok(ResponseBuilder::new(200)
        .header("content-type", "text/html")
        .body(rewrite_html(input))
        .build())
}

fn rewrite_html(input: String) -> String {
    let element_content_handlers = vec![element!("h1", |el| {
        el.set_inner_content(
            "Hello Bot Protection this is Fermyon Wasm Functions",
            lol_html::html_content::ContentType::Text,
        );
        Ok(())
    })];

    return rewrite_str(
        &input,
        RewriteStrSettings {
            element_content_handlers,
            ..RewriteStrSettings::new()
        },
    )
    .unwrap_or(input);
}
