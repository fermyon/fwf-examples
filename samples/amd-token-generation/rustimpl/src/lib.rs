use amd::{AkamaiTokenGenerator, TokenConfig};
use anyhow::{anyhow, Result};
use spin_sdk::{
    http::{IntoResponse, Params, Request, Response, Router},
    http_component,
};
use url::Url;

mod amd;

#[http_component]
pub fn handler(req: Request) -> Result<impl IntoResponse> {
    let mut router = Router::new();

    router.get("/rustapi/token", handle_rust_token_generation);

    Ok(router.handle(req))
}

fn handle_rust_token_generation(req: Request, _params: Params) -> Result<impl IntoResponse> {
    let url = req
        .header("spin-full-url")
        .ok_or_else(|| anyhow!("Missing spin-full-url header"))?;

    println!("Handling request to {:?}", url);

    let url = Url::parse(url.as_str().expect("spin-full-url header is empty"))
        .map_err(|e| anyhow!("Failed to parse URL: {}", e))?;

    let path = url.path();

    // Handle root path
    if path == "/" {
        return Ok(Response::builder()
            .status(200)
            .header("content-type", "text/plain")
            .body("Akamai URL Token Generation Service")
            .build());
    }

    // Handle token generation
    if path == "/rustapi/token" {
        let encryption_key = spin_sdk::variables::get("encryption_key")
            .map_err(|_| anyhow!("Encryption key is not set"))?;

        let token_generator = AkamaiTokenGenerator::new(&encryption_key, "SHA-256", "hdnts")?;

        let query_params: Vec<(String, String)> = url
            .query_pairs()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();

        // Get URL parameter
        let content_url = query_params
            .iter()
            .find(|(k, _)| k == "url")
            .map(|(_, v)| v.clone())
            .ok_or_else(|| anyhow!("Missing required parameter: url"))?;

        // Get optional parameters
        let window_seconds = query_params
            .iter()
            .find(|(k, _)| k == "window")
            .map(|(_, v)| v.parse::<i64>().unwrap_or(3600));

        let start_time = query_params
            .iter()
            .find(|(k, _)| k == "start_time")
            .and_then(|(_, v)| v.parse::<i64>().ok());

        let ip = query_params
            .iter()
            .find(|(k, _)| k == "ip")
            .map(|(_, v)| v.clone());

        let session_id = query_params
            .iter()
            .find(|(k, _)| k == "session_id")
            .map(|(_, v)| v.clone());

        let token_config = TokenConfig {
            window_seconds,
            start_time,
            url: content_url.clone(),
            ip,
            session_id,
            verbose: true,
        };

        let token = token_generator.generate_url_token(&token_config)?;

        // Create a full URL with the token as a query parameter
        let mut content_url_obj =
            Url::parse(&content_url).map_err(|e| anyhow!("Failed to parse content URL: {}", e))?;

        content_url_obj
            .query_pairs_mut()
            .append_pair(token_generator.get_token_name(), &token);

        let full_url = content_url_obj.to_string();

        let response_body = serde_json::json!({
            "token": token,
            "url": full_url
        });

        return Ok(Response::builder()
            .status(200)
            .header("content-type", "application/json")
            .body(response_body.to_string())
            .build());
    }

    // Handle unknown paths
    Ok(Response::builder()
        .status(404)
        .header("content-type", "application/json")
        .body(r#"{"error": "Not Found"}"#)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_generation() {
        let key = "0123456789abcdef0123456789abcdef";
        let token_generator = AkamaiTokenGenerator::new(key, "SHA-256", "hdnts").unwrap();

        let config = TokenConfig {
            window_seconds: Some(3600),
            start_time: Some(1718483200),
            url: "https://example.com/video/sample.mp4".to_string(),
            ip: Some("203.0.113.1".to_string()),
            session_id: Some("user123".to_string()),
            verbose: false,
        };

        let token = token_generator.generate_url_token(&config).unwrap();

        // This expected value would come from running the TypeScript implementation with the same inputs
        let expected = "hdnts=exp=1718486800~st=1718483200~url=https%3A%2F%2Fexample.com%2Fvideo%2Fsample.mp4~ip=203.0.113.1~id=user123~hmac=8a3087fac0750644335e8a7aa9ae6a61b64fc3999fd9265c14b6baf8a39bd2b5";

        assert_eq!(token, expected);
    }
}
