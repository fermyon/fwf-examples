import { Hono } from 'hono';
import { requestId, RequestIdVariables } from 'hono/request-id';
import { logger } from 'hono/logger'
import { authRouter } from './auth/router';
import { authMiddleware } from './auth/middleware';
import { loggerRouter, LoggerService } from './logger';
import { appsRouter, AppsService } from './apps';
import { User, UserService } from './users';
import { Db } from './db';

let app = new Hono<{
    Variables: {
        id: RequestIdVariables
        appsService: AppsService,
        loggerService: LoggerService,
        userService: UserService,
        user: User,
    }
}>();

app.use(logger())
app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    c.res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
});

app.use('*', requestId())

// Initialize services and pass them as middleware
app.use('*', async (c, next) => {
    let db = new Db();
    c.set('appsService', new AppsService(db));
    c.set('loggerService', new LoggerService(db));
    c.set('userService', new UserService(db));
    await next();
});

// Add auth middleware
app.use('*', authMiddleware)

// Add auth routes
app.route('/', authRouter);
app.route('/', loggerRouter);
app.route('/', appsRouter);

app.options('*', async (c) => {
    return new Response(null, { status: 204 })
});

app.fire()
