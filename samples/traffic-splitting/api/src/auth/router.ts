import { Hono } from 'hono';
import { GitHubAuth } from './github';
import { setCookie, getCookie } from 'hono/cookie'
import { User, UserService } from '../users';
import { RequestIdVariables } from 'hono/request-id';
import { AppsService } from '../apps';
import { LoggerService } from '../logger';


export let authRouter = new Hono<{
    Variables: {
        id: RequestIdVariables
        appsService: AppsService,
        loggerService: LoggerService,
        userService: UserService,
        user: User,
    }
}>();

authRouter.get('/api/auth/github', async (c) => {
    const github = new GitHubAuth();
    const authUrl = github.getAuthorizationUrl();
    return c.redirect(authUrl);
});

authRouter.get('/api/auth/github/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
        return c.json({ error: 'No code provided' }, 400);
    }

    try {
        const github = new GitHubAuth();
        const accessToken = await github.getAccessToken(code);
        const githubUser = await github.getUser(accessToken);
        console.log(`[auth]: User authenticated: ${githubUser.login}`);

        // Store user in database
        const userService: UserService = c.get('userService');
        const user = await userService.createOrUpdateUser(githubUser);
        console.log(`[auth]: User stored in database: ${user.id}`);

        // Set session cookie
        setCookie(c, 'session', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 1 week
        });

        // Redirect to the applications page
        return c.redirect('/applications');
    } catch (error) {
        console.error('GitHub OAuth error:', error);
        return c.json({ error: 'Authentication failed' }, 401);
    }
});

authRouter.get('/api/auth/logout', async (c) => {
    setCookie(c, 'session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
    });
    return c.redirect('/');
});

authRouter.get('/api/auth/user', async (c) => {
    const session = getCookie(c, 'session');
    if (!session) {
        return c.json({ error: 'Not authenticated' }, 401);
    }

    try {
        const github = new GitHubAuth();
        const githubUser = await github.getUser(session);

        // Get user from database with last signin info
        const userService = c.get('userService');
        const user = await userService.getUserByGithubId(githubUser.id);

        if (user) {
            return c.json({
                id: user.githubId,
                login: user.login,
                name: user.name,
                email: user.email,
                avatar_url: user.avatarUrl,
                last_signin_at: user.lastSigninAt
            });
        } else {
            return c.json(githubUser);
        }
    } catch (error) {
        return c.json({ error: 'Invalid session' }, 401);
    }
}); 
