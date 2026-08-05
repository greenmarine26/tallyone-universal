# 평택항 두 터미널(PNCT·PCTC)의 공개 선석배정 조회 — 항차의 진실(짝 E/W·계획시각·상태)을 받아 온다.
"""검수사가 매일 업무로 보는 **로그인 없는 공개 조회 화면**을 수집기가 대신 한 번 읽는다.

  · PNCT  POST http://www.pnct.co.kr/c001/m002Ctr/selectVslList.do
          본문은 넥사크로 XML(Dataset ds_cond · STR_DATE/END_DATE = YYYYMMDD),
          응답은 XML Dataset ds_list. 선사항차 짝이 OPR_VVD 에 `OBWH090(2705E/2706W)` 로 온다.
  · PCTC  GET  http://www.pctc21.com/esvc/vessel/berthScheduleG
          접속만으로 7일치 서버렌더 HTML. 선사항차 짝은 `2643E-2644W` 하이픈 표기.

이 모듈은 **받아 오고 읽기만** 한다 — 항차 대조·등록 게이트·정리는 app_upload 가 한다
(항차 정수 비교 voy_ident 가 거기 있고, 서로 부르면 순환하기 때문).

돌려주는 값은 언제나 (목록, None) 또는 (None, 사유) 다. 조용히 실패하지 않는다.
한 줄(레코드)의 모양:
  terminal      'PNCT' | 'PCTC'
  vessel_code   4글자 선박코드(PNCT VVD 앞 4자 · PCTC 모선항차 앞 4자)
  vessel_name   선박 실명            master_vvd  모선항차 원문(OBWH090 · STMJ-0007-(P))
  voy_d/voy_l   선사항차 짝(양하 E/N · 선적 W/S). 방향이 안 맞는 쪽은 비운다(지어내지 않는다)
  route         항로코드             pier        부두 'PCTC' | 'PNCT'
  berth         검수앱 규약 표기 '동부두 9번선석'(못 만들면 ''), berth_raw 는 터미널 원문
  eta/etb/etd/ata/atb/atd  'YYYY-MM-DD HH:MM'(못 읽으면 '')
  status        검수앱 계약값 'departed' | 'working' | 'planned' | ''
  status_raw    터미널 원문 상태(PNCT VSL_STATE 'D'/'P' · PCTC 차트 class plan/work/done)
  departed      실적으로 이미 나간 항차인가(정리 판정의 근거)
  dis_van/load_van  양하/선적 물량
"""

import datetime
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

PNCT_URL = "http://www.pnct.co.kr/c001/m002Ctr/selectVslList.do"
PCTC_URL = "http://www.pctc21.com/esvc/vessel/berthScheduleG"
TIMEOUT = 20                       # 초 — 사이클을 붙잡지 않는다
USER_AGENT = "Mozilla/5.0 (MailPilot Uni berth-schedule reader)"

# PNCT 조회 창 — 뒤로 7일까지 본다. 지난 항차 정리(ATD 확인)의 근거가 여기서 나온다.
#   실측: 뒤 7일 창에서 TNJP055(26354E/26354W)·OBWH088(2701E/2702W) 같은 '이미 나간 항차'가
#   ATD 와 함께 그대로 잡힌다. 뒤 1일만 보면 그 근거가 없어 옛 카드를 지울 수 없다.
DEFAULT_DAYS_BACK = 7
DEFAULT_DAYS_FWD = 7

_NS = "{http://www.nexacroplatform.com/platform/dataset}"

# PNCT OPR_VVD — `OBWH090(2705E/2706W)` · 한쪽이 빈 `ATPR033(/2636W)` 도 있다.
_PNCT_PAIR = re.compile(r"^\s*([A-Z0-9]+)\s*\(\s*([A-Z0-9]*)\s*/\s*([A-Z0-9]*)\s*\)")
# 시각 — PNCT `2026/08/05 22:00` · PCTC `2026-08-05 08:00`
_DT = re.compile(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})")

# PCTC 상세 블록 · 차트 막대 · 선석 행
_PCTC_BLOCK = '<div class="berth-schedule box-on hide '
_PCTC_CELL = re.compile(
    r'<td[^>]*class="bg-skyblue"[^>]*>([^<]*)</td>\s*<td[^>]*>(.*?)</td>', re.S)
_PCTC_BAR = re.compile(
    r'<div class="berth-chart\s+(\w+)"[^>]*data-voy-no="([^"]*)"[^>]*style="[^"]*top:\s*(\d+)px')
_PCTC_ROW = re.compile(
    r'<tr class="h-big [^"]*"\s*style="height:\s*(\d+)px">\s*<td class="bg-blue2">([^<]*)</td>')
_TAG = re.compile(r"<[^>]+>")


# ──────────────────────────── 값 다듬기 ────────────────────────────

def norm_dt(text):
    """터미널 시각 표기 → 'YYYY-MM-DD HH:MM'. 못 읽으면 '' (지어내지 않는다)."""
    match = _DT.search(str(text or ""))
    if not match:
        return ""
    year, month, day, hour, minute = (int(g) for g in match.groups())
    try:
        return datetime.datetime(year, month, day, hour, minute).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return ""


def dt_ms(text):
    """'YYYY-MM-DD HH:MM' → 로컬시각 epoch(ms). 못 읽으면 None."""
    stamp = norm_dt(text)
    if not stamp:
        return None
    return int(datetime.datetime.strptime(stamp, "%Y-%m-%d %H:%M").timestamp() * 1000)


def _now_ms():
    return int(datetime.datetime.now().timestamp() * 1000)


def _past(stamp, now_ms=None):
    """이 시각이 이미 지났는가. 못 읽으면 False."""
    value = dt_ms(stamp)
    return value is not None and value < (now_ms if now_ms is not None else _now_ms())


def _http(url, data=None, headers=None, timeout=TIMEOUT, opener=None):
    """한 번만 부른다. 실패는 예외 그대로 올린다(부르는 쪽이 사유를 남긴다)."""
    head = {"User-Agent": USER_AGENT}
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method="POST" if data is not None else "GET")
    call = opener or urllib.request.urlopen
    with call(req, timeout=timeout) as res:
        raw = res.read()
    return raw.decode("utf-8", "replace")


def _blank_row(terminal):
    return {"terminal": terminal, "vessel_code": "", "vessel_name": "", "master_vvd": "",
            "voy_d": "", "voy_l": "", "route": "", "eta": "", "etb": "", "etd": "",
            "ata": "", "atb": "", "atd": "", "berth": "", "berth_raw": "", "pier": terminal,
            "status": "", "status_raw": "", "departed": False,
            "dis_van": "", "load_van": ""}


def _set_pair(row, first, second, note):
    """선사항차 짝을 넣는다 — 앞은 양하(E/N)·뒤는 선적(W/S). 방향이 안 맞으면 비우고 사유를 남긴다.

    실측 예: `2606N-2606N`(SWSP) 처럼 두 쪽이 같은 왕복 항차, `2605W-2605W`(KBTR) 처럼
    앞쪽이 선적 표기인 줄이 있다. 그런 칸은 넘겨짚지 않고 비운다.
    """
    first = re.sub(r"[^A-Za-z0-9]", "", str(first or "")).upper()
    second = re.sub(r"[^A-Za-z0-9]", "", str(second or "")).upper()
    if first:
        if first[-1] in ("E", "N"):
            row["voy_d"] = first
        else:
            note.append("%s 앞 항차 %s 는 양하 방향(E/N)이 아니라 비웠습니다"
                        % (row.get("master_vvd") or row.get("vessel_code"), first))
    if second:
        if second[-1] in ("W", "S"):
            row["voy_l"] = second
        else:
            note.append("%s 뒤 항차 %s 는 선적 방향(W/S)이 아니라 비웠습니다"
                        % (row.get("master_vvd") or row.get("vessel_code"), second))


# ──────────────────────────── PNCT ────────────────────────────

def pnct_body(str_date, end_date):
    """넥사크로 조회 본문(ds_cond) — 화면이 보내는 모양 그대로."""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Root xmlns="http://www.nexacroplatform.com/platform/dataset">\n'
        '  <Parameters></Parameters>\n'
        '  <Dataset id="ds_cond">\n'
        '    <ColumnInfo>\n'
        '      <Column id="STR_DATE" type="STRING" size="256"/>\n'
        '      <Column id="END_DATE" type="STRING" size="256"/>\n'
        '    </ColumnInfo>\n'
        '    <Rows><Row>\n'
        '      <Col id="STR_DATE">%s</Col>\n'
        '      <Col id="END_DATE">%s</Col>\n'
        '    </Row></Rows>\n'
        '  </Dataset>\n'
        '</Root>' % (str_date, end_date))


def parse_pnct(text, now_ms=None):
    """PNCT 응답 XML → (목록, None) | (None, 사유). 메모(넘겨짚지 않고 비운 칸)는 세 번째로."""
    notes = []
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        return None, "응답이 XML 이 아닙니다(%s)" % exc, notes
    rows = []
    for dataset in root.iter(_NS + "Dataset"):
        if dataset.get("id") != "ds_list":
            continue
        for node in dataset.iter(_NS + "Row"):
            raw = {}
            for col in node:
                raw[col.get("id")] = " ".join((col.text or "").split())
            row = _blank_row("PNCT")
            row["vessel_name"] = raw.get("VSL_NAME", "")
            row["master_vvd"] = raw.get("VVD", "")
            row["route"] = raw.get("ROUTE", "").upper()
            row["dis_van"] = raw.get("DIS_VAN", "")
            row["load_van"] = raw.get("LOAD_VAN", "")
            # PNCT 선석 표기(T2·T3·F1)에는 선석 번호가 없다. 앱 isValidBerth 가 두 글자를
            #   걸러 내고 저장값을 지워 버리므로(HomePage 301행) berth 는 비우고 원문만 남긴다.
            row["berth_raw"] = raw.get("BERTH_NO", "") or raw.get("BERTH", "")
            for field, key in (("eta", "ETA_DATE"), ("etb", "ETB_DATE"), ("etd", "ETD_DATE"),
                               ("ata", "ATA_DATE"), ("atb", "ATB_DATE"), ("atd", "ATD_DATE")):
                given = raw.get(key, "")
                row[field] = norm_dt(given)
                if given and not row[field]:
                    notes.append("PNCT %s %s 시각을 못 읽어 비웠습니다: %r"
                                 % (row["master_vvd"], key, given))
            pair = _PNCT_PAIR.match(raw.get("OPR_VVD", ""))
            if pair:
                row["vessel_code"] = pair.group(1)[:4].upper()
                _set_pair(row, pair.group(2), pair.group(3), notes)
            else:
                notes.append("PNCT %s 선사항차(OPR_VVD)를 못 읽었습니다: %r"
                             % (row["master_vvd"], raw.get("OPR_VVD", "")))
            if not row["vessel_code"]:
                row["vessel_code"] = re.sub(r"[^A-Z]", "", row["master_vvd"].upper())[:4]
            row["status_raw"] = raw.get("STATUS", "") or raw.get("VSL_STATE", "")
            # 상태는 검수앱 계약값(departed/working/planned)으로만 쓴다 — src/badgeRule.js 40행.
            #   실측: VSL_STATE 'D' 줄은 전부 ATD 가 있고 'P' 줄은 하나도 없다. 실적으로 판정한다.
            if row["atd"]:
                row["status"] = "departed"
            elif row["atb"]:
                row["status"] = "working"
            elif row["etb"]:
                row["status"] = "planned"
            row["departed"] = bool(row["atd"]) and _past(row["atd"], now_ms)
            if not row["vessel_code"]:
                notes.append("PNCT 선박코드를 못 읽어 건너뜁니다: %r" % raw.get("VVD", ""))
                continue
            rows.append(row)
    if not rows:
        return None, "ds_list 에 항차가 없습니다", notes
    return rows, None, notes


def fetch_pnct(days_back=DEFAULT_DAYS_BACK, days_fwd=DEFAULT_DAYS_FWD,
               timeout=TIMEOUT, opener=None, today=None, now_ms=None):
    """PNCT 선석배정 1회 조회 → (목록, None, 메모) | (None, 사유, 메모)."""
    base = today or datetime.date.today()
    body = pnct_body((base - datetime.timedelta(days=int(days_back))).strftime("%Y%m%d"),
                     (base + datetime.timedelta(days=int(days_fwd))).strftime("%Y%m%d"))
    try:
        text = _http(PNCT_URL, data=body.encode("utf-8"),
                     headers={"Content-Type": "text/xml; charset=UTF-8"},
                     timeout=timeout, opener=opener)
    except Exception as exc:                       # 조용한 실패 금지 — 사유를 그대로 올린다
        return None, "PNCT 조회 실패(%s: %s)" % (type(exc).__name__, exc), []
    return parse_pnct(text, now_ms=now_ms)


# ──────────────────────────── PCTC ────────────────────────────

def _pctc_berth_rows(html):
    """차트 왼쪽 선석 행 → [(top 시작, top 끝, '9B'), …]. 막대의 top 픽셀로 선석을 되읽는다."""
    out, top = [], 0
    for height, label in _PCTC_ROW.findall(html):
        try:
            span = int(height)
        except ValueError:
            continue
        out.append((top, top + span, label.strip()))
        top += span
    return out


def _pctc_berth_of(rows, top):
    for start, end, label in rows:
        if start <= top < end:
            return label
    return ""


def pctc_berth_text(label):
    """PCTC 차트 선석 '9B' → 검수앱이 받아 주는 표기 '동부두 9번선석'.

    앱은 src/utils.js isValidBerth 로 두 글자짜리('9B')를 걸러 내고, 걸리면 저장된 berth 를
    지워 버린다(HomePage 301행). 숫자만 뽑아 앱 규약(extractBerthNo: `n번선석`)에 맞춘다.
    번호를 못 뽑으면 '' — 없는 선석을 만들어 내지 않는다.
    """
    match = re.match(r"^\s*(\d+)", str(label or ""))
    return "동부두 %d번선석" % int(match.group(1)) if match else ""


def parse_pctc(html, now_ms=None):
    """PCTC 선석배정 차트 HTML → (목록, None, 메모) | (None, 사유, 메모)."""
    notes = []
    if _PCTC_BLOCK not in html:
        return None, "선석배정 차트에 항차 블록이 없습니다", notes
    berth_rows = _pctc_berth_rows(html)
    bars = {}
    for state, voy_no, top in _PCTC_BAR.findall(html):
        try:
            bars[voy_no] = (state, _pctc_berth_of(berth_rows, int(top)))
        except ValueError:
            bars[voy_no] = (state, "")
    rows = []
    for chunk in html.split(_PCTC_BLOCK)[1:]:
        master = chunk.split('"', 1)[0].strip()
        body = chunk.split("</div>", 1)[0]
        cell = {}
        for label, value in _PCTC_CELL.findall(body):
            cell[label.strip()] = " ".join(_TAG.sub("", value).split())
        row = _blank_row("PCTC")
        row["master_vvd"] = master
        row["vessel_code"] = re.sub(r"[^A-Z0-9]", "", master.split("-")[0].upper())[:4]
        row["vessel_name"] = cell.get("선박명", "")
        row["route"] = cell.get("항로", "").upper()
        row["etb"] = norm_dt(cell.get("접안(예정)시간", ""))
        row["etd"] = norm_dt(cell.get("출항 시간", ""))
        for label, field in (("접안(예정)시간", "etb"), ("출항 시간", "etd")):
            if cell.get(label) and not row[field]:
                notes.append("PCTC %s %s 시각을 못 읽어 비웠습니다: %r"
                             % (master, label, cell.get(label)))
        vans = (cell.get("양하/적하/이적/합계") or "").split("/")
        if len(vans) >= 2:
            row["dis_van"], row["load_van"] = vans[0].strip(), vans[1].strip()
        pair_text = (cell.get("선사항차") or "").strip()
        if pair_text and pair_text != "-":
            parts = pair_text.split("-")
            if len(parts) == 2:
                _set_pair(row, parts[0], parts[1], notes)
            else:
                notes.append("PCTC %s 선사항차 표기를 못 읽었습니다: %r" % (master, pair_text))
        state, berth = bars.get(master, ("", ""))
        row["status_raw"] = state
        row["berth_raw"] = berth
        row["berth"] = pctc_berth_text(berth)
        # PCTC 는 상태 글자가 없다 — 차트 범례(예정/계획완료/완료)의 class 와 시각으로 읽는다.
        #   done  = 완료(막대가 초록) · work = 계획완료 · plan = 예정.
        #   '작업중'은 계획완료 막대이면서 접안시각이 이미 지난 줄로만 본다(넘겨짚지 않는다).
        if state == "done":
            row["status"] = "departed"
        elif state == "work":
            row["status"] = "working" if _past(row["etb"], now_ms) else "planned"
        elif state:
            row["status"] = "planned"
        # 실적 출항시각을 안 주므로 '완료 막대 + 출항시각이 지남' 두 신호가 다 설 때만 나간 것으로 본다.
        row["departed"] = state == "done" and _past(row["etd"], now_ms)
        if not row["vessel_code"]:
            notes.append("PCTC 선박코드를 못 읽어 건너뜁니다: %r" % master)
            continue
        rows.append(row)
    if not rows:
        return None, "선석배정 차트에서 항차를 못 읽었습니다", notes
    return rows, None, notes


def fetch_pctc(timeout=TIMEOUT, opener=None, now_ms=None):
    """PCTC 선석배정 차트 1회 조회 → (목록, None, 메모) | (None, 사유, 메모)."""
    try:
        html = _http(PCTC_URL, timeout=timeout, opener=opener)
    except Exception as exc:                       # 조용한 실패 금지
        return None, "PCTC 조회 실패(%s: %s)" % (type(exc).__name__, exc), []
    return parse_pctc(html, now_ms=now_ms)


# ──────────────────────────── 두 터미널 합치기 ────────────────────────────

def excluded_routes(cfg):
    """비관할 항로(검수사 확정) — 이 항로 선박은 앱에 새로 등록하지 않는다."""
    table = [str(r).strip().upper() for r in ((cfg or {}).get("excluded_routes") or [])
             if str(r).strip()]
    return table or list(DEFAULT_EXCLUDED_ROUTES)


def fetch_all(cfg=None, log=None, opener=None, days_back=DEFAULT_DAYS_BACK,
              days_fwd=DEFAULT_DAYS_FWD, now_ms=None):
    """사이클당 터미널별 딱 한 번씩 — (목록, None) | (None, 사유).

    **두 터미널이 다 성공해야 목록을 준다.** 반쪽 배정표로 '배정표에 없는 항차'를 판정하면
    멀쩡한 항차를 옛 항차로 몰 수 있다(정리는 되돌릴 수 없다). 한쪽이라도 실패하면 이번
    사이클의 게이트·정리를 통째로 건너뛴다 — 자료를 잃지 않는 쪽으로 기운다.
    """
    say = log or (lambda _m: None)
    skip = excluded_routes(cfg)
    rows, reasons, notes = [], [], []
    pn, why, note = fetch_pnct(days_back=days_back, days_fwd=days_fwd, opener=opener,
                               now_ms=now_ms)
    (rows.extend(pn) if pn else reasons.append(why))
    notes += note
    pc, why, note = fetch_pctc(opener=opener, now_ms=now_ms)
    (rows.extend(pc) if pc else reasons.append(why))
    notes += note
    for line in notes:
        say("  선석배정 — " + line)
    if reasons:
        return None, " · ".join(r for r in reasons if r)
    for row in rows:
        row["excluded"] = row["route"] in skip
    return rows, None
