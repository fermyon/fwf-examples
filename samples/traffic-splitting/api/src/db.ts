import { createClient } from '@libsql/client';
import * as Variables from '@spinframework/spin-variables';

export class Db {
    private client: ReturnType<typeof createClient>;

    constructor() {
        const url = Variables.get("database_url");
        const authToken = Variables.get("database_token");

        if (!url || !authToken) {
            throw new Error("database_url and database_token must be set");
        }

        console.log(`[db]: Initializing database with url: ${url}`);
        this.client = createClient({
            url: url,
            authToken: authToken
        });
    }

    /**
     * Execute a query that returns rows
     * @example
     * const users = await db.query<User>("SELECT * FROM users WHERE name = ?", ["Alice"]);
     */
    async query<T = any>(sql: string, params: Array<string | number | boolean | null> = []): Promise<T[]> {
        try {
            console.log(`[db]: Executing query: ${sql} with params: ${params} `);
            const result = await this.client.execute({ sql, args: params });
            console.log(`[db]: Returning ${result.rows.length} rows`);
            return result.rows as T[];
        } catch (error) {
            console.error('[db]: Database query error:', error);
            throw error;
        }
    }

    /**
     * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
     * @example
     * await db.execute("INSERT INTO users (name, email) VALUES (?, ?)", ["Alice", "alice@example.org"]);
     */
    async execute(sql: string, params: Array<string | number | boolean | null> = []): Promise<void> {
        try {
            console.log(`[db]: Executing: ${sql} with params: ${params} `);
            await this.client.execute({ sql, args: params });
        } catch (error) {
            console.error('[db]: Database execute error:', error);

            // Check for constraint violation errors
            if (error instanceof Error &&
                error.message.includes('SQLITE_CONSTRAINT') &&
                error.message.includes('UNIQUE constraint failed')) {
                // Rethrow with a more specific error type that can be handled by callers
                throw new UniqueConstraintError(error.message);
            }

            throw error;
        }
    }
}

export class UniqueConstraintError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UniqueConstraintError';
    }
} 
