// TallyUni 0.9 시뮬 전용 — firebase/storage 대역. 이 판의 경로는 Storage를 쓰지 않는다.
export function getStorage(app) { return { app }; }
export function ref(s, p) { return { s, p }; }
export function uploadBytes() { return Promise.reject(new Error('시뮬: Storage 미사용')); }
export function getDownloadURL() { return Promise.reject(new Error('시뮬: Storage 미사용')); }
export function deleteObject() { return Promise.resolve(); }
export function listAll() { return Promise.resolve({ items: [], prefixes: [] }); }
