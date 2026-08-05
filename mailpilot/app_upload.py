# 평택항 범용 수집기 — 앱 채우기 모듈. 메일박스에 쌓인 EDI 를 읽어 검수앱(TallyUni) 파이어베이스에 항차·EDI 를 올린다.
"""수집(메일 → 폴더)까지 끝난 자료를 **검수앱이 바로 쓸 수 있는 모양**으로 서버에 올린다.

앱이 기대하는 모양(검수앱 src/autoRegApi.js · HomePage.jsx 와 같은 계약):
  voyages/{선박코드}_{항차}/info                     → 홈 화면에 항차 카드가 뜬다
  voyages/{키}/{discharge|loading}/ediContainers    → 진행막대·베이플랜·카고플랜이 산다
  voyages/{키}/{discharge|loading}/raw/edi          → 앱에서 다시 판독할 수 있는 원문

절대 보존 원칙(현장 수집기 autoreg.py 에서 그대로 가져온다):
  · info 는 **없을 때만** 만든다. 이미 있으면 빈 voy_d/voy_l 만 채운다 — 사람이 넣은 값은 절대 안 건드린다.
  · records·completed(검수 기록)는 이 판에서 **아예 건드리지 않는다**.
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

import edi_parser as ep

STATE_V = 1                       # 올리는 규칙이 바뀌면 올린다(옛 지문 무효화 → 한 번 재업로드)
PARSER_TAG = "MailPilot Uni 0.5 (edi_parser)"
RAW_TEXT_LIMIT = 5_000_000        # raw/edi 에 담는 원문 길이 상한(현장 수집기와 같은 값)

# 홈포트(모항) 판정 — 검수앱 src/utils.js 의 PYEONGTAEK_CODES / PYEONGTAEK_SUFFIX 와 같은 기준.
DEFAULT_HOME_PORT_ALIASES = ["PTK", "KRPTK", "KRPYT", "PYT", "KRPYOTM", "PYOTM", "KRPYO"]
_HOME_SUFFIX = re.compile(r"(PTK|PYT|PYOTM|PYO)$")

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
    """이 항구 코드가 우리 항(모항)인가. 앱 JS 의 isPyeongtaekPort 와 같은 기준."""
    if not code:
        return False
    text = str(code).upper().strip()
    if not text:
        return False
    table = [str(a).upper().strip() for a in (aliases or DEFAULT_HOME_PORT_ALIASES)
             if str(a).strip()]
    if text in table:
        return True
    return bool(_HOME_SUFFIX.search(text))


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
        if table.get(dis) != load or table.get(load) != dis:
            fresh.append((dis, load))
        table[dis] = load
        table[load] = dis
    return fresh


def paired_partner(cache, code, voy):
    """이 항차의 짝 항차. 증거가 없으면 ''(짝짓지 않는다)."""
    table = ((cache or {}).get("pairs") or {}).get(str(code or "").upper()) or {}
    return table.get(str(voy or "").upper(), "")


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
        entry = groups.setdefault((code, key_voy), {"members": [], "voys": []})
        entry["members"].append((voy, path, names))
        for cand in (voy, partner):
            if cand and cand not in entry["voys"]:
                entry["voys"].append(cand)
    out = []
    for (code, key_voy), entry in sorted(groups.items()):
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


def resolve_key(firebase, code, key_voy, other_voys=()):
    """(키, 키항차) — 서버에 이미 있는 항차(어느 쪽 항차의 키든)가 있으면 재사용한다(키 난립 방지)."""
    code = str(code or "").upper()
    order, seen = [], set()
    for cand in (str(key_voy or "").upper(),) + tuple(str(v or "").upper() for v in other_voys):
        if cand and cand not in seen:
            seen.add(cand)
            order.append(cand)
    for cand in order:
        key = "%s_%s" % (code, cand)
        if firebase.get("voyages/%s/info" % key):
            return key, cand
    return "%s_%s" % (code, order[0] if order else key_voy), (order[0] if order else key_voy)


def register_voyage(firebase, key, code, key_voy, voy_d, voy_l, log):
    """info — 없으면 만들고, 있으면 **빈 voy_d/voy_l 만** 채운다. 다른 필드는 절대 손대지 않는다."""
    current = firebase.get("voyages/%s/info" % key)
    if not isinstance(current, dict) or not current:
        info = {
            "vsl": code,
            "voy": key_voy,
            "mode": voy_direction(key_voy) or "discharge",
            "createdAt": _now_ms(),
            "createdBy": "자동등록(수집기)",
            "autoRegistered": True,
            "autoStatus": "collecting",
        }
        if voy_d:
            info["voy_d"] = voy_d
        if voy_l:
            info["voy_l"] = voy_l
        if firebase.put("voyages/%s/info" % key, strip_nulls(info)) is None:
            log("    ✗ 항차 등록 실패: %s — 다음 사이클에 다시 시도합니다." % key)
            return False
        log("    + 항차 등록: %s (%s)" % (key, info["mode"]))
        return True
    patch = {}
    if voy_d and not current.get("voy_d"):
        patch["voy_d"] = voy_d
    if voy_l and not current.get("voy_l"):
        patch["voy_l"] = voy_l
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


def handle_group(firebase, code, key_voy, members, voy_d, voy_l, aliases, log):
    """한 항차(폴더 한 묶음) — 항차 등록 + 방향별 대표 EDI 업로드. (키, 올린 대수 합)."""
    other = [v for v, _p, _n in members] + [v for v in (voy_d, voy_l) if v]
    key, key_voy = resolve_key(firebase, code, key_voy, other)
    log("  ▸ %s %s → %s (양하 %s · 선적 %s)"
        % (code, "+".join(v for v, _p, _n in members), key, voy_d or "-", voy_l or "-"))
    ok = register_voyage(firebase, key, code, key_voy, voy_d, voy_l, log)

    cands = []
    for voy, path, names in members:
        cands += scan_candidates(path, names, aliases, log, voy_direction(voy))
    if not cands:
        return key, 0, ok
    best = pick_representatives(cands, log)
    uploaded = 0
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
    return key, uploaded, ok


def run(root, cache, master, firebase, cfg, log, state_path=None):
    """사이클마다 한 번 — 메일박스를 훑어 변한 폴더만 앱(파이어베이스)에 채운다."""
    result = {"folders": 0, "voyages": 0, "changed": 0, "skipped": 0, "uploads": 0,
              "errors": 0, "registered": [], "pairs": 0}
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

    # 1차 — 짝 증거부터 모은다(키를 정하기 전에 다 알고 있어야 한 키로 묶인다).
    for code, voy, _path, names in folders:
        result["pairs"] += len(collect_pairs(" ".join([voy] + names), code, cache, context_voy=voy))

    # 2차 — 짝으로 묶은 뒤, 지문이 바뀐 묶음만 등록·업로드한다.
    groups = group_voyages(folders, cache)
    result["voyages"] = len(groups)
    for code, key_voy, members, voy_d, voy_l in groups:
        rel = "%s/%s" % (code, key_voy)
        fingerprint = hashlib.md5(
            "|".join("%s:%s" % (voy, folder_fingerprint(path, names))
                     for voy, path, names in members).encode("utf-8")).hexdigest()
        if (state["folders"].get(rel) or {}).get("fp") == fingerprint:
            result["skipped"] += 1
            continue
        result["changed"] += 1
        try:
            key, uploaded, sent = handle_group(firebase, code, key_voy, members,
                                               voy_d, voy_l, aliases, log)
        except Exception as exc:                        # 항차 하나가 죽어도 사이클은 계속된다
            log("  앱 채우기 실패 %s (%s: %s)" % (rel, type(exc).__name__, exc))
            result["errors"] += 1
            continue
        if sent:                                        # 실패한 항차는 지문을 남기지 않는다(다음에 재시도)
            state["folders"][rel] = {"fp": fingerprint, "key": key, "at": _now_ms()}
        else:
            result["errors"] += 1
        result["uploads"] += uploaded
        if key not in result["registered"]:
            result["registered"].append(key)

    save_state(state, state_path, log)
    if result["changed"] or result["errors"]:
        log("앱 채우기 완료 — 폴더 %d · 항차 %d(새 자료 %d · 그대로 %d) · 올린 항차 %d · EDI %d대 · 오류 %d"
            % (result["folders"], result["voyages"], result["changed"], result["skipped"],
               len(result["registered"]), result["uploads"], result["errors"]))
    else:
        log("앱 채우기 — 새 자료 없음(항차 %d개 그대로)." % result["voyages"])
    return result
