use anyhow::*;
use graphql_client::GraphQLQuery;
use spin_sdk::http::{send, IntoResponse, Request, Response, ResponseBuilder};
use spin_sdk::http_component;

#[allow(clippy::upper_case_acronyms)]
type URI = String;

#[derive(GraphQLQuery)]
#[graphql(
    schema_path = "src/schema.graphql",
    query_path = "src/query_1.graphql",
    response_derives = "Debug"
)]
struct RepoView;

/// A simple Spin HTTP component.
#[http_component]
async fn handle_graphql(req: Request) -> Result<impl IntoResponse> {
    let github_api_token =
        spin_sdk::variables::get("gh_api_token").expect("Missing gh_api_token variable");

    let (owner, name) = parse_repo_name(req.path())?;
    let variables = repo_view::Variables {
        owner: owner.to_string(),
        name: name.to_string(),
    };

    let body = RepoView::build_query(variables);
    let body = serde_json::to_string(&body).unwrap();

    let outgoing = Request::post("https://api.github.com/graphql", body)
        .header("user-agent", "graphql-rust")
        .header("content-type", "application/json")
        .header("Authorization", format!("Bearer {}", github_api_token))
        .build();
    let res: Response = send(outgoing).await?;

    let response: graphql_client::Response<repo_view::ResponseData> =
        serde_json::from_slice(res.body()).unwrap();
    let response_data = response.data.expect("missing response data");

    let stars = response_data
        .repository
        .as_ref()
        .map(|repo| repo.stargazers.total_count);
    match stars {
        Some(stars) => {
            let resp = ResponseBuilder::new(200)
                .body(render_stargazers(stars, owner, name))
                .header("content-type", "text/html")
                .build();
            Ok(resp)
        }
        None => {
            let resp = ResponseBuilder::new(404)
                .body(format!("Repository {}/{} not found", owner, name))
                .header("content-type", "text/plain")
                .build();
            Ok(resp)
        }
    }
}

fn parse_repo_name(repo_name: &str) -> Result<(&str, &str), anyhow::Error> {
    let mut parts = repo_name.split('/').skip(1);
    match (parts.next(), parts.next()) {
        (Some(owner), Some(name)) => Ok((owner, name)),
        _ => Err(format_err!("wrong format for the repository name param (we expect something like spinframework/spin)"))
    }
}

fn render_stargazers(stars: i64, org: &str, repo: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Stargazers for {org}/{repo}</title>
  </head>
  <body>
    <h1>Stargazers for {org}/{repo}</h1>
    <p>This repository has 🌟{stars}🌟 stars.</p>
  </body>
</html>
"#
    )
}
