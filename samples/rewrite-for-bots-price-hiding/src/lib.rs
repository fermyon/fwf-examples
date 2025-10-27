use std::collections::HashMap;

use anyhow::Context;
use spin_sdk::http::{IntoResponse, Request, Response};
use spin_sdk::http_component;
use url::Url;

/// A simple Spin HTTP component.
#[http_component]
async fn handle_rewrite_for_bots_price_hiding(req: Request) -> anyhow::Result<impl IntoResponse> {
    let upstream_host = spin_sdk::variables::get("upstream_host").expect("upstream_host must be set");
    let upstream_url = format!("{upstream_host}{path}", path = req.path_and_query().unwrap_or("/"));

    let parsed = Url::parse(&req.uri()).context("failed to parse request URI")?;

    // FOR DEMONSTRATION PURPOSES: check for ?content-type=bot query param
    // In a real deployment, requests would only come to the rewriter if the CDN
    // already determined them to be bots.
    let is_bot_request = parsed
        .query_pairs()
        .any(|(k, v)| k == "content-type" && v == "bot");

    // If this is NOT a bot request, pass it through. Again, in a production deployment
    // this would not be necessary because the function would never see non-bot requests.
    if !is_bot_request {
        let passthrough_request = Request::builder()
            .uri(&upstream_url)
            .method(req.method().clone())
            .headers(req.headers().map(|(hname, hval)| (hname.to_owned(), hval.as_bytes().to_vec())).collect::<HashMap<_, _>>())
            .body(req.body().to_owned())
            .build();
        return Ok(spin_sdk::http::send(passthrough_request).await?);
    }

    // Bot protection processing begins here

    let error_response = spin_sdk::variables::get("error_response").expect("error_response should have been set");
    let replacements_json = spin_sdk::variables::get("replacements_json").expect("replacements_json should have been set");
    let replacements: Vec<Replacement> = serde_json::from_str(&replacements_json).context("invalid replacements JSON")?;

    let headers = vec![
        ("user-agent".to_string(), "FWF Price Hiding".to_string()),
    ];

    let upstream_request = Request::builder()
        .uri(&upstream_url)
        .method(spin_sdk::http::Method::Get)
        .headers(headers)
        .build();

    let upstream_response: Result<spin_sdk::http::Response, _> = spin_sdk::http::send(upstream_request).await;

    let upstream_response = match upstream_response {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Bot response not generated: upstream request for {upstream_url} failed: {e:?}");
            return Ok(Response::builder()
                .status(403)
                .header("content-type", "text/plain")
                .body(error_response)
                .build());
        }
    };

    let status = *upstream_response.status();

    // Not found, gone, or redirected
    if status == 404 || status == 410 || status == 301 || status == 307 {
        return Ok(upstream_response);
    }

    if !is_success(&upstream_response) {
        eprintln!("Bot response not generated: upstream request for {upstream_url} returned status code {}", upstream_response.status());
        return Ok(Response::builder()
            .status(503)
            .header("content-type", "text/plain")
            .body(error_response)
            .build());
    }

    let Some((content_type, response_text)) = extract_text(&upstream_response) else {
        eprintln!("Bot response not generated: upstream request for {upstream_url} returned non-text response");
        return Ok(upstream_response);
    };

    let protected_text = match hide_prices(&response_text, &replacements) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Bot response not generated: processing response from {upstream_url} failed: {e:?}");
            return Ok(Response::builder()
                .status(503)
                .header("content-type", "text/plain")
                .body(error_response)
                .build());
        }
    };

    Ok(Response::builder()
        .status(200)
        .header("content-type", content_type.unwrap_or("text/html"))
        .body(protected_text)
        .build())
}

fn is_success(response: &spin_sdk::http::Response) -> bool {
    (response.status() / 100) == 2
}

fn extract_text(response: &spin_sdk::http::Response) -> Option<(Option<&str>, String)> {
    match response.header("content-type").and_then(|hval| hval.as_str()) {
        None => String::from_utf8(response.body().to_vec()).ok().map(|v| (None, v)),
        Some(content_type) => {
            if content_type.starts_with("text/") || content_type == "application/html" {
                let text = String::from_utf8(response.body().to_vec()).ok()?;
                Some((Some(content_type), text))
            } else {
                None
            }
        }
    }
}

fn hide_prices(html: &str, replacements: &[Replacement]) -> anyhow::Result<String> {
    fn replace_with(replacment: String) -> impl Fn(&mut lol_html::html_content::Element) -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
        move |el: &mut lol_html::html_content::Element| -> Result<(), Box<dyn std::error::Error + Send + Sync + 'static>> {
            el.set_inner_content(&replacment, lol_html::html_content::ContentType::Html);
            Ok(())
        }
    }

    let element_content_handlers = replacements.iter().flat_map(|r|
        r.selectors.iter().map(|s|
            lol_html::element!(s, replace_with(r.replacement.clone()))
        )
    ).collect();

    let settings = lol_html::Settings {
        element_content_handlers,
        ..lol_html::Settings::new()
    };

    let r = lol_html::rewrite_str(html, settings)?;
    Ok(r)
}

#[derive(serde::Deserialize)]
struct Replacement {
    selectors: Vec<String>,
    replacement: String,
}
