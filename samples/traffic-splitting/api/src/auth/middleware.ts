import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { GitHubAuth } from './github';
import { UserService } from '../users';

export async function authMiddleware(c: Context, next: Next) {
    // Skip auth for public routes and for logger, which is covered by its own authentication logic based on API keys.
    if (c.req.path.startsWith('/api/auth/') || c.req.path.startsWith('/api/logger/')) {
        return next();
    }

    const session = getCookie(c, 'session');
    if (!session) {
        return c.redirect('/api/auth/github', 301);
    }

    try {
        const github = new GitHubAuth();
        const githubUser = await github.getUser(session);

        // Get user from database
        const userService: UserService = c.get('userService');
        const user = await userService.getUserByGithubId(githubUser.id);

        if (user) {
            c.set('user', {
                id: user.id,
                githubId: user.githubId,
                login: user.login,
                name: user.name,
                email: user.email,
                avatar_url: user.avatarUrl,
                last_signin_at: user.lastSigninAt
            });
        } else {
            // If user not in database yet (should be rare), use GitHub user
            c.set('user', githubUser);
        }

        await next();
    } catch (error) {
        // Invalid or expired session
        return c.redirect('/api/auth/github', 301);
    }
} 
