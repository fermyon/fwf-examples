interface AkamaiTokenConfig {
    windowSeconds?: number;
    startTime?: number;
    url: string;
    ip?: string;
    sessionId?: string;
    verbose?: boolean;
}

export class AkamaiTokenGenerator {
    private key: Uint8Array;
    private tokenName: string;
    private algorithm: string;
    private fieldDelimiter: string;

    constructor(hexKey: string, algorithm: string = 'SHA-256', tokenName: string = 'hdnts') {
        if (!hexKey) {
            throw new Error('Key is required');
        }

        // Convert hex key to Uint8Array
        this.key = this.hexToBytes(hexKey);
        this.tokenName = tokenName;
        this.algorithm = algorithm;
        this.fieldDelimiter = '~';
    }

    getTokenName(): string {
        return this.tokenName;
    }

    async generateUrlToken(config: AkamaiTokenConfig): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const startTime = config.startTime || now;
        const endTime = startTime + (config.windowSeconds || 3600); // Default to 1 hour

        if (!config.url) {
            throw new Error('URL must be specified');
        }

        // Log configuration if verbose is enabled
        if (config.verbose) {
            console.log('Token Configuration:');
            console.log(`  Token Name: ${this.tokenName}`);
            console.log(`  Algorithm: ${this.algorithm}`);
            console.log(`  Field Delimiter: ${this.fieldDelimiter}`);
            console.log(`  Current Time: ${now}`);
            console.log(`  Start Time: ${startTime}`);
            console.log(`  End Time: ${endTime}`);
            console.log(`  Window Seconds: ${config.windowSeconds || 3600}`);
            console.log(`  URL: ${config.url}`);
            if (config.ip) console.log(`  IP: ${config.ip}`);
            if (config.sessionId) console.log(`  Session ID: ${config.sessionId}`);
        }

        const tokenParts: string[] = [];

        // Add expiration time
        tokenParts.push(`exp=${endTime}`);

        // Add start time if different from now
        if (config.startTime && config.startTime !== now) {
            tokenParts.push(`st=${startTime}`);
        }

        // Add URL
        tokenParts.push(`url=${encodeURIComponent(config.url)}`);

        // Add IP if specified
        if (config.ip) {
            tokenParts.push(`ip=${config.ip}`);
        }

        // Add session ID if specified
        if (config.sessionId) {
            tokenParts.push(`id=${config.sessionId}`);
        }

        // Generate the token string to be signed
        const tokenString = tokenParts.join(this.fieldDelimiter);

        // Generate HMAC
        const hmac = await this.generateHmac(tokenString);

        // Log token details if verbose is enabled
        if (config.verbose) {
            console.log('Token Generation:');
            console.log(`  Token String: ${tokenString}`);
            console.log(`  HMAC: ${hmac}`);
        }

        // Return the final token
        const token = `${this.tokenName}=${tokenString}${this.fieldDelimiter}hmac=${hmac}`;

        if (config.verbose) {
            console.log(`  Final Token: ${token}`);
        }

        return token;
    }

    private async generateHmac(message: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);

        // Use crypto.subtle.sign instead of crypto.hmac
        const key = await crypto.subtle.importKey(
            'raw',
            this.key,
            { name: 'HMAC', hash: { name: this.algorithm } },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            data
        );

        return this.bytesToHex(new Uint8Array(signature));
    }

    private hexToBytes(hex: string): Uint8Array {
        // Remove 0x prefix if present
        const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

        // Ensure even length
        const paddedHex = cleanHex.length % 2 ? '0' + cleanHex : cleanHex;

        const bytes = new Uint8Array(paddedHex.length / 2);

        for (let i = 0; i < paddedHex.length; i += 2) {
            bytes[i / 2] = parseInt(paddedHex.substring(i, i + 2), 16);
        }

        return bytes;
    }

    private bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
} 
