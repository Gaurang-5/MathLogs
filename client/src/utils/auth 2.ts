export interface TokenPayload {
    role?: string;
}

export function readTokenPayload(token: string | null): TokenPayload | null {
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length < 2) return null;

    try {
        return JSON.parse(atob(parts[1])) as TokenPayload;
    } catch {
        return null;
    }
}
