# [FWaFfic](https://5b787b15-5196-4572-8772-abeca0b6e871.aka.fermyon.tech/applications)

A small traffic monitoring application. Its main goal is to demo [traffic splitting](./trafficsplit/).
but can also show a real workload.

### Running the sample

First, set up the GitHub OAuth env:

```bash
# set environment variables for GitHub OAuth
export SPIN_VARIABLE_GITHUB_CLIENT_ID=your_client_id
export SPIN_VARIABLE_GITHUB_CLIENT_SECRET=your_client_secret
export SPIN_VARIABLE_GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback

# set environment variables for Turso database
export SPIN_VARIABLE_DATABASE_URL=your-database-url
export SPIN_VARIABLE_DATABASE_TOKEN=your-database-token
```

You can now deploy your application:

```bash
spin aka deploy \
    --variable database_url=$SPIN_VARIABLE_DATABASE_URL \
    --variable database_token=$SPIN_VARIABLE_DATABASE_TOKEN \
    --variable github_client_id=$SPIN_VARIABLE_GITHUB_CLIENT_ID \
    --variable github_client_secret=$SPIN_VARIABLE_GITHUB_CLIENT_SECRET \
    --variable github_callback_url=$SPIN_VARIABLE_PROD_CALLBACK_URL
```

Then, you can send traffic to your Spin application. It will split the traffic: upstream, and to the logging service, then return
the response from upstream.

You can then see the traffic if you navigate to https://5b787b15-5196-4572-8772-abeca0b6e871.aka.fermyon.tech/applications.
