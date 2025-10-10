# Deploying FWF Apps per Source URL Domain

## Configure Python Environment and Dependencies

```py
python3 -m venv .venv
source .venv/bin/activate
python3 pip install -r requirements.txt
```

## Configuring fallbacks

The redirect app consumes a JSON file which describes a set of default redirects for request paths with certain prefixes. This is useful for handling requests that do not match any of the explicit redirect rules. The JSON file should be an array of objects, each with a "prefix" and "target" field. For example:

```json
[
    {"prefix": "/blog", "target": "https://blog.example.com"},
    {"prefix": "/shop", "target": "https://shop.example.com"},
    {"prefix": "/docs", "target": "https://docs.example.com"}
]
```

This configuration means that any request path starting with "/blog" will be redirected to "https://blog.example.com" followed by the rest of the path. Similarly, requests starting with "/shop" and "/docs" will be redirected to their respective targets.

For example, a request to "/blog/post1" will be redirected to "https://blog.example.com/post1". If a request path does not match any of the specified prefixes, the app will return a 404 Not Found response.

## Run the deploy script

Pass your excel document. The bash script leverages `xlsx2txt.py` to convert the excel document into a `redirects.txt` file and then builds and deploys the Fermyon Wasm Function. Also pass in [configured fallbacks](#configuring-fallbacks):

!NOTE: the script currently reusese the same fallbacks.json file for all apps. You may want to modify.

```sh
./deploy-apps.sh data.xlsx fallbacks.json
```

The script deploys many apps from the same repo by using `spin aka app unlink` command to unlink your local workspace from the previously deployed app. To modify an app, link it back to the workspace:

```sh
# remind yourself of the app name
spin aka app list
spin aka app unlink
spin aka app link --app-name $app-name
```