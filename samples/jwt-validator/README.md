# JSON Web Token (JWT) Validator

This folder contains a Spin application which is able to validate JWT tokens issued by any OAuth 2.0 & OpenID Connect compliant Identity Provider (or Token Issuer). 

For demonstration purposes, the Spin app responds with a HTTP status code `200` if the token is valid. Otherwise, it returns a `401` and provides detailed information about what is invalid as the response payload. In a real-world setting, this could be combined with request teeing and forward requests to the actual origin, if the presented token is valid.

## Exposed Endpoints

The application exposes two endpoints:

- `POST /validate`: Which is using a pre-configured validation setting
- `POST /validate-with-options`: Which accepts validation options as JSON payload 

Invoking the `/validate` endpoint (and presenting a JWT using the standard `Authorization` header), the following aspects of the JWT token are validated:

- Correct JWT format
- Ensure JWT integrity
- Ensure token is not expired
- Ensure token is already valid (NBF)

## Optional Validation

- Validating Token Types
- Validating Token Issuer
- Validating audiences
- Validating scopes
- Validating claim existence


## Demo Flow

### Requesting JWT Tokens

```console
# requesting a token using the customer-client
customer_token=$(curl -H 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=client_credentials' \
--data-urlencode 'client_id=customer-client' \
--data-urlencode 'client_secret=511536EF-F270-4058-80CA-1C89C192F69A' \
--data-urlencode 'scope=customer.read' https://idsrv.purplesky-721836c2.eastus.azurecontainerapps.io/connect/token | jq -r .access_token)

# requesting a token using the invoice-client
invoice_token=$(curl -H 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=client_credentials' \
--data-urlencode 'client_id=invoice-client' \
--data-urlencode 'client_secret=511536EF-F270-4058-80CA-1C89C192F69A' \
--data-urlencode 'scope=invoice.read' https://idsrv.purplesky-721836c2.eastus.azurecontainerapps.io/connect/token | jq -r .access_token)
```

### Compiling the Spin application

```console
spin build
```

### Validating JWT Tokens

Once the Spin application is deployed, store the application URL in an environment variable called `APP_URL`:

```console
export APP_URL=https://foo.bar
```

At this point, you can sent requests to the Spin application, to get execute validation of the presented JWT token:

```console
# Validate customer-client token
# This token is invalid
curl -iX POST -H "Authorization: bearer $customer_token" $APP_URL/validate 

# Validating invoice-client token
# This token is valid
curl -iX POST -H "Authorization: bearer $invoice_token"  $APP_URL/validate
```

### Validating JWT Tokens with individual Options

To validate a JWT token with custom validation options, sent a `POST` request to `/validate-with-options` as shown below:

```jsonc
// Customize JWT Validation behavior
{   
    expectedAudience: ["invoice"],
    expectedIssuer: "https://idsrv.purplesky-721836c2.eastus.azurecontainerapps.io",
    expectedTokenType: "at+jwt",
    expectedScopes: ["invoice.read"],
    expectedClaims: ["client_app_type"]
}
```

```console
# Request a token
third_token=$(curl -H 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'grant_type=client_credentials' \
--data-urlencode 'client_id=customer-client' \
--data-urlencode 'client_secret=511536EF-F270-4058-80CA-1C89C192F69A' \
https://idsrv.purplesky-721836c2.eastus.azurecontainerapps.io/connect/token | jq -r .access_token)

curl --location $APP_URL/validate-with-options \
-H "Authorization: bearer $third_token" \
-H 'Content-Type: application/json' \
--data '{
    "expectedAudience": ["customer"],
    "expectedIssuer": "https://idsrv.purplesky-721836c2.eastus.azurecontainerapps.io",
    "expectedTokenType": "at+jwt",
    "expectedScopes": ["customer.read", "manage"],
    "expectedClaims": ["client_app_type"]
}'
```
