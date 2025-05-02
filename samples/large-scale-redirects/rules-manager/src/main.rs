//! Utility to update redirect rules.
//!
//! The way this works is:
//! - we first load an existing redirect file that is known-valid
//! - we then load additional redirect files provided by the user
//!   - for each of them, we
//!     - first check if each rule is valid by itself
//!     - then add them to the list of rules, checking for duplicates
//!   - we then check if the resulting list contains any loops, and abort with a descriptive error if so
//!   - we then write the resulting list to a file
//!   - we additionally generate optimized data structures for both rule sources and destinations
//!     and write those to files as well

use anyhow::{anyhow, Context, Result};
use clap::{arg, Parser, ValueEnum};
use std::cell::RefCell;
use std::fmt::{Display, Formatter};
use std::fs::{read_to_string, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use url::Url;

const GENERATED_FILE_HEADER: &'static str =
    "# Validated redirects, DO NOT EDIT. EDITING WILL CAUSE INCORRECT REDIRECTS!";

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
enum ValidationBehavior {
    Ignore,
    Warn,
    Error,
}

#[derive(Parser, Debug)]
struct ValidationBehaviors {
    /// Behavior for self-referential loops. Default is to warn and discard the rule.
    #[arg(long, value_enum, hide_default_value = true, default_value_t = ValidationBehavior::Warn)]
    self_loops: ValidationBehavior,

    /// Behavior for loops across multiple rules. Default is to abort with an error.
    #[arg(long, value_enum, hide_default_value = true, default_value_t = ValidationBehavior::Error)]
    loops: ValidationBehavior,

    /// Behavior for invalid rules. Default is to abort with an error.
    #[arg(long, value_enum, hide_default_value = true, default_value_t = ValidationBehavior::Error)]
    invalid_lines: ValidationBehavior,
}

#[derive(clap::Args)]
#[group(required = true)]
struct RuleFiles {
    /// Path(s) to the existing redirects file(s)
    #[arg(long, num_args = 0..)]
    existing_rules: Vec<PathBuf>,

    /// Path(s) to new redirect files to add
    #[arg(long, num_args = 0..)]
    add_rules: Vec<PathBuf>,
}

#[derive(clap::Args)]
struct Output {
    /// Path to store all output files in
    #[arg(long, default_value = ".")]
    output_dir: PathBuf,

    /// Path to the output file
    #[arg(long, default_value = "new_redirects.txt")]
    rules_output_file: String,

    /// Path to store the encoded sources in
    #[arg(long, default_value = "sources.fst")]
    encoded_sources: String,

    /// Path to store the encoded targets in
    #[arg(long, default_value = "targets.fcsd")]
    encoded_targets: String,
}

impl Default for ValidationBehaviors {
    fn default() -> Self {
        Self {
            self_loops: ValidationBehavior::Warn,
            loops: ValidationBehavior::Error,
            invalid_lines: ValidationBehavior::Error,
        }
    }
}

/// A tool for updating and validating redirect rules
#[derive(Parser)]
#[command(version, about)]
struct Args {
    #[command(flatten)]
    rule_files: RuleFiles,

    /// Default status code for redirects
    #[arg(value_parser = clap::value_parser!(u16).range(301..400), default_value = "302")]
    default_status_code: u16,

    #[command(flatten)]
    output: Output,

    /// Include existing redirects in the output. Default is to not include them.
    #[arg(long)]
    include_existing: bool,

    #[command(flatten)]
    behaviors: ValidationBehaviors,
}

fn main() -> Result<()> {
    let args = Args::parse();
    run(&args)
}

#[derive(Debug)]
struct RedirectsSource<'a> {
    pub path: &'a Path,
    pub contents: String,
}

fn run(args: &Args) -> Result<()> {
    let existing_redirects = args
        .rule_files
        .existing_rules
        .iter()
        .map(|path| {
            Ok(RedirectsSource {
                path,
                contents: read_to_string(path).with_context(|| {
                    format!(
                        "Failed to read existing redirects file {}",
                        path.to_string_lossy()
                    )
                })?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let new_redirects = args
        .rule_files
        .add_rules
        .iter()
        .map(|path| {
            Ok(RedirectsSource {
                path,
                contents: read_to_string(path).with_context(|| {
                    format!(
                        "Failed to read new redirects file {}",
                        path.to_string_lossy()
                    )
                })?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let redirects = RedirectsMap::build(
        &existing_redirects,
        &new_redirects,
        args.default_status_code,
        &args.behaviors,
    )
    .with_context(|| "Failed to update redirects".to_string())?;

    // Write the resulting list to a file
    let excluded_rules: Option<Vec<&RedirectsSource>> = if args.include_existing {
        None
    } else {
        Some(existing_redirects.iter().collect())
    };

    let output_directory = Path::new(&args.output.output_dir);

    if !args.rule_files.add_rules.is_empty() {
        ensure_dir(&output_directory)?;
        let output_file_path = output_directory.join(&args.output.rules_output_file);
        redirects
            .write_to_file(&output_file_path, excluded_rules)
            .with_context(|| "Failed to write updated redirects".to_string())?;
        println!("Saved updated redirects to {}", output_file_path.display());
    }

    let mut entries = redirects
        .map
        .iter()
        .map(|(key, val)| {
            if val.status_code == args.default_status_code {
                (*key, val.to.to_string())
            } else {
                (*key, format!("{} {}", val.to, val.status_code))
            }
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.0);

    let mut targets = entries.iter().map(|(_, to)| to).collect::<Vec<_>>();
    targets.sort();
    targets.dedup();

    // Encode redirect sources using fst and store them in a file
    ensure_dir(&output_directory)?;
    let sources_file_path = output_directory.join(&args.output.encoded_sources);
    let wtr = BufWriter::new(File::create(&sources_file_path)?);
    let mut build = fst::MapBuilder::new(wtr)?;
    for (from, to) in entries.iter() {
        // Find the index of the target in the sorted list and store it as the value
        let index = targets.binary_search(&to).unwrap();
        build.insert(from, index as u64)?;
    }
    build.finish()?;
    println!(
        "Saved encoded redirect sources to {}",
        sources_file_path.display()
    );

    // Encode redirect targets using fcsd and store them in a file
    let targets_file_path = output_directory.join(&args.output.encoded_targets);
    let target_set = fcsd::Set::with_bucket_size(targets.as_slice(), 128)?;
    let set_file = File::create(&targets_file_path)?;
    target_set.serialize_into(BufWriter::new(set_file))?;
    println!(
        "Saved encoded redirect targets to {}",
        targets_file_path.display()
    );

    Ok(())
}

fn ensure_dir(dir: &&Path) -> Result<()> {
    if !dir.exists() {
        std::fs::create_dir_all(dir).with_context(|| {
            format!(
                "Failed to create output directory {}",
                dir.to_string_lossy()
            )
        })?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
struct MapEntry<'a> {
    to: &'a str,
    source: &'a RedirectsSource<'a>,
    status_code: u16,
    line_no: usize,
}

impl<'a> PartialEq for MapEntry<'a> {
    fn eq(&self, other: &Self) -> bool {
        self.to == other.to
    }
}

#[derive(Debug)]
struct RedirectsMap<'a> {
    map: std::collections::HashMap<&'a str, MapEntry<'a>>,
    default_status_code: u16,
    parse_errors: Vec<FailedCheck<'a>>,
}

#[derive(Debug)]
struct FailedCheck<'a> {
    source: &'a RedirectsSource<'a>,
    line_no: usize,
    line: &'a str,
    reason: FailedCheckReason,
}

#[derive(Debug)]
struct FailedCheckReason {
    message: String,
    severity: ValidationBehavior,
}

#[derive(Debug)]
enum ParseResult<'a> {
    Ok((&'a str, &'a str, u16)),
    Err(String, ValidationBehavior),
}

impl<'a> RedirectsMap<'a> {
    fn new(default_status_code: u16) -> RedirectsMap<'a> {
        Self {
            map: std::collections::HashMap::new(),
            default_status_code,
            parse_errors: Vec::new(),
        }
    }

    fn add_rules(&mut self, source: &'a RedirectsSource, checks: &ValidationBehaviors) {
        for (line_no, line) in source.contents.lines().enumerate() {
            // Strip inline comments
            let rule_part = line.split('#').next().unwrap_or("").trim();

            if rule_part.is_empty() {
                continue; // Skip empty lines and lines that are only comments
            }

            self.parse_line(rule_part, line, checks, source, line_no);
        }
    }

    fn parse_line(
        &mut self,
        rule_part: &'a str,
        original_line: &'a str,
        checks: &ValidationBehaviors,
        source: &'a RedirectsSource,
        line_no: usize,
    ) {
        let parts: Vec<&str> = rule_part.split_whitespace().collect();
        let parts = match parts.len() {
            0 => ParseResult::Err("Empty line".to_string(), checks.invalid_lines),
            1 => ParseResult::Err(
                "Missing target for redirect".to_string(),
                checks.invalid_lines,
            ),
            2 | 3 => {
                let from = parts[0];
                let to = parts[1];
                let status_code = if parts.len() == 3 {
                    parts[2]
                        .parse::<u16>()
                        .ok()
                        .filter(|&code| (301..=399).contains(&code))
                } else {
                    Some(self.default_status_code)
                };

                if from == to {
                    ParseResult::Err(
                        "Source and target cannot be the same".to_string(),
                        checks.self_loops,
                    )
                } else if !is_valid_redirect_source(from) && !is_valid_redirect_target(to) {
                    ParseResult::Err(
                        format!("Invalid format for source and target: '{from}' -> '{to}'"),
                        checks.invalid_lines,
                    )
                } else if !is_valid_redirect_source(from) {
                    ParseResult::Err(
                        format!("Invalid format for source: '{from}'"),
                        checks.invalid_lines,
                    )
                } else if !is_valid_redirect_target(to) {
                    ParseResult::Err(
                        format!("Invalid format for target: '{to}'"),
                        checks.invalid_lines,
                    )
                } else if status_code.is_none() {
                    ParseResult::Err(
                        format!("Invalid status code: '{}'", parts[2]),
                        checks.invalid_lines,
                    )
                } else {
                    ParseResult::Ok((from, to, status_code.unwrap()))
                }
            }
            n => ParseResult::Err(
                format!("Line must contain 2 or 3 whitespace-separated parts, but found {n}"),
                checks.invalid_lines,
            ),
        };

        match parts {
            ParseResult::Ok((from, to, status_code)) => {
                self.map.insert(
                    from,
                    MapEntry {
                        to,
                        status_code,
                        source,
                        line_no,
                    },
                );
            }
            ParseResult::Err(message, severity) => {
                let reason = FailedCheckReason { message, severity };
                let failed = FailedCheck {
                    source,
                    line_no,
                    line: original_line,
                    reason,
                };
                self.parse_errors.push(failed);
            }
        }
    }

    fn check_for_loops(&self) -> Result<()> {
        let mut loops = Vec::new();
        for (start_node, target) in self.map.iter() {
            let mut visited = vec![LoopCheckEntry::new(*start_node, target)];
            let mut from = target.to;

            while let Some(target) = self.map.get(from) {
                let entry = LoopCheckEntry::new(from, target);
                if visited.contains(&entry) {
                    loops.push(visited);
                    break;
                }

                visited.push(entry);
                from = target.to;
            }
        }
        if !loops.is_empty() {
            let loops: Vec<String> = loops
                .iter()
                .map(|loop_nodes| {
                    format!(
                        "Loop:\n   {}",
                        loop_nodes
                            .iter()
                            .map(|entry| entry.to_string())
                            .collect::<Vec<_>>()
                            .join("\n-> ")
                    )
                })
                .collect();
            return Err(anyhow!("Loops detected:\n{}", loops.join("\n")));
        }

        Ok(())
    }

    fn shorten_chains(&mut self) -> Result<()> {
        let chain_starts: Vec<&str> = self.map.keys().map(|key| *key).collect();
        let mut chain_depths = vec![];

        for start in chain_starts {
            let mut current = self.map.get(start).unwrap();
            let mut depth = 1;

            while let Some(target) = self.map.get(current.to).map(|e| e.clone()) {
                if target.status_code != current.status_code {
                    break;
                }
                depth += 1;
                self.map.insert(start, target);
                current = self.map.get(start).unwrap();
            }

            if depth > 1 {
                chain_depths.push(depth);
            }
        }
        if !chain_depths.is_empty() {
            let average = chain_depths.iter().sum::<usize>() as f64 / chain_depths.len() as f64;
            println!(
                "Shortened {} chains with an average depth of {:.2}",
                chain_depths.len(),
                average
            );
        }

        Ok(())
    }

    /// Process redirects from input streams and return the combined redirect map
    fn build(
        existing_redirects: &'a Vec<RedirectsSource>,
        new_redirects: &'a Vec<RedirectsSource>,
        default_status_code: u16,
        checks: &ValidationBehaviors,
    ) -> Result<Self> {
        let mut redirects = Self::new(default_status_code);

        for existing_redirects in existing_redirects {
            let header = existing_redirects.contents.lines().next().unwrap();
            if header.trim() != GENERATED_FILE_HEADER {
                return Err(anyhow!(
                    "Existing redirects file must be generated by this tool"
                ));
            }
            redirects.add_rules(&existing_redirects, checks);
        }

        if !redirects.parse_errors.is_empty() {
            return Err(anyhow!("No parse errors expected in existing redirects"));
        }

        for source in new_redirects {
            redirects.add_rules(&source, checks);
        }

        let errors_found = redirects.print_errors(ValidationBehavior::Error, "Errors in file: ");
        redirects.print_errors(ValidationBehavior::Warn, "Warning, ignored lines in file: ");

        let ignored_lines = redirects
            .parse_errors
            .iter()
            .filter(|e| e.reason.severity != ValidationBehavior::Error)
            .count();
        if !ignored_lines > 0 {
            println!("Skipped {ignored_lines} invalid lines");
        }

        if checks.loops != ValidationBehavior::Ignore {
            redirects.check_for_loops()?;
        }

        redirects.shorten_chains()?;

        if errors_found {
            return Err(anyhow!("Errors found in redirect rules, aborting"));
        }
        Ok(redirects)
    }

    fn print_errors(&self, severity: ValidationBehavior, header: &str) -> bool {
        let errors: Vec<_> = self
            .parse_errors
            .iter()
            .filter(|e| e.reason.severity == severity)
            .collect();
        let errors_found = !errors.is_empty();
        let mut current_path = Path::new("");
        for error in &errors {
            if error.source.path != current_path {
                println!("{header}{}", error.source.path.display());
                current_path = error.source.path;
            }
            println!(
                "  Line {}: {} (Line source: \"{}\")",
                error.line_no, error.reason.message, error.line
            );
        }
        errors_found
    }

    fn write_to_file(
        &self,
        output_path: &Path,
        excluded_rules: Option<Vec<&RedirectsSource>>,
    ) -> Result<()> {
        let mut sorted_redirects: Vec<_> = self
            .map
            .iter()
            .map(|(from, entry)| {
                if entry.status_code == self.default_status_code {
                    format!("{from} {}", entry.to)
                } else {
                    format!("{from} {} {}", entry.to, entry.status_code)
                }
            })
            .collect();
        sorted_redirects.sort();

        if let Some(excluded_rules) = excluded_rules {
            let mut excluded_lines: std::collections::HashSet<&str> =
                std::collections::HashSet::new();
            for excluded_rules_single in excluded_rules {
                let mut lines = excluded_rules_single.contents.lines();
                let first_line = lines.next().unwrap();
                if first_line != GENERATED_FILE_HEADER {
                    return Err(anyhow!(
                        "Existing redirects file must be generated by this tool"
                    ));
                }
                for line in lines {
                    excluded_lines.insert(line);
                }
            }

            // Filter out lines that appear in excluded_rules
            sorted_redirects = sorted_redirects
                .into_iter()
                .filter(|line| !excluded_lines.contains(line.as_str()))
                .collect();
        }

        if sorted_redirects.is_empty() {
            return Err(anyhow!("No new rules found"));
        }

        let mut file = File::create(output_path)?;
        writeln!(file, "{}", GENERATED_FILE_HEADER)?;
        for line in sorted_redirects.iter() {
            writeln!(file, "{}", line)?;
        }
        Ok(())
    }
}

const BASE: LazyLock<Url> = LazyLock::new(|| Url::parse("https://example.com").unwrap());

fn is_valid_redirect_source(input: &str) -> bool {
    input.starts_with("/") && BASE.join(input).is_ok()
}

fn is_valid_redirect_target(input: &str) -> bool {
    assert!(
        !input.contains(|c: char| c.is_whitespace()),
        "Input should not contain newlines"
    );
    let violations = RefCell::new(Vec::new());
    let cb = |v| violations.borrow_mut().push(v);
    let parser = Url::options().syntax_violation_callback(Some(&cb));
    if input.starts_with("/") {
        return parser.base_url(Some(&BASE)).parse(input).is_ok()
            && violations.borrow_mut().is_empty();
    }

    if !input.starts_with("http") {
        return false;
    }

    Url::parse(input).is_ok() && violations.borrow_mut().is_empty()
}

struct LoopCheckEntry<'a> {
    from: &'a str,
    to: &'a MapEntry<'a>,
}

impl<'a> Display for LoopCheckEntry<'a> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}#{}: {} -> {}",
            self.to.source.path.display(),
            self.to.line_no,
            self.from,
            self.to.to
        )
    }
}

impl<'a> LoopCheckEntry<'a> {
    fn new(from: &'a str, to: &'a MapEntry<'a>) -> Self {
        Self { from, to }
    }
}

impl<'a> PartialEq for LoopCheckEntry<'a> {
    fn eq(&self, other: &Self) -> bool {
        self.from == other.from
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use tempfile::tempdir;

    #[test]
    fn test_loop_within_new_rules() {
        // Create a redirect map with a loop entirely within new rules: A -> B -> C -> A
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/path-a /path-b\n/path-b /path-c\n/path-c /path-a".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(
            redirects.parse_errors.is_empty(),
            "No parse errors expected"
        );

        // Now check for loops
        let result = redirects.check_for_loops();
        assert!(result.is_err(), "Loop should be detected");

        // Verify that the loop is detected and the error message contains the description of the loop.
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("/path-a"), "Error should mention path-a");
        assert!(err_msg.contains("/path-b"), "Error should mention path-b");
        assert!(err_msg.contains("/path-c"), "Error should mention path-c");
    }

    #[test]
    fn test_loop_with_existing_and_new_rules() {
        // First set up the "existing" redirects
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("existing"),
            contents: "/existing-1 /existing-2\n/existing-2 /existing-3".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(
            redirects.parse_errors.is_empty(),
            "No parse errors expected"
        );

        // Add a new redirect that creates a loop with existing redirects
        let rules = RedirectsSource {
            path: Path::new("new"),
            contents: "/existing-3 /existing-1".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        // Now verify the loop is detected
        let result = redirects.check_for_loops();
        assert!(
            result.is_err(),
            "Loop should be detected after adding new rule"
        );

        // Verify error message contains the full loop path
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("/existing-1"),
            "Error should mention existing-1"
        );
        assert!(
            err_msg.contains("/existing-2"),
            "Error should mention existing-2"
        );
        assert!(
            err_msg.contains("/existing-3"),
            "Error should mention existing-3"
        );
    }

    #[test]
    fn test_self_referential_loop() {
        // Create a redirect map with a self-referential loop
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("new"),
            contents: "/self-loop /self-loop".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(
            !redirects.parse_errors.is_empty(),
            "Self-loop should be detected"
        );

        assert_eq!(
            redirects.parse_errors[0].line_no, 0,
            "Error should mention correct line"
        );
    }

    #[test]
    fn test_no_loops() {
        // Create a redirect map with redirects that don't form a loop
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/start /middle\n/middle /end".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        // Verify that no loop is detected
        assert!(
            redirects.parse_errors.is_empty(),
            "No loop should be detected in a valid redirect chain"
        );
    }

    #[test]
    fn test_update_redirects_with_loop() {
        // Create input streams with redirects that will form a loop
        let existing_content = vec![RedirectsSource {
            path: Path::new("existing"),
            contents: format!("{GENERATED_FILE_HEADER}\n/path-x /path-y\n/path-y /path-z"),
        }];
        let new_content = RedirectsSource {
            path: Path::new("new"),
            contents: "/path-z /path-x".to_string(), // This creates a loop with existing redirects
        };

        let new_sources = vec![new_content];

        // Attempt to update redirects
        let result = RedirectsMap::build(
            &existing_content,
            &new_sources,
            302,
            &ValidationBehaviors::default(),
        );

        // Verify the operation fails due to loop detection
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("Loops detected"),
            "Error should mention loop detection"
        );
        assert!(err_msg.contains("/path-x"), "Error should mention path-x");
        assert!(err_msg.contains("/path-y"), "Error should mention path-y");
        assert!(err_msg.contains("/path-z"), "Error should mention path-z");
    }

    #[test]
    fn test_multiple_files_creating_loop() {
        // Create input streams with redirects that will form a loop across multiple files
        let existing_content = vec![RedirectsSource {
            path: Path::new("existing"),
            contents: format!("{GENERATED_FILE_HEADER}\n/start /middle"),
        }];
        let new_content1 = RedirectsSource {
            path: Path::new("new1"),
            contents: "/middle /next".to_string(),
        };
        let new_content2 = RedirectsSource {
            path: Path::new("new2"),
            contents: "/next /start".to_string(),
        };

        let new_readers = vec![new_content1, new_content2];

        // Attempt to update redirects
        let result = RedirectsMap::build(
            &existing_content,
            &new_readers,
            302,
            &ValidationBehaviors::default(),
        );

        // Verify the operation fails due to loop detection
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("Loops detected"),
            "Error should mention loop detection"
        );
        assert!(err_msg.contains("/start"), "Error should mention /start");
        assert!(err_msg.contains("/middle"), "Error should mention /middle");
        assert!(err_msg.contains("/next"), "Error should mention /next");
    }

    #[test]
    fn test_update_redirects_no_loop() {
        // Create input streams with redirects that won't form a loop
        let existing_content = vec![RedirectsSource {
            path: Path::new("existing"),
            contents: format!("{GENERATED_FILE_HEADER}\n/old /new\n/old/page /new/page"),
        }];
        let new_content = RedirectsSource {
            path: Path::new("existing"),
            contents: "/another /destination\n/yet-another /final".to_string(), // This creates a loop with existing redirects
        };

        let new_sources = vec![new_content];

        // Attempt to update redirects
        let result = RedirectsMap::build(
            &existing_content,
            &new_sources,
            302,
            &ValidationBehaviors::default(),
        );

        // Verify the operation succeeds
        assert!(
            result.is_ok(),
            "Redirect update should succeed when no loops exist"
        );
        let redirects = result.unwrap();
        assert_eq!(redirects.map.len(), 4, "Combined map should have 4 entries");
    }

    #[test]
    fn test_invalid_line_behavior_error() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("invalid"),
            contents: "/valid /target\ninvalid line\n/another /valid".to_string(),
        };
        let behaviors = ValidationBehaviors {
            invalid_lines: ValidationBehavior::Error,
            ..Default::default()
        };
        redirects.add_rules(&rules, &behaviors);
        assert_eq!(redirects.map.len(), 2); // Should parse valid lines
        assert_eq!(redirects.parse_errors.len(), 1); // Should have one error
        assert_eq!(
            redirects.parse_errors[0].reason.severity,
            ValidationBehavior::Error
        );
        assert!(
            redirects.parse_errors[0]
                .reason
                .message
                .contains("Invalid format")
        );
    }

    #[test]
    fn test_invalid_line_behavior_warn() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("invalid"),
            contents: "/valid /target\ninvalid line\n/another /valid".to_string(),
        };
        let behaviors = ValidationBehaviors {
            invalid_lines: ValidationBehavior::Warn,
            ..Default::default()
        };
        redirects.add_rules(&rules, &behaviors);
        assert_eq!(redirects.map.len(), 2); // Should parse valid lines
        assert_eq!(redirects.parse_errors.len(), 1); // Should have one warning
        assert_eq!(
            redirects.parse_errors[0].reason.severity,
            ValidationBehavior::Warn
        );
    }

    #[test]
    fn test_invalid_line_behavior_ignore() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("invalid"),
            contents: "/valid /target\ninvalid line\n/another /valid".to_string(),
        };
        let behaviors = ValidationBehaviors {
            invalid_lines: ValidationBehavior::Ignore,
            ..Default::default()
        };
        redirects.add_rules(&rules, &behaviors);
        assert_eq!(redirects.map.len(), 2); // Should parse valid lines
        assert_eq!(
            redirects
                .parse_errors
                .iter()
                .filter(|e| e.reason.severity != ValidationBehavior::Ignore)
                .count(),
            0
        ); // Should ignore the error
    }

    #[test]
    fn test_self_loop_behavior_error() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("self_loop"),
            contents: "/a /a".to_string(),
        };
        let behaviors = ValidationBehaviors {
            self_loops: ValidationBehavior::Error,
            ..Default::default()
        };
        redirects.add_rules(&rules, &behaviors);
        assert!(redirects.map.is_empty()); // Rule should not be added
        assert_eq!(redirects.parse_errors.len(), 1);
        assert_eq!(
            redirects.parse_errors[0].reason.severity,
            ValidationBehavior::Error
        );
    }

    #[test]
    fn test_is_valid_redirect_source() {
        assert!(is_valid_redirect_source("/valid/path"));
        assert!(is_valid_redirect_source("/"));
        assert!(is_valid_redirect_source("/path?query=1"));
        assert!(!is_valid_redirect_source("invalid/path")); // Must start with /
        assert!(!is_valid_redirect_source("https://example.com/path")); // Must be relative
        assert!(is_valid_redirect_source("/path%20with%20space")); // Encoded spaces are ok
    }

    #[test]
    fn test_is_valid_redirect_target() {
        assert!(is_valid_redirect_target("/valid/relative/path"));
        assert!(is_valid_redirect_target("https://absolute.url/path"));
        assert!(is_valid_redirect_target(
            "http://absolute.url/path?query=1#fragment"
        ));
        assert!(!is_valid_redirect_target("invalid-relative-path")); // Relative must start with /
        assert!(!is_valid_redirect_target("ftp://invalid.scheme")); // Only http/https schemes for absolute URLs
        assert!(!is_valid_redirect_target("/<with>invalid|chars")); // Invalid chars
        assert!(is_valid_redirect_target("/path%20with%20space")); // Encoded chars ok
    }

    #[test]
    fn test_chain_shortening() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("chains"),
            contents: "/a /b\n/b /c\n/c /d\n/x /y\n/y /z".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(redirects.parse_errors.is_empty());

        redirects.shorten_chains().unwrap();

        assert_eq!(redirects.map.get("/a").unwrap().to, "/d");
        assert_eq!(redirects.map.get("/b").unwrap().to, "/d"); // Intermediate steps also point to final
        assert_eq!(redirects.map.get("/c").unwrap().to, "/d");
        assert_eq!(redirects.map.get("/x").unwrap().to, "/z");
        assert_eq!(redirects.map.get("/y").unwrap().to, "/z");
    }

    #[test]
    fn test_write_to_file_include_existing() -> Result<()> {
        let dir = tempdir()?;
        let existing_path = dir.path().join("existing.txt");
        let new_path = dir.path().join("new.txt");
        let output_path = dir.path().join("output.txt");

        let existing_content = format!("{GENERATED_FILE_HEADER}\n/old /intermediate");
        let new_content = "/intermediate /new\n/another /rule";
        std::fs::write(&existing_path, &existing_content)?;
        std::fs::write(&new_path, new_content)?;

        let args = Args {
            rule_files: RuleFiles {
                existing_rules: vec![existing_path.clone()],
                add_rules: vec![new_path.clone()],
            },
            default_status_code: 302,
            output: Output {
                output_dir: dir.path().to_path_buf(),
                rules_output_file: "output.txt".to_string(),
                encoded_sources: "sources.fst".to_string(),
                encoded_targets: "targets.fcsd".to_string(),
            },
            include_existing: true,
            behaviors: ValidationBehaviors::default(),
        };

        run(&args)?;

        let output_content = read_to_string(&output_path)?;
        let lines: HashSet<&str> = output_content.lines().collect();

        assert!(lines.contains(GENERATED_FILE_HEADER));
        assert!(lines.contains("/another /rule"));
        assert!(lines.contains("/intermediate /new"));
        assert!(lines.contains("/old /new")); // Shortened chain
        assert_eq!(lines.len(), 4); // Header + 3 rules

        Ok(())
    }

    #[test]
    fn test_write_to_file_exclude_existing() -> Result<()> {
        let dir = tempdir()?;
        let existing_path = dir.path().join("existing.txt");
        let new_path = dir.path().join("new.txt");
        let output_path = dir.path().join("output.txt");

        let existing_content = format!("{GENERATED_FILE_HEADER}\n/old /intermediate");
        let new_content = "/intermediate /new\n/another /rule"; // /intermediate /new updates existing chain
        std::fs::write(&existing_path, &existing_content)?;
        std::fs::write(&new_path, new_content)?;

        let args = Args {
            rule_files: RuleFiles {
                existing_rules: vec![existing_path.clone()],
                add_rules: vec![new_path.clone()],
            },
            default_status_code: 302,
            output: Output {
                output_dir: dir.path().to_path_buf(),
                rules_output_file: "output.txt".to_string(),
                encoded_sources: "sources.fst".to_string(),
                encoded_targets: "targets.fcsd".to_string(),
            },
            include_existing: false, // Default, but explicit here
            behaviors: ValidationBehaviors::default(),
        };

        run(&args)?;

        let output_content = read_to_string(&output_path)?;
        let mut lines = output_content.lines();

        assert_eq!(lines.next().unwrap(), GENERATED_FILE_HEADER);
        assert_eq!(lines.next().unwrap(), "/another /rule"); // New rule is present
        assert_eq!(lines.next().unwrap(), "/intermediate /new"); // New rule is present
        assert_eq!(lines.next().unwrap(), "/old /new"); // Updated rule (from chain shortening) is present
        assert_eq!(lines.next(), None); // No more lines

        Ok(())
    }

    #[test]
    fn test_write_to_file_no_new_rules_exclude_existing() -> Result<()> {
        let dir = tempdir()?;
        let existing_path = dir.path().join("existing.txt");
        let new_path = dir.path().join("new.txt"); // Empty new rules file
        let output_path = dir.path().join("output.txt");

        let existing_content = format!("{GENERATED_FILE_HEADER}\n/old /intermediate");
        std::fs::write(&existing_path, &existing_content)?;
        std::fs::write(&new_path, "")?; // Empty new rules

        let args = Args {
            rule_files: RuleFiles {
                existing_rules: vec![existing_path.clone()],
                add_rules: vec![new_path.clone()],
            },
            default_status_code: 302,
            output: Output {
                output_dir: dir.path().to_path_buf(),
                rules_output_file: "output.txt".to_string(),
                encoded_sources: "sources.fst".to_string(),
                encoded_targets: "targets.fcsd".to_string(),
            },
            include_existing: false,
            behaviors: ValidationBehaviors::default(),
        };

        // Run should not succeed, because providing rules to add signaled that an update should happen.
        let run_result = run(&args);
        assert!(run_result.is_err()); // The overall run succeeds (FST/FCSD generated)

        // Check that the output file was NOT created or is empty because write_to_file errored internally
        assert!(!output_path.exists() || read_to_string(&output_path)?.is_empty());

        Ok(())
    }

    #[test]
    fn test_inline_comments() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("comments"),
            contents: "/valid /target # This is a comment\n/another /valid  # Comment with spaces\n# Just a comment line\n/no-comment /here".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(
            redirects.parse_errors.is_empty(),
            "No errors expected with valid comments"
        );
        assert_eq!(redirects.map.len(), 3, "Should parse 3 valid rules");
        assert!(redirects.map.contains_key("/valid"));
        assert_eq!(redirects.map.get("/valid").unwrap().to, "/target");
        assert!(redirects.map.contains_key("/another"));
        assert_eq!(redirects.map.get("/another").unwrap().to, "/valid");
        assert!(redirects.map.contains_key("/no-comment"));
        assert_eq!(redirects.map.get("/no-comment").unwrap().to, "/here");
    }

    #[test]
    fn test_inline_comment_invalid_rule() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("invalid_comment"),
            contents: "/invalid # comment".to_string(),
        };
        let behaviors = ValidationBehaviors {
            invalid_lines: ValidationBehavior::Warn, // Warn to check the error message
            ..Default::default()
        };
        redirects.add_rules(&rules, &behaviors);
        assert!(redirects.map.is_empty(), "Invalid rule should not be added");
        assert_eq!(
            redirects.parse_errors.len(),
            1,
            "Should have one parse error"
        );
        assert_eq!(
            redirects.parse_errors[0].reason.severity,
            ValidationBehavior::Warn
        );
        assert!(
            redirects.parse_errors[0]
                .reason
                .message
                .contains("Missing target")
        );
        assert_eq!(redirects.parse_errors[0].line, "/invalid # comment");
    }

    #[test]
    fn test_hash_in_path_not_a_comment() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("hash_path"),
            contents: "/path#frag /target".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(redirects.map.is_empty(), "Invalid rule should not be added");
        assert_eq!(
            redirects.parse_errors.len(),
            1,
            "Should have one parse error"
        );
        assert!(
            redirects.parse_errors[0]
                .reason
                .message
                .contains("Missing target")
        );
    }

    #[test]
    fn test_parse_line_with_status_code() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/source /target 301\n/source2 /target2".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert_eq!(redirects.map.get("/source").unwrap().status_code, 301);
        assert_eq!(redirects.map.get("/source2").unwrap().status_code, 302); // Default
    }

    #[test]
    fn test_invalid_status_codes() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/source /target abc\n/source2 /target2 200\n/source3 /target3 600"
                .to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        // Status code abc is non-numeric - should be an error
        assert!(!redirects.map.contains_key("/source"));

        // Status code 200 is valid HTTP but not a redirect - should be an error
        assert!(!redirects.map.contains_key("/source2"));

        // Status code 600 is out of range - should be an error
        assert!(!redirects.map.contains_key("/source3"));

        // Check we have 3 parse errors
        assert_eq!(redirects.parse_errors.len(), 3);
    }

    #[test]
    fn test_valid_redirect_status_codes() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/source1 /target1 301\n/source2 /target2 302\n/source3 /target3 307\n/source4 /target4 308".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        assert_eq!(redirects.map.get("/source1").unwrap().status_code, 301);
        assert_eq!(redirects.map.get("/source2").unwrap().status_code, 302);
        assert_eq!(redirects.map.get("/source3").unwrap().status_code, 307);
        assert_eq!(redirects.map.get("/source4").unwrap().status_code, 308);
        assert_eq!(redirects.map.len(), 4);
        assert_eq!(redirects.parse_errors.len(), 0);
    }

    #[test]
    fn test_status_codes_in_file_output() -> Result<()> {
        let dir = tempdir()?;
        let output_path = dir.path().join("output.txt");

        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("test"),
            contents: "/source1 /target1 301\n/source2 /target2".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        redirects.write_to_file(&output_path, None)?;

        let output_content = read_to_string(&output_path)?;
        let lines: Vec<&str> = output_content.lines().collect();

        assert!(lines.contains(&"/source1 /target1 301"));
        assert!(lines.contains(&"/source2 /target2")); // Default 302 is omitted

        Ok(())
    }

    #[test]
    fn test_status_codes_with_chain_shortening() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("chains"),
            contents: "/a /b 301\n/b /c 301\n/c /d 301".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());
        assert!(redirects.parse_errors.is_empty());

        redirects.shorten_chains().unwrap();

        // Verify the shortened chains use the status code from the final target
        assert_eq!(redirects.map.get("/a").unwrap().to, "/d");
        assert_eq!(redirects.map.get("/a").unwrap().status_code, 301);

        assert_eq!(redirects.map.get("/b").unwrap().to, "/d");
        assert_eq!(redirects.map.get("/b").unwrap().status_code, 301);
    }

    #[test]
    fn test_mixed_status_codes_and_defaults() {
        let mut redirects = RedirectsMap::new(302);
        let rules = RedirectsSource {
            path: Path::new("mixed"),
            contents: "/page1 /page2\n/page2 /page3 301\n/page3 /page4\n/page4 /page5".to_string(),
        };
        redirects.add_rules(&rules, &ValidationBehaviors::default());

        assert_eq!(redirects.map.get("/page1").unwrap().status_code, 302); // Default
        assert_eq!(redirects.map.get("/page2").unwrap().status_code, 301); // Explicit
        assert_eq!(redirects.map.get("/page3").unwrap().status_code, 302); // Default
        assert_eq!(redirects.map.get("/page4").unwrap().status_code, 302); // Explicit

        redirects.shorten_chains().unwrap();

        // First rule isn't eliminated because it has a different status code
        assert_eq!(redirects.map.get("/page1").unwrap().to, "/page2");
        assert_eq!(redirects.map.get("/page1").unwrap().status_code, 302);

        // Same for the second rule
        assert_eq!(redirects.map.get("/page2").unwrap().to, "/page3");
        assert_eq!(redirects.map.get("/page2").unwrap().status_code, 301);

        // The third and fourth rules use the same status code, so the chain is shortened
        assert_eq!(redirects.map.get("/page3").unwrap().to, "/page5");
        assert_eq!(redirects.map.get("/page3").unwrap().status_code, 302);
    }

    #[test]
    fn test_custom_status_code_serialization() -> Result<()> {
        let dir = tempdir()?;
        let existing_path = dir.path().join("existing.txt");
        let new_path = dir.path().join("new.txt");
        let output_path = dir.path().join("output.txt");

        let existing_content = format!("{GENERATED_FILE_HEADER}\n/old /intermediate 301");
        let new_content = "/intermediate /new 308\n/another /rule 307";
        std::fs::write(&existing_path, &existing_content)?;
        std::fs::write(&new_path, new_content)?;

        let args = Args {
            rule_files: RuleFiles {
                existing_rules: vec![existing_path.clone()],
                add_rules: vec![new_path.clone()],
            },
            default_status_code: 302,
            output: Output {
                output_dir: dir.path().to_path_buf(),
                rules_output_file: "output.txt".to_string(),
                encoded_sources: "sources.fst".to_string(),
                encoded_targets: "targets.fcsd".to_string(),
            },
            include_existing: true,
            behaviors: ValidationBehaviors::default(),
        };

        run(&args)?;

        let output_content = read_to_string(&output_path)?;
        let lines: HashSet<&str> = output_content.lines().collect();

        // No shortening because of different status codes, so all rules should be present
        assert!(lines.contains("/old /intermediate 301"));
        assert!(lines.contains("/intermediate /new 308"));
        assert!(lines.contains("/another /rule 307"));

        Ok(())
    }
}
