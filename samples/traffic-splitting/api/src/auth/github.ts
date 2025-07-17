import * as Variables from '@spinframework/spin-variables';
interface GitHubOAuthConfig {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
}

export interface GitHubUser {
    id: number;
    login: string;
    name: string;
    email: string;
    avatar_url: string;
}

export class GitHubAuth {
    private config: GitHubOAuthConfig;

    constructor() {
        const clientId = Variables.get("github_client_id");
        const clientSecret = Variables.get("github_client_secret");
        const callbackUrl = Variables.get("github_callback_url");

        if (!clientId || !clientSecret || !callbackUrl) {
            throw new Error("GitHub OAuth configuration is missing");
        }

        this.config = {
            clientId,
            clientSecret,
            callbackUrl,
        };
    }

    getAuthorizationUrl(): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.callbackUrl,
            scope: 'read:user user:email',
            response_type: 'code',
        });

        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    async getAccessToken(code: string): Promise<string> {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.callbackUrl,
            }),
        });

        const data: any = await response.json();
        if (data.error) {
            throw new Error(`GitHub OAuth error: ${data.error}`);
        }

        return data.access_token;
    }

    async getUser(accessToken: string): Promise<GitHubUser> {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${accessToken}`,
                'Accept': 'application/json',
                'User-Agent': 'FWaFfic-App'
            },
        });

        if (!response.ok) {
            const error = await response.text();
            console.error(`[github]: Failed to fetch user: ${error}`);
            throw new Error('Failed to fetch GitHub user');
        }

        const userData: any = await response.json();
        console.log(`[github]: User data received for user: ${userData.login}`);
        return userData;
    }
} 
