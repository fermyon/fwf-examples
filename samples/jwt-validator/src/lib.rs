use anyhow::{Context, Result};
use jwks_client::error::Error;
use jwks_client::jwt::Jwt;
use jwks_client::keyset::KeyStore;
use models::OpenIdConfiguration;
use serde::{Deserialize, Serialize};
use spin_sdk::http::{
    send, IntoResponse, Params, Request, RequestBuilder, Response, ResponseBuilder, Router,
};
use spin_sdk::{http_component, variables};

mod models;

#[http_component]
fn handle_jwt_validator(req: Request) -> Result<impl IntoResponse> {
    let mut router = Router::default();
    router.post_async("/validate", handle_validate_jwt);
    router.post_async("/validate-with-options", handle_validate_jwt_with_options);
    Ok(router.handle(req))
}

async fn handle_validate_jwt(req: Request, _: Params) -> Result<impl IntoResponse> {
    let Ok(oidc_url) = variables::get("oidc_url") else {
        return Ok(Response::new(
            500,
            "application not configured correctly, oidc_url missing",
        ));
    };
    let Some(jwt_header) = req.header("Authorization") else {
        return Ok(Response::new(401, ()));
    };
    let jwt = jwt_header
        .as_str()
        .and_then(|val| {
            let mut parts = val.split_whitespace();
            parts.nth(1)
        })
        .unwrap_or("");

    if jwt.is_empty() {
        return Ok(Response::new(401, ()));
    }
    let model = JwtValidationRequestModel {
        jwt: String::from(jwt),
        authority: oidc_url.clone(),

        options: JwtValidationOptions {
            expected_audiences: Some(vec![String::from("invoice")]),
            expected_issuer: Some(oidc_url),
            expected_token_type: Some(String::from("at+jwt")),
            expected_scopes: Some(vec![String::from("invoice.read")]),
            expected_claims: Some(vec![String::from("client_app_type")]),
        },
    };
    return validate(model).await;
}

async fn handle_validate_jwt_with_options(req: Request, _: Params) -> Result<impl IntoResponse> {
    let Ok(oidc_url) = variables::get("oidc_url") else {
        return Ok(Response::new(
            500,
            "application not configured correctly, oidc_url missing",
        ));
    };
    let Some(jwt_header) = req.header("Authorization") else {
        return Ok(Response::new(401, ()));
    };
    let jwt = jwt_header
        .as_str()
        .and_then(|val| {
            let mut parts = val.split_whitespace();
            parts.nth(1)
        })
        .unwrap_or("");

    if jwt.is_empty() {
        return Ok(Response::new(401, ()));
    }

    let Ok(options) = serde_json::from_slice::<JwtValidationOptions>(req.body()) else {
        return Ok(Response::new(400, "Error deserializing payload"));
    };
    if options
        .expected_issuer
        .as_ref()
        .is_some_and(|iss| iss.as_str() != oidc_url.as_str())
    {
        return Ok(Response::new(
            400,
            format!(
                "Expected issuer is specified, but differs from sample issuer {}",
                oidc_url.as_str()
            ),
        ));
    }

    let model = JwtValidationRequestModel {
        jwt: String::from(jwt),
        authority: oidc_url,
        options,
    };
    return validate(model).await;
}

async fn validate(model: JwtValidationRequestModel) -> Result<Response> {
    let openid_config = get_openid_configuration(model.authority).await?;
    let key_set = KeyStore::new_from(openid_config.jwks_uri.clone())
        .await
        .unwrap();

    match key_set.verify(&model.jwt) {
        Ok(jwt) => {
            println!("keyset validation succeeded. Starting JWT validation");
            let errors = validate_jwt_and_track_errors(&jwt, &model.options);
            if errors.len() == 0 {
                return Ok(Response::new(200, ()));
            }
            let payload = serde_json::to_string_pretty(&errors)?;
            return Ok(ResponseBuilder::new(401)
                .header("content-type", "application/json")
                .body(payload)
                .build());
        }
        Err(Error { msg, typ }) => {
            println!("keyset validation failed. Skipping JWT validation");
            let e = ValidationError::new(format!(
                "JWT Keyset validation failed (type: {:?}) {}",
                typ, msg
            ));
            let payload = serde_json::to_string(&e)?;
            Ok(Response::new(401, payload))
        }
    }
}

async fn get_openid_configuration(authority: String) -> Result<OpenIdConfiguration> {
    let openid_configuration_url = format!("{}/.well-known/openid-configuration", authority);
    let req = RequestBuilder::new(spin_sdk::http::Method::Get, openid_configuration_url).build();
    let res: Response = send(req).await?;
    serde_json::from_slice::<OpenIdConfiguration>(res.body())
        .with_context(|| "Error while deserializing into OpenIdConfiguration")
}

fn validate_jwt_and_track_errors(
    jwt: &Jwt,
    options: &JwtValidationOptions,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    if options.expected_token_type.is_some() {
        let want = options.expected_token_type.as_ref().unwrap();
        let got = jwt.header().typ();
        if got.is_none() || got.is_some_and(|a| a.to_ascii_lowercase() != want.to_ascii_lowercase())
        {
            errors.push(ValidationError::new(format!(
                "JWT has wrong token type. Got: {} Wanted: {}",
                got.unwrap(),
                want
            )));
        }
    }
    if options.expected_audiences.is_some() {
        let want = options.expected_audiences.as_ref().unwrap();
        let got = match jwt.payload().get_str("aud") {
            Some(aud) => Some(vec![aud.to_string()]),
            None => match jwt.payload().get_array("aud") {
                Some(auds) => Some(
                    auds.iter()
                        .map(|v| v.as_str().unwrap().to_string())
                        .collect::<Vec<String>>(),
                ),
                None => None,
            },
        };
        if got.is_none() {
            errors.push(ValidationError::new(format!(
                "JWT does not have 'aud' claim"
            )));
        }
        let got = got.unwrap();

        for aud in want.iter() {
            if !got.contains(aud) {
                errors.push(ValidationError::new(format!(
                    "JWT is missing {} as part of the 'aud' claim",
                    aud
                )));
            }
        }
    }
    if options.expected_issuer.is_some() {
        let want = options.expected_issuer.as_ref().unwrap();
        let got = jwt.payload().get_str("iss");
        if got.is_none() {
            errors.push(ValidationError::new(format!(
                "JWT does not have 'iss' claim"
            )));
        }
        if want != got.unwrap() {
            errors.push(ValidationError::new(format!(
                "JWT does not have expected value for 'iss' claim"
            )));
        }
    }
    if options.expected_scopes.is_some() {
        let want = options.expected_scopes.as_ref().unwrap();
        let got = jwt.payload().get_array("scope");
        if got.is_none() {
            errors.push(ValidationError::new(format!(
                "JWT does not have required scopes"
            )));
        }
        let got: Vec<String> = got
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_ascii_lowercase())
            .collect();
        for scope in want.iter() {
            if !got.contains(&scope.to_ascii_lowercase()) {
                errors.push(ValidationError::new(format!(
                    "JWT does not have the required {} scope.",
                    scope
                )));
            }
        }
    }
    if options.expected_claims.is_some() {
        let want = options.expected_claims.as_ref().unwrap();
        for claim in want.iter() {
            if !jwt.payload().has_claim(claim.to_string()) {
                errors.push(ValidationError::new(format!(
                    "JWT does not have the required {} claim",
                    claim
                )));
            }
        }
    }
    errors
}

#[derive(Debug, Serialize)]
pub struct ValidationError {
    pub message: String,
}

impl ValidationError {
    fn new(message: String) -> Self {
        Self { message }
    }
}

#[derive(Debug, Deserialize)]
pub struct JwtValidationRequestModel {
    pub jwt: String,
    pub authority: String,
    pub options: JwtValidationOptions,
}

#[derive(Debug, Deserialize)]
pub struct JwtValidationOptions {
    #[serde(rename = "expectedAudience")]
    pub expected_audiences: Option<Vec<String>>,
    #[serde(rename = "expectedIssuer")]
    pub expected_issuer: Option<String>,
    /// Recommended to check the type header to avoid "JWT confusion" attacks
    #[serde(rename = "expectedTokenType")]
    pub expected_token_type: Option<String>,
    #[serde(rename = "expectedScopes")]
    pub expected_scopes: Option<Vec<String>>,
    #[serde(rename = "expectedClaims")]
    pub expected_claims: Option<Vec<String>>,
}
