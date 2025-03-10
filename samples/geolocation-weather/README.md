# Geolocation Weather Application

This sample illustrates how to fetch weather data from an API based on the user's geolocation data. Behind the scenes, ip-api.com is used to look up the latitude, longitude coordinates using the client's IP address and aqicn.org is used to fetch weather data.

## Prerequisites

- Spin CLI
- Spin `aka` plugin
- WAQI API token from [https://aqicn.org/api/](https://aqicn.org/api/)

## Deploy to FWF

Once you've cloned the repository and moved to the ./samples/geolocation-weather, install the dependencies, build and run the app:

```console
spin build
spin aka deploy --variable waqi_api_token=<your_api_token_here>
```

The `spin aka deploy` command will print the application URL to `stdout`.

Use the browser to see application running at the address printed.

## Running locally

When testing locally, this sample will use a default IP address instead of 127.0.0.1 for the client IP address which can be overriden for test purposes on the CLI.

```console
spin build
SPIN_VARIABLE_WAQI_API_TOKEN=<your_api_token_here> spin up
```

To test with a specific client ip address:

```console
SPIN_VARIABLE_TEST_IP_ADDR=<client_ip_here> \
SPIN_VARIABLE_WAQI_API_TOKEN=<your_api_token_here> spin up
```
