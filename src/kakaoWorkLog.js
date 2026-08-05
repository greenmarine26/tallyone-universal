// TallyOne 1.8-15: 카톡 작업방 기록 → 타임시트 보강
//
// 왜 (검수사 확정 2026-08-05)
//   해치커버를 앱이 아니라 **카톡에 손으로 쳐서** 보고한 건이 많다. 되묻는 게 성가셔 우회했거나,
//   1호기·2호기가 각자 편한 방식으로 보냈다. 그래서 앱 기록에는 오픈만 남고 클로즈가 비어,
//   마감 텔리 타임시트가 "커버가 열린 채 마감"으로 나왔다(STMJ 2643E 실측 — 불가능한 서류).
//   카톡방에는 실제로 다 남아 있다. **그 방을 정본으로 삼아 빠진 것을 메운다.**
//
// 무엇을 읽나 (실물 로그 2026-08-05 STMJ 전수 기준)
//   줄 형식      `[발신자] [HH:MM] 내용`  ·  날짜 전환선 `26년 8월 5일`
//   해치 오픈    `26번베이 커버 2장 오픈` · `13&15 H/O 2장 입니다` · 앱 형식(여러 줄)
//   해치 클로즈  `14번베이 커버 2장 클로즈` · `05&07 H/C 2장 입니다` · 앱 형식
//   작업         `1호기 양하시작` · `1호기 양하종료` · `2호기 양하완료 선적시작`(한 줄에 둘)
//   장비         내용 안에 있거나, 22:16 처럼 **다음 메시지**에 따로 온다 → 바로 뒤 1분 이내면 물려준다
//
// ⚠ 베이 표기가 두 가지다. `13&15`(홀수 쌍 = 13-14-15 한 슬롯)와 `26번베이`(짝수 단독)가
//   같은 슬롯을 가리킨다. 둘 다 그대로 담고, 그룹 판정은 읽는 쪽(bayGroupCenter)에 맡긴다.
// ⚠ 사진·잡담(`사진 3장`, `넹`, `씰번호 리스트랑 맞아요`)은 버린다. 지어내지 않는다.

const RE_LINE = /^\[([^\]]*)\]\s*\[(\d{1,2}):(\d{2})\]\s*(.*)$/;
const RE_DATE = /^(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/;
const RE_EQUIP = /(\d)\s*호기/;

/** `26번베이` `18번 베이` */
const RE_BAYNO = /(\d{1,2})\s*번\s*베이/;
/** 앱 형식 `베이: 18` 또는 `베이: 25, 26, 27` */
const RE_APPBAY = /베이\s*[:：]\s*([\d,\s]+)/;
/** `2장` `1장` */
const RE_PANEL = /(\d+)\s*장/;

/**
 * 베이 번호 뽑기 — 검수사마다 표기가 다르다(검수사 확인 2026-08-05).
 *   짝수 단독      `26번베이` `18번 베이`
 *   홀수 묶음      `13&15` `13/15` `13-15` `13_15` `13,15` `13 15`
 *   세 개 이상     `17,18,19` `1 2 3` `1-3`
 * ⚠ 띄어쓰기 표기(`1 2 3`)가 있어 **장수(`2장`)·장비(`2호기`)를 먼저 걷어내야** 한다.
 *   안 그러면 "커버 2장"의 2 를 베이로 읽는다.
 * ⚠ 장수는 **적힌 대로** 쓴다. 추론하지 않는다 — 같은 홀수 쌍이라도 슬롯에 따라 1장·2장이 다르다
 *   (실측: `01&03` 은 1장, `13&15`·`09&11`·`05&07` 은 2장).
 */
function extractBays(body) {
  const app = RE_APPBAY.exec(body);
  if (app) return app[1].split(',').map(s => s.trim()).filter(Boolean);

  const bn = RE_BAYNO.exec(body);
  if (bn) return [bn[1]];

  // 장수·장비·날짜/시각을 먼저 제거한 뒤 남은 숫자만 본다.
  let s = body
    .replace(/\d+\s*호기/g, ' ')
    .replace(/\d+\s*장/g, ' ')
    .replace(/시각\s*[:：].*/g, ' ')
    .replace(/\d{1,2}\s*[:：]\s*\d{2}/g, ' ')
    .replace(/총/g, ' ');
  // 동작 낱말 앞쪽만 본다(뒤에 붙는 잡말의 숫자를 피한다).
  const cut = s.search(/H\s*\/\s*[OC]|오픈|클로즈|크로즈|OPEN|CLOSE|커버|닫/i);
  if (cut > 0) s = s.slice(0, cut);
  const nums = s.match(/\d{1,2}/g) || [];
  return nums.map((n) => String(parseInt(n, 10))).filter((n) => +n >= 1 && +n <= 99);
}

const isOpenWord = (s) => /오픈|OPEN|H\s*\/\s*O\b/i.test(s);
const isCloseWord = (s) => /클로즈|크로즈|닫|CLOSE|H\s*\/\s*C\b/i.test(s);

/**
 * 카톡방 텍스트를 작업 기록 후보로 바꾼다.
 * @param {string} text 카톡 내보내기 또는 복사한 대화
 * @param {{baseDate?: Date}} opts baseDate = 날짜 전환선이 나오기 전 기준일(보통 작업 시작일)
 * @returns {{items: Array, skipped: number}} items = {ts, kind:'hatch'|'work_status', action, bays, panelCount, equip, mode, raw}
 */
export function parseKakaoWorkLog(text, opts = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const base = opts.baseDate instanceof Date ? new Date(opts.baseDate) : new Date();
  let y = base.getFullYear(), mo = base.getMonth(), d = base.getDate();
  let prevMin = -1;                 // 자정 넘어감 감지용(날짜 전환선이 없을 때)
  const items = [];
  let skipped = 0;
  let pending = null;               // 장비가 다음 줄에 오는 경우를 위해 직전 항목을 잡아둔다

  // 앱 형식은 여러 줄이라 한 덩어리로 모은다.
  const blocks = [];
  for (const raw of lines) {
    const m = RE_LINE.exec(raw);
    if (m) blocks.push({ who: m[1], hh: +m[2], mm: +m[3], body: m[4], extra: [] });
    else if (RE_DATE.test(raw)) blocks.push({ dateLine: raw });
    else if (blocks.length && !blocks[blocks.length - 1].dateLine) blocks[blocks.length - 1].extra.push(raw);
  }

  for (const b of blocks) {
    if (b.dateLine) {
      const dm = RE_DATE.exec(b.dateLine);
      if (dm) { y = 2000 + (+dm[1]); mo = (+dm[2]) - 1; d = +dm[3]; prevMin = -1; }
      continue;
    }
    const body = [b.body, ...b.extra].join('\n').trim();
    if (!body) { skipped += 1; continue; }

    // 날짜 전환선이 없어도 시각이 되감기면 하루 넘긴 것으로 본다(카톡 복사본에 구분선이 빠질 때가 있다).
    const cur = b.hh * 60 + b.mm;
    if (prevMin >= 0 && cur + 120 < prevMin) { const nx = new Date(y, mo, d + 1); y = nx.getFullYear(); mo = nx.getMonth(); d = nx.getDate(); }
    prevMin = cur;
    const ts = new Date(y, mo, d, b.hh, b.mm).getTime();

    const eq = RE_EQUIP.exec(body);
    const equip = eq ? `${eq[1]}호기` : '';

    // ── 장비만 달랑 온 줄 (22:16 "2호기") → 바로 앞 항목에 물려준다
    if (equip && body.replace(RE_EQUIP, '').replace(/[\s.]/g, '') === '') {
      if (pending && !pending.equip && Math.abs(ts - pending.ts) <= 120000) pending.equip = equip;
      else skipped += 1;
      continue;
    }

    // ── 해치커버
    const open = isOpenWord(body), close = isCloseWord(body);
    if (open || close) {
      const bays = extractBays(body);
      if (bays.length) {
        const pc = RE_PANEL.exec(body);
        const it = {
          ts, kind: 'hatch', action: close ? 'close' : 'open',
          bays: bays.map(s => String(parseInt(s, 10))),
          panelCount: pc ? +pc[1] : null, equip, raw: body.split('\n')[0].slice(0, 60),
        };
        items.push(it); pending = it;
        continue;
      }
      skipped += 1; continue;
    }

    // ── 작업 시작·종료 (한 줄에 둘이 올 수 있다: "2호기 양하완료 선적시작")
    let hit = false;
    for (const [re, action, mode] of [
      [/양하\s*(시작|개시)/, 'discharge_start', 'discharge'],
      [/양하\s*(종료|완료|끝)/, 'discharge_done', 'discharge'],
      [/선적\s*(시작|개시)/, 'loading_start', 'loading'],
      [/선적\s*(종료|완료|끝)/, 'loading_done', 'loading'],
      [/(중단|중지|정지)/, 'pause', ''],
      [/(재개)/, 'resume', ''],
    ]) {
      if (!re.test(body)) continue;
      const it = { ts, kind: 'work_status', action, mode, equip, raw: body.split('\n')[0].slice(0, 60) };
      items.push(it); pending = it; hit = true;
    }
    if (!hit) skipped += 1;
  }
  items.sort((a, b2) => a.ts - b2.ts);
  return { items, skipped };
}

/** 이미 앱에 있는 기록과 대조해 **빠진 것만** 추린다.
 *  같은 동작·같은 그룹이 ±20분 안에 있으면 중복으로 본다(사람이 친 시각과 앱 시각이 조금 다르다). */
export function diffAgainstReports(items, reports, groupOf) {
  const have = [];
  for (const r of Object.values(reports || {})) {
    if (!r || !r.ts) continue;
    if (r.type === 'hatch') have.push({ kind: 'hatch', action: r.action, ts: r.ts, groups: (r.bays || []).map(groupOf).filter(g => g != null) });
    else if (r.type === 'work_status') have.push({ kind: 'work_status', action: r.action, ts: r.ts });
  }
  const out = [];
  for (const it of items) {
    let dup = false;
    if (it.kind === 'hatch') {
      const gs = it.bays.map(groupOf).filter(g => g != null);
      dup = have.some(h => h.kind === 'hatch' && h.action === it.action &&
        Math.abs(h.ts - it.ts) <= 20 * 60000 && gs.some(g => h.groups.includes(g)));
    } else {
      dup = have.some(h => h.kind === 'work_status' && h.action === it.action && Math.abs(h.ts - it.ts) <= 20 * 60000);
    }
    out.push({ ...it, dup });
  }
  return out;
}
