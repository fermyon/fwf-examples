import { Db } from './db';
import { GitHubUser } from './auth/github';

export interface User {
    id: string;
    githubId: number;
    login: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    createdAt: string;
    lastSigninAt: string;
}

export class UserService {
    private db: Db;

    constructor(db: Db) {
        this.db = db;
    }

    async getUserByGithubId(githubId: number): Promise<User | null> {
        console.log(`[users]: Getting user with GitHub ID: ${githubId}`);
        const users = await this.db.query<User>(
            'SELECT id, github_id as githubId, login, name, email, avatar_url as avatarUrl, created_at as createdAt, last_signin_at as lastSigninAt FROM users WHERE github_id = ?',
            [githubId]
        );
        return users[0] || null;
    }

    async createOrUpdateUser(githubUser: GitHubUser): Promise<User> {
        console.log(`[users]: Creating or updating user: ${githubUser.login}`);

        // Check if user already exists
        const existingUser = await this.getUserByGithubId(githubUser.id);
        const now = new Date().toISOString();

        if (existingUser) {
            // Update existing user with new signin time
            const updatedUser: User = {
                ...existingUser,
                login: githubUser.login,
                name: githubUser.name || existingUser.name,
                email: githubUser.email || existingUser.email,
                avatarUrl: githubUser.avatar_url || existingUser.avatarUrl,
                lastSigninAt: now
            };

            await this.db.execute(
                `UPDATE users SET 
                    login = ?, 
                    name = ?, 
                    email = ?, 
                    avatar_url = ?, 
                    last_signin_at = ? 
                WHERE github_id = ?`,
                [
                    updatedUser.login,
                    updatedUser.name,
                    updatedUser.email,
                    updatedUser.avatarUrl,
                    updatedUser.lastSigninAt,
                    updatedUser.githubId
                ]
            );

            return updatedUser;
        } else {
            // Create new user
            const newUser: User = {
                id: crypto.randomUUID(),
                githubId: githubUser.id,
                login: githubUser.login,
                name: githubUser.name || null,
                email: githubUser.email || null,
                avatarUrl: githubUser.avatar_url || null,
                createdAt: now,
                lastSigninAt: now
            };

            await this.db.execute(
                `INSERT INTO users (
                    id, github_id, login, name, email, avatar_url, created_at, last_signin_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newUser.id,
                    newUser.githubId,
                    newUser.login,
                    newUser.name,
                    newUser.email,
                    newUser.avatarUrl,
                    newUser.createdAt,
                    newUser.lastSigninAt
                ]
            );

            return newUser;
        }
    }
} 
