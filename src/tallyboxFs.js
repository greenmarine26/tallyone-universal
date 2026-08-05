// TallyOne 1.7: 마감 서류를 TALLYBOX에 **직접** 쓴다 — 다운로드 폴더를 거치지 않는다.
//
// 왜 (검수사 2026-08-04)
//   "크롬은 폴더를 지정해야 하고 엣지는 다운로드로 가고 일관성이 없음"
//   브라우저 다운로드는 앱이 통제할 수 없다. 크롬은 「저장 위치 확인」이 켜져 있으면 매번
//   대화상자를 띄우고(기본 폴더가 MAILBOX였다), 엣지는 말없이 다운로드 폴더로 떨군다.
//   그래서 수집기가 여러 폴더를 감시해 주워 담는 우회로를 쓰고 있었다. 우회로를 없앤다.
//
// 어떻게
//   File System Access API 로 TALLYBOX 루트를 **한 번만** 지정받고 IndexedDB에 보관한다.
//   그 뒤로는 앱이 `TALLYBOX/{선박}/{항차}/` 를 스스로 만들고 파일을 그 자리에 쓴다.
//   저장 대화상자 없음 · 다운로드 폴더 안 거침 · 크롬과 엣지가 같게 동작.
//
//   ⚠ Chrome/Edge 데스크톱 전용이다(사파리·파이어폭스 미지원).
//     검수사 확정 — 마감 서류는 폰에서 만들지 않는다("수석검수사는 노트북이나 데스크탑을 사용").
//     그래도 미지원 브라우저에서는 호출부가 기존 다운로드로 폴백한다(isTallyboxSupported 로 판별).
//
//   경로 규칙은 수집기 `collector/tallybox.py` 와 **같은 규칙**이다. 둘 중 하나만 고치지 마라.
//   (앱이 직접 쓰게 된 뒤에도 수집기 경로는 남는다 — 미지원 브라우저·과거 파일 회수용)

const DB_NAME = 'gm_fs_v1';        // mailboxFs.js 와 같은 DB를 쓴다(스토어·키만 다름)
const STORE = 'handles';
const KEY_ROOT = 'tallyboxRoot';

/** 이 브라우저가 폴더 직접 쓰기를 지원하는가 */
export function isTallyboxSupported() {
  try {
    return typeof window !== 'undefined'
      && typeof window.showDirectoryPicker === 'function'
      && window.isSecureContext;
  } catch {
    return false;
  }
}

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      // mailboxFs 가 먼저 만들었을 수 있다 — 없을 때만 만든다.
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, val) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** 저장해 둔 TALLYBOX 루트 핸들 (없으면 null) */
export async function getSavedTallybox() {
  try { return await idbGet(KEY_ROOT); } catch { return null; }
}

/** 폴더 고르기 → 저장. **사용자 클릭 안에서** 불러야 한다(브라우저 제약). */
export async function pickTallyboxRoot() {
  const handle = await window.showDirectoryPicker({ id: 'gm-tallybox', mode: 'readwrite' });
  await idbSet(KEY_ROOT, handle);
  return handle;
}

/** 쓰기 권한 상태: 'granted' | 'prompt' | 'denied' */
export async function checkWritePermission(handle) {
  if (!handle || !handle.queryPermission) return 'denied';
  try { return await handle.queryPermission({ mode: 'readwrite' }); } catch { return 'denied'; }
}

/** 권한 되살리기 — 사용자 클릭 안에서 */
export async function requestWritePermission(handle) {
  if (!handle || !handle.requestPermission) return 'denied';
  try { return await handle.requestPermission({ mode: 'readwrite' }); } catch { return 'denied'; }
}

/** 준비된 루트 핸들을 돌려준다. 권한이 없으면 null (호출부가 폴백하거나 지정 버튼을 띄운다). */
export async function readyRoot() {
  if (!isTallyboxSupported()) return null;
  const h = await getSavedTallybox();
  if (!h) return null;
  const st = await checkWritePermission(h);
  if (st === 'granted') return h;
  return null;                     // 'prompt' 는 사용자 클릭이 필요해 호출부에서 처리
}

/**
 * `TALLYBOX/{선박}/{항차}/{파일명}` 에 쓴다. 없는 폴더는 만든다.
 * @returns {Promise<string>} 쓴 경로(표시용)
 */
export async function writeTallyboxFile(root, vsl, folder, filename, data) {
  if (!root) throw new Error('TALLYBOX 폴더가 지정되지 않았습니다');
  const shipDir = await root.getDirectoryHandle(String(vsl).toUpperCase(), { create: true });
  const voyDir = await shipDir.getDirectoryHandle(String(folder), { create: true });
  const fh = await voyDir.getFileHandle(String(filename), { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(data);           // Blob · ArrayBuffer · string 전부 받는다
  } finally {
    await w.close();               // 조용히 실패하지 않게 반드시 닫는다
  }
  return `${String(vsl).toUpperCase()}\\${folder}\\${filename}`;
}
