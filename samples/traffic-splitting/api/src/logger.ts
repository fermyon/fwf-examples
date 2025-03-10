import { Db, UniqueConstraintError } from './db';
import { Hono } from 'hono';
import { RequestIdVariables } from 'hono/request-id';
import { AppsService } from './apps';
import { GitHubUser } from './auth/github';

export class LoggerService {
    private db: Db;

    constructor(db: Db) {
        this.db = db;
    }

    async logRequest(request: RequestMetadata) {
        const sql = `
            INSERT INTO requests (id, app_id, timestamp, url, method, headers, body_length)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.execute(sql, [
            request.id,
            request.appId,
            request.timestamp,
            request.url,
            request.method,
            JSON.stringify(request.headers),
            request.bodyLength
        ]);
    }

    async getRequests(filter: RequestFilter): Promise<RequestMetadata[]> {
        let sql = `
            SELECT id, app_id as appId, timestamp, url, method, headers, body_length as bodyLength 
            FROM requests 
            WHERE app_id = ?
        `;
        const params: Array<string | number> = [filter.appId];

        if (filter.fromTimestamp) {
            sql += ` AND timestamp >= ?`;
            params.push(filter.fromTimestamp);
        }

        sql += ` ORDER BY timestamp DESC`;

        if (filter.limit) {
            sql += ` LIMIT ?`;
            params.push(filter.limit);
        }

        const requests = await this.db.query<RequestMetadata>(sql, params);

        return requests.map(req => ({
            ...req,
            headers: JSON.parse(req.headers as unknown as string)
        }));
    }

    async deleteRequests(appId: string) {
        await this.db.execute('DELETE FROM requests WHERE app_id = ?', [appId]);
    }

    async logResponse(response: ResponseMetadata) {
        const sql = `
            INSERT INTO responses (id, request_id, app_id, timestamp, status_code, headers, body_length)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.execute(sql, [
            response.id,
            response.requestId,
            response.appId,
            response.timestamp,
            response.statusCode,
            JSON.stringify(response.headers),
            response.bodyLength
        ]);
    }

    async getResponse(requestId: string): Promise<ResponseMetadata | null> {
        const sql = `
            SELECT 
                id,
                request_id as requestId,
                app_id as appId,
                timestamp,
                status_code as statusCode,
                headers,
                body_length as bodyLength
            FROM responses 
            WHERE request_id = ?
        `;

        const responses = await this.db.query<ResponseMetadata>(sql, [requestId]);
        if (responses.length === 0) return null;

        return {
            ...responses[0],
            headers: JSON.parse(responses[0].headers as unknown as string)
        };
    }

    async getResponses({ appId, fromTimestamp, limit = 100 }: {
        appId: string,
        fromTimestamp?: string,
        limit?: number
    }) {
        let query = `
            SELECT id, request_id as requestId, app_id as appId, timestamp, status_code as statusCode, 
                   headers, body_length as bodyLength
            FROM responses
            WHERE app_id = ?
        `;

        const params: any[] = [appId];

        if (fromTimestamp) {
            query += ` AND timestamp >= ?`;
            params.push(fromTimestamp);
        }

        query += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        try {
            const responses = await this.db.query(query, params);

            // Create new objects instead of modifying the existing ones
            return responses.map((response: any) => {
                let parsedHeaders = [];
                try {
                    if (typeof response.headers === 'string') {
                        parsedHeaders = JSON.parse(response.headers);
                    } else if (Array.isArray(response.headers)) {
                        parsedHeaders = response.headers;
                    }
                } catch (e) {
                    console.error(`Failed to parse headers for response ${response.id}:`, e);
                }

                // Return a new object with all properties
                return {
                    id: response.id,
                    requestId: response.requestId,
                    appId: response.appId,
                    timestamp: response.timestamp,
                    statusCode: response.statusCode,
                    bodyLength: response.bodyLength,
                    headers: parsedHeaders
                };
            });
        } catch (error) {
            console.error('Error fetching responses:', error);
            throw error;
        }
    }

    async getErrorResponses({ appId, fromTimestamp, limit = 100 }: {
        appId: string,
        fromTimestamp?: string,
        limit?: number
    }) {
        let query = `
            SELECT r.id as requestId, r.timestamp as requestTimestamp, r.url, r.method,
                   r.headers as requestHeaders, r.body_length as requestBodyLength,
                   s.id as responseId, s.timestamp as responseTimestamp, 
                   s.status_code as statusCode, s.headers as responseHeaders, 
                   s.body_length as responseBodyLength
            FROM responses s
            JOIN requests r ON s.request_id = r.id
            WHERE s.app_id = ? AND s.status_code >= 400
        `;

        const params: any[] = [appId];

        if (fromTimestamp) {
            query += ` AND s.timestamp >= ?`;
            params.push(fromTimestamp);
        }

        query += ` ORDER BY s.timestamp DESC LIMIT ?`;
        params.push(limit);

        try {
            const errorPairs = await this.db.query(query, params);

            // Process the results to parse headers
            return errorPairs.map((pair: any) => {
                let requestHeaders = [];
                let responseHeaders = [];

                try {
                    if (typeof pair.requestHeaders === 'string') {
                        requestHeaders = JSON.parse(pair.requestHeaders);
                    }
                    if (typeof pair.responseHeaders === 'string') {
                        responseHeaders = JSON.parse(pair.responseHeaders);
                    }
                } catch (e) {
                    console.error(`Failed to parse headers:`, e);
                }

                return {
                    request: {
                        id: pair.requestId,
                        timestamp: pair.requestTimestamp,
                        url: pair.url,
                        method: pair.method,
                        headers: requestHeaders,
                        bodyLength: pair.requestBodyLength
                    },
                    response: {
                        id: pair.responseId,
                        timestamp: pair.responseTimestamp,
                        statusCode: pair.statusCode,
                        headers: responseHeaders,
                        bodyLength: pair.responseBodyLength
                    }
                };
            });
        } catch (error) {
            console.error('Error fetching error responses:', error);
            throw error;
        }
    }

    async getRequestById(requestId: string): Promise<{
        request: RequestMetadata;
        response: ResponseMetadata | null;
    } | null> {
        try {
            // Get the request
            const requestSql = `
                SELECT id, app_id as appId, timestamp, url, method, headers, body_length as bodyLength 
                FROM requests 
                WHERE id = ?
            `;

            const requests = await this.db.query<RequestMetadata>(requestSql, [requestId]);

            if (requests.length === 0) return null;

            const request = {
                ...requests[0],
                headers: JSON.parse(requests[0].headers as unknown as string)
            };

            // Get the corresponding response if it exists
            const response = await this.getResponse(requestId);

            return {
                request,
                response
            };
        } catch (error) {
            console.error(`Error fetching request by ID ${requestId}:`, error);
            throw error;
        }
    }
}

export let loggerRouter = new Hono<{
    Variables: {
        id: RequestIdVariables
        appsService: AppsService,
        loggerService: LoggerService,
        user: GitHubUser
    }
}>();

interface RequestMetadata {
    appId: string;
    id: string;
    timestamp: string;
    url: string;
    method: string;
    headers: string[];
    bodyLength: number;
}

interface ResponseMetadata {
    id: string;
    requestId: string;
    appId: string;
    timestamp: string;
    statusCode: number;
    headers: string[];
    bodyLength: number;
}


interface RequestFilter {
    appId: string;
    fromTimestamp?: string;
    limit?: number;
}


loggerRouter.get('/api/apps/:id/requests', async (c) => {
    const user = c.get('user');
    const appId = c.req.param('id');
    const fromTimestamp = c.req.query('from') || '';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 100;

    let appsService = c.get('appsService');
    let app = await appsService.getApp(appId);

    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Check if the user owns this app
    if (app.userId !== user.id.toString()) {
        return c.json({ error: 'Unauthorized access.' }, 403);
    }

    // Default to 12 hours ago if no timestamp provided
    const defaultFromTimestamp = new Date(Date.now() - (12 * 60 * 60 * 1000)).toISOString();

    let loggerService = c.get('loggerService');
    let requests = await loggerService.getRequests({
        appId: app.id,
        fromTimestamp: fromTimestamp || defaultFromTimestamp,
        limit
    });
    return c.json(requests);
});

loggerRouter.get('/api/apps/:id/errors', async (c) => {
    const appId = c.req.param('id');
    const fromTimestamp = c.req.query('from') || '';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 100;

    let appsService = c.get('appsService');
    let app = await appsService.getApp(appId);
    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Check if the user owns this app
    const user = c.get('user');
    if (app.userId !== user.id.toString()) {
        return c.json({ error: 'Unauthorized access.' }, 403);
    }

    // Default to 24 hours ago if no timestamp provided
    const defaultFromTimestamp = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();

    let loggerService = c.get('loggerService');
    let errorPairs = await loggerService.getErrorResponses({
        appId: app.id,
        fromTimestamp: fromTimestamp || defaultFromTimestamp,
        limit
    });

    return c.json(errorPairs);
});

loggerRouter.get('/api/requests/:requestId', async (c) => {
    const requestId = c.req.param('requestId');
    const user = c.get('user');

    let loggerService = c.get('loggerService');

    try {
        const result = await loggerService.getRequestById(requestId);

        if (!result) {
            return c.json({ error: 'Request not found.' }, 404);
        }

        // Check if the user owns the app this request belongs to
        let appsService = c.get('appsService');
        let app = await appsService.getApp(result.request.appId);

        if (!app) {
            return c.json({ error: 'App not found.' }, 404);
        }

        // Check if the user owns this app
        if (app.userId !== user.id.toString()) {
            return c.json({ error: 'Unauthorized access.' }, 403);
        }

        return c.json(result);
    } catch (error) {
        console.error(`Error in request lookup:`, error);
        return c.json({ error: 'Internal server error.' }, 500);
    }
});

loggerRouter.post('/api/logger/request/:appId/*', async (c) => {
    const appId = c.req.param('appId');
    let loggerService = c.get('loggerService');

    try {
        const body = await c.req.json();
        await loggerService.logRequest(body);
        return c.json({ success: true });
    } catch (error: any) {
        // Check for UniqueConstraintError
        if (error instanceof UniqueConstraintError) {
            console.warn(`[logger]: Duplicate request detected, skipping: ${error.message}`);
            // Return 409 Conflict for duplicate resources
            return c.json({ error: 'Duplicate request ID' }, 409);
        }

        console.error(`[logger]: Error logging request:`, error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

loggerRouter.post('/api/logger/response/:appId', async (c) => {
    const appId = c.req.param('appId');
    let loggerService = c.get('loggerService');

    try {
        const body = await c.req.json();
        await loggerService.logResponse(body);
        return c.json({ success: true });
    } catch (error: any) {
        // Check for UniqueConstraintError
        if (error instanceof UniqueConstraintError) {
            console.warn(`[logger]: Duplicate response detected, skipping: ${error.message}`);
            // Return 409 Conflict for duplicate resources
            return c.json({ error: 'Duplicate response ID' }, 409);
        }

        console.error(`[logger]: Error logging response:`, error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});
