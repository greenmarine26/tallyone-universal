// 수집기 자동 항차 등록용 페이로드 빌더 — 파싱·분류는 검수앱 파서가 소유(수집기는 파일만 전달, 쓰기는 수집기 REST).
// V8.32: window.GMautoPayload(files, {vslCode, voy, mode}) → { key, info, ediContainers, ediRaw, records, counts }
//   - ediContainers 분류는 VoyagePage 재처리 로직과 동일(평택 POD/POL → discharge/loading, 그 외 transit).
//   - records는 원시 파싱 결과만 반환(먼저 온 값 유지 + 빈칸 채움). 기존 records와의 병합·보존은 수집기 측 보수 머지 담당.
//   - Firebase 쓰기는 여기서 하지 않는다 — 순수 함수라 시뮬·헬퍼 재사용이 쉽다.
import { parseBAPLIE, parseAscFile, parseListExcel, isPyeongtaekPort, loadSheetJS } from './utils.js';
import { APP_VERSION } from './utils.js';

// V9.57(G5): 파일 분류기 단일화 — mergeApi.classify와 이 _kind가 서로 달라(cdl 허용·.txt 지원·
//   merged 지원) 같은 파일이 경로마다 다르게 처리됐다. 이제 이 함수 하나를 양쪽
//   (buildAutoPayload·mergeApi.mergeFolder)이 임포트한다. 확장자가 아니라 내용(head) 기준 판정 유지.
//   반환: 'edi' | 'asc' | 'ifcsum' | 'merged' | 'xray' | 'list' | 'skip'
export function classifyTallyFile(name, head) {
  const n = (name || '').toLowerCase();
  const e = n.split('.').pop();
  if (e === 'edi') return 'edi';
  if (e === 'asc') return 'asc';
  if (e === 'txt') {
    // RZOR 등 EDI/ASC/매니페스트가 .txt로 오는 경우 — 내용 머리로 판정.
    const h = (head || '').trimStart();
    if (h.startsWith('UNB') || h.startsWith('UNH')) return 'edi';
    if (h.startsWith('$60')) return 'asc';
    if (h.startsWith('00:IFCSUM')) return 'ifcsum';   // V8.33: LOLO(RZOR) 매니페스트 — 가상 EDI 재료
    // V9.57(G4): .txt + 00:BAPLIE(숫자코드)도 EDI로 — parseBAPLIE가 숫자형 라우팅을 내장하므로
    //   종전처럼 skip으로 버리지 않는다.
    if (h.startsWith('00:')) return 'edi';
    return 'skip';
  }
  if (e === 'xls' || e === 'xlsx') {
    if (/loadlist\.xlsx$/.test(n)) return 'merged';   // V8.32-01: 수집기 합본(평택 기준 검증본) — 전용 매핑으로 읽음
    if (/xray|x-ray/.test(n)) return 'xray';          // V9.57(G5): mergeApi가 쓰는 xray 분류 편입
    // V8.89: cdl 제외 해제 — CDL(양하 리스트)만 먼저 온 항차가 "인식된 자료 없음"으로 등록조차 안 되던
    //   문제(STSE 2653E 사건 2026-07-13). CDL은 양하 검수 리스트이므로 records로 등록한다.
    if (/recap|cbf|memo/.test(n)) return 'skip';
    return 'list';
  }
  return 'skip';
}
const _kind = classifyTallyFile;   // 파일 내 기존 호출부 호환 별칭

async function _asText(f) {
  const ab = f.arrayBuffer ? await f.arrayBuffer() : (f.buffer || f);
  // V9.57(G9): 디코드 실패를 조용히 삼키지 않는다 — ''를 돌려주면 그 파일이 skip으로 사라져
  //   원인이 증상에서 멀어진다. 경고 로그를 남기고 호출부 perFile에 0건으로 드러나게 한다.
  try { return new TextDecoder('latin1').decode(new Uint8Array(ab)); }
  catch (e) { console.warn('[autoRegApi] 파일 텍스트 디코드 실패:', f && f.name, e); return ''; }
}
async function _asU8(f) {
  const ab = f.arrayBuffer ? await f.arrayBuffer() : (f.buffer || f);
  return new Uint8Array(ab);
}

// V9.57(G4): 약식 parseIfcsum 제거 — utils.parseNumericIFCSUM(parseBAPLIE 라우팅 경유)으로 통합.
//   약식 파서는 ISO 텍스트('40HC' 등)를 정규화하지 않고 B/L split(같은 컨 여러 51 세그먼트)을
//   병합하지 않아 중복·규격 불일치를 만들었다. 정식 파서가 둘 다 처리한다.

// 가상 선적 EDI 대상 — 선적 EDI가 늦거나(OBWH) 안 오는(RZOR) 선박. 리스트로 선적 카운트를 채운다(사용자 확정 2026-07-04).
const VIRTUAL_LOAD_SHIPS = new Set(['RZOR', 'OBWH']);

// V8.84-02: 플랜(프리스토우 격자 엑셀) 가상 선적 EDI 대상 — 선적 EDI가 안 오고 두우 표준 배치 플랜만 오는 선박.
//   자리(베이/로우/단)만 계획 슬롯으로 등록하고 컨번호는 배정하지 않는다(사용자 확정 2026-07-11 — 임의 배정 금지).
//   컨번호는 NOLIST 리스트(records)가 담당. 마커: e=20MT · E=40HQ MT · 2=20F · 4=40HQ F.
const PLAN_VIRTUAL_SHIPS = new Set(['TMPZ']);
// 플랜 시트명 → POD (평택 선적분 시트 = 목적항별, 사용자 확정 2026-07-11)
const PLAN_POD_SHEETS = { SHANGHAI: 'CNSHA', SHA: 'CNSHA', BUSAN: 'KRPUS', PUSAN: 'KRPUS', NINGBO: 'CNNGB', NGB: 'CNNGB' };

// V8.84-02: TMPZ 프리스토우 플랜 격자 파서 — 실파일(TIANHAI PINGZE.xls) SHANGHAI 시트 자체 집계표
//   (20F 1 · 20E 99 · HQ F 7 · HQ E 52 · 218TEU)와 100% 일치 검증(2026-07-11).
//   격자 구조: 밴드(가로 4블록)마다 [베이라벨 행] 위 + [로우라벨 행(08 06 04 02 01 03 05 07)] +
//   블록 오른쪽 1~3칸에 단(tier) 라벨 열(92~82=데크, 08~02=홀드). 마커는 (단라벨 행 × 로우라벨 열) 교차 셀.
export function parsePlanGrid(wb, XLSX) {
  const ROWLBL = new Set(Array.from({ length: 11 }, (_, i) => String(i).padStart(2, '0')));
  const TIER = /^(0[2468]|1[02468]|8[02468]|9[02468])$/;
  const BAYRE = /^\((\d{1,2})\)(\d{1,2})$|^(\d{1,2})$/;
  const slots = {};                              // (bay_row_tier) → slot (시트 간 겹침은 1회만 — 표준 패턴 중복 표기)
  const bySheet = {};
  for (const sn of wb.SheetNames) {
    const pod = PLAN_POD_SHEETS[String(sn).trim().toUpperCase()];
    if (!pod) continue;
    const ws = wb.Sheets[sn];
    if (!ws || !ws['!ref']) continue;
    const rg = XLSX.utils.decode_range(ws['!ref']);
    const nr = rg.e.r + 1, nc = rg.e.c + 1;
    const val = (r, c) => {
      if (r < 0 || c < 0 || r >= nr || c >= nc) return '';
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) return '';
      const v = cell.v;
      if (typeof v === 'number' && v === Math.floor(v)) {
        return (v >= 0 && v < 100) ? String(v).padStart(2, '0') : String(v);
      }
      return String(v).trim();
    };
    // 1) 로우라벨 런(블록 헤더) 수집
    const hdr = {};                              // r → [ [cols...], ... ]
    for (let r = 0; r < nr; r++) {
      const cols = [];
      for (let c = 0; c < nc; c++) if (ROWLBL.has(val(r, c))) cols.push(c);
      if (cols.length < 4) continue;
      const runs = []; let cur = [cols[0]];
      for (const c of cols.slice(1)) {
        if (c - cur[cur.length - 1] <= 2) cur.push(c); else { runs.push(cur); cur = [c]; }
      }
      runs.push(cur);
      const keep = runs.filter(x => x.length >= 3);
      if (keep.length) hdr[r] = keep;
    }
    const hrows = Object.keys(hdr).map(Number).sort((a, b) => a - b);
    let cnt = 0;
    for (let i = 0; i < hrows.length; i++) {
      const r = hrows[i];
      const rend = i + 1 < hrows.length ? hrows[i + 1] - 1 : Math.min(nr - 1, r + 13);
      for (const cols of hdr[r]) {
        // 2) 베이 라벨: 헤더 위 1~3행(다른 헤더행 만나면 중단) — '13' 또는 '(14)15'
        let bayOdd = null, bayEven = null;
        for (let rr = r - 1; rr >= Math.max(0, r - 3) && bayOdd == null; rr--) {
          if (hdr[rr]) break;                    // 하단 미러 로우라벨 행은 베이라벨 아님
          for (let c = Math.min(...cols) - 1; c <= Math.max(...cols) + 1; c++) {
            const m = BAYRE.exec(val(rr, c));
            if (m) {
              if (m[3] != null) { bayOdd = parseInt(m[3], 10); bayEven = bayOdd - 1; }
              else { bayEven = parseInt(m[1], 10); bayOdd = parseInt(m[2], 10); }
              break;
            }
          }
        }
        if (bayOdd == null) continue;            // 베이라벨 없는 런(하단 미러) — 블록 아님
        // 3) 단 라벨 열: 런 오른쪽 1~3칸 중 단 패턴이 2개 이상인 첫 열
        let tcol = null;
        for (let c = Math.max(...cols) + 1; c <= Math.min(nc - 1, Math.max(...cols) + 3); c++) {
          let hits = 0;
          for (let rr = r + 1; rr <= rend; rr++) if (TIER.test(val(rr, c))) hits++;
          if (hits >= 2) { tcol = c; break; }
        }
        if (tcol == null) continue;
        // 4) 마커 읽기
        for (let rr = r + 1; rr <= rend; rr++) {
          const t = val(rr, tcol);
          if (!TIER.test(t)) continue;
          for (const c of cols) {
            const cell = ws[XLSX.utils.encode_cell({ r: rr, c })];
            if (!cell || cell.v == null) continue;
            let mk = typeof cell.v === 'number' && (cell.v === 2 || cell.v === 4) ? String(cell.v) : String(cell.v).trim();
            let size = '', fe = '';
            if (mk === 'e') { size = '20'; fe = 'E'; }
            else if (mk === '2') { size = '20'; fe = 'F'; }
            else if (mk === 'E') { size = '40'; fe = 'E'; }
            else if (mk === '4') { size = '40'; fe = 'F'; }
            else continue;
            const bay = String(size === '20' ? bayOdd : bayEven);   // parseBAPLIE와 동일: 앞 0 없는 베이
            const row = val(r, c), tier = t;
            const k = `${bay}_${row}_${tier}`;
            if (!slots[k]) { slots[k] = { bay, row, tier, size, fe, pod }; cnt++; }
          }
        }
      }
    }
    bySheet[sn] = cnt;
  }
  return { slots: Object.values(slots), bySheet };
}

export async function buildAutoPayload(files, opts) {
  const vslCode = String(opts?.vslCode || '').trim().toUpperCase();
  const voy = String(opts?.voy || '').trim().toUpperCase();
  if (!vslCode || !voy) return { ok: false, error: 'vslCode/voy 필요' };
  const mode = opts?.mode === 'loading' || opts?.mode === 'discharge'
    ? opts.mode
    : (/[WS]$/.test(voy) ? 'loading' : 'discharge');

  // [1] 파일 분류·파싱 — EDI 후보 중 실번호 최다(동수면 총수 최다) 1개 채택(mergeApi와 같은 정신).
  let best = null;                 // { name, text, containers, cnCount }
  let plan = null;                 // V8.84-02: 플랜 격자 파싱 결과 { name, slots } — 슬롯 최다 1개 채택
  const records = {};              // 리스트 원시 병합(먼저 온 값 유지 + 빈칸 채움)
  const perFile = [];
  for (const f of files || []) {
    const name = f.name || '';
    try {
      if (/\.(xls|xlsx)$/i.test(name)) {
        const xk = _kind(name);
        if (xk === 'merged') {
          // V8.32-01: 합본(MERGED 시트, 'Cntr No' 헤더) 전용 파싱 — parseListExcel은 이 형식을 못 읽음(0건).
          const XLSX = await loadSheetJS();
          const wb = XLSX.read(await _asU8(f), { type: 'array' });
          const ws = wb.Sheets['MERGED'] || wb.Sheets[wb.SheetNames[0]];
          let mc = 0;
          (XLSX.utils.sheet_to_json(ws) || []).forEach(row => {
            const cn = String(row['Cntr No'] || '').replace(/\s/g, '').toUpperCase();
            if (!/^[A-Z]{4}\d{7}$/.test(cn)) return;
            mc++;
            const rec = { cn, _source: name };
            if (row['Seal'] != null && row['Seal'] !== '') rec.sl = String(row['Seal']).trim();
            if (row['EmptySeal'] != null && row['EmptySeal'] !== '') rec.eseal = String(row['EmptySeal']).trim();
            const w = parseInt(row['Weight'], 10);
            if (w > 0) rec.wt = w;
            // V9.20-02: 합본에 있는 ISO/F/E/Line/POL/POD도 옮긴다 — 안 옮겨서 26353W 256대가
            //   전부 'F/E 미정 + 기타 ISO'로 등록되던 사건(2026-07-28 실측). 합본이 유일 리스트인 항차 보호.
            const feRaw = String(row['F/E'] || '').trim().toUpperCase();
            if (feRaw === 'F' || feRaw === 'E') rec.fe = feRaw;
            const isoRaw = String(row['ISO'] || '').trim().toUpperCase();
            if (isoRaw) rec.iso = isoRaw;
            if (row['Line'] != null && row['Line'] !== '') rec.op = String(row['Line']).trim().toUpperCase();
            if (row['POL'] != null && row['POL'] !== '') rec.pol = String(row['POL']).trim().toUpperCase();
            if (row['POD'] != null && row['POD'] !== '') rec.pod = String(row['POD']).trim().toUpperCase();
            // 엠티인데 Seal만 있는 합본(엠티실을 Seal 열에 실는 수집기 포맷) → eseal로도 복사
            if (rec.fe === 'E' && rec.sl && !rec.eseal) rec.eseal = rec.sl;
            if (!records[cn]) { records[cn] = rec; return; }
            const prev = records[cn];
            for (const [k, v] of Object.entries(rec)) {
              if (prev[k] === '' || prev[k] == null) prev[k] = v;
            }
          });
          perFile.push({ name, kind: 'merged', count: mc });
          continue;
        }
        // V8.84-02: 플랜 대상 선박(TMPZ)이면 격자 플랜 워크북인지 먼저 확인 — 시트명이 목적항(PLAN_POD_SHEETS)이고
        //   격자 슬롯이 잡히면 플랜으로 처리(리스트 파싱 대상 아님). 아니면 기존 리스트 흐름으로.
        if (PLAN_VIRTUAL_SHIPS.has(vslCode)) {
          try {
            const XLSX = await loadSheetJS();
            const wb = XLSX.read(await _asU8(f), { type: 'array' });
            if (wb.SheetNames.some(sn => PLAN_POD_SHEETS[String(sn).trim().toUpperCase()])) {
              const pg = parsePlanGrid(wb, XLSX);
              if (pg.slots.length) {
                perFile.push({ name, kind: 'plan', count: pg.slots.length });
                if (!plan || pg.slots.length > plan.slots.length) plan = { name, slots: pg.slots };
                continue;
              }
            }
          } catch (e) {
            // V9.57(G9): 플랜 판별 실패는 리스트 흐름으로 계속하되 로그는 남긴다 — 조용한 실패 금지.
            console.warn('[autoRegApi] 플랜 격자 판별 실패 — 리스트로 처리:', name, e);
          }
        }
        if (xk !== 'list') { perFile.push({ name, kind: 'skip' }); continue; }
        const out = await parseListExcel(await _asU8(f));
        const recs = (out && out.records) || [];
        recs.forEach(r => {
          if (!r.cn) return;
          const cn = r.cn.toUpperCase();
          if (!records[cn]) { records[cn] = { ...r, cn, _source: name }; return; }
          const prev = records[cn];
          for (const [k, v] of Object.entries(r)) {
            if (v === '' || v == null) continue;
            if (prev[k] === '' || prev[k] == null) prev[k] = v;   // 빈칸만 채움
          }
        });
        perFile.push({ name, kind: 'list', count: recs.length });
      } else {
        const text = await _asText(f);
        const kind = _kind(name, text.slice(0, 12));
        if (kind !== 'edi' && kind !== 'asc' && kind !== 'ifcsum') { perFile.push({ name, kind: 'skip' }); continue; }
        // V9.57(G4): IFCSUM도 parseBAPLIE로 — 숫자형 라우팅 내장(00:IFCSUM→parseNumericIFCSUM,
        //   00:BAPLIE→parseNumericBAPLIE). ISO_MAP 정규화·B/L split 병합이 정식 파서에서 처리된다.
        const r = kind === 'asc' ? parseAscFile(text) : parseBAPLIE(text);
        const isVirtual = kind === 'ifcsum' || !!(r && r._virtualEdi);   // 가상 EDI(리스트 겸용) 표식 유지
        const cs = (r && r.containers) || [];
        const cnCount = cs.filter(c => c.cn && c.cn.length === 11).length;
        // V8.35-01: 동률이면 규격(iso) 보유 수가 많은 쪽 우선 — ASC(규격 일부 누락)가 알파벳순으로
        //   BAPLIE를 밀어내 카고플랜 규격 180대 누락(PCSZ 2619E 사건, 사용자 발견 2026-07-03).
        const isoCount = cs.filter(c => c.cn && c.iso).length;
        perFile.push({ name, kind, count: cs.length, cnCount, isoCount });
        if (!best || cnCount > best.cnCount
            || (cnCount === best.cnCount && isoCount > (best.isoCount || 0))
            || (cnCount === best.cnCount && isoCount === (best.isoCount || 0) && cs.length > best.containers.length)) {
          best = { name, text, containers: cs, cnCount, isoCount, virtual: isVirtual };
        }
      }
    } catch (e) { perFile.push({ name, error: String(e && e.message || e) }); }
  }

  // [2] ediContainers — VoyagePage 재처리와 동일 분류.
  const ediContainers = {};
  if (best) {
    best.containers.forEach(c => {
      // V9.57(G6): 선적 평택 판정에 _inList(리스트 등록=평택) 반영 — 화면(BayPlan·카고플랜) 규칙과 통일.
      //   TODO: utils.isPtk(c, mode)가 export되면(팀F 추가 중) 이 인라인을 임포트로 교체.
      const podPtk = isPyeongtaekPort(c.pod);
      const polPtk = c._inList || isPyeongtaekPort(c.pol);
      const containerMode = mode === 'discharge' ? (podPtk ? 'discharge' : 'transit') : (polPtk ? 'loading' : 'transit');
      const key = c.cn && c.cn.length === 11 ? c.cn : `__SLOT_${c.bay}_${c.row}_${c.tier}`;
      ediContainers[key] = { ...c, _slotKey: key, _mode: containerMode };
    });
  }

  // V8.33-01: 가상 EDI(IFCSUM)는 실번호·무게를 담고 있으므로 리스트(records)도 함께 생성 — 앱 매칭용.
  //   (리스트가 없으면 매칭 0으로 보이는 문제, 사용자 지적 2026-07-03.)
  if (best && best.virtual) {
    best.containers.forEach(c => {
      if (!c.cn || c.cn.length !== 11) return;
      const cn = c.cn.toUpperCase();
      const rec = { cn, _source: best.name };
      if (c.sl) rec.sl = c.sl;
      if (c.eseal) rec.eseal = c.eseal;   // V9.57(G4): 정식 IFCSUM 파서는 엠티실을 eseal로 분리해 담는다
      if (c.wt) rec.wt = c.wt;
      if (!records[cn]) { records[cn] = rec; return; }
      const prev = records[cn];
      for (const [k, v] of Object.entries(rec)) {
        if (prev[k] === '' || prev[k] == null) prev[k] = v;
      }
    });
  }

  // 가상 선적 EDI(RZOR·OBWH) — 선적인데 진짜 EDI가 없으면(best 없음) 리스트를 선적 ediContainers로 승격한다.
  //   POL 평택으로 채워 대시보드 선적 카운트(_ptkCountOfSection·POL평택)에 잡히게. _virtualFromList로 '가상/리스트' 배지.
  //   RZOR는 선적 EDI가 안 와 이 가상이 최종. OBWH는 나중에 실 EDI가 오면 best로 잡혀 ediContainers를 덮어씀(자동 마무리).
  if (mode === 'loading' && !best && VIRTUAL_LOAD_SHIPS.has(vslCode) && Object.keys(records).length) {
    for (const cn of Object.keys(records)) {
      ediContainers[cn] = { ...records[cn], cn, pol: 'KRPTK', _slotKey: cn, _mode: 'loading', _virtualEdi: true, _virtualFromList: true };
    }
  }

  // V8.84-02: 플랜 가상 선적 EDI(TMPZ) — 선적인데 진짜 EDI가 없으면 플랜 격자 슬롯을 '자리만' 등록한다.
  //   컨번호 미배정(__SLOT_ 키) — 임의 배정 금지(사용자 확정 2026-07-11). 컨번호는 NOLIST 리스트(records)가 담당.
  //   나중에 실 EDI가 오면 best로 잡혀 이 블록은 건너뛰어 자동 대체된다.
  if (mode === 'loading' && !best && plan && plan.slots.length) {
    for (const s of plan.slots) {
      const key = `__SLOT_${s.bay}_${s.row}_${s.tier}`;
      ediContainers[key] = {
        bay: s.bay, row: s.row, tier: s.tier,
        iso: s.size === '20' ? '22G1' : '45G1', fe: s.fe,
        pol: 'KRPTK', pod: s.pod,
        _slotKey: key, _mode: 'loading', _virtualEdi: true, _virtualFromPlan: true, _source: plan.name,
      };
    }
  }

  // [3] 항차 info — HomePage 수동 생성(handleCreate)과 같은 스키마 + 자동 표시.
  const info = {
    vsl: vslCode, voy, mode,
    createdAt: Date.now(),
    createdBy: '자동등록(수집기)',
    autoRegistered: true,
    autoStatus: opts?.phase === 'confirm' ? 'confirmed' : 'collecting',
  };
  if (mode === 'discharge') info.voy_d = voy; else info.voy_l = voy;

  const counts = {
    edi: Object.keys(ediContainers).length,
    ediWithCn: Object.keys(ediContainers).filter(k => !k.startsWith('__SLOT')).length,
    ptk: Object.values(ediContainers).filter(c => c._mode === mode).length,
    records: Object.keys(records).length,
  };
  return {
    ok: !!best || counts.records > 0 || counts.edi > 0,   // V8.84-02: 플랜만 있어도(리스트 아직) 등록 성공
    key: `${vslCode}_${voy}`, mode, info, ediContainers, records, counts, perFile,
    ediRaw: best ? { text: best.text, fileName: best.name, parserVersion: APP_VERSION } : null,
  };
}

if (typeof window !== 'undefined') { window.GMautoPayload = buildAutoPayload; }
