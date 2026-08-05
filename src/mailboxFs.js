// V9.46: 메일함 폴더 직결 — 업로드할 때 파일을 찾아 헤매지 않게 한다
//
// 왜: 자료는 이미 수집기가 `MAILBOX/{선박코드}/{항차}/` 에 모아 둔다. 그런데 앱에서 올릴 때는
//   매번 파일 대화상자를 열어 드라이브 → MAILBOX → 선박 → 항차를 손으로 타고 들어가야 했다
//   (사용자 요청 2026-08-02: "업로드를 누르면 해당 선박 폴더로 자동으로 가게").
//
// 브라우저는 파일 대화상자의 시작 폴더를 지정할 수 없다. 대신 File System Access API로
//   **메일함 루트를 한 번 연결**해 두면, 그 뒤로는 앱이 항차 폴더를 직접 읽어 목록으로 보여줄 수 있다.
//   대화상자 자체가 필요 없어진다.
//
// 권한: 사용자가 고른 디렉터리 핸들을 IndexedDB에 보관한다(구조화 복제 대상이라 저장된다).
//   다음 방문 때 queryPermission 으로 확인하고, 'prompt' 면 버튼 한 번으로 되살린다.
//   Chrome/Edge 데스크톱 전용 — 미지원 브라우저(폰 등)에서는 기존 파일 입력이 그대로 쓰인다.

const DB_NAME = 'gm_fs_v1';
const STORE = 'handles';
const KEY_ROOT = 'mailboxRoot';

/** 이 브라우저가 폴더 직결을 지원하는가 */
export function isFsSupported() {
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
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
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

/** 저장해 둔 메일함 루트 핸들 (없으면 null) */
export async function getSavedRoot() {
  try { return await idbGet(KEY_ROOT); } catch { return null; }
}

/** 폴더 고르기 → 저장. 사용자 제스처(클릭) 안에서 불러야 한다. */
export async function pickMailboxRoot() {
  const handle = await window.showDirectoryPicker({ id: 'gm-mailbox', mode: 'read' });
  await idbSet(KEY_ROOT, handle);
  return handle;
}

/** 읽기 권한 상태: 'granted' | 'prompt' | 'denied' */
export async function checkPermission(handle) {
  if (!handle || !handle.queryPermission) return 'denied';
  try { return await handle.queryPermission({ mode: 'read' }); } catch { return 'denied'; }
}

/** 권한 되살리기 — 사용자 제스처 안에서 */
export async function requestPermission(handle) {
  if (!handle || !handle.requestPermission) return 'denied';
  try { return await handle.requestPermission({ mode: 'read' }); } catch { return 'denied'; }
}

const norm = (s) => String(s || '').trim().toUpperCase();

/** 하위 디렉터리 이름 목록 (숨김 폴더 제외) */
export async function listDirs(handle) {
  const out = [];
  if (!handle) return out;
  for await (const [name, h] of handle.entries()) {
    if (h.kind === 'directory' && !name.startsWith('.')) out.push(name);
  }
  return out.sort();
}

/** 이름으로 하위 디렉터리 찾기 — 대소문자 무시, 정확 일치 우선 */
export async function findDir(parent, wanted) {
  if (!parent || !wanted) return null;
  const w = norm(wanted);
  let loose = null;
  for await (const [name, h] of parent.entries()) {
    if (h.kind !== 'directory') continue;
    const n = norm(name);
    if (n === w) return { name, handle: h };
    // 느슨한 짝: 앞의 0 차이(0533E vs 533E) 정도만. 그 이상은 추측이라 하지 않는다.
    if (n.replace(/^0+/, '') === w.replace(/^0+/, '')) loose = { name, handle: h };
  }
  return loose;
}

// 파일이 어느 칸으로 갈지 — 어디까지나 **추천**이다. 최종 선택은 사람이 버튼으로 한다.
//   실측 파일명 기준(2026-08-02 메일함 1258개): EDI는 확장자, X-RAY는 PORT-MIS 조회 파일명,
//   나머지 표(엑셀/CSV)는 리스트.
const RE_EDI = /\.(edi|asc)$/i;
const RE_EDI_TXT = /(^|[^a-z])edi([^a-z]|$)|baplie|\(un\d/i;
const RE_XRAY = /검수업체|컨테이너목록조회|x-?ray/i;
const RE_TABLE = /\.(xls|xlsx|xlsm|csv)$/i;
const RE_SKIP = /^_|\.json$|대조리포트|^~\$/i;

/** 파일 하나의 추천 대상: 'edi' | 'list' | 'xray' | '' */
export function suggestTarget(name) {
  const n = String(name || '');
  if (RE_SKIP.test(n)) return '';
  if (RE_XRAY.test(n)) return 'xray';
  if (RE_EDI.test(n)) return 'edi';
  if (/\.txt$/i.test(n)) return RE_EDI_TXT.test(n) ? 'edi' : '';
  if (RE_TABLE.test(n)) return 'list';
  if (/\.pdf$/i.test(n)) return 'edi';   // STOWAGE PDF — EDI 칸이 받는다
  return '';
}

/** 숨길 파일인가 (수집기 기록·부산물) */
export function isNoise(name) {
  return RE_SKIP.test(String(name || ''));
}

/**
 * 항차 폴더의 파일 목록.
 * 반환 { ok, dirPath, files:[{name,size,at,target,handle}], dirs, reason }
 *   ok=false 여도 dirs(고를 수 있는 폴더 목록)를 같이 준다 — 왜 못 찾았는지 사용자가 바로 본다.
 */
export async function listVoyageFiles(root, vessel, voy) {
  if (!root) return { ok: false, reason: 'no-root', files: [], dirs: [] };

  // V9.47: **어느 층을 연결했든** 찾아간다. 검수사가 MAILBOX를 고를 수도, 선박 폴더를 고를 수도,
  //   그 항차 폴더를 바로 고를 수도 있다. 한 가지만 맞다고 우기면 "안 되네" 로 끝난다.
  //     ① root/{선박}/{항차}   ← MAILBOX 를 연결한 경우 (권장 — 한 번으로 전 선박이 풀린다)
  //     ② root/{항차}          ← 선박 폴더를 연결한 경우
  //     ③ root 자체가 그 항차   ← 항차 폴더를 연결한 경우
  let yDir = null, base = '';
  const vDir = await findDir(root, vessel);
  if (vDir) {
    const y = await findDir(vDir.handle, voy);
    if (y) { yDir = y; base = `${vDir.name}/${y.name}`; }
  }
  if (!yDir) {
    const y2 = await findDir(root, voy);                       // ② 선박 폴더를 연결했다
    if (y2) { yDir = y2; base = `${root.name || ''}/${y2.name}`; }
  }
  if (!yDir && norm(root.name) === norm(voy)) {                // ③ 항차 폴더를 연결했다
    yDir = { name: root.name, handle: root };
    base = root.name;
  }
  if (!yDir) {
    // 못 찾았을 때는 추측하지 않고, 지금 연결된 폴더에 무엇이 있는지 그대로 보여준다.
    return { ok: false, reason: vDir ? 'no-voy' : 'no-vessel', files: [],
             dirs: await listDirs(vDir ? vDir.handle : root),
             vesselDir: vDir ? vDir.name : (root.name || ''),
             rootName: root.name || '' };
  }
  const files = [];
  for await (const [name, h] of yDir.handle.entries()) {
    if (h.kind !== 'file' || isNoise(name)) continue;
    let size = 0, at = 0;
    try {
      const f = await h.getFile();
      size = f.size; at = f.lastModified;
    } catch { /* 접근 실패한 파일은 크기 없이 표시 */ }
    files.push({ name, size, at, target: suggestTarget(name), handle: h });
  }
  files.sort((a, b) => (b.at || 0) - (a.at || 0));
  return { ok: true, dirPath: base, files, dirs: [], rootName: root.name || '' };
}

/** 목록의 항목 → File 객체 */
export async function toFile(entry) {
  return await entry.handle.getFile();
}

// ── 이미 넣은 파일 기억 (중복 투입 방지) ────────────────────────────────
//   같은 파일을 두 번 넣어도 앱은 멱등하지만, **넣었는지 아닌지가 안 보이는 게** 실수를 만든다.
const doneKey = (voyageKey, mode) => `gm_fsdone:${voyageKey}:${mode}`;
const stamp = (f) => `${f.name}|${f.size}|${f.at}`;

export function getDoneSet(voyageKey, mode) {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(voyageKey, mode)) || '[]'));
  } catch {
    return new Set();
  }
}

export function markDone(voyageKey, mode, entry, target) {
  try {
    const s = getDoneSet(voyageKey, mode);
    s.add(`${stamp(entry)}=>${target}`);
    localStorage.setItem(doneKey(voyageKey, mode), JSON.stringify([...s].slice(-300)));
  } catch { /* 저장 실패해도 업로드 자체엔 영향 없다 */ }
}

export function isDone(doneSet, entry, target) {
  return doneSet.has(`${stamp(entry)}=>${target}`);
}
