// Drafts are local to this browser and teacher. They are never treated as saved marks.
function database(): Promise<IDBDatabase> {
    return new Promise((resolve,reject)=>{
        const request=indexedDB.open('mathlogs-scan-drafts',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
    });
}
export async function readScanDrafts<T>(key: string): Promise<T | undefined> {
    const db=await database();
    try { return await new Promise<T|undefined>((resolve,reject)=>{
        const request=db.transaction('drafts').objectStore('drafts').get(key);
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    }); } finally { db.close(); }
}
export async function writeScanDrafts(key: string, value: unknown): Promise<void> {
    const db=await database();
    try { await new Promise<void>((resolve,reject)=>{
        const transaction=db.transaction('drafts','readwrite');
        transaction.objectStore('drafts').put(value,key);
        transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);
    }); } finally { db.close(); }
}
export function scanDraftOwner(): string {
    try { const token=localStorage.getItem('token') || '';const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return `${claims.instituteId}:${claims.id}`; }
    catch { return 'unavailable'; }
}
