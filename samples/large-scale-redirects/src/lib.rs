use std::fs::File;
use std::io::{BufReader, Read};
use std::str::from_utf8;
use std::sync::OnceLock;
use wasi::http::types::{Fields, IncomingRequest, OutgoingResponse, ResponseOutparam, StatusCode};

struct MyIncomingHandler;

impl wasi::exports::http::incoming_handler::Guest for MyIncomingHandler {
    fn handle(request: IncomingRequest, response_out: ResponseOutparam) {
        let headers = Fields::new();
        let mut code = 404;
        let sources = SOURCES.get().unwrap();
        let path = request.path_with_query().unwrap();
        match sources.get(&path) {
            Some(index) => {
                let targets = TARGETS.get().unwrap();
                let redirect = targets.decoder().run(index as usize);

                // If the redirect target ends in " <status code>", we need to parse the status code
                let target = if redirect.len() > 4 && redirect[redirect.len() - 4] == b' ' {
                    code = from_utf8(&redirect[redirect.len() - 3..])
                        .unwrap()
                        .parse::<StatusCode>()
                        .unwrap();
                    redirect[0..redirect.len() - 4].to_vec()
                } else {
                    code = *DEFAULT_STATUS_CODE.get().unwrap();
                    redirect
                };
                let header = String::from("Location");
                let val = [target];
                headers.set(&header, &val).unwrap();
            }
            None => {
                if let Some(redirect) = get_fallback_redirect(&path) {
                    let header = String::from("Location");
                    let val = [redirect.into_bytes()];
                    headers.set(&header, &val).unwrap();
                    code = *DEFAULT_STATUS_CODE.get().unwrap();
                }
            }
        }

        let resp = OutgoingResponse::new(headers);
        let _ = resp.set_status_code(code);
        ResponseOutparam::set(response_out, Ok(resp));
    }
}

fn get_fallback_redirect(path: &str) -> Option<String> {
    let fallback_prefixes = FALLBACK_PREFIXES.get().unwrap();
    // Simple linear search - O(n*m) where n=number of prefixes, m=avg prefix length
    let fallback_prefixes_idx = fallback_prefixes
        .iter()
        .position(|prefix| path.starts_with(prefix));
    if let Some(idx) = fallback_prefixes_idx {
        let fallback_targets = FALLBACK_TARGETS.get().unwrap();
        let after = &path[fallback_prefixes[idx].len()..];
        return Some(format!("{}{}", &fallback_targets[idx], after));
    }
    None
}

wasi::http::proxy::export!(MyIncomingHandler);

static TARGETS: OnceLock<fcsd::Set> = OnceLock::new();
static SOURCES: OnceLock<fst::Map<Vec<u8>>> = OnceLock::new();
static FALLBACK_PREFIXES: OnceLock<Vec<String>> = OnceLock::new();
static FALLBACK_TARGETS: OnceLock<Vec<String>> = OnceLock::new();
static DEFAULT_STATUS_CODE: OnceLock<u16> = OnceLock::new();

#[export_name = "wizer.initialize"]
pub extern "C" fn init() {
    #[derive(serde::Deserialize, Debug)]
    struct Fallbacks {
        path_prefix: String,
        target: String,
    }
    let mut args = String::new();
    std::io::stdin()
        .read_line(&mut args)
        .expect("failed to read stdin");
    let args = args.trim().split_whitespace().collect::<Vec<_>>();
    match args[..] {
        [sources_path, targets_path, fallbacks_json, default_status_code] => {
            let default_status_code = match default_status_code.parse::<u16>() {
                Ok(code) if (301..400).contains(&code) => code,
                _ => panic!("Invalid default status code '{default_status_code}'"),
            };
            println!("Using default status code {default_status_code}");
            DEFAULT_STATUS_CODE.set(default_status_code).unwrap();

            println!("Loading redirect sources from {sources_path}");
            let mut sources_file =
                File::open(sources_path).expect("Unable to read encoded redirect sources");
            let size = sources_file.metadata().unwrap().len();
            let mut sources_bytes = vec![0; size as usize];
            sources_file.read_exact(&mut sources_bytes).unwrap();
            let sources_fst = fst::Map::new(sources_bytes).unwrap();
            SOURCES.set(sources_fst).unwrap();

            println!("Loading redirect targets from {targets_path}");
            let targets_file =
                File::open(targets_path).expect("Unable to read encoded redirect targets");
            let reader = BufReader::new(targets_file);
            let set = fcsd::Set::deserialize_from(reader).unwrap();
            let _ = TARGETS.set(set);

            println!("Loading fallbacks from {fallbacks_json}");
            let mut fallbacks_file =
                File::open(fallbacks_json).expect("Unable to read fallbacks JSON file");
            let mut fallbacks_json = String::new();
            // Read the entire file into a string
            let _ = fallbacks_file.read_to_string(&mut fallbacks_json);
            let fallbacks: Vec<Fallbacks> =
                serde_json::from_str(&fallbacks_json).expect("Unable to parse fallbacks JSON");

            let mut fallback_prefixes = Vec::new();
            let mut fallback_targets = Vec::new();
            for fb in &fallbacks {
                fallback_prefixes.push(fb.path_prefix.clone());
                fallback_targets.push(fb.target.clone());
            }
            FALLBACK_PREFIXES.set(fallback_prefixes).unwrap();
            FALLBACK_TARGETS.set(fallback_targets).unwrap();
            return;
        }
        _ => {}
    }
    panic!("Expected four arguments: <sources.fst> <targets.fcsd> <fallbacks.json> <default status code>");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_fallback_redirect() {
        FALLBACK_PREFIXES
            .set(vec![
                "/legacy-shop/us".to_string(),
                "/legacy-shop/uk".to_string(),
            ])
            .unwrap();
        FALLBACK_TARGETS
            .set(vec![
                "https://shop.example.com/en-us".to_string(),
                "https://shop.example.com/en-gb".to_string(),
            ])
            .unwrap();
        assert_eq!(
            get_fallback_redirect("/legacy-shop/us/some/path"),
            Some("https://shop.example.com/en-us/some/path".to_string())
        );
        assert_eq!(
            get_fallback_redirect("/legacy-shop/uk/another/path"),
            Some("https://shop.example.com/en-gb/another/path".to_string())
        );
        assert_eq!(get_fallback_redirect("/unknown/path"), None);
    }
}
