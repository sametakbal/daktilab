/** Base URL of the daktilab API, e.g. "/api" (same origin) or "https://api.example.com/api". */
const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || null;

/** False when no backend is configured; the app then runs fully offline. */
export const apiEnabled = base !== null;

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export function apiUrl(path: string): string {
    if (!base) throw new ApiError(0, "Backend is not configured");
    return base + path;
}

/** JSON request with the session cookie. Throws ApiError with the server's message on non-2xx. */
export async function api<T = void>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    const res = await fetch(apiUrl(path), {
        method,
        credentials: "include",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown;
    try {
        json = text ? JSON.parse(text) : undefined;
    } catch {
        json = undefined;
    }
    if (!res.ok) {
        const message = (json as { error?: string } | undefined)?.error ?? `${res.status} ${res.statusText}`;
        throw new ApiError(res.status, message);
    }
    return json as T;
}
