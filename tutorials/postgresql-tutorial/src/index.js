// https://itty.dev/itty-router/routers/autorouter
import { AutoRouter } from 'itty-router';
import * as Variables from '@spinframework/spin-variables';
import * as Postgres from '@spinframework/spin-postgres';
import { v4 as uuidv4 } from 'uuid';
import { validate as uuidValidate } from 'uuid';


const decoder = new TextDecoder();
let router = AutoRouter();

// Route ordering matters, the first route that matches will be used
// Any route that does not return will be treated as a middleware
// Any unmatched route will return a 404
router
    .post("/products", async (request, { connectionString }) => createProduct(await request.arrayBuffer(), connectionString))
    .get("/products", async (_, { connectionString }) => readAllProducts(connectionString))
    .get("/products/:id", async ({ params }, { connectionString }) => readProductById(params.id, connectionString))
    .put("/products/:id", async (request, { connectionString }) => updateProductById(request.params.id, await request.arrayBuffer(), connectionString))
    .delete("/products/:id", async ({ params }, { connectionString }) => deleteProductById(params.id, connectionString));

addEventListener('fetch', async (event) => {
    const connectionString = Variables.get("pg_connection_string");
    if (!connectionString) {
        event.respondWith(new Response(JSON.stringify({ message: "Connection String not specified" }), { status: 500, headers: DEFAULT_HEADERS }));
    }
    event.respondWith(router.fetch(event.request, { connectionString }));
});

const SQL_CREATE = "INSERT INTO Products (Id, Name, Price) VALUES ($1, $2, $3)";
const SQL_READ_ALL = "SELECT Id, Name, Price from Products ORDER BY Name";
const SQL_READ_BY_ID = "SELECT Id, Name, Price from Products WHERE Id = $1";
const SQL_UPDATE_BY_ID = "UPDATE Products SET Name = $1, Price = $2 WHERE Id = $3";
const SQL_DELETE_BY_ID = "DELETE FROM Products WHERE Id = $1";

const DEFAULT_HEADERS = {
    "content-type": "application/json"
};

function badRequest(message) {
    return new Response(JSON.stringify({ message }), { status: 400, headers: DEFAULT_HEADERS });
}

function notFound(message) {
    return new Response(JSON.stringify({ message }), { status: 404, headers: DEFAULT_HEADERS });
}

function readAllProducts(connectionString) {
    const connection = Postgres.open(connectionString);
    let result = connection.query(SQL_READ_ALL, []);
    let items = result.rows.map(row => {
        return {
            id: row["id"],
            name: row["name"],
            price: +row["price"]
        };
    });

    return new Response(JSON.stringify(items), { status: 200, headers: DEFAULT_HEADERS });
}

function readProductById(id, connectionString) {
    if (!uuidValidate(id)) {
        return badRequest("Invalid identifier received via URL");
    }
    let connection = Postgres.open(connectionString);
    let result = connection.query(SQL_READ_BY_ID, [id]);
    if (result.rows.length == 0) {
        return notFound("Product not found");
    }
    let found = {
        id: result.rows[0]["id"],
        name: result.rows[0]["name"],
        price: +result.rows[0]["price"]
    };

    return new Response(JSON.stringify(found), { status: 200, headers: DEFAULT_HEADERS });
}

function createProduct(requestBody, connectionString) {
    let payload = JSON.parse(decoder.decode(requestBody));
    if (!payload || !payload.name || typeof payload.price != "number") {
        return badRequest("Invalid payload received. Expecting {\"name\":\"some name\", \"price\": 9.99}");
    }

    const newProduct = {
        id: uuidv4(),
        name: payload.name,
        price: payload.price
    };

    const connection = Postgres.open(connectionString);
    connection.execute(SQL_CREATE, [newProduct.id, newProduct.name, newProduct.price]);

    let customHeaders = {
        "Location": `/products/${newProduct.id}`
    };
    Object.assign(customHeaders, DEFAULT_HEADERS);

    return new Response(JSON.stringify(newProduct), { status: 201, headers: customHeaders });
}

function updateProductById(id, requestBody, connectionString) {
    if (!uuidValidate(id)) {
        return badRequest("Invalid identifier received via URL");
    }
    let payload = JSON.parse(decoder.decode(requestBody));
    if (!payload || !payload.name || typeof payload.price != "number") {
        return badRequest("Invalid payload received. Expecting {\"name\":\"some name\", \"price\": 9.99}");
    }

    const product = {
        id: id,
        name: payload.name,
        price: payload.price
    };
    const connection = Postgres.open(connectionString);
    const updatedRows = connection.execute(SQL_UPDATE_BY_ID, [product.name, product.price, product.id]);
    if (updatedRows == 0) {
        return notFound("Product not found");
    }
    let customHeaders = {
        "Location": `/items/${id}`
    }
    Object.assign(customHeaders, DEFAULT_HEADERS);

    return new Response(JSON.stringify(product), { status: 200, headers: customHeaders });
}

function deleteProductById(id, connectionString) {
    if (!uuidValidate(id)) {
        return badRequest("Invalid identifier received via URL");
    }
    const connection = Postgres.open(connectionString);
    const deletedRows = connection.execute(SQL_DELETE_BY_ID, [id]);
    if (deletedRows == 0) {
        return notFound("Product not found");
    }
    return new Response(null, { status: 204 });
}