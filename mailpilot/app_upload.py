# 평택항 범용 수집기 — 앱 채우기 모듈. 메일박스에 쌓인 EDI 를 읽어 검수앱(TallyUni) 파이어베이스에 항차·EDI 를 올린다.
"""수집(메일 → 폴더)까지 끝난 자료를 **검수앱이 바로 쓸 수 있는 모양**으로 서버에 올린다.

앱이 기대하는 모양(검수앱 src/autoRegApi.js · HomePage.jsx 와 같은 계약):
  voyages/{선박코드}_{항차}/info                     → 홈 화면에 항차 카드가 뜬다
  voyages/{키}/{discharge|loading}/ediContainers    → 진행막대·베이플랜·카고플랜이 산다
  voyages/{키}/{discharge|loading}/raw/edi          → 앱에서 다시 판독할 수 있는 원문
  voyages/{키}/{discharge|loading}/records          → 매칭·누락(실번호·무게·온도) — 0.9

절대 보존 원칙(현장 수집기 autoreg.py 에서 그대로 가져온다):
  · info 는 **없을 때만** 만든다. 이미 있으면 빈 voy_d/voy_l 만 채운다 — 사람이 넣은 값은 절대 안 건드린다.
  · records 는 0.9 부터 **보수 머지로만** 채운다 — 새 컨 추가·빈 칸 채움뿐이고,
    비어 있지 않은 기존 값은 덮지 않으며 기존 컨을 지우지도 않는다. completed 는 무접촉.
  · 방향 필터로 전량 제외되면 PUT 자체를 하지 않는다 — 빈 PUT 은 RTDB 에서 '노드 삭제'다.
  · None(null) 을 절대 보내지 않는다 — RTDB 에서 null 은 '지우기'다.
  · 좌표(bay/row/tier…)는 PUT 전에 기존 노드에서 물려받는다 — 사람이 맞춘 자리를 지우지 않는다.

짝(E/W) 판단은 **증거가 있을 때만** 한다. 제목·첨부파일명에 '0221E&0222W' 같은 표기가 있어야
한 항차로 묶는다. 증거가 없으면 항차별 개별 키로 둔다 — 추론으로 짝짓지 않는다(검수사 확정).
"""

import hashlib
import json
import os
import re
import time

import berth_schedule as bsch                       # 0.6 — 터미널 선석배정(항차의 진실)
import edi_parser as ep

STATE_V = 3                       # 올리는 규칙이 바뀌면 올린다(옛 지문 무효화 → 한 번 재업로드)
                                  #   1→2 : 0.9 리스트(records) 업로드가 붙었다.
                                  #   2→3 : 0.10 방향 판정이 넓어졌다 — 0.9 가 건너뛴 리스트를
                                  #         한 번 다시 읽어야 한다(내용은 그대로, 판정만 달라진다).
PARSER_TAG = "MailPilot Uni 0.7 (edi_parser)"
RAW_TEXT_LIMIT = 5_000_000        # raw/edi 에 담는 원문 길이 상한(현장 수집기와 같은 값)

# 홈포트(모항) 판정 — 검수앱 src/utils.js 의 PYEONGTAEK_CODES / PYEONGTAEK_SUFFIX 와 같은 기준.
DEFAULT_HOME_PORT_ALIASES = ["PTK", "KRPTK", "KRPYT", "PYT", "KRPYOTM", "PYOTM", "KRPYO"]
_HOME_SUFFIX = re.compile(r"(PTK|PYT|PYOTM|PYO)$")

# 0.10 — 코드 말고 **실물이 쓰는 두 표기**를 더 받는다. 실측한 형태만 넣는다(일반화 금지).
#   ㉮ 항명 표기   'PYEONGTAEK' · 'PYONGTAEK'(뒤에 ',KOREA' 가 붙어 온다)
#      실측: TMPZ 2023E·2025E 의 중국 선사 리스트 整船清单.XLSX · 冷箱清单.xls 의 DISCHRG/PORT 열.
#   ㉯ 선석(부두) 코드 'PTK02' · 'PTK04'
#      실측: 선사 표준 내보내기('… (Excel).xls' · 'LIST OUT')의 LWHARF 열 — 판독기가 POL 로 잡는다.
#      평택항 부두 번호일 뿐 다른 항이 아니다(40여 장 전수 확인 — 전부 평택 선적분).
_HOME_NAME = re.compile(r"^(?:KR)?(?:PYEONGTAEK|PYONGTAEK)$")
_HOME_BERTH = re.compile(r"^(?:KR)?(?:PTK|PYT)[0-9]{1,2}$")

# 항차 방향 — 폴더 이름 끝 글자. E/N = 양하(들어온다) · W/S = 선적(싣는다).
_DIS_SUFFIX = ("E", "N")
_LOAD_SUFFIX = ("W", "S")

# EDI 후보로 열어 보는 확장자(내용으로 다시 판별하므로 확장자는 '열어 볼지'만 정한다)
EDI_EXTS = (".edi", ".asc", ".txt")

# ISO 6346 실번호 — 4번째 글자가 U/J/Z. 가상(더미) 번호를 실번호로 세지 않기 위한 규칙.
_ISO6346 = re.compile(r"^[A-Z]{3}[UJZ][0-9]{7}$")

# RTDB 키에 쓸 수 없는 글자(. $ # [ ] /)를 밀어 낸다.
_BAD_KEY = re.compile(r"[^A-Za-z0-9_-]")

# PUT(=노드 전체 교체) 때 기존 노드에서 물려받을 좌표 필드 — 현장 autoreg.py _EDI_COORD_KEYS 와 같다.
COORD_KEYS = ("bay", "row", "tier", "pos", "deck", "line", "col", "lolo", "dbl")

# 짝(E/W) 증거 — 제목·첨부파일명에서만 읽는다. 셋 다 '실제로 그렇게 적혀 있을 때'만 걸린다.
#   ① 0221E&0222W · 2705E & 2706W · 2608N&2609S   (양쪽 항차가 다 적힌 형태)
#   ② R083E&W · 2023E&W                            (뒤 항차를 생략한 형태 — 번호가 같다)
#   ③ E&0222W                                      (앞 항차가 떨어져 있는 형태 — 폴더 항차를 앞짝으로 본다)
_PAIR_FULL = re.compile(
    r"(?<![A-Z0-9])([A-Z]{0,2}[0-9]{3,5})([EN])\s*&\s*([A-Z]{0,2}[0-9]{3,5})([WS])(?![A-Z0-9])")
_PAIR_SHORT = re.compile(
    r"(?<![A-Z0-9])([A-Z]{0,2}[0-9]{3,4})([EN])\s*&\s*([WS])(?![A-Z0-9])")
_PAIR_HALF = re.compile(
    r"(?<![A-Z0-9])([EN])\s*&\s*([A-Z]{0,2}[0-9]{3,5})([WS])(?![A-Z0-9])")


def _core():
    """mailpilot 코어를 늦게 불러온다(서로 부르는 모양이라 모듈 첫머리에서 부르면 순환한다)."""
    import mailpilot
    return mailpilot


def _now_ms():
    return int(time.time() * 1000)


# ──────────────────────────── ㉮ 홈포트 판정 ────────────────────────────

def is_home_port(code, aliases=None):
    """이 항구 코드가 우리 항(모항)인가. 앱 JS 의 isPyeongtaekPort 와 같은 기준.

    0.10 — 코드 외에 실물 표기 둘을 더 받는다: 항명('PYEONGTAEK', ',KOREA' 가 붙어 오기도 한다)과
    선석 코드('PTK02'). 나라 이름이 쉼표로 붙는 표기는 앞 조각만 본다('KWANGYANG, KOREA' → KWANGYANG).
    """
    if not code:
        return False
    text = str(code).upper().strip()
    if not text:
        return False
    table = [str(a).upper().strip() for a in (aliases or DEFAULT_HOME_PORT_ALIASES)
             if str(a).strip()]
    head = text.split(",")[0].strip()                # 'KRPTK,PYEONGTAEK' · 'PYONGTAEK,KOREA'
    for token in (text, head):
        if not token:
            continue
        if token in table:
            return True
        if _HOME_SUFFIX.search(token):
            return True
        if _HOME_NAME.match(token) or _HOME_BERTH.match(token):
            return True
    return False


def home_aliases(cfg):
    """설정에서 모항 별칭 목록을 꺼낸다. 없으면 기본값(평택)."""
    table = [str(a).upper().strip() for a in ((cfg or {}).get("home_port_aliases") or [])
             if str(a).strip()]
    return table or list(DEFAULT_HOME_PORT_ALIASES)


# ──────────────────────────── ㉯ 항차 방향 · 짝 ────────────────────────────

def voy_direction(voy):
    """항차 토큰 → 'discharge'(E/N) · 'loading'(W/S) · ''(판단 불가)."""
    text = str(voy or "").upper().strip()
    if not text:
        return ""
    last = text[-1]
    if last in _DIS_SUFFIX:
        return "discharge"
    if last in _LOAD_SUFFIX:
        return "loading"
    return ""


# ──────────────────────────── ㉯-2 항차 표기 정규화(0.5-01) ────────────────────────────
#
# 같은 항차인데 0패딩 표기가 달라 두 번 등록되는 일을 막는다(XTPG 0535E ↔ 535E).
#   같은 선박 + 같은 방향(E/N · W/S) + 숫자부 **정수값** 동일 = 같은 항차
#   단 문자 접두가 있으면(R083W 의 R) 접두까지 같아야 같은 항차다.
#
# ⛔ 전역 패딩 제거는 하지 않는다 — DJCT 0221E 처럼 0패딩이 정본인 선박이 있다.
#    정수 비교는 **같은 항차인지 판정할 때만** 쓰고, 표기는 '자료가 많은 폴더'가 정한다.
_VOY_TOKEN = re.compile(r"^([A-Z]*)([0-9]+)([A-Z])$")


def voy_ident(voy):
    """항차 토큰 → (문자접두, 숫자값, 방향). 판정 불가면 None."""
    text = re.sub(r"[^A-Za-z0-9]", "", str(voy or "")).upper()
    match = _VOY_TOKEN.match(text)
    if not match:
        return None
    direction = voy_direction(match.group(3))
    if not direction:
        return None
    try:
        number = int(match.group(2))
    except ValueError:
        return None
    return (match.group(1), number, direction)


def same_voyage(a, b):
    """두 표기가 같은 항차인가. 둘 중 하나라도 못 읽으면 글자 그대로 비교한다(추측 금지)."""
    ident_a, ident_b = voy_ident(a), voy_ident(b)
    if ident_a is None or ident_b is None:
        return str(a or "").strip().upper() == str(b or "").strip().upper()
    return ident_a == ident_b


def _dir_files(path):
    """폴더 안 '파일'만. 못 읽으면 빈 목록(조용히 죽지 않는다)."""
    try:
        return [f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))]
    except OSError:
        return []


def _folder_rank(path, names):
    """정본 폴더 고르기 — ① 파일 수 많은 쪽 ② 동수면 EDI 있는 쪽 ③ 그래도 동수면 먼저 있던 쪽."""
    has_edi = any(str(n).lower().endswith(EDI_EXTS) for n in names)
    try:
        born = os.path.getctime(path)
    except OSError:
        born = 0.0
    return (len(names), 1 if has_edi else 0, -born)


def canonical_voy_dirname(vessel_dir, voy):
    """선박 폴더 안에서 이 항차와 '같은 항차'인 기존 폴더 이름(정본). 없으면 ''."""
    if not vessel_dir or not os.path.isdir(vessel_dir):
        return ""
    best, best_rank = "", None
    try:
        entries = sorted(os.listdir(vessel_dir))
    except OSError:
        return ""
    for name in entries:
        path = os.path.join(vessel_dir, name)
        if not os.path.isdir(path) or not same_voyage(name, voy):
            continue
        rank = _folder_rank(path, _dir_files(path))
        if best_rank is None or rank > best_rank:
            best, best_rank = name, rank
    return best


def find_pairs(text, context_voy=""):
    """글(제목·파일명)에서 짝 증거를 뽑는다 → [(양하항차, 선적항차), …]. 없으면 빈 목록."""
    up = " ".join(str(text or "").upper().split())
    out = []
    for m in _PAIR_FULL.finditer(up):
        out.append((m.group(1) + m.group(2), m.group(3) + m.group(4)))
    for m in _PAIR_SHORT.finditer(up):
        out.append((m.group(1) + m.group(2), m.group(1) + m.group(3)))
    ctx = str(context_voy or "").upper().strip()
    if ctx and voy_direction(ctx) == "discharge":
        for m in _PAIR_HALF.finditer(up):
            out.append((ctx, m.group(2) + m.group(3)))
    seen, uniq = set(), []
    for pair in out:
        if pair[0] == pair[1] or pair in seen:
            continue
        seen.add(pair)
        uniq.append(pair)
    return uniq


def collect_pairs(text, code, cache, context_voy=""):
    """짝 증거를 캐시(cache['pairs'][선박코드])에 쌓는다. 새로 알게 된 짝만 돌려준다."""
    if not code or cache is None:
        return []
    found = find_pairs(text, context_voy)
    if not found:
        return []
    table = cache.setdefault("pairs", {}).setdefault(str(code).upper(), {})
    fresh = []
    for dis, load in found:
        # 0.5-01 — 표기가 달라도(0534E ↔ 534E) 이미 아는 짝이면 '새 짝'이 아니다(로그 폭주 방지).
        if not (same_voyage(_table_get(table, dis), load)
                and same_voyage(_table_get(table, load), dis)):
            fresh.append((dis, load))
        table[dis] = load
        table[load] = dis
    return fresh


def _table_get(table, voy):
    """짝 표에서 이 항차의 값을 꺼낸다 — 표기가 달라도 같은 항차면 잡는다(0534W ≡ 534W)."""
    key = str(voy or "").upper()
    if key in (table or {}):
        return table[key]
    ident = voy_ident(key)
    if ident is None:
        return ""
    for name, value in sorted((table or {}).items()):
        if voy_ident(name) == ident:
            return value
    return ""


def paired_partner(cache, code, voy):
    """이 항차의 짝 항차. 증거가 없으면 ''(짝짓지 않는다).

    0.5-01 — 표기(0패딩)가 달라도 같은 항차면 짝을 찾는다. 짝 증거는 메일에 적힌 표기 그대로
    쌓이므로(534E&534W), 폴더가 0534W 로 정리돼도 정수 비교로 이어져야 한 카드가 된다.
    """
    table = ((cache or {}).get("pairs") or {}).get(str(code or "").upper()) or {}
    return _table_get(table, voy)


# ──────────────────────────── 폴더 지문(변한 것만 올린다) ────────────────────────────

def folder_fingerprint(folder, names):
    """폴더 안 파일들의 이름|크기|수정시각 해시. 하나라도 바뀌면 값이 달라진다."""
    digest = hashlib.md5()
    for name in sorted(names):
        path = os.path.join(folder, name)
        try:
            stat = os.stat(path)
            digest.update(("%s|%d|%d" % (name, stat.st_size, int(stat.st_mtime))).encode("utf-8"))
        except OSError:
            digest.update(name.encode("utf-8"))
    return digest.hexdigest()


def load_state(path):
    """올린 폴더 지문 기록. 없거나 판이 다르면 빈 상태(한 번 다시 올린다)."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and data.get("_v") == STATE_V and isinstance(data.get("folders"), dict):
            return data
    except (OSError, ValueError):
        pass
    return {"_v": STATE_V, "folders": {}}


def save_state(state, path, log=None):
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False, indent=1)
        return True
    except OSError as exc:
        if log:
            log("앱 채우기 상태 저장 실패(%s): %s" % (path, exc))   # 조용한 실패 금지
        return False


# ──────────────────────────── ㉰ EDI 후보 읽기 · 대표 뽑기 ────────────────────────────

def _read_text(path):
    with open(path, "rb") as fh:
        return fh.read().decode("latin1", "replace")


def _safe_key(text):
    key = _BAD_KEY.sub("_", str(text or ""))
    return key or "__SLOT___"


def scan_candidates(folder, names, aliases, log, folder_dir=""):
    """폴더의 EDI 후보를 전부 읽어 판독한다. 확장자는 믿지 않고 내용(detect_kind)으로 종류를 정한다."""
    out = []
    for name in sorted(names):
        if not name.lower().endswith(EDI_EXTS):
            continue
        path = os.path.join(folder, name)
        try:
            text = _read_text(path)
        except OSError as exc:
            log("    자료를 읽지 못했습니다(%s): %s" % (name, exc))
            continue
        kind = ep.detect_kind(text, name)
        if not kind:
            continue
        try:
            parsed = ep.parse_edi(text, name)
        except Exception as exc:                       # 한 파일이 깨져도 폴더 전체를 죽이지 않는다
            log("    판독 실패(%s) %s: %s" % (name, type(exc).__name__, exc))
            continue
        cons = parsed.get("containers") or []
        if not cons:
            continue
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = 0.0
        dis_home = sum(1 for c in cons if is_home_port(c.get("pod"), aliases))
        load_home = sum(1 for c in cons if is_home_port(c.get("pol"), aliases))
        out.append({
            "name": name, "text": text, "kind": kind, "containers": cons, "mtime": mtime,
            "folder_dir": folder_dir, "dis_home": dis_home, "load_home": load_home,
            "cn_count": sum(1 for c in cons if _ISO6346.match(str(c.get("cn") or ""))),
            "iso_count": sum(1 for c in cons if c.get("cn") and c.get("iso")),
            "total": len(cons),
        })
    return out


def content_direction(cand, folder_dir):
    """이 파일의 내용이 말하는 방향 — 홈포트 POD 가 많으면 양하, POL 이 많으면 선적.
    가릴 수 없으면 폴더 방향을 따른다(다수결 override 의 근거)."""
    if cand["dis_home"] > cand["load_home"]:
        return "discharge"
    if cand["load_home"] > cand["dis_home"]:
        return "loading"
    return folder_dir or "discharge"


def _rank(cand, mode):
    """대표 선정 4단 비교 — ① 해당 방향 홈포트분 ② 실번호(ISO6346) 컨 ③ 규격 보유 ④ 총수."""
    home = cand["dis_home"] if mode == "discharge" else cand["load_home"]
    return (home, cand["cn_count"], cand["iso_count"], cand["total"])


def pick_representatives(cands, log=None):
    """방향별 대표 1개씩 — {'discharge': 후보|None, 'loading': 후보|None}.

    같은 (종류·내용방향) 이 여럿이면 수정시각이 가장 새것만 남기고(구판 되덮기 방지),
    남은 것들 중에서 4단 비교로 방향별 대표를 뽑는다.
    한 항차(짝으로 묶인 폴더들)의 자료를 **한자리에 모아** 고른다 — 같은 노드에 두 번 쓰지 않는다.
    """
    for cand in cands:
        cand["dir"] = content_direction(cand, cand.get("folder_dir") or "")
    groups = {}
    for cand in cands:
        groups.setdefault((cand["kind"], cand["dir"]), []).append(cand)
    kept = []
    for group in groups.values():
        group.sort(key=lambda c: (c["mtime"], c["name"]))
        if len(group) > 1 and log:
            log("    같은 종류 %d개 중 최신본만: %s" % (len(group), group[-1]["name"]))
        kept.append(group[-1])
    best = {"discharge": None, "loading": None}
    for mode in ("discharge", "loading"):
        for cand in kept:
            if cand["dir"] != mode:
                continue
            if best[mode] is None or _rank(cand, mode) > _rank(best[mode], mode):
                best[mode] = cand
    return best


# ──────────────────────────── 컨테이너 지도 만들기 · 방향 필터 ────────────────────────────

def build_edi_map(containers, mode, aliases):
    """앱과 같은 모양의 ediContainers — 키는 _slotKey, 값은 파서 컨 + _slotKey·_mode."""
    out = {}
    for con in containers:
        pod_home = is_home_port(con.get("pod"), aliases)
        pol_home = is_home_port(con.get("pol"), aliases)
        if mode == "discharge":
            con_mode = "discharge" if pod_home else "transit"
        else:
            con_mode = "loading" if pol_home else "transit"
        cn = str(con.get("cn") or "")
        key = cn if len(cn) == 11 else "__SLOT_%s_%s_%s" % (
            con.get("bay") or "", con.get("row") or "", con.get("tier") or "")
        key = _safe_key(key)
        rec = dict(con)
        rec["_slotKey"] = key
        rec["_mode"] = con_mode
        out[key] = rec
    return out


def direction_filter(edi_map, mode, aliases):
    """양하=POD 모항 · 선적=POL 모항 인 것만 남긴다. 둘 다 비어 판단 불가한 컨은 보존(fail-open)."""
    out, dropped = {}, 0
    for key, value in (edi_map or {}).items():
        if not isinstance(value, dict):
            out[key] = value
            continue
        pod, pol = value.get("pod"), value.get("pol")
        if not pod and not pol:
            out[key] = value                            # 판정 불가 → 남긴다
            continue
        keep = is_home_port(pod, aliases) if mode == "discharge" else is_home_port(pol, aliases)
        if keep:
            out[key] = value
        else:
            dropped += 1
    return out, dropped


def merge_coords(old_edi, new_edi, log=None, mode=""):
    """PUT 은 노드 통째 교체다 — 기존 노드에서 컨번호가 같은 항목의 좌표 중
    **새 값에 없는 것만** 물려받는다(EDI 가 준 값은 덮지 않는다)."""
    if not isinstance(old_edi, dict) or not old_edi:
        return new_edi, 0
    by_cn = {}
    for key, value in old_edi.items():
        if isinstance(value, dict):
            by_cn.setdefault(str(value.get("cn") or key).replace(" ", "").upper(), value)
    kept = 0
    for key in list(new_edi.keys()):
        cur = new_edi[key]
        if not isinstance(cur, dict):
            continue
        prev = by_cn.get(str(cur.get("cn") or key).replace(" ", "").upper())
        if not isinstance(prev, dict):
            continue
        copy = {f: prev[f] for f in COORD_KEYS
                if cur.get(f) in ("", None) and prev.get(f) not in ("", None)}
        if copy:
            merged = dict(cur)
            merged.update(copy)
            new_edi[key] = merged
            kept += 1
    if kept and log:
        log("    ↺ %s 좌표 보존 — 기존 노드에서 %d대 승계" % (mode, kept))
    return new_edi, kept


def strip_nulls(obj):
    """RTDB 로 나가는 값에서 None 을 없앤다(null 은 '지우기'다). 남길 자리는 빈 문자열."""
    if isinstance(obj, dict):
        return {k: strip_nulls(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [strip_nulls(v) for v in obj if v is not None]
    return obj


# ──────────────────────────── ㉯ 항차 키 · info 등록 ────────────────────────────

def group_voyages(folders, cache):
    """짝 증거로 같은 항차인 폴더들을 한 묶음으로 묶는다.

    돌려주는 값: [(선박코드, 키항차, [(항차, 경로, 파일명들), …], voy_d, voy_l), …]
    짝 증거가 없으면 폴더 하나가 그대로 한 묶음이다(추론으로 짝짓지 않는다).
    """
    groups = {}
    for code, voy, path, names in folders:
        partner = paired_partner(cache, code, voy)
        key_voy = voy
        if partner and voy_direction(voy) != "discharge" and voy_direction(partner) == "discharge":
            key_voy = partner
        # 0.5-01 — 묶음 열쇠는 표기가 아니라 '같은 항차 판정값'이다(0535E 와 535E 가 한 묶음).
        gid = (code, voy_ident(key_voy) or ("", -1, key_voy))
        entry = groups.setdefault(gid, {"members": [], "voys": [],
                                        "key_voy": key_voy, "key_rank": None})
        entry["members"].append((voy, path, names))
        if same_voyage(voy, entry["key_voy"]):       # 실제로 있는 폴더 표기를 정본으로 쓴다
            rank = _folder_rank(path, names)         # 여럿이면 자료가 많은 폴더의 표기
            if entry["key_rank"] is None or rank > entry["key_rank"]:
                entry["key_voy"], entry["key_rank"] = voy, rank
        for cand in (voy, partner):
            if cand and cand not in entry["voys"]:
                entry["voys"].append(cand)
    out = []
    for (code, _gid), entry in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[1]["key_voy"])):
        key_voy = entry["key_voy"]
        voy_d = key_voy if voy_direction(key_voy) == "discharge" else ""
        voy_l = key_voy if voy_direction(key_voy) == "loading" else ""
        for cand in entry["voys"]:
            direction = voy_direction(cand)
            if direction == "discharge" and not voy_d:
                voy_d = cand
            elif direction == "loading" and not voy_l:
                voy_l = cand
        out.append((code, key_voy, sorted(entry["members"]), voy_d, voy_l))
    return out


def voyage_index(firebase, log=None):
    """서버 항차 키 목록 → {선박코드: {항차표기: 키}}. 못 읽으면 빈 사전(종전 경로로 돈다)."""
    index = {}
    try:
        raw = firebase.get("voyages", params={"shallow": "true"})
    except Exception as exc:                            # 조용한 실패 금지 — 남기고 계속
        if log:
            log("  항차 키 목록을 읽지 못했습니다(%s: %s) — 표기 대조 없이 진행합니다."
                % (type(exc).__name__, exc))
        return index
    if not isinstance(raw, dict):
        return index
    for key in raw.keys():
        code, sep, voy = str(key).partition("_")
        if not sep or not voy:
            continue
        index.setdefault(code.upper(), {})[voy.upper()] = str(key)
    return index


def key_order(code, key_voy, other_voys=()):
    """키 후보 항차 목록(중복 제거, 키항차가 맨 앞)."""
    order, seen = [], set()
    for cand in (str(key_voy or "").upper(),) + tuple(str(v or "").upper() for v in other_voys):
        if cand and cand not in seen:
            seen.add(cand)
            order.append(cand)
    return order


def resolve_key(firebase, code, key_voy, other_voys=(), index=None):
    """(키, 키항차) — 서버에 이미 있는 항차 키가 있으면 재사용한다(키 난립 방지).

    0.5-01 — 표기가 달라도 같은 항차면 **기존 키를 재사용한다**(0535E 자료가 XTPG_535E 로 간다).
    새 키는 어느 후보와도 같은 항차가 아닐 때만 만든다.
    """
    code = str(code or "").upper()
    order = key_order(code, key_voy, other_voys)
    known = (index or {}).get(code) or {}
    # ① 표기까지 똑같은 키 — 예전과 같은 길
    for cand in order:
        key = "%s_%s" % (code, cand)
        if known.get(cand):
            return known[cand], cand
        if not known and firebase.get("voyages/%s/info" % key):
            return key, cand
    # ② 표기만 다른 같은 항차 키 — 새로 만들지 않고 그 키에 얹는다
    for cand in order:
        ident = voy_ident(cand)
        if ident is None:
            continue
        for voy in sorted(known.keys()):
            if voy_ident(voy) == ident:
                return known[voy], voy
    return "%s_%s" % (code, order[0] if order else key_voy), (order[0] if order else key_voy)


def register_voyage(firebase, key, code, key_voy, voy_d, voy_l, log, plan_row=None,
                    source="mail", current=None):
    """info — 없으면 만들고, 있으면 **빈 voy_d/voy_l 만** 채운다. 다른 필드는 절대 손대지 않는다.

    0.6 — 배정표(plan_row)가 있으면 일정 칸을 함께 채운다. planDate·terminalStatus·berth·pier 는
    '지금의 진실'이라 기존 값이 있어도 갱신하고, 나머지(vslFull 등)는 빈칸일 때만 채운다.

    0.7 — source 로 '누가 이 카드를 세우는가'를 가른다. 만드는 모양만 다르고 보강 규칙은 하나다.
      'mail'     자료가 와서 만든다      → createdBy 자동등록 · autoStatus collecting
                 이미 예정 카드가 서 있으면 그때 **expected → collecting** 으로 넘긴다.
      'expected' 배정표만 보고 미리 세운다 → createdBy 예정등록 · autoStatus expected
      'plan'     기존 카드 일정 보강 전용  → autoStatus 는 손대지 않는다
    current 를 주면 info 를 다시 읽지 않는다(부르는 쪽이 이미 읽었을 때).
    """
    fresh, refresh = plan_info_fields(plan_row, log)
    if current is None:
        current = firebase.get("voyages/%s/info" % key)
    if not isinstance(current, dict) or not current:
        expected = source == "expected"
        # 예정 카드는 배정표에 양하 항차가 있으면 양하로 세운다(현장 계약). 메일 경로는 종전대로
        #   폴더 항차의 방향을 따른다 — 0.6 까지의 판정을 바꾸지 않는다.
        mode = ("discharge" if (expected and voy_d)
                else (voy_direction(key_voy) or "discharge"))
        info = {
            "vsl": code,
            "voy": key_voy,
            "mode": mode,
            "createdAt": _now_ms(),
            "createdBy": "예정등록(수집기)" if expected else "자동등록(수집기)",
            "autoRegistered": True,
            "autoStatus": "expected" if expected else "collecting",
        }
        if voy_d:
            info["voy_d"] = voy_d
        if voy_l:
            info["voy_l"] = voy_l
        info.update(fresh)
        info.update(refresh)
        if firebase.put("voyages/%s/info" % key, strip_nulls(info)) is None:
            log("    ✗ 항차 %s 실패: %s — 다음 사이클에 다시 시도합니다."
                % ("예정등록" if expected else "등록", key))
            return False
        log("    + 항차 %s: %s (%s%s)"
            % ("예정등록" if expected else "등록", key, info["mode"],
               " · 배정표" if (fresh or refresh) else ""))
        return True
    patch = {}
    if voy_d and not current.get("voy_d"):
        patch["voy_d"] = voy_d
    if voy_l and not current.get("voy_l"):
        patch["voy_l"] = voy_l
    # 0.7 — 예정 카드에 실자료가 처음 닿는 순간(메일 경로)만 상태를 넘긴다. 다른 필드는 무접촉.
    if source == "mail" and current.get("autoStatus") == "expected":
        patch["autoStatus"] = "collecting"
    for field, value in fresh.items():                  # 기존 값 존중 — 빈칸만 채운다
        if not current.get(field):
            patch[field] = value
    for field, value in refresh.items():                # 배정표가 최신 진실인 칸만 갱신한다
        if current.get(field) != value:
            patch[field] = value
    if patch:
        if firebase.patch("voyages/%s/info" % key, strip_nulls(patch)) is None:
            log("    ✗ 항차 보강 실패: %s — 다음 사이클에 다시 시도합니다." % key)
            return False
        log("    · 항차 보강: %s %s" % (key, json.dumps(patch, ensure_ascii=False)))
    return True


# ──────────────────────────── ㉰ EDI 업로드 ────────────────────────────

def upload_mode(firebase, key, mode, cand, aliases, log):
    """한 방향(양하/선적) 노드에 대표 EDI 를 올린다. (올린 컨 수, 성공여부)."""
    edi_map = build_edi_map(cand["containers"], mode, aliases)
    kept, dropped = direction_filter(edi_map, mode, aliases)
    if not kept:
        log("    ⤫ %s EDI 업로드 생략 — 방향 필터 전량 제외(%d대, 타항 자료 의심). 기존 노드 보존"
            % (mode, dropped))
        return 0, True                                  # 안 올린 것은 실패가 아니다(의도된 보존)
    try:
        old = firebase.get("voyages/%s/%s/ediContainers" % (key, mode))
    except Exception as exc:                            # 조용한 실패 금지 — 보존 없이 계속하되 남긴다
        old = None
        log("    ⚠ %s 좌표 보존 실패(%s: %s) — 보존 없이 계속" % (mode, type(exc).__name__, exc))
    kept, _ = merge_coords(old if isinstance(old, dict) else {}, kept, log, mode)
    if firebase.put("voyages/%s/%s/ediContainers" % (key, mode), strip_nulls(kept)) is None:
        log("    ✗ %s EDI 업로드 실패 — 다음 사이클에 다시 시도합니다." % mode)
        return 0, False
    text = cand["text"]
    ok = firebase.put("voyages/%s/%s/raw/edi" % (key, mode), {
        "text": text[:RAW_TEXT_LIMIT],
        "uploadedAt": _now_ms(),
        "fileName": cand["name"],
        "parserVersion": PARSER_TAG,
        "sizeBytes": len(text),
    }) is not None
    if not ok:
        log("    ✗ %s 원문(raw/edi) 업로드 실패 — 다음 사이클에 다시 시도합니다." % mode)
    log("    ↑ %s EDI %d대 올림(%s · 원본 %d대%s)"
        % (mode, len(kept), cand["name"], cand["total"],
           " · 타항·반대방향 %d대 제외" % dropped if dropped else ""))
    return len(kept), ok


# ──────────────────── ㉰-2 리스트 자동 업로드(0.9) ────────────────────
#
# 항차 폴더의 엑셀 리스트(선사 CLL·CDL·세관 CDL·중국어)를 읽어 `voyages/{키}/{방향}/records` 에
# 올린다. 앱의 매칭·누락 화면이 records 를 읽으므로, 이것이 없으면 EDI 만 있는 항차는
# 실번호·무게·온도가 비어 있다.
#
# ⛔ 현장 계약(사용자 확정) — **검수원이 이미 넣은 값은 단 한 바이트도 바뀌지 않는다.**
#   · 새 컨은 더한다. 기존 컨은 **빈 칸("" · 0 · 없음)만** 채운다.
#   · 비어 있지 않은 기존 값은 절대 덮지 않는다(다르면 로그로만 남긴다).
#   · 기존 컨을 지우지 않는다(v1 무삭제). 리스트에서 빠진 컨도 그대로 둔다.
#   · 기존 노드를 못 읽으면(GET 실패) **아무것도 올리지 않는다** — 통째 PUT 은 되덮기다.
#   · 바뀐 것이 없으면 PUT 자체를 하지 않는다(사이클마다 같은 쓰기 반복 없음).
#
# 판독은 list_parser(검수앱 utils.js parseListExcel 이식본)가 소유한다 — 여기서 다시 파싱하지 않는다.

_LP_MOD = [None, ""]                  # [모듈, 실패사유] — 지연 임포트 결과를 한 번만 기억한다


def list_parser_mod():
    """리스트 판독 모듈을 늦게 부른다. 없으면 (None, 사유) — 리스트 단계만 건너뛰기 위함."""
    if _LP_MOD[0] is None and not _LP_MOD[1]:
        try:
            import list_parser
            _LP_MOD[0] = list_parser
        except Exception as exc:                      # 조용한 실패 금지 — 사유를 그대로 남긴다
            _LP_MOD[1] = "%s: %s" % (type(exc).__name__, exc)
    return _LP_MOD[0], _LP_MOD[1]


# 개정 서열 마커(파일명) — 최종/FINAL > REVISED/수정 > n차 > 무표시.
#   '_REV 1' 처럼 밑줄에 붙어 오는 표기가 있어 \b 대신 영문자 경계를 직접 쓴다.
_MARK_FINAL = re.compile(r"(?<![A-Za-z])FINAL(?![A-Za-z])|최종", re.I)
_MARK_REVISED = re.compile(r"(?<![A-Za-z])REV(?:\.|ISED|ISION)?(?![A-Za-z])|수정", re.I)
_MARK_NTH = re.compile(r"([0-9]{1,2})\s*차")

RANK_FINAL, RANK_REVISED, RANK_NTH, RANK_PLAIN = 400, 300, 200, 100

# 파일명 방향 힌트 — 내용(홈포트 POL/POD)으로 못 가릴 때만 쓴다.
_HINT_DIS = re.compile(r"(?<![A-Z])CDL(?![A-Z])|DISCH", re.I)
_HINT_LOAD = re.compile(r"(?<![A-Z])CLL(?![A-Z])|LOAD", re.I)

# ── 0.10 「내용 판독」 — 시트 머리 블록에서 **목적항**을 읽는다 ────────────────────
#
# 검수사 확정 규칙: "목적항이 어디냐. **평택이면 양하, 타목적지면 선적**."
# POL/POD 열이 컨마다 붙어 있지 않은 리스트가 많다. 그런 리스트는 머리 블록(표 위 몇 줄)에
# 항로가 한 번만 적혀 있다. 실물에서 확인한 표기만 규칙으로 넣는다(추측 정규식 금지).
#
#   ㉮ 라벨 붙은 항로쌍  'LOD/DIS :  KRPTK,PYEONGTAEK/CNTAG'
#      실측: 태영상선 'cntr_number_list(xtp 0535w)krptk.xls' 등 7장. 왼쪽=적재항, 오른쪽=목적항.
#   ㉯ 라벨 붙은 적재항  'L/PORT: NINGBO' · 'Port of Loading: NINGBO'
#      실측: TMPZ 整船清单.XLSX · 冷箱清单.xls. 적재항이 타항이면 우리는 목적항 → 양하.
#   ㉰ 항로 토막       'LYG-PTK'(연운항→평택)
#      실측: TNJP '…CNTR LIST.xlsx' 11장의 PORT 칸. 오른쪽이 목적항이다.
#   ㉱ 제목줄 방향말   'CONTAINER DISCHARGING LIST' · 'Container Number List (OUTBOUND)'
#      양쪽이 다 나오면(터미널 출항보고서의 DISC/LOAD 시트) **무효**로 본다 — 우리 방향이 아니다.
#
# 머리 블록으로 보는 범위는 시트 앞 12줄이다(실측: 위 표기는 모두 그 안에 있다).
LIST_HEAD_ROWS = 12
LIST_HEAD_SHEETS = 8

_HEAD_LOD_DIS = re.compile(r"LOD\s*/\s*DIS\b", re.I)
_HEAD_PORT_PAIR = re.compile(
    r"(?<![A-Z0-9])([A-Z]{3,5}(?:\s*,\s*[A-Z]{3,12})?)\s*/\s*([A-Z]{3,5}(?:\s*,\s*[A-Z]{3,12})?)"
    r"(?![A-Z0-9])")
_HEAD_DIS_PORT = re.compile(
    r"(?:D\s*/\s*PORT|PORT\s+OF\s+DISCHARGE|DISCHARGE\s+PORT)\s*[:：]\s*([A-Z][A-Z ]{2,24})", re.I)
_HEAD_LOAD_PORT = re.compile(
    r"(?:L\s*/\s*PORT|PORT\s+OF\s+LOADING|LOADING\s+PORT)\s*[:：]\s*([A-Z][A-Z ]{2,24})", re.I)
# 항로 토막은 **칸 하나가 통째로** 그 모양일 때만 본다.
#   ('XIN QUN DAO - 2630E … _PTK-TALLY_REPORT' 처럼 글 속에 박힌 '-' 를 항로로 오독하지 않기 위함)
_HEAD_ROUTE = re.compile(r"^([A-Z]{3,5})\s*-\s*([A-Z]{3,5})$")
_HEAD_TITLE_DIS = re.compile(r"DISCHARG\w*\s+LIST|\(\s*INBOUND\s*\)", re.I)
_HEAD_TITLE_LOAD = re.compile(r"LOAD\w*\s+LIST|\(\s*OUTBOUND\s*\)", re.I)


# 리스트가 아닌 서류가 파일 이름만으로는 안 걸러질 때가 있다 — 머리 블록이 스스로 밝힌다.
#   실측: RZOR 'PLAN.xlsx' 는 이름에 아무 표시가 없지만 첫 줄이 'M/V "RIZHAO ORIENT" STOWAGE PLAN'.
#   list_parser.detect_list_kind 는 파서 코어(JS 대조 계약)라 손대지 않고, 여기서 한 겹 더 거른다.
#   ⚠ '터미널 출항보고서(TDR)'는 넣지 않는다 — 0.9 가 이미 그 안의 적재리스트를 양하로 올리고 있고
#     (실측 'tdr_CCT2.xls' → NSDC 2607N 양하), 이 판에서 그 동작을 바꾸지 않는다(한 판에 하나).
_HEAD_REPORT = re.compile(
    r"STOWAGE\s*PLAN|BAY\s*PLAN|TALLY\s*REPORT|WORKING\s*REPORT|PERFORMANCE\s*REPORT"
    r"|마감\s*텔리", re.I)


def head_is_report(sheets):
    """머리 블록이 '리스트가 아니라 보고서·플랜'이라고 밝히는가. 밝히면 그 문구."""
    for text, _cell in _head_lines(sheets):
        hit = _HEAD_REPORT.search(text)
        if hit:
            return hit.group(0)
    return ""


def _head_lines(sheets):
    """시트 머리 블록을 훑을 글 목록으로 만든다 — [(글, 칸하나인가)].

    칸 하나씩과 '그 행의 칸을 이은 글'을 함께 담는다. 라벨과 값이 다른 칸에 있는 파일
    (태영상선 'LOD/DIS :' | 'KRPTK,PYEONGTAEK/CNTAG')은 이은 글에서 붙고,
    칸 하나에 줄바꿈으로 여러 항목이 든 파일(冷箱清单)은 낱줄로 펴서 담는다.
    """
    lines = []
    for _name, grid in (sheets or [])[:LIST_HEAD_SHEETS]:
        for row in (grid or [])[:LIST_HEAD_ROWS]:
            cells = [str(c) for c in (row or []) if str(c or "").strip()]
            if not cells:
                continue
            for cell in cells:
                for part in str(cell).splitlines():
                    if part.strip():
                        lines.append((part.strip(), True))
            if len(cells) > 1:
                lines.append((" ".join(cells), False))
    return lines


def _port_side_mode(load_port, dis_port, aliases):
    """적재항·목적항 표기 한 쌍 → 방향. 목적항이 먼저다(검수사 확정 규칙).

    목적항이 우리 항이면 양하, 타항이면 선적. 목적항을 모르고 적재항만 알면 뒤집어 본다.
    둘 다 우리 항이거나 둘 다 타항이면 가릴 수 없다('' 를 돌려준다).
    """
    dis_home = is_home_port(dis_port, aliases) if dis_port else None
    load_home = is_home_port(load_port, aliases) if load_port else None
    if dis_home is not None and load_home is not None and dis_home == load_home:
        return ""
    if dis_home is not None:
        return "discharge" if dis_home else "loading"
    if load_home is not None:
        return "loading" if load_home else "discharge"
    return ""


def head_dest_mode(sheets, aliases=None):
    """머리 블록의 목적항 표기로 방향을 읽는다. ('discharge'|'loading'|'', 근거문구)."""
    lines = _head_lines(sheets)
    if not lines:
        return "", ""
    for text, _cell in lines:                         # ㉮ 라벨 붙은 항로쌍이 가장 확실하다
        hit = _HEAD_LOD_DIS.search(text)
        if not hit:
            continue
        for pair in _HEAD_PORT_PAIR.finditer(text[hit.end():].upper()):
            # 항로가 적혀 있으면 그것으로 끝낸다 — 아래 힌트로 넘어가지 않는다.
            #   양쪽 다 타항이면 우리 화물이 아니라는 **증거**다(실측: KAI PING 0596W 는 인천→타이창).
            return (_port_side_mode(pair.group(1), pair.group(2), aliases),
                    "LOD/DIS %s" % pair.group(0))
    for text, _cell in lines:                         # ㉯ 라벨 붙은 목적항(검수사 규칙의 본문)
        hit = _HEAD_DIS_PORT.search(text)
        if not hit:
            continue
        return (_port_side_mode("", hit.group(1).strip(), aliases),
                "목적항 %s" % hit.group(1).strip())
    for text, _cell in lines:                         # ㉰ 라벨 붙은 적재항(목적항이 없을 때만)
        hit = _HEAD_LOAD_PORT.search(text)
        if not hit:
            continue
        return (_port_side_mode(hit.group(1).strip(), "", aliases),
                "적재항 %s" % hit.group(1).strip())
    for text, cell in lines:                          # ㉱ 항로 토막(칸 하나 · 한쪽만 우리 항)
        if not cell:
            continue
        hit = _HEAD_ROUTE.match(text.upper())
        if not hit:
            continue
        mode = _port_side_mode(hit.group(1), hit.group(2), aliases)
        if mode:
            return mode, "항로 %s" % hit.group(0)
    dis_hit = [t for t, _c in lines if _HEAD_TITLE_DIS.search(t)]
    load_hit = [t for t, _c in lines if _HEAD_TITLE_LOAD.search(t)]
    if dis_hit and not load_hit:                      # ㉲ 제목줄 방향말 — 한쪽만 나올 때만
        return "discharge", "제목 %s" % dis_hit[0][:40]
    if load_hit and not dis_hit:
        return "loading", "제목 %s" % load_hit[0][:40]
    return "", ""

# 값이 0 이면 '그 열이 없었다'는 뜻인 필드(검수앱 firebase.js _ZERO_IS_EMPTY 와 같은 정신).
#   ⚠ 참/거짓(False)은 빈 값이 아니다 — dg/rf 의 False 는 '아니다'라는 판정값이다.
LIST_PAIR_FIELDS = (("sl", "sl_orig"), ("eseal", "eseal_orig"))

# 값이 서로 다르면 로그로 남길 필드(덮지는 않는다) — 실번호가 대표다.
LIST_CONFLICT_FIELDS = ("sl", "eseal", "iso", "fe", "wt", "pol", "pod", "bl")

# 충돌 로그 상한 — 한 항차가 사이클 로그를 뒤덮지 않게. 넘치면 몇 건이 더 있는지 남긴다.
#   (실측: XTPG 535E 는 리스트 3장 사이에 'PTK↔KRPTK'·'45G0↔45GP' 표기 차이만 72건이다.)
LIST_CONFLICT_LOG_MAX = 10


def list_rank(name):
    """파일명 개정 마커 → 서열 점수(클수록 새 판). 같은 점수는 mtime 최신이 이긴다."""
    text = str(name or "")
    if _MARK_FINAL.search(text):
        return RANK_FINAL
    if _MARK_REVISED.search(text):
        return RANK_REVISED
    nth = _MARK_NTH.search(text)
    if nth:
        return RANK_NTH + min(int(nth.group(1)), 99)
    return RANK_PLAIN


def list_mode(dis_home, load_home, name, head_mode=""):
    """이 리스트가 어느 방향인가. 'discharge' · 'loading' · ''(가릴 수 없음).

    ① 컨별 내용이 먼저다 — 홈포트 POD 가 많으면 양하, POL 이 많으면 선적.
       (실증: 'XINQUNDAO 2629W DIS LIST AFTER KRPTK.XLS' 는 이름이 DIS 인데 내용은 선적분이다.)
    ② 0.10 — 컨별 항구 칸이 없으면 **머리 블록의 목적항**(head_dest_mode)을 본다.
       검수사 확정 규칙: 목적항이 평택이면 양하, 타목적지면 선적.
    ③ 그래도 못 가리면 파일명 힌트(CDL/DISCH=양하 · CLL/LOAD=선적).
    ④ 그래도 불명이면 ''를 돌려준다 — **넘겨짚지 않고 건너뛴다.**
       (실증: 'SWSP 2606N (Excel).xls' 는 폴더가 2606N(양하)인데 검수사는 선적에 올렸다.
        폴더 방향을 힌트로 쓰면 반대로 올라간다 — 그래서 폴더는 근거로 쓰지 않는다.)
    """
    if dis_home > load_home:
        return "discharge"
    if load_home > dis_home:
        return "loading"
    if head_mode in ("discharge", "loading"):
        return head_mode
    dis_hint = bool(_HINT_DIS.search(str(name or "")))
    load_hint = bool(_HINT_LOAD.search(str(name or "")))
    if dis_hint and not load_hint:
        return "discharge"
    if load_hint and not dis_hint:
        return "loading"
    return ""


def _list_empty(value):
    """리스트 병합에서 '빈 칸'인가 — 없음(None) · 빈 문자열 · 숫자 0.
    참/거짓은 빈 칸이 아니다(False 는 '아니다'라는 값이다)."""
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (int, float)):
        return value == 0
    return False


def _fix_seal_pairs(rec):
    """실번호 짝(sl/sl_orig · eseal/eseal_orig)을 어긋나지 않게 맞춘다.

    한쪽만 채우면 `sl ≠ sl_orig` 가 되어 앱이 **실오류(세관 신고 대상)** 로 띄운다
    (검수앱 1.8-02 사고와 같은 자리). 원본이 비어 있으면 현재 값을 원본으로 삼는다.
    """
    for base, orig in LIST_PAIR_FIELDS:
        if not _list_empty(rec.get(base)) and _list_empty(rec.get(orig)):
            rec[orig] = rec[base]
    return rec


def merge_list_files(files, log=None):
    """개정 서열 높은 순으로 리스트들을 한 장으로 합친다 — 먼저 온 값이 이긴다.

    files: [{"name","rank","mtime","records":[...]}] (정렬 전). 돌려주는 값: ({컨:레코드}, 충돌수)
    같은 (컨·필드)에 서로 다른 값이 있으면 **낮은 서열이 덮지 못하고** 로그로만 남는다.
    """
    order = sorted(files, key=lambda f: (f["rank"], f["mtime"], f["name"]), reverse=True)
    out, conflicts = {}, 0
    for item in order:
        for rec in item.get("records") or []:
            cn = str(rec.get("cn") or "").strip().upper()
            if not cn:
                continue
            if cn not in out:
                out[cn] = dict(rec)
                continue
            cur = out[cn]
            for field, value in rec.items():
                if _list_empty(value):
                    continue
                if _list_empty(cur.get(field)):
                    cur[field] = value
                elif field in LIST_CONFLICT_FIELDS and \
                        str(cur[field]).strip() != str(value).strip():
                    conflicts += 1
                    if log and conflicts <= LIST_CONFLICT_LOG_MAX:
                        log("    ⚠ 리스트 충돌 %s %s: %r(서열 높음) ↔ %r(%s) — 덮지 않습니다"
                            % (cn, field, cur[field], value, item["name"]))
    if log and conflicts > LIST_CONFLICT_LOG_MAX:
        log("    ⚠ 리스트 충돌 %d건 더 있습니다(같은 종류) — 모두 덮지 않았습니다"
            % (conflicts - LIST_CONFLICT_LOG_MAX))
    for cn, rec in out.items():
        _fix_seal_pairs(rec)
        if not rec.get("l4") and len(cn) >= 4:
            rec["l4"] = cn[-4:]
    return out, conflicts


def merge_into_records(old, new, log=None, mode=""):
    """보수 머지 — 새 컨은 더하고, 기존 컨은 **빈 칸만** 채운다. 삭제·덮어쓰기 없음.

    돌려주는 값: (병합결과, 새 컨 수, 빈칸 채운 컨 수, 충돌 수)
    """
    out = json.loads(json.dumps(old or {}, ensure_ascii=False))
    added = filled = conflicts = 0
    for cn, rec in (new or {}).items():
        prev = out.get(cn)
        if prev is None:
            out[cn] = _fix_seal_pairs(dict(rec))
            added += 1
            continue
        if not isinstance(prev, dict):                # 모양이 다른 기존 값은 손대지 않는다
            if log:
                log("    ⚠ %s %s 기존 값이 사전이 아니어서 건너뜁니다(무접촉)" % (mode, cn))
            continue
        cur = dict(prev)
        touched_base = set()
        for field, value in rec.items():
            if _list_empty(value):
                continue
            if field in ("sl_orig", "eseal_orig"):    # 짝 필드는 아래에서 짝으로만 다룬다
                continue
            if _list_empty(cur.get(field)):
                cur[field] = value
                touched_base.add(field)
            elif field in LIST_CONFLICT_FIELDS and \
                    str(cur[field]).strip() != str(value).strip():
                conflicts += 1
                if log and conflicts <= LIST_CONFLICT_LOG_MAX:
                    log("    ⚠ 기존값 충돌 %s %s %s: 기존 %r ↔ 리스트 %r — 기존을 지킵니다"
                        % (mode, cn, field, cur[field], value))
        for base, orig in LIST_PAIR_FIELDS:           # sl 을 채웠으면 sl_orig 도 짝으로 채운다
            if base in touched_base:
                cur[orig] = rec.get(orig) if not _list_empty(rec.get(orig)) else cur[base]
            elif not _list_empty(cur.get(base)) and _list_empty(cur.get(orig)):
                cur[orig] = cur[base]                 # 한쪽만 있으면 실오류로 오인된다
        if "tmp" in touched_base and cur.get("tmp_missing") is True:
            cur["tmp_missing"] = False                # 온도가 채워졌으면 '온도 없음'을 푼다
        if cur != prev:
            out[cn] = cur
            filled += 1
    if log and conflicts > LIST_CONFLICT_LOG_MAX:
        log("    ⚠ %s 기존값 충돌 %d건 더 있습니다(같은 종류) — 기존을 모두 지켰습니다"
            % (mode, conflicts - LIST_CONFLICT_LOG_MAX))
    return out, added, filled, conflicts


def scan_lists(folder, names, aliases, log, folder_dir=""):
    """폴더의 리스트 엑셀을 전부 읽어 판독한다 — [{"name","rank","mtime","mode","records"}].
    report(마감텔리·베이플랜)·XRAY·합본은 detect_list_kind 가 걸러 낸다."""
    lp, why = list_parser_mod()
    if lp is None:
        log("    ⚠ 리스트 판독 모듈을 부르지 못해 리스트 단계를 건너뜁니다 — %s" % why)
        return []
    out = []
    for name in sorted(names):
        if lp.detect_list_kind(name) != "list":       # 값싼 이름 게이트(확장자·report·xray·합본)
            continue
        path = os.path.join(folder, name)
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError as exc:
            log("    리스트를 읽지 못했습니다(%s): %s" % (name, exc))
            continue
        sheets, err = lp.read_sheets(data, name)
        if err:                                       # 의존성 부재·HTML 위장 등 — 사유를 남긴다
            log("    리스트 판독 건너뜀(%s): %s" % (name, err))
            continue
        if lp.detect_list_kind(name, sheets) != "list":
            continue                                  # 내용에 리스트 시트가 없다(요약표 등)
        report_why = head_is_report(sheets)            # 0.10 — 내용이 스스로 '플랜·보고서'라 밝히면 뺀다
        if report_why:
            log("    · 리스트가 아닙니다(내용이 밝힘: %s) — 올리지 않습니다: %s" % (report_why, name))
            continue
        try:
            parsed = lp.parse_list_sheets(sheets, source=name)
        except Exception as exc:                      # 한 파일이 깨져도 폴더 전체를 죽이지 않는다
            log("    리스트 판독 실패(%s) %s: %s" % (name, type(exc).__name__, exc))
            continue
        recs = (parsed or {}).get("records") or []
        if not recs:
            continue
        dis_home = sum(1 for r in recs if is_home_port(r.get("pod"), aliases))
        load_home = sum(1 for r in recs if is_home_port(r.get("pol"), aliases))
        head_mode, head_why = "", ""
        if dis_home == load_home:                     # 컨별 항구 칸으로 못 가릴 때만 머리 블록을 본다
            head_mode, head_why = head_dest_mode(sheets, aliases)
        mode = list_mode(dis_home, load_home, name, head_mode)
        if not mode:
            log("    ⤫ 리스트 방향을 가릴 수 없어 건너뜁니다: %s (컨 %d · 홈 POD %d · POL %d)"
                % (name, len(recs), dis_home, load_home))
            continue
        if head_mode and head_mode == mode:
            log("    · 내용 판독 — %s 방향 %s (근거: %s)"
                % (name, "양하" if mode == "discharge" else "선적", head_why))
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = 0.0
        out.append({"name": name, "rank": list_rank(name), "mtime": mtime,
                    "mode": mode, "records": recs, "folder_dir": folder_dir})
    return out


def upload_lists(firebase, key, mode, files, log):
    """한 방향 records 를 보수 머지로 올린다. (새 컨, 빈칸 채움, 충돌, 성공여부)."""
    new, conflicts = merge_list_files(files, log)
    if not new:
        return 0, 0, conflicts, True
    path = "voyages/%s/%s/records" % (key, mode)
    try:
        old = firebase.get(path)
    except Exception as exc:                          # 조용한 실패 금지 — 못 읽으면 올리지 않는다
        log("    ✗ %s 기존 records 를 읽지 못해 리스트를 올리지 않습니다(%s: %s)"
            % (mode, type(exc).__name__, exc))
        return 0, 0, conflicts, False
    if old is not None and not isinstance(old, dict):
        log("    ✗ %s 기존 records 모양이 사전이 아닙니다 — 손대지 않습니다(%s)" % (mode, type(old).__name__))
        return 0, 0, conflicts, False
    merged, added, filled, more = merge_into_records(old or {}, new, log, mode)
    conflicts += more
    if merged == (old or {}):
        return 0, 0, conflicts, True                  # 바뀐 것이 없으면 쓰지 않는다
    if firebase.put(path, strip_nulls(merged)) is None:
        log("    ✗ %s 리스트 업로드 실패 — 다음 사이클에 다시 시도합니다." % mode)
        return 0, 0, conflicts, False
    log("    ↑ 리스트 올림: %s %s 추가 %d·빈칸 채움 %d·충돌 %d (%s)"
        % (key, mode, added, filled, conflicts,
           ", ".join(f["name"] for f in sorted(files, key=lambda f: (f["rank"], f["mtime"]),
                                               reverse=True))))
    return added, filled, conflicts, True


# ──────────────────────────── ㉱ 백필 스캔 ────────────────────────────

def voyage_folders(root, cache, master, log):
    """올릴 대상 폴더 목록 — [(선박코드, 항차, 경로, 파일명들)].
    '_' 로 시작하는 폴더(_미분류·_기타)는 건너뛰고, **정본표에 있고 검수 대상인 선박**만 본다."""
    core = _core()
    out, off, unknown = [], [], []
    try:
        entries = sorted(os.listdir(root))
    except OSError as exc:
        log("메일박스를 읽지 못했습니다(%s): %s" % (root, exc))
        return out
    for name in entries:
        if name.startswith("_"):
            continue
        path = os.path.join(root, name)
        if not os.path.isdir(path):
            continue
        code = name.strip().upper()
        if not core.master_by_code(master, code):
            unknown.append(code)
            continue
        if not core.tally_enabled(cache, code):
            off.append(code)
            continue
        try:
            voys = sorted(os.listdir(path))
        except OSError as exc:
            log("선박 폴더를 읽지 못했습니다(%s): %s" % (code, exc))
            continue
        for vname in voys:
            vpath = os.path.join(path, vname)
            if not os.path.isdir(vpath):
                continue
            voy = vname.strip().upper()
            if not voy_direction(voy):
                log("  항차 방향을 못 읽어 건너뜁니다: %s/%s" % (code, voy))
                continue
            try:
                names = [f for f in os.listdir(vpath) if os.path.isfile(os.path.join(vpath, f))]
            except OSError as exc:
                log("  항차 폴더를 읽지 못했습니다(%s/%s): %s" % (code, voy, exc))
                continue
            if not names:
                continue
            out.append((code, voy, vpath, names))
    if unknown:
        log("정본표에 없는 폴더 %d개는 건너뜁니다: %s" % (len(unknown), ", ".join(sorted(set(unknown)))))
    if off:
        log("검수 대상이 아닌 선박 %d척은 건너뜁니다: %s" % (len(off), ", ".join(sorted(set(off)))))
    return out


def handle_group(firebase, code, key_voy, members, voy_d, voy_l, aliases, log, index=None,
                 plan_row=None):
    """한 항차(폴더 한 묶음) — 항차 등록 + 방향별 대표 EDI + 리스트(records) 업로드.

    돌려주는 값: (키, 올린 EDI 대수 합, 성공여부, 리스트 통계)
    """
    other = [v for v, _p, _n in members] + [v for v in (voy_d, voy_l) if v]
    key, key_voy = resolve_key(firebase, code, key_voy, other, index)
    if index is not None:                               # 이번 판에서 새로 만든 키도 다음 묶음이 본다
        index.setdefault(str(code).upper(), {}).setdefault(str(key_voy).upper(), key)
    log("  ▸ %s %s → %s (양하 %s · 선적 %s)"
        % (code, "+".join(v for v, _p, _n in members), key, voy_d or "-", voy_l or "-"))
    ok = register_voyage(firebase, key, code, key_voy, voy_d, voy_l, log, plan_row)

    stats = {"added": 0, "filled": 0, "conflicts": 0, "files": 0, "modes": []}
    cands, lists = [], []
    for voy, path, names in members:
        cands += scan_candidates(path, names, aliases, log, voy_direction(voy))
        lists += scan_lists(path, names, aliases, log, voy_direction(voy))

    uploaded = 0
    if cands:
        best = pick_representatives(cands, log)
        for mode in ("discharge", "loading"):
            cand = best.get(mode)
            if cand is None:
                continue
            if mode != cand.get("folder_dir"):
                log("    ↔ 폴더 방향(%s)과 내용이 달라 %s 노드에 올립니다: %s"
                    % (cand.get("folder_dir") or "?", mode, cand["name"]))
            count, sent = upload_mode(firebase, key, mode, cand, aliases, log)
            uploaded += count
            ok = ok and sent

    # 0.9 — 리스트(records). EDI 와 독립이다: EDI 가 없어도 리스트만으로 매칭이 산다.
    for mode in ("discharge", "loading"):
        files = [f for f in lists if f["mode"] == mode]
        if not files:
            continue
        stats["files"] += len(files)
        added, filled, conflicts, sent = upload_lists(firebase, key, mode, files, log)
        stats["added"] += added
        stats["filled"] += filled
        stats["conflicts"] += conflicts
        if added or filled:
            stats["modes"].append("%s/%s" % (key, mode))
        ok = ok and sent
    return key, uploaded, ok, stats


# ──────────────── ㉲ 기동 시 1회 — 항차 표기 병합 마이그레이션(0.5-01) ────────────────
#
# 같은 항차가 표기 차이(0패딩)로 폴더 두 개·서버 키 두 개로 갈라진 것을 하나로 합친다.
# 원칙은 정본 이관과 같다 — **옮기기만** 한다. 파일은 지우지도 덮어쓰지도 않는다.
#   · 정본 폴더 : 자료가 많은 쪽 → 동수면 EDI 있는 쪽 → 그래도 동수면 먼저 있던 쪽
#   · 서버 키   : 한 묶음 = 한 키. 같은 묶음을 가리키는 다른 표기의 키는 정본 키로 합치고 지운다.
#   · 검수 흔적(records·completed 등)이 있는 키는 **절대 지우지 않고** 로그로 보고만 한다.
# 여러 번 돌려도 안전하다(멱등) — 합칠 것이 없으면 아무것도 쓰지 않는다.

VOYAGE_SAFE_CHILDREN = ("info", "discharge", "loading")


def merge_voy_dirs(vessel_dir, log):
    """한 선박 폴더 안에서 같은 항차인 폴더들을 정본 폴더로 합친다(옮기기만 · 충돌 스킵)."""
    out = {"moved": 0, "skipped": 0, "merged": []}
    try:
        entries = sorted(os.listdir(vessel_dir))
    except OSError as exc:
        log("  선박 폴더를 읽지 못했습니다(%s): %s" % (vessel_dir, exc))
        return out
    buckets = {}
    for name in entries:
        path = os.path.join(vessel_dir, name)
        if not os.path.isdir(path):
            continue
        ident = voy_ident(name)
        if ident is None:
            continue                                    # 항차로 못 읽는 폴더는 무접촉
        buckets.setdefault(ident, []).append(name)
    for _ident, names in sorted(buckets.items()):
        if len(names) < 2:
            continue
        ranked = sorted(names, reverse=True,
                        key=lambda n: _folder_rank(os.path.join(vessel_dir, n),
                                                   _dir_files(os.path.join(vessel_dir, n))))
        canon, others = ranked[0], ranked[1:]
        for name in others:
            src, dst = os.path.join(vessel_dir, name), os.path.join(vessel_dir, canon)
            moved, skipped = 0, 0
            for fname in sorted(_dir_files(src)):
                target = os.path.join(dst, fname)
                if os.path.exists(target):
                    skipped += 1
                    log("    같은 이름이 이미 있어 건너뜁니다(그대로 둡니다): %s" % target)
                    continue
                try:
                    os.rename(os.path.join(src, fname), target)
                except OSError as exc:
                    skipped += 1
                    log("    파일을 옮기지 못했습니다(그대로 둡니다): %s (%s)" % (fname, exc))
                    continue
                moved += 1
            out["moved"] += moved
            out["skipped"] += skipped
            out["merged"].append((name, canon))
            log("  ↦ 항차 표기 병합: %s → %s (파일 %d개 이동 · %d개 건너뜀)"
                % (os.path.join(vessel_dir, name), canon, moved, skipped))
            try:
                if not os.listdir(src):                 # 빈 껍데기만 치운다(파일이 남으면 실패해 그대로)
                    os.rmdir(src)
                    log("    빈 폴더를 치웠습니다: %s" % src)
            except OSError as exc:
                log("    빈 폴더를 치우지 못해 그대로 둡니다: %s (%s)" % (src, exc))
    return out


def voyage_traces(firebase, key):
    """(자식 이름들, 검수 흔적 이름들, info). info·discharge·loading 밖의 자식이 검수 흔적이다."""
    children = firebase.get("voyages/%s" % key, params={"shallow": "true"})
    children = children if isinstance(children, dict) else {}
    info = firebase.get("voyages/%s/info" % key)
    info = info if isinstance(info, dict) else {}
    return children, sorted(c for c in children if c not in VOYAGE_SAFE_CHILDREN), info


def merge_voyage_node(firebase, dup, key, log):
    """비정본 항차 키를 정본 키로 합친다. 돌려주는 값: 'deleted' | 'held' | 'failed'."""
    children, traces, info = voyage_traces(firebase, dup)
    if traces:
        log("  ⚠ 중복 항차 %s 에 검수 흔적(%s)이 있어 지우지 않습니다 — 사람이 판단하세요(정본 %s)."
            % (dup, ", ".join(traces), key))
        return "held"
    if info and not info.get("autoRegistered"):
        log("  ⚠ 중복 항차 %s 는 사람이 만든 항차(만든이 %s)라 지우지 않습니다 — 정본 %s."
            % (dup, info.get("createdBy") or "?", key))
        return "held"
    for mode in ("discharge", "loading"):               # ① 정본에 없는 방향 노드만 옮긴다
        if mode not in children:
            continue
        if firebase.get("voyages/%s/%s/ediContainers" % (key, mode)):
            continue                                    # 정본이 이미 갖고 있다 → 손대지 않는다
        node = firebase.get("voyages/%s/%s" % (dup, mode))
        if not isinstance(node, dict) or not node:
            continue
        if firebase.put("voyages/%s/%s" % (key, mode), strip_nulls(node)) is None:
            log("  ✗ 중복 항차 %s 의 %s 노드를 정본 %s 로 옮기지 못했습니다 — 지우지 않습니다."
                % (dup, mode, key))
            return "failed"
        log("  ↦ 중복 항차 %s 의 %s 노드를 정본 %s 로 옮겼습니다(%d대)."
            % (dup, mode, key, len(node.get("ediContainers") or {})))
    current = firebase.get("voyages/%s/info" % key)     # ② 정본 info 의 빈칸만 채운다
    current = current if isinstance(current, dict) else {}
    patch = {f: info[f] for f in ("voy_d", "voy_l") if info.get(f) and not current.get(f)}
    if patch:
        if firebase.patch("voyages/%s/info" % key, strip_nulls(patch)) is None:
            log("  ✗ 정본 %s info 보강 실패 — 중복 키 %s 는 그대로 둡니다." % (key, dup))
            return "failed"
        log("  · 정본 %s info 보강: %s" % (key, json.dumps(patch, ensure_ascii=False)))
    firebase.delete("voyages/%s" % dup)                 # ③ 비정본 키 삭제 후 다시 읽어 확인
    if firebase.get("voyages/%s" % dup, params={"shallow": "true"}):
        log("  ✗ 중복 항차 키가 남아 있습니다: voyages/%s" % dup)
        return "failed"
    log("  − 중복 항차 키 삭제: %s (정본 %s 로 통합)" % (dup, key))
    return "deleted"


def cleanup_duplicate_keys(root, cache, master, firebase, log, result):
    """한 묶음 = 한 키. 같은 폴더 묶음을 가리키는 다른 표기의 서버 키를 정본 키로 합친다."""
    folders = voyage_folders(root, cache, master, lambda _msg: None)
    index = voyage_index(firebase, log)
    for code, key_voy, members, voy_d, voy_l in group_voyages(folders, cache):
        other = [v for v, _p, _n in members] + [v for v in (voy_d, voy_l) if v]
        key, _kv = resolve_key(firebase, code, key_voy, other, index)
        idents = set()
        for cand in [key_voy] + [v for v, _p, _n in members]:
            ident = voy_ident(cand)                     # 짝 상대는 폴더가 있을 때만 센다(추론 금지)
            if ident:
                idents.add(ident)
        known = index.get(str(code).upper()) or {}
        for voy in sorted(known.keys()):
            dup = known[voy]
            if dup == key or voy_ident(voy) not in idents:
                continue
            state = merge_voyage_node(firebase, dup, key, log)
            if state == "deleted":
                result["deleted"].append(dup)
                known.pop(voy, None)
            elif state == "held":
                result["held"].append(dup)
            else:
                result["errors"] += 1
    return result


def migrate_voyage_spelling(root, cache, master, firebase, log, state_path=None):
    """기동 시 1회 — 0패딩 표기 차이로 갈라진 항차를 정본 표기 하나로 합친다(멱등)."""
    result = {"merged": [], "moved": 0, "skipped": 0, "deleted": [], "held": [], "errors": 0}
    if not root or not os.path.isdir(root):
        log("메일박스 폴더가 없어 항차 표기 정규화를 건너뜁니다: %s" % root)
        return result
    if not master:
        log("선박 정본표가 없어 항차 표기 정규화를 건너뜁니다.")
        return result
    core = _core()
    touched = set()
    for base in (root, os.path.join(root, core.OTHER_DIR)):
        if not os.path.isdir(base):
            continue
        try:
            entries = sorted(os.listdir(base))
        except OSError as exc:
            log("메일박스를 읽지 못했습니다(%s): %s" % (base, exc))
            continue
        for name in entries:
            if name.startswith("_"):
                continue                                # _기타·_미분류 등 살림 폴더는 무접촉
            vessel_dir = os.path.join(base, name)
            code = name.strip().upper()
            if not os.path.isdir(vessel_dir) or not core.master_by_code(master, code):
                continue                                # 정본표에 없는 폴더는 건드리지 않는다
            out = merge_voy_dirs(vessel_dir, log)
            if out["merged"]:
                touched.add(code)
            result["merged"] += [(code, a, b) for a, b in out["merged"]]
            result["moved"] += out["moved"]
            result["skipped"] += out["skipped"]

    if touched and state_path:                          # 합친 선박은 정본 폴더를 한 번 다시 올린다
        state = load_state(state_path)
        drop = [rel for rel in list(state["folders"])
                if str(rel).split("/")[0].strip().upper() in touched]
        for rel in drop:
            state["folders"].pop(rel, None)
        if drop:
            save_state(state, state_path, log)
            log("항차 표기 병합 — 업로드 지문 %d건 무효화(정본 폴더를 이번 판에 다시 올립니다): %s"
                % (len(drop), ", ".join(sorted(drop))))

    if firebase is not None and getattr(firebase, "enabled", False):
        cleanup_duplicate_keys(root, cache, master, firebase, log, result)
    else:
        log("파이어베이스 미설정 — 서버 중복 항차 키 정리는 건너뜁니다.")

    if result["merged"] or result["deleted"] or result["held"] or result["errors"]:
        log("항차 표기 정규화 완료 — 폴더 병합 %d건(파일 이동 %d · 건너뜀 %d) · "
            "중복 키 삭제 %d개 · 보류 %d개 · 실패 %d건"
            % (len(result["merged"]), result["moved"], result["skipped"],
               len(result["deleted"]), len(result["held"]), result["errors"]))
    else:
        log("항차 표기 정규화 — 합칠 항차가 없습니다(표기 흔들림 0).")
    return result


# ──────────────────────────── ㉳ 0.6 선석배정 게이트 ────────────────────────────
#
# 배정표(터미널 선석배정)가 **항차의 진실**이다. 메일만 보고 만들던 항차 카드가
#   ① 지난 항차가 그대로 남고 ② 짝(E/W)이 두 장으로 갈라지고 ③ 작업일시가 비는
# 세 가지 탈을 냈다(검수사 신고 2026-08-06 · 37키). 배정표로 거르고 채운다.
#
# 지키는 선: 배정표를 **못 받은 사이클엔 아무것도 하지 않는다**(게이트도 정리도 생략).
#           배정표에 없는 선박은 종전대로 받는다(fail-open — 자료를 잃지 않는다).
#           검수 흔적이 있는 키는 어떤 경우에도 지우지 않는다. 폴더·파일은 무접촉.

# 기항 마감 신호 — 제목·첨부명의 'DEP.TALLY' / 'DEP TALLY' / 'DEP-TALLY'.
_DEP_TALLY = re.compile(r"(?<![A-Z])DEP[\s._\-]*TALLY(?![A-Z])")


class BerthPlan:
    """이번 사이클의 선석배정표. 항차 대조는 0.5-01 voy_ident(정수 비교)를 그대로 쓴다."""

    def __init__(self, rows):
        self.rows = list(rows or [])
        self._by_code = {}
        for row in self.rows:
            self._by_code.setdefault(str(row.get("vessel_code") or "").upper(), []).append(row)

    def __len__(self):
        return len(self.rows)

    def rows_for(self, code):
        return self._by_code.get(str(code or "").upper()) or []

    def find(self, code, voys):
        """이 선박의 이 항차(표기 여럿 중 하나라도)가 실린 배정표 줄. 없으면 None."""
        idents = set()
        plain = set()
        for voy in voys:
            text = str(voy or "").strip().upper()
            if not text:
                continue
            plain.add(text)
            ident = voy_ident(text)
            if ident:
                idents.add(ident)
        for row in self.rows_for(code):
            for field in ("voy_d", "voy_l"):
                cand = str(row.get(field) or "").upper()
                if not cand:
                    continue
                ident = voy_ident(cand)
                if cand in plain or (ident and ident in idents):
                    return row
        return None

    def excluded_route_for(self, code):
        """이 선박이 **배정표에서 확인된** 비관할 항로 선박인가 → 항로명. 아니면 ''.

        0.6-02 — 비관할 항로(PXS·PQS·JWKP)는 검수사가 아예 맡지 않는 배다. 그런데 항차 단위로만
        보면 배정표 창(뒤 7일~앞 7일) 밖으로 밀린 지난 항차(PCSG 2639E·2640W)는 줄을 못 찾아
        fail-open 으로 남고, 지워도 다음 사이클에 다시 등록된다.
        **배정표에 실린 이 선박의 줄이 하나도 빠짐없이 비관할일 때만** 선박 단위로 판정한다.
        한 줄이라도 관할 항로면 '' — 항로가 바뀐 배를 통째로 지우지 않는다(추측 금지).
        """
        rows = self.rows_for(code)
        if not rows or not all(row.get("excluded") for row in rows):
            return ""
        routes = sorted({str(row.get("route") or "").upper() for row in rows if row.get("route")})
        return "·".join(routes) or "?"


# ── 기항 마감(DEP.TALLY) 캐시 — vessels_cache.json 안 "closed": {선박코드: {항차: 시각}} ──

def closed_table(cache, code):
    return ((cache or {}).get("closed") or {}).get(str(code or "").upper()) or {}


def is_closed(cache, code, voys):
    """이 항차가 마감(DEP.TALLY)으로 기록돼 있는가. 표기가 달라도 같은 항차면 잡는다."""
    table = closed_table(cache, code)
    if not table:
        return ""
    for voy in voys:
        text = str(voy or "").strip().upper()
        if not text:
            continue
        if text in table:
            return text
        ident = voy_ident(text)
        if ident is None:
            continue
        for name in sorted(table):
            if voy_ident(name) == ident:
                return name
    return ""


def mark_closed(text, code, voy, cache, log=None):
    """제목·첨부명에서 기항 마감(DEP.TALLY)을 읽어 캐시에 남긴다. 새로 안 항차만 돌려준다.

    폴더 적재·기존 키 채우기는 계속한다 — 막는 것은 **새 항차 카드 만들기**뿐이다.
    """
    if not code or cache is None:
        return []
    up = " ".join(str(text or "").upper().split())
    if not _DEP_TALLY.search(up):
        return []
    voys = [str(voy or "").upper().strip()]
    for dis, load in find_pairs(up, voy):               # 같은 글에 짝이 적혀 있으면 둘 다 마감
        voys += [dis, load]
    partner = paired_partner(cache, code, voy)
    if partner:
        voys.append(str(partner).upper())
    table = cache.setdefault("closed", {}).setdefault(str(code).upper(), {})
    fresh = []
    for name in voys:
        if not name or not voy_direction(name):
            continue
        if is_closed(cache, code, [name]):
            continue
        table[name] = time.strftime("%Y-%m-%dT%H:%M:%S")
        fresh.append(name)
    if fresh and log:
        log("기항 마감(DEP.TALLY) 확인: %s %s" % (code, ", ".join(fresh)))
    return fresh


# ── 등록 게이트 ──

def _key_known(index, code, voys):
    """이 항차가 서버에 이미 카드로 있는가(표기가 달라도 같은 항차면 있다고 본다)."""
    known = (index or {}).get(str(code or "").upper()) or {}
    for voy in voys:
        text = str(voy or "").strip().upper()
        if not text:
            continue
        if text in known:
            return True
        ident = voy_ident(text)
        if ident and any(voy_ident(name) == ident for name in known):
            return True
    return False


def registration_gate(plan, cache, code, voys):
    """새 항차 카드를 만들어도 되는가 → (된다, 사유). 이미 있는 키를 채우는 것은 막지 않는다."""
    reason = is_closed(cache, code, voys)
    if reason:
        return False, "기항 마감(DEP.TALLY %s)" % reason
    if plan is None:
        return True, ""
    row = plan.find(code, voys)
    if row is None:
        # 0.6-02 — 줄은 못 찾아도 배정표에서 '이 배는 비관할'이 확인되면 새 카드를 안 만든다.
        #   (정리에서 지운 비관할 키가 다음 사이클에 되살아나는 것을 막는 같은 잣대다.)
        route = plan.excluded_route_for(code)
        if route:
            return False, "비관할 항로 %s(배정표에서 확인한 선박)" % route
        return True, ""                                 # 배정표에 없는 선박 — 종전대로(fail-open)
    if row.get("excluded"):
        return False, "비관할 항로 %s" % (row.get("route") or "?")
    if row.get("departed"):
        return False, "배정표 실적 출항(ATD %s)" % (row.get("atd") or row.get("etd") or "")
    return True, ""


def plan_info_fields(row, log=None):
    """배정표 줄 → info 에 채울 (빈칸만 채울 것, 항상 갱신할 것). 못 읽은 값은 아예 안 보낸다."""
    if not row:
        return {}, {}
    fresh, refresh = {}, {}
    if row.get("vessel_name"):
        fresh["vslFull"] = row["vessel_name"]
    start = row.get("atb") or row.get("etb") or ""
    end = row.get("atd") or row.get("etd") or ""
    if start and end:
        refresh["planDate"] = "%s ~ %s" % (start, end)
        refresh["planSrc"] = "plan"
    elif log and (start or end):
        log("    · 배정표 %s — 접안·출항 한쪽 시각이 없어 planDate 를 비웁니다(%s ~ %s)"
            % (row.get("master_vvd") or row.get("vessel_code"), start or "?", end or "?"))
    # 검수앱 계약값(src/badgeRule.js)만 보낸다 — 모르는 낱말을 보내면 앱이 경고를 찍는다.
    if row.get("status") in ("departed", "working", "planned"):
        refresh["terminalStatus"] = row["status"]
    if row.get("berth"):
        refresh["berth"] = row["berth"]
    if row.get("pier"):
        refresh["pier"] = row["pier"]
    return fresh, refresh


def promote_pairs(plan, cache, log):
    """배정표의 선사항차 짝을 짝 캐시에 정본으로 올린다 — 갈라진 카드를 한 장으로 되돌리는 근거."""
    if plan is None or cache is None:
        return 0
    count = 0
    for row in plan.rows:
        if row.get("excluded"):
            continue
        code = str(row.get("vessel_code") or "").upper()
        dis, load = row.get("voy_d") or "", row.get("voy_l") or ""
        if not code or not dis or not load:
            continue
        table = cache.setdefault("pairs", {}).setdefault(code, {})
        if same_voyage(_table_get(table, dis), load) and same_voyage(_table_get(table, load), dis):
            continue
        table[dis], table[load] = load, dis
        count += 1
        log("  ↔ 배정표 짝 확정: %s %s ↔ %s (%s)"
            % (code, dis, load, row.get("master_vvd") or row.get("terminal")))
    return count


# ──────────────────────── ㉳ 예정등록(0.7) — 자료보다 먼저 카드를 세운다 ────────────────────────
#
# 현장 검수앱에는 자료가 오기 전에도 배정표·도선 기반 '예정 카드'가 미리 선다. 범용판은 0.6 까지
# **메일 자료가 온 항차만** 등록해 그 카드가 없었다. 배정표는 이미 사이클마다 받고 있으므로
# 그 줄로 카드를 세운다 — 만드는 것은 info 뿐이고 섹션(discharge/loading)은 자료가 올 때 생긴다.
#
#   대상 줄 : 정본표에 있는 선박 · 검수 대상(체크 켬) · 비관할 항로 아님 · DEP.TALLY 마감 아님 ·
#             실적 출항(ATD) 없음  → 판정 잣대는 0.6 registration_gate 하나만 쓴다.
#   키      : 0.5-01 resolve_key/voy_ident 재사용 — 이미 있는 키면 새로 만들지 않고 보강만 한다.
#   상태    : autoStatus 'expected' → 실자료가 닿으면 'collecting'(register_voyage source='mail').
#   철수    : 예정으로 세운 카드가 배정표에서 출항·비관할·마감으로 바뀌면 그 자리에서 치운다
#             (검수 흔적·사람이 만든 카드는 remove_voyage_key 가 막는다).

EXPECTED_STATUS = "expected"

# 캐시 지문에 넣는 배정표 값 — 이 중 하나라도 바뀌어야 다시 쓴다(같은 PUT/PATCH 반복 금지).
_EXPECTED_SIG_FIELDS = ("voy_d", "voy_l", "vessel_name", "atb", "etb", "atd", "etd",
                        "status", "berth", "pier", "excluded", "departed")


def expected_sig(row):
    """배정표 줄에서 예정 카드에 실리는 값만 뽑은 지문."""
    return "|".join(str((row or {}).get(field) or "") for field in _EXPECTED_SIG_FIELDS)


def expected_row_id(row):
    """캐시에서 이 배정표 줄을 가리키는 이름 — 짝 표기 그대로(터미널 모선항차는 매번 바뀐다)."""
    return "%s/%s" % ((row or {}).get("voy_d") or "-", (row or {}).get("voy_l") or "-")


def expected_table(cache):
    return cache.setdefault("expected", {}) if cache is not None else {}


def forget_expected(cache, key):
    """이 항차 키를 가리키던 예정등록 기록을 지운다 — 카드가 사라졌으면 지문도 사라져야 한다."""
    if cache is None or not key:
        return 0
    gone = 0
    for code, rows in list((cache.get("expected") or {}).items()):
        for row_id, seen in list((rows or {}).items()):
            if (seen or {}).get("key") == key:
                rows.pop(row_id, None)
                gone += 1
        if not rows:
            cache["expected"].pop(code, None)
    return gone


def expected_rows(plan, cache, master, log=None):
    """예정 카드를 세울 배정표 줄만 고른다 → [(줄, 항차들)]. 판정은 registration_gate 하나로."""
    core = _core()
    out = []
    for row in (plan.rows if plan is not None else []):
        code = str(row.get("vessel_code") or "").upper()
        voys = [v for v in (row.get("voy_d"), row.get("voy_l")) if v]
        if not code or not voys:
            continue                                    # 선사항차를 못 읽은 줄(유조선 등)은 건너뛴다
        if not core.master_by_code(master, code):
            continue                                    # 정본표에 없는 배 — 이름을 모르는 카드는 안 세운다
        if not core.tally_enabled(cache, code):
            continue                                    # 검수 대상 체크를 끈 배
        if row.get("atd"):
            continue                                    # 실적 출항 시각이 찍힌 기항은 이미 끝났다
        allowed, why = registration_gate(plan, cache, code, voys)
        if not allowed:
            if log:
                log("  · 예정등록 제외: %s %s — %s" % (code, "/".join(voys), why))
            continue
        out.append((row, voys))
    return out


def retire_expected(firebase, cache, plan, log):
    """배정표가 '끝났다'고 말하는 예정 카드를 그 자리에서 치운다 — 다음 기동을 기다리지 않는다.

    자료가 닿아 collecting 이 된 카드는 손대지 않는다(기존 정리 규칙이 맡는다).
    """
    out = {"retired": [], "held": [], "errors": 0}
    for code, rows in list(((cache.get("expected") if cache else None) or {}).items()):
        for row_id, seen in list((rows or {}).items()):
            key = (seen or {}).get("key")
            if not key:
                continue
            voys = [v for v in str(row_id).split("/") if v and v != "-"]
            if not voys or plan.find(code, voys) is None:
                continue                                # 배정표 창 밖 — 기동 정리가 맡는다
            allowed, why = registration_gate(plan, cache, code, voys)
            if allowed:
                continue
            info = firebase.get("voyages/%s/info" % key)
            if not isinstance(info, dict) or not info:
                rows.pop(row_id, None)                  # 이미 없는 카드 — 지문만 정리한다
                continue
            if info.get("autoStatus") != EXPECTED_STATUS:
                continue                                # 자료가 닿은 카드는 예정 카드가 아니다
            state = remove_voyage_key(firebase, key, "예정 카드 철수 — %s" % why, log)
            if state == "deleted":
                out["retired"].append(key)
                rows.pop(row_id, None)
            elif state == "held":
                out["held"].append(key)
                rows.pop(row_id, None)                  # 사람이 맡은 카드는 다시 묻지 않는다
            else:
                out["errors"] += 1
    return out


def register_expected(plan, cache, master, firebase, cfg, log, index=None):
    """배정표 수신 사이클마다 — 예정 카드를 세우고(없으면), 끝난 예정 카드를 치운다.

    새 키가 없을 때만 info 를 PUT 한다. 이미 키가 있으면 0.6 보강 경로 그대로다(중복 로직 없음).
    """
    out = {"created": [], "filled": [], "retired": [], "held": [], "skipped": 0, "errors": 0}
    if plan is None or firebase is None or not getattr(firebase, "enabled", False):
        return out
    if not (cfg or {}).get("expected_cards", True):
        log("예정등록 — 설정에서 껐습니다(expected_cards).")
        return out

    try:
        retired = retire_expected(firebase, cache, plan, log)
    except Exception as exc:                            # 철수가 죽어도 등록은 계속한다
        log("예정 카드 철수 중 오류: %s: %s" % (type(exc).__name__, exc))
        retired = {"retired": [], "held": [], "errors": 1}
    out["retired"] = retired["retired"]
    out["held"] = retired["held"]
    out["errors"] += retired["errors"]

    rows = expected_rows(plan, cache, master, None)
    if not rows:
        log("예정등록 — 배정표에서 세울 예정 항차가 없습니다.")
        return out
    if index is None:
        index = voyage_index(firebase, log)
    table = expected_table(cache)
    done = set()
    for row, voys in rows:
        code = str(row.get("vessel_code") or "").upper()
        row_id, sig = expected_row_id(row), expected_sig(row)
        seen = (table.get(code) or {}).get(row_id) or {}
        if seen.get("sig") == sig:
            out["skipped"] += 1
            continue                                    # 바뀐 것이 없다 — 읽지도 쓰지도 않는다
        voy_d, voy_l = row.get("voy_d") or "", row.get("voy_l") or ""
        key, key_voy = resolve_key(firebase, code, voy_d or voy_l, voys, index)
        if key in done:
            continue                                    # 같은 카드를 가리키는 두 줄(터미널 중복)
        done.add(key)
        current = firebase.get("voyages/%s/info" % key)
        is_new = not (isinstance(current, dict) and current)
        if not register_voyage(firebase, key, code, key_voy, voy_d, voy_l, log, row,
                               source="expected", current=current or {}):
            out["errors"] += 1
            continue
        index.setdefault(code, {}).setdefault(str(key_voy).upper(), key)
        (out["created"] if is_new else out["filled"]).append(key)
        if cache is not None:
            table.setdefault(code, {})[row_id] = {"sig": sig, "key": key, "at": _now_ms()}

    if out["created"]:
        log("예정등록 — 새 예정 카드 %d장: %s"
            % (len(out["created"]), ", ".join(out["created"])))
    if out["retired"]:
        log("예정등록 — 끝난 예정 카드 %d장을 치웠습니다: %s"
            % (len(out["retired"]), ", ".join(out["retired"])))
    if not out["created"] and not out["retired"]:
        log("예정등록 — 세울 새 카드가 없습니다(배정표 %d줄 대상 · 그대로 %d줄 · 보강 %d장)"
            % (len(rows), out["skipped"], len(out["filled"])))
    return out


# ── 기존 키 정리 — 배정표를 받은 사이클에 한 번(멱등) ──

def remove_voyage_key(firebase, key, why, log):
    """자동 등록이고 검수 흔적이 없는 항차 키만 지운다. 'deleted' | 'held' | 'failed'."""
    _children, traces, info = voyage_traces(firebase, key)
    if traces:
        log("  ⚠ %s 는 검수 흔적(%s)이 있어 지우지 않습니다 — %s" % (key, ", ".join(traces), why))
        return "held"
    if info and not info.get("autoRegistered"):
        log("  ⚠ %s 는 사람이 만든 항차(만든이 %s)라 지우지 않습니다 — %s"
            % (key, info.get("createdBy") or "?", why))
        return "held"
    firebase.delete("voyages/%s" % key)
    if firebase.get("voyages/%s" % key, params={"shallow": "true"}):
        log("  ✗ 항차 키가 남아 있습니다: voyages/%s" % key)
        return "failed"
    log("  − 항차 카드 삭제: %s (%s · 폴더·파일은 그대로)" % (key, why))
    return "deleted"


def stale_expected(firebase, key):
    """배정표에서 사라진 '빈 예정 카드'인가 — autoStatus expected · 섹션 없음 · 검수 흔적 없음.

    자료가 닿은 카드(collecting)·사람이 만든 카드는 여기서 False 다 — 지우는 것은
    **아무 것도 담기지 않은 예정 카드**뿐이다. 실제 삭제는 remove_voyage_key 가 한 번 더 막는다.
    """
    children, traces, info = voyage_traces(firebase, key)
    if traces or not info:
        return False
    if info.get("autoStatus") != EXPECTED_STATUS or not info.get("autoRegistered"):
        return False
    return not any(name in children for name in ("discharge", "loading"))


def reconcile_with_plan(firebase, cache, plan, log):
    """배정표로 서버 항차를 한 번 맞춘다 — ⓐ갈라진 짝 병합 ⓑ일정 보강 ⓒ지난 항차·비관할 카드 제거.

    여러 번 돌려도 안전하다(멱등). 실패는 건마다 세고 사이클은 계속한다.
    """
    out = {"merged": [], "filled": [], "deleted": [], "held": [], "errors": 0}
    index = voyage_index(firebase, log)
    if not index:
        log("선석배정 정리 — 서버 항차 키를 읽지 못해 건너뜁니다.")
        return out

    # ⓐ·ⓑ 배정표 한 줄 = 카드 한 장. 갈라진 키를 정본으로 합치고 일정을 채운다.
    for row in plan.rows:
        if row.get("excluded"):
            continue                                    # 비관할 항로는 손대지 않는다
        code = str(row.get("vessel_code") or "").upper()
        known = index.get(code) or {}
        if not known:
            continue
        dis, load = row.get("voy_d") or "", row.get("voy_l") or ""
        hits = []
        for want in (dis, load):
            ident = voy_ident(want)
            if not want:
                continue
            for voy in sorted(known):
                if (voy == want.upper() or (ident and voy_ident(voy) == ident)) \
                        and known[voy] not in [h[1] for h in hits]:
                    hits.append((voy, known[voy]))
        if not hits:
            continue
        canon_voy, canon = hits[0]
        for voy, dup in hits[1:]:
            state = merge_voyage_node(firebase, dup, canon, log)
            if state == "deleted":
                out["merged"].append((dup, canon))
                known.pop(voy, None)
            elif state == "held":
                out["held"].append(dup)
            else:
                out["errors"] += 1
        if register_voyage(firebase, canon, code, canon_voy, dis, load, log, row, source="plan"):
            out["filled"].append(canon)
        else:
            out["errors"] += 1

    # ⓒ 지난 항차·비관할 항로 카드 제거 — 지울 것을 **먼저 전부 적고** 나서 지운다.
    index = voyage_index(firebase, log)
    plan_gone = []
    for code in sorted(index):
        off_route = plan.excluded_route_for(code)       # 0.6-02 — 배정표로 확인된 비관할 선박
        for voy in sorted(index[code]):
            key = index[code][voy]
            row = plan.find(code, [voy])
            if row is not None and row.get("excluded"):
                plan_gone.append((key, "비관할 항로 %s" % (row.get("route") or "?")))
            elif row is None and off_route:
                plan_gone.append((key, "비관할 항로 %s(배정표에서 확인한 선박)" % off_route))
            elif row is not None and row.get("departed"):
                plan_gone.append((key, "배정표 실적 출항 %s"
                                  % (row.get("atd") or row.get("etd") or "")))
            elif row is None and is_closed(cache, code, [voy]):
                plan_gone.append((key, "기항 마감(DEP.TALLY) · 배정표 창 밖"))
            elif row is None and stale_expected(firebase, key):
                # 0.7 — 배정표 창 밖으로 밀린 **예정 카드**(자료도 흔적도 없는 빈 카드)는 치운다.
                plan_gone.append((key, "배정표 창 밖 예정 카드(자료 없음)"))
    if not plan_gone:
        log("선석배정 정리 — 치울 지난 항차·비관할 카드가 없습니다.")
        return out
    log("선석배정 정리 — 치울 카드 %d개를 확인했습니다: %s"
        % (len(plan_gone), ", ".join("%s(%s)" % (k, w) for k, w in plan_gone)))
    for key, why in plan_gone:
        state = remove_voyage_key(firebase, key, why, log)
        if state == "deleted":
            out["deleted"].append(key)
            forget_expected(cache, key)                 # 0.7 — 지운 카드의 예정등록 지문도 지운다
        elif state == "held":
            out["held"].append(key)
            forget_expected(cache, key)
        else:
            out["errors"] += 1
    return out


def fetch_plan(cfg, log, opener=None, now_ms=None):
    """사이클당 터미널별 1회 — 선석배정표. 못 받으면 (None, 사유)를 그대로 올린다.

    설정에 berth_plan 이 **참일 때만** 조회한다(DEFAULT_CONFIG 기본값 True). 설정을 안 거친
    호출(시험·옛 설정)이 뜻하지 않게 바깥 사이트를 부르는 일을 막는 잠금이다.
    """
    if not (cfg or {}).get("berth_plan"):
        return None, "설정에서 선석배정 조회를 껐습니다(berth_plan)"
    rows, why = bsch.fetch_all(cfg, log, opener=opener, now_ms=now_ms)
    if rows is None:
        return None, why
    return BerthPlan(rows), None


def run(root, cache, master, firebase, cfg, log, state_path=None, reconcile=False,
        opener=None, now_ms=None):
    """사이클마다 한 번 — 메일박스를 훑어 변한 폴더만 앱(파이어베이스)에 채운다.

    0.6 — 먼저 선석배정표를 한 번 읽는다. 받았으면 짝을 확정하고(필요하면 한 번 정리하고)
    배정표에 없거나 이미 나간 항차의 **새 카드 만들기**를 막는다. 못 받았으면 그 단계를
    통째로 건너뛰고 0.5-01 과 똑같이 돈다(자료를 잃지 않는 쪽).
    0.7 — 배정표를 받았으면 그 줄로 **예정 카드**를 미리 세운다(자료가 오기 전에도 화면에 뜨게).
    """
    result = {"folders": 0, "voyages": 0, "changed": 0, "skipped": 0, "uploads": 0,
              "errors": 0, "registered": [], "pairs": 0, "blocked": [], "plan": 0,
              "planReconciled": False, "expected": [], "retired": [],
              "lists": [], "listAdded": 0, "listFilled": 0, "listConflicts": 0, "listFiles": 0}
    if firebase is None or not getattr(firebase, "enabled", False):
        log("파이어베이스 미설정 — 앱 채우기(항차·EDI 등록)를 건너뜁니다.")
        return result
    if not root or not os.path.isdir(root):
        log("메일박스 폴더가 없어 앱 채우기를 건너뜁니다: %s" % root)
        return result
    if not master:
        log("선박 정본표가 없어 앱 채우기를 건너뜁니다(정본 선박만 올립니다).")
        return result

    aliases = home_aliases(cfg)
    state_path = state_path or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                            "upload_state.json")
    state = load_state(state_path)
    folders = voyage_folders(root, cache, master, log)
    result["folders"] = len(folders)

    # 0차 — 선석배정표(항차의 진실). 못 받으면 게이트·정리를 통째로 건너뛴다(조용한 실패 금지).
    plan, why = fetch_plan(cfg, log, opener, now_ms)
    if plan is None:
        log("선석배정표를 받지 못해 이번 사이클은 게이트·정리를 건너뜁니다 — %s" % why)
    else:
        result["plan"] = len(plan)
        log("선석배정표 %d줄 수신(PNCT %d · PCTC %d) — 비관할 %d줄"
            % (len(plan),
               sum(1 for r in plan.rows if r.get("terminal") == "PNCT"),
               sum(1 for r in plan.rows if r.get("terminal") == "PCTC"),
               sum(1 for r in plan.rows if r.get("excluded"))))
        result["pairs"] += promote_pairs(plan, cache, log)
        if reconcile:
            try:
                result["reconcile"] = reconcile_with_plan(firebase, cache, plan, log)
                result["planReconciled"] = True
            except Exception as exc:                    # 정리가 죽어도 수집·업로드는 계속한다
                log("선석배정 정리 중 예기치 못한 오류: %s: %s" % (type(exc).__name__, exc))
                result["errors"] += 1
        # 0.7 — 자료가 오기 전에도 배정표 줄로 예정 카드를 세운다(사이클마다 · 멱등).
        try:
            expected = register_expected(plan, cache, master, firebase, cfg, log)
            result["expected"] = expected["created"]
            result["retired"] = expected["retired"]
            result["errors"] += expected["errors"]
        except Exception as exc:                        # 예정등록이 죽어도 수집·업로드는 계속한다
            log("예정등록 중 예기치 못한 오류: %s: %s" % (type(exc).__name__, exc))
            result["errors"] += 1

    # 1차 — 짝 증거부터 모은다(키를 정하기 전에 다 알고 있어야 한 키로 묶인다).
    for code, voy, _path, names in folders:
        result["pairs"] += len(collect_pairs(" ".join([voy] + names), code, cache, context_voy=voy))

    # 2차 — 짝으로 묶은 뒤, 지문이 바뀐 묶음만 등록·업로드한다.
    groups = group_voyages(folders, cache)
    result["voyages"] = len(groups)
    index = voyage_index(firebase, log)                 # 0.5-01 — 표기 다른 같은 항차 키 재사용용
    for code, key_voy, members, voy_d, voy_l in groups:
        rel = "%s/%s" % (code, key_voy)
        fingerprint = hashlib.md5(
            "|".join("%s:%s" % (voy, folder_fingerprint(path, names))
                     for voy, path, names in members).encode("utf-8")).hexdigest()
        if (state["folders"].get(rel) or {}).get("fp") == fingerprint:
            result["skipped"] += 1
            continue
        voys = [v for v, _p, _n in members] + [v for v in (key_voy, voy_d, voy_l) if v]
        plan_row = plan.find(code, voys) if plan is not None else None
        allowed, why = registration_gate(plan, cache, code, voys)
        if not allowed and not _key_known(index, code, voys):
            log("  ⤫ %s %s 새 항차 카드를 만들지 않습니다 — %s (폴더·파일은 그대로)"
                % (code, "+".join(v for v, _p, _n in members), why))
            result["blocked"].append("%s_%s" % (code, key_voy))
            state["folders"][rel] = {"fp": fingerprint, "blocked": why, "at": _now_ms()}
            continue
        result["changed"] += 1
        try:
            key, uploaded, sent, lstat = handle_group(firebase, code, key_voy, members,
                                                      voy_d, voy_l, aliases, log, index, plan_row)
        except Exception as exc:                        # 항차 하나가 죽어도 사이클은 계속된다
            log("  앱 채우기 실패 %s (%s: %s)" % (rel, type(exc).__name__, exc))
            result["errors"] += 1
            continue
        result["listAdded"] += lstat["added"]
        result["listFilled"] += lstat["filled"]
        result["listConflicts"] += lstat["conflicts"]
        result["listFiles"] += lstat["files"]
        for node in lstat["modes"]:
            if node not in result["lists"]:
                result["lists"].append(node)
        if sent:                                        # 실패한 항차는 지문을 남기지 않는다(다음에 재시도)
            state["folders"][rel] = {"fp": fingerprint, "key": key, "at": _now_ms()}
        else:
            result["errors"] += 1
        result["uploads"] += uploaded
        if key not in result["registered"]:
            result["registered"].append(key)

    save_state(state, state_path, log)
    if result["lists"] or result["listConflicts"]:
        log("앱 채우기 — 리스트 %d장으로 records 채움: 새 컨 %d · 빈칸 채운 컨 %d · 충돌 %d (%s)"
            % (result["listFiles"], result["listAdded"], result["listFilled"],
               result["listConflicts"], ", ".join(result["lists"]) or "-"))
    if result["blocked"]:
        log("앱 채우기 — 배정표 게이트로 새 카드를 만들지 않은 항차 %d개: %s"
            % (len(result["blocked"]), ", ".join(result["blocked"])))
    if result["changed"] or result["errors"]:
        log("앱 채우기 완료 — 폴더 %d · 항차 %d(새 자료 %d · 그대로 %d) · 올린 항차 %d · EDI %d대 · 오류 %d"
            % (result["folders"], result["voyages"], result["changed"], result["skipped"],
               len(result["registered"]), result["uploads"], result["errors"]))
    else:
        log("앱 채우기 — 새 자료 없음(항차 %d개 그대로)." % result["voyages"])
    return result
