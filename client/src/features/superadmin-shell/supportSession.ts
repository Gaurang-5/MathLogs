export type ActiveSupportSession = { sessionId: string; token: string; instituteId: string; instituteName: string; reason: string; expiresAt: string; ticketId?: string; ticketReference?: string };
const KEY = 'superAdminSupportSession';
export function getSupportSession(): ActiveSupportSession | null { try { const value = sessionStorage.getItem(KEY); if (!value) return null; const session = JSON.parse(value) as ActiveSupportSession; if (new Date(session.expiresAt).getTime() <= Date.now()) { sessionStorage.removeItem(KEY); return null; } return session; } catch { sessionStorage.removeItem(KEY); return null; } }
export function setSupportSession(session: ActiveSupportSession) { sessionStorage.setItem(KEY, JSON.stringify(session)); window.dispatchEvent(new Event('support-session-change')); }
export function clearSupportSession() { sessionStorage.removeItem(KEY); window.dispatchEvent(new Event('support-session-change')); }
