import { Db } from './db';
import { Hono } from "hono";
import { RequestIdVariables } from "hono/request-id";
import { LoggerService } from "./logger";
import { GitHubUser } from "./auth/github";

interface App {
    id: string;
    name: string;
    createdAt: string;
    url: string;
    loggerUrl: string;
    apiKey: string;
    userId: string;
}

export class AppsService {
    private db: Db;

    constructor(db: Db) {
        this.db = db;
    }

    async getApps(userId: string): Promise<App[]> {
        console.log(`[apps]: Getting all apps for user: ${userId}`);
        return await this.db.query<App>(
            'SELECT id, name, created_at as createdAt, url, logger_url as loggerUrl, api_key as apiKey, user_id as userId FROM apps WHERE user_id = ?',
            [userId]
        );
    }

    async getApp(id: string): Promise<App | null> {
        console.log(`[apps]: Getting app with id: ${id}`);
        const apps = await this.db.query<App>(
            'SELECT id, name, created_at as createdAt, url, logger_url as loggerUrl, api_key as apiKey, user_id as userId FROM apps WHERE id = ?',
            [id]
        );
        return apps[0] || null;
    }

    async saveApp(app: App): Promise<App> {
        console.log(`[apps]: Saving app with id: ${app.id}`);
        const sql = `
            INSERT INTO apps (id, name, url, created_at, logger_url, api_key, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                url = excluded.url,
                logger_url = excluded.logger_url,
                api_key = excluded.api_key,
                user_id = excluded.user_id
        `;

        await this.db.execute(sql, [
            app.id,
            app.name,
            app.url,
            app.createdAt,
            app.loggerUrl,
            app.apiKey,
            app.userId
        ]);

        return app;
    }

    async deleteApp(id: string): Promise<void> {
        console.log(`[apps]: Deleting app with id: ${id}`);
        await this.db.execute('DELETE FROM apps WHERE id = ?', [id]);
    }
}


export let appsRouter = new Hono<{
    Variables: {
        id: RequestIdVariables
        appsService: AppsService,
        loggerService: LoggerService,
        user: GitHubUser
    }
}>();

appsRouter.get('/api/apps', async (c) => {
    const user = c.get('user');
    let appsService = c.get('appsService');
    let apps = await appsService.getApps(user.id.toString());
    return c.json(apps);
})

appsRouter.options('/api/apps/*', async (_c) => {
    return new Response(null, { status: 204 })
})

appsRouter.get('/api/apps/:id', async (c) => {
    const user = c.get('user');
    let appsService = c.get('appsService');
    let app = await appsService.getApp(c.req.param('id'));

    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Check if the user owns this app
    if (app.userId !== user.id.toString()) {
        return c.json({ error: 'Unauthorized access.' }, 403);
    }

    return c.json(app);
})

appsRouter.delete('/api/apps/:id', async (c) => {
    const user = c.get('user');
    let appsService = c.get('appsService');
    let app = await appsService.getApp(c.req.param('id'));

    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Check if the user owns this app
    if (app.userId !== user.id.toString()) {
        return c.json({ error: 'Unauthorized access.' }, 403);
    }

    await appsService.deleteApp(app.id);

    let loggerService = c.get('loggerService');
    await loggerService.deleteRequests(app.id);
    return c.json({ message: 'App deleted.' });
})

appsRouter.post('/api/apps', async (c) => {
    const user = c.get('user');
    let appsService = c.get('appsService');
    let appId = crypto.randomUUID();
    let apiKey = crypto.randomUUID();
    let app: App = await c.req.json();
    app.id = appId;
    app.apiKey = apiKey;
    app.loggerUrl = `/api/logger/${appId}`;
    app.createdAt = new Date().toISOString();
    app.userId = user.id.toString();
    await appsService.saveApp(app);
    return c.json(app);
})

appsRouter.get('api/apps/:id/requests', async (c) => {
    const appId = c.req.param('id');
    const fromTimestamp = c.req.query('from') || '';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 100;

    let appsService = c.get('appsService');
    let app = await appsService.getApp(appId);
    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
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
})

appsRouter.get('api/apps/:id/responses', async (c) => {
    const appId = c.req.param('id');
    const fromTimestamp = c.req.query('from') || '';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 100;

    let appsService = c.get('appsService');
    let app = await appsService.getApp(appId);
    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Default to 12 hours ago if no timestamp provided
    const defaultFromTimestamp = new Date(Date.now() - (12 * 60 * 60 * 1000)).toISOString();

    let loggerService = c.get('loggerService');
    let responses = await loggerService.getResponses({
        appId: app.id,
        fromTimestamp: fromTimestamp || defaultFromTimestamp,
        limit
    });
    return c.json(responses);
})

appsRouter.post('api/apps/:id/regenerate-key', async (c) => {
    const user = c.get('user');
    let appsService = c.get('appsService');
    let app = await appsService.getApp(c.req.param('id'));

    if (!app) {
        return c.json({ error: 'App not found.' }, 404);
    }

    // Check if the user owns this app
    if (app.userId !== user.id.toString()) {
        return c.json({ error: 'Unauthorized access.' }, 403);
    }

    let apiKey = crypto.randomUUID();
    console.log(`[apps]: Regenerating key for app with id: ${app.id}`);
    app.apiKey = apiKey;
    await appsService.saveApp(app);
    return c.json(app);
})  
