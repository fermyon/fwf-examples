use anyhow::{anyhow, Result};
use hex::{FromHex, ToHex};
use hmac::{Hmac, Mac};
use sha2::Sha256;
type HmacSha256 = Hmac<Sha256>;

pub struct TokenConfig {
    pub window_seconds: Option<i64>,
    pub start_time: Option<i64>,
    pub url: String,
    pub ip: Option<String>,
    pub session_id: Option<String>,
    pub verbose: bool,
}

pub struct AkamaiTokenGenerator {
    key: Vec<u8>,
    token_name: String,
    algorithm: String,
    field_delimiter: String,
}

impl AkamaiTokenGenerator {
    pub fn new(hex_key: &str, algorithm: &str, token_name: &str) -> Result<Self> {
        if hex_key.is_empty() {
            return Err(anyhow!("Key is required"));
        }

        let key = Vec::from_hex(hex_key.trim_start_matches("0x"))
            .map_err(|e| anyhow!("Invalid hex key: {}", e))?;

        Ok(Self {
            key,
            token_name: token_name.to_string(),
            algorithm: algorithm.to_string(),
            field_delimiter: "~".to_string(),
        })
    }

    pub fn get_token_name(&self) -> &str {
        &self.token_name
    }

    pub fn generate_url_token(&self, config: &TokenConfig) -> Result<String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;

        let start_time = config.start_time.unwrap_or(now);
        let end_time = start_time + config.window_seconds.unwrap_or(3600);

        if config.url.is_empty() {
            return Err(anyhow!("URL must be specified"));
        }

        // Log configuration if verbose is enabled
        if config.verbose {
            println!("Token Configuration:");
            println!("  Token Name: {}", self.token_name);
            println!("  Algorithm: {}", self.algorithm);
            println!("  Field Delimiter: {}", self.field_delimiter);
            println!("  Current Time: {}", now);
            println!("  Start Time: {}", start_time);
            println!("  End Time: {}", end_time);
            println!(
                "  Window Seconds: {}",
                config.window_seconds.unwrap_or(3600)
            );
            println!("  URL: {}", config.url);
            if let Some(ip) = &config.ip {
                println!("  IP: {}", ip);
            }
            if let Some(session_id) = &config.session_id {
                println!("  Session ID: {}", session_id);
            }
        }

        let mut token_parts = Vec::new();

        // Add expiration time
        token_parts.push(format!("exp={}", end_time));

        // Add start time if different from now
        if let Some(st) = config.start_time {
            if st != now {
                token_parts.push(format!("st={}", st));
            }
        }

        // Add URL
        token_parts.push(format!("url={}", urlencoding::encode(&config.url)));

        // Add IP if specified
        if let Some(ip) = &config.ip {
            token_parts.push(format!("ip={}", ip));
        }

        // Add session ID if specified
        if let Some(session_id) = &config.session_id {
            token_parts.push(format!("id={}", session_id));
        }

        // Generate the token string to be signed
        let token_string = token_parts.join(&self.field_delimiter);

        // Generate HMAC
        let hmac = self.generate_hmac(&token_string)?;

        // Log token details if verbose is enabled
        if config.verbose {
            println!("Token Generation:");
            println!("  Token String: {}", token_string);
            println!("  HMAC: {}", hmac);
        }

        // Return the final token
        let token = format!(
            "{}={}{}{}",
            self.token_name,
            token_string,
            self.field_delimiter,
            format!("hmac={}", hmac)
        );

        if config.verbose {
            println!("  Final Token: {}", token);
        }

        Ok(token)
    }

    fn generate_hmac(&self, message: &str) -> Result<String> {
        let mut mac =
            HmacSha256::new_from_slice(&self.key).map_err(|e| anyhow!("HMAC error: {}", e))?;

        mac.update(message.as_bytes());
        let result = mac.finalize().into_bytes();

        // Use hex crate to encode the result
        Ok(result.encode_hex::<String>())
    }
}
