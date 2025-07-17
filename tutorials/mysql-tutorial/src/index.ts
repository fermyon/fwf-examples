import { AutoRouter } from 'itty-router';
import * as Variables from '@spinframework/spin-variables';
import * as Mysql from '@spinframework/spin-mysql';
import { v4 as uuidv4 } from 'uuid';
import { validate as uuidValidate } from 'uuid';

const router = AutoRouter();
const decoder = new TextDecoder();

// define application constants
const SQL_CREATE = "INSERT INTO Products (Id, Name, Price) VALUES (?, ?, ?)";
const SQL_READ_ALL = "SELECT Id, Name, Price from Products ORDER BY Name";
const SQL_READ_BY_ID = "SELECT Id, Name, Price from Products WHERE Id = ?";
const SQL_UPDATE_BY_ID = "UPDATE Products SET Name = ?, Price = ? WHERE Id = ?";
const SQL_DELETE_BY_ID = "DELETE FROM Products WHERE Id = ?";
const DEFAULT_HEADERS = {
  "content-type": "application/json"
};

// helper function to quickly respond with an HTTP 400
function badRequest(message: string) {
  return new Response(JSON.stringify({ message }), { status: 400, headers: DEFAULT_HEADERS });
}

// helper function to quickly respond with a 404
function notFound(message: string) {
  return new Response(JSON.stringify({ message }), { status: 404, headers: DEFAULT_HEADERS });
}

// Layout the HTTP API

router
  // C(reate) -> Add a new product
  .post("/products", async (request, { connectionString }) => createProduct(await request.arrayBuffer(), connectionString))
  // R(ead) -> Read all products
  .get("/products", async (_, { connectionString }) => readAllProducts(connectionString))
  // R(ead) -> Read a single product using its identifier
  .get("/products/:id", async ({ params }, { connectionString }) => readProductById(params.id, connectionString))
  // U(pdate) -> Update a product using its identifier
  .put("/products/:id", async (request, { connectionString }) => updateProductById(request.params.id, await request.arrayBuffer(), connectionString))
  // D(elete) -> Delete a product using its identifier
  .delete("/products/:id", async ({ params }, { connectionString }) => deleteProductById(params.id, connectionString))
  .all("*", () => notFound("Endpoint not found"));

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
  // if the connection string is not set, return early with a HTTP 500
  const connectionString = Variables.get("mysql_connection_string");
  if (!connectionString) {
    event.respondWith(new Response(
      JSON.stringify({ message: "Connection String not specified" }),
      { status: 500, headers: DEFAULT_HEADERS }
    ));
  }

  // Let the HTTP router handle incoming requests
  // pass the connection string as extra
  event.respondWith(router.fetch(event.request, { connectionString }));
});

function createProduct(requestBody: ArrayBuffer, connectionString: string) {

  // validate the request payload
  let payload = JSON.parse(decoder.decode(requestBody));

  // if payload does not match the expectations, return early by sending an HTTP 400 
  if (!payload || !payload.name || typeof payload.price != "number") {
    return badRequest("Invalid payload received. Expecting {\"name\":\"some name\", \"price\": 9.99}");
  }

  // construct a new Product using user provided data and 
  // by rolling a new UUID 
  const newProduct = {
    id: uuidv4(),
    name: payload.name,
    price: payload.price
  };

  // Open the MySQL connection
  const connection = Mysql.open(connectionString);

  // Persist the new product in database
  connection.execute(SQL_CREATE, [newProduct.id, newProduct.name, newProduct.price]);

  // Create an HTTP 201 (Created) response
  let customHeaders = {
    "Location": `/products/${newProduct.id}`
  };
  Object.assign(customHeaders, DEFAULT_HEADERS);

  return new Response(JSON.stringify(newProduct), { status: 201, headers: customHeaders });
}

function readAllProducts(connectionString: string) {
  // open MySQL connection
  const connection = Mysql.open(connectionString);

  // load all products from the database 
  let result = connection.query(SQL_READ_ALL, []);
  // iterate over each row received
  let items = result.rows.map(row => {
    // and construct a TypeScript object containing the data of a particular product
    return {
      id: row["Id"],
      name: row["Name"],
      price: +row["Price"]!.toString()
    };
  });

  // Create an HTTP response with status code 200
  return new Response(JSON.stringify(items), { status: 200, headers: DEFAULT_HEADERS });
}

function readProductById(id: string, connectionString: string) {
  // validate UUID 
  if (!uuidValidate(id)) {
    return badRequest("Invalid identifier received via URL");
  }

  // open MySQL connection
  let connection = Mysql.open(connectionString);

  // retrieve a product using its identifier
  let result = connection.query(SQL_READ_BY_ID, [id]);

  // if we receive 0 rows, respond to the request with an HTTP 404 (Not Found)
  if (result.rows.length == 0) {
    return notFound("Product not found");
  }

  let found = {
    id: result.rows[0]["Id"],
    name: result.rows[0]["Name"],
    price: +result.rows[0]["Price"]!.toString()
  };

  // Create an HTTP 200 response
  return new Response(JSON.stringify(found), { status: 200, headers: DEFAULT_HEADERS });
}

function updateProductById(id: string, requestBody: ArrayBuffer, connectionString: string) {
  // validate UUID 
  if (!uuidValidate(id)) {
    return badRequest("Invalid identifier received via URL");
  }
  // validate the payload
  let payload = JSON.parse(decoder.decode(requestBody));
  if (!payload || !payload.name || typeof payload.price != "number") {
    return badRequest("Invalid payload received. Expecting {\"name\":\"some name\", \"price\": 9.99}");
  }

  // construct the updated product
  const product = {
    id: id,
    name: payload.name,
    price: payload.price
  };

  // open MySQL connection
  const connection = Mysql.open(connectionString);
  connection.execute(SQL_UPDATE_BY_ID, [product.name, product.price, product.id]);

  // construct a HTTP 200 response
  let customHeaders = {
    "Location": `/items/${id}`
  }
  Object.assign(customHeaders, DEFAULT_HEADERS);

  return new Response(JSON.stringify(product), { status: 200, headers: customHeaders });
}

function deleteProductById(id: string, connectionString: string) {
  // validate UUID
  if (!uuidValidate(id)) {
    return badRequest("Invalid identifier received via URL");
  }

  // open MySQL connection
  const connection = Mysql.open(connectionString);
  connection.execute(SQL_DELETE_BY_ID, [id]);

  // construct a HTTP 204 response
  return new Response(null, { status: 204 });
}

