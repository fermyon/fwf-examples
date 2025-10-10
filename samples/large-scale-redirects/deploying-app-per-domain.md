# Deploying FWF Apps per Source URL Domain

## Configure Python Environment and Dependencies

```py
python3 -m venv .venv
source .venv/bin/activate
python3 pip install -r requirements.txt
```

## Run the deploy script

Pass your excel document. The bash script leverages `xlsx2txt.py` to convert the excel document into a `redirects.txt` file and then builds and deploys the Fermyon Wasm Function

```sh
./deploy-apps.sh data.xlsx
```

The script deploys many apps from the same repo by using `spin aka app unlink` command to unlink your local workspace from the previously deployed app. To modify an app, link it back to the workspace:

```sh
# remind yourself of the app name
spin aka app list
spin aka app unlink
spin aka app link --app-name $app-name
```