export interface RegisteredStudent {
    id?: string;
    humanId?: string | null;
    name: string;
    schoolName?: string;
    batchId?: string;
}

export function getCachedRegistration(batchId: string | undefined, mode: 'kiosk' | 'standard' = 'standard'): RegisteredStudent | null {
    if (mode !== 'standard' || !batchId) return null;

    const cachedData = localStorage.getItem(`registered_batch_${batchId}`);
    if (!cachedData) return null;

    try {
        return JSON.parse(cachedData) as RegisteredStudent;
    } catch (error) {
        console.error("Local storage parse error", error);
        return null;
    }
}
