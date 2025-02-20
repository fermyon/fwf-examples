# Read POST body

This sample illustrates how to read the body of an HTTP POST request.

To test different kinds of data, use `curl` with `-X POST` and the `-H` flag to set the `content-type` header.
To test reading a POSTed HTML form, visit `/form` in your browser, fill out fields, and click the Submit button
(in this case the response will be rendered as JSON).
