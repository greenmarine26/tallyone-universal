# 평택항 범용 수집기 — EDI 판독 모듈. 검수앱 src/utils.js 의 parseBAPLIE·parseAscFile 를 파이썬으로 그대로 옮긴 이식본(표준 라이브러리만 사용).
"""BAPLIE(EDIFACT) · 숫자코드 BAPLIE · 숫자코드 IFCSUM · ASC($604) 네 가지를 읽어
검수앱과 **같은 컨테이너 객체**를 만든다.

정본(이식 원본): `src/utils.js`
  - parseBAPLIE(:886) · parseNumericBAPLIE(:720) · parseNumericIFCSUM(:818) · parseAscFile(:1210)
  - 보조: normalizeBay(:354) · isoToLabel(:422) · isReeferIso(:583) · isoCategory(:700) · isValidCn(:3093)

이식 원칙 — 자바스크립트가 내는 값이 곧 정답이다.
  · 빈 값은 ""·0·False 로 둔다(None 금지 — RTDB 에서 null 은 '삭제'다).
  · JS 의 `a && b || c` 가 남기는 값(빈 문자열이 그대로 들어가는 자리 포함)까지 재현한다.
  · JS 가 만들지 않는 열쇠는 파이썬도 만들지 않는다(IFCSUM 갈래에 sh 없음 등).

주 진입점
  detect_kind(text, filename="") -> "asc" | "numeric" | "ifcsum" | "edi" | ""
  parse_edi(text, filename="")   -> {"kind", "vessel", "voy", "containers", ...}
"""

import re

__all__ = [
    "detect_kind", "parse_edi",
    "parse_baplie", "parse_numeric_baplie", "parse_numeric_ifcsum", "parse_asc_file",
    "normalize_bay", "iso_to_label", "is_reefer_iso", "iso_category", "is_valid_cn",
]


# ─────────────────────────── 자바스크립트 흉내 도우미 ───────────────────────────

_JS_INT_RE = re.compile(r"^[\s﻿]*([+-]?[0-9]+)")
_JS_FLOAT_RE = re.compile(
    r"^[\s﻿]*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)")


def _js_parse_int(value):
    """JS parseInt — 앞쪽 정수만 읽고, 못 읽으면 None(=NaN)."""
    m = _JS_INT_RE.match(str(value))
    if not m:
        return None
    return int(m.group(1))


def _js_parse_int_or0(value):
    """JS `parseInt(x, 10) || 0` — NaN 도 0 도 결과는 0."""
    n = _js_parse_int(value)
    return n if n else 0


def _js_parse_float(value):
    m = _JS_FLOAT_RE.match(str(value))
    if not m:
        return None
    return float(m.group(1))


def _to_fixed1(num):
    """JS Number.prototype.toFixed(1) — -0 은 '0.0' 으로."""
    s = "%.1f" % (num,)
    if s == "-0.0":
        return "0.0"
    return s


def _substring(s, start, end=None):
    """JS String.prototype.substring — 여기서는 음수·역전 범위를 쓰지 않으므로 단순 자르기."""
    if end is None:
        return s[start:]
    return s[start:end]


def _at(parts, idx):
    """JS 배열 인덱스 접근 — 범위를 벗어나면 undefined(여기서는 '')."""
    if 0 <= idx < len(parts):
        return parts[idx]
    return ""


# ─────────────────────────── 보조 판정 (utils.js 이식) ───────────────────────────

_CN_RE = re.compile(r"^[A-Za-z]{4}[0-9]{7}$")


def is_valid_cn(cn):
    """utils.js:3093 isValidCn — /^[A-Z]{4}\\d{7}$/i."""
    return bool(_CN_RE.match(str(cn or "").strip()))


def normalize_bay(b):
    """utils.js:354 normalizeBay — '016'→'16', 숫자가 아니면 ''."""
    if b is None or b == "":
        return ""
    s = str(b).strip()
    n = _js_parse_int(s)
    if n is None:
        return ""
    return str(n)


_WS_RE = re.compile(r"\s+")


def iso_to_label(iso):
    """utils.js:422 isoToLabel — ISO 코드를 20DC/40HC/40RF … 라벨로 정규화."""
    if not iso:
        return ""
    p = _WS_RE.sub("", str(iso).upper().strip())

    # 엠티/풀 마커 복원 (453E→4530)
    if re.match(r"^[0-9]{3}[EF]$", p):
        p = p[:3] + "0"
    if re.match(r"^95[0-9][0-9]$", p):
        return "45HC"

    # 45피트 (첫 자리 L)
    if re.match(r"^L[0-9]", p) or re.match(r"^L[GRPUT]", p):
        return "45HC"

    # 40피트 Hi-Cube 숫자군
    if re.match(r"^45[0-9][0-9]$", p):
        if re.match(r"^458[3-4]$", p):
            return "40FR"
        if re.match(r"^458[25]$", p):
            return "40RF"
        if re.match(r"^453", p):
            return "40RF"
        if re.match(r"^459", p):
            return "40OT"
        return "40HC"
    if re.match(r"^46", p):
        return "40HC"

    if re.match(r"^45RF", p):
        return "40RF"
    if re.match(r"^45HC", p):
        return "40HC"
    if re.match(r"^45GP", p):
        return "40HC"
    if re.match(r"^45[GRPU]", p):
        if re.match(r"^45P", p):
            return "40FR"
        if re.match(r"^45U", p):
            return "40OT"
        if re.match(r"^45R", p):
            return "40RF"
        return "40HC"

    # 4자리 숫자 ISO
    if re.match(r"^42[0-9][0-9]$", p):
        if re.match(r"^428[3-4]$", p):
            return "40FR"
        if re.match(r"^428[25]$", p):
            return "40RF"
        return "40DC"
    if re.match(r"^25[0-9][0-9]$", p):
        return "20DC"
    if re.match(r"^22[0-9][0-9]$", p):
        if re.match(r"^228[3-4]$", p):
            return "20FR"
        if re.match(r"^228[25]$", p):
            return "20RF"
        if re.match(r"^223", p):
            return "20RF"
        return "20DC"

    # 알파벳 형식 — 40피트
    if re.match(r"^40HR", p):
        return "40RF"
    if re.match(r"^4[24]R", p):
        return "40RF"
    if re.match(r"^40R", p):
        return "40RF"
    if re.match(r"^40F[PR]", p):
        return "40FR"
    if re.match(r"^4[24]P", p):
        return "40FR"
    if re.match(r"^4[24]O", p):
        return "40OT"
    if re.match(r"^40O", p):
        return "40OT"
    if re.match(r"^4[24]U", p):
        return "40OT"
    if re.match(r"^40T", p):
        return "40TK"
    if re.match(r"^4[24]T", p):
        return "40TK"
    if re.match(r"^40HC", p):
        return "40HC"
    if re.match(r"^4[24]H", p):
        return "40HC"
    if re.match(r"^43R", p):
        return "40RF"
    if re.match(r"^43", p):
        return "40HC"
    if re.match(r"^40[DG]", p):
        return "40DC"
    if re.match(r"^4[24][G][P0-9]", p):
        return "40DC"

    # 알파벳 형식 — 20피트
    if re.match(r"^20R", p):
        return "20RF"
    if re.match(r"^2[02][R]", p):
        return "20RF"
    if re.match(r"^20H", p):
        return "20HC"
    if re.match(r"^2[25]H", p):
        return "20HC"
    if re.match(r"^20F[PR]", p):
        return "20FR"
    if re.match(r"^2[02][P]", p):
        return "20FR"
    if re.match(r"^20O", p):
        return "20OT"
    if re.match(r"^2[02][U]", p):
        return "20OT"
    if re.match(r"^20T", p):
        return "20TK"
    if re.match(r"^2[02][T]", p):
        return "20TK"
    if re.match(r"^20[GD]", p):
        return "20DC"
    if re.match(r"^2[02][G][P0-9]", p):
        return "20DC"

    # fallback
    if p[:1] == "4":
        t = p[2:3]
        if t == "R":
            return "40RF"
        if t in ("P", "F"):
            return "40FR"
        if t in ("O", "U"):
            return "40OT"
        if t == "T":
            return "40TK"
        if t == "V":
            return "40VH"
        if t == "H":
            return "40HC"
        if t in ("G", "D"):
            return "40DC"
        if t == "0":
            return "40HC"
        return "40" + (t or "?")
    if p[:1] == "2":
        t = p[2:3]
        if t == "R":
            return "20RF"
        if t in ("P", "F"):
            return "20FR"
        if t in ("O", "U"):
            return "20OT"
        if t == "T":
            return "20TK"
        if t == "V":
            return "20VH"
        if t == "H":
            return "20HC"
        if t in ("G", "D"):
            return "20DC"
        if t == "0":
            return "20DC"
        return "20" + (t or "?")
    return p


def is_reefer_iso(iso):
    """utils.js:583 isReeferIso — FR(플랫랙) 오탐 없이 리퍼만 잡는다."""
    if not iso:
        return False
    upper = str(iso).upper().strip()
    if re.match(r"^R[FE]", upper):
        return True
    if re.match(r"^[24]58[25]$", upper):
        return True
    if re.match(r"^(22|45|95)3[0-9EF]$", upper):
        return True
    if re.match(r"^[24][0234568L9]R[A-Z0-9]?$", upper):
        return True
    if re.match(r"^[24]0HR$", upper):
        return True
    lbl = iso_to_label(upper)
    if not lbl or lbl == upper:
        return False
    return lbl.endswith("RF") or lbl.endswith("RE")


def iso_category(iso):
    """utils.js:700 isoCategory."""
    lbl = iso_to_label(iso)
    if not lbl:
        return "?"
    if lbl in ("20DC", "20GP"):
        return "20DC"
    if lbl in ("40DC", "40GP"):
        return "40DC"
    if lbl == "40HC":
        return "40HC"
    if lbl.endswith("RF"):
        return "RF"
    if lbl.endswith("TK"):
        return "TK"
    if lbl.endswith("FR"):
        return "FR"
    if lbl.endswith("OT"):
        return "OT"
    return lbl


# ─────────────────────────── 특수 컨 태깅 (표준·숫자코드 공용 블록) ───────────────────────────

def _tag_special(cur, iso):
    """ISO 3번째 자리 + 458x/459x 규칙으로 rf/fr/tk/oog 태깅 (utils.js 표준·숫자 파서 공통)."""
    if len(iso) >= 3:
        t = iso[2]
        if "0" <= t <= "9":
            if t in ("3", "4"):
                cur["rf"] = True
            elif t == "5":
                cur["oog"] = True
            elif t == "6":
                cur["fr"] = True
                cur["oog"] = True
            elif t == "7":
                cur["tk"] = True
        else:
            if t == "R":
                cur["rf"] = True
            if t in ("U", "O"):
                cur["oog"] = True
            if t == "T":
                cur["tk"] = True
            if t in ("P", "F"):
                cur["fr"] = True
                cur["oog"] = True
    if re.match(r"^[24]58[25]$", iso):
        cur["rf"] = True
    if re.match(r"^[24]59", iso):
        cur["oog"] = True
    if re.match(r"^[24]58[34]$", iso):
        cur["fr"] = True
        cur["oog"] = True
    if not cur["rf"] and is_reefer_iso(iso):
        cur["rf"] = True


_TMP_NORM_RE = re.compile(r"^([+-]?)0*([0-9]+(?:\.[0-9]+)?)$")


def _normalize_tmp(raw):
    """'-018'→'-18', '000'→'0' (utils.js TMP+2 · 숫자코드 50:C 공통 정규화)."""
    norm = str(raw).strip()
    m = _TMP_NORM_RE.match(norm)
    if m:
        body = m.group(2)
        norm = (m.group(1) or "") + (body if body != "" else "0")
    return norm


# ─────────────────────────── 숫자코드 BAPLIE (CASP/CKL 계열) ───────────────────────────

def parse_numeric_baplie(edi_text):
    """utils.js:720 parseNumericBAPLIE — '00:BAPLIE:' 머리 + 50:/52: 세그먼트."""
    result = {"vsl": "", "voy": "", "pol": "", "etd": "", "eta": "",
              "carrier": "", "callsign": "", "containers": [], "errors": []}
    text = re.sub(r"\r?\n", "", edi_text)
    segs = [s for s in (x.strip() for x in text.split("'")) if s]
    cur = None
    for seg in segs:
        p = seg.split(":")
        tag = p[0]
        if tag == "10":
            # 10:콜사인:선박명:국가:항차:::ETD:ETA:POL
            result["callsign"] = _at(p, 1).strip().upper()
            result["vsl"] = _at(p, 2).strip()
            result["voy"] = _at(p, 4).strip()
            result["etd"] = _at(p, 7).strip()
            result["eta"] = _at(p, 8).strip()
            result["pol"] = _at(p, 9).strip()
        elif tag == "50":
            if cur:
                result["containers"].append(cur)
            cn = re.sub(r"[\s\-]", "", _at(p, 1)).upper()
            iso = _at(p, 2).upper()
            st = _at(p, 3).strip().upper()
            loc = _at(p, 4).strip()
            wt = _js_parse_int_or0(_at(p, 14) or "0")
            op = _at(p, 16).strip()
            cur = {
                "cn": cn, "l4": cn[-4:] if cn else "", "iso": iso, "tp": "",
                "fe": "E" if st == "E" else "F",
                "pol": "", "pod": "", "npod": "", "tspot": "", "fpod": "",
                "wt": wt, "wtt": "WT" if wt else "",
                "bay": "", "row": "", "tier": "",
                "op": op,
                "dg": False, "dgc": "", "un": "", "pg": "",
                "rf": False, "fr": False, "tk": False, "oog": False,
                "sl": "", "sh": "", "bl": "",
                "tmp": "", "st": st,
                "isBooking": False, "pendingCn": False,
            }
            # 위치 7자리 BBBRRTT (또는 6자리 BBRRTT)
            if len(loc) >= 7:
                cur["bay"] = normalize_bay(loc[0:3])
                cur["row"] = loc[3:5]
                cur["tier"] = loc[5:7]
            elif len(loc) == 6:
                cur["bay"] = normalize_bay(loc[0:2])
                cur["row"] = loc[2:4]
                cur["tier"] = loc[4:6]
            _tag_special(cur, iso)
            # 50 세그먼트 온도 필드(:C:온도:)
            if _at(p, 5).strip().upper() == "C" and _at(p, 6).strip() != "":
                cur["rf"] = True
                cur["tmp"] = _normalize_tmp(_at(p, 6))
        elif tag == "52" and cur:
            # 52:POL::POD::FPOD:::
            cur["pol"] = _at(p, 1).strip()
            cur["pod"] = _at(p, 3).strip()
            cur["fpod"] = _at(p, 5).strip()
    if cur:
        result["containers"].append(cur)
    if len(result["containers"]) == 0:
        result["errors"].append("숫자코드 BAPLIE: 컨테이너(50 세그먼트)를 찾지 못했습니다.")
    return result


# ─────────────────────────── 숫자코드 IFCSUM (RIZHAO 계열 매니페스트) ───────────────────────────

_IFCSUM_ISO_MAP = {"40HC": "4500", "40RH": "45R1", "45HC": "L5G1",
                   "40FR": "42P3", "20GP": "2200", "20RF": "20RF"}


def parse_numeric_ifcsum(edi_text):
    """utils.js:818 parseNumericIFCSUM — '00:IFCSUM:MANIFEST' 머리 + 51: 세그먼트.

    같은 컨번호가 여러 51(B/L split)로 나오면 물리 1대로 병합한다(중량 합산·품명/BL 병기).
    """
    result = {"vsl": "", "voy": "", "pol": "", "etd": "", "eta": "",
              "carrier": "", "callsign": "", "containers": [], "errors": []}
    text = re.sub(r"\r?\n", "", edi_text)
    segs = [s for s in (x.strip() for x in text.split("'")) if s]
    cur_bl = ""
    cur_pol = ""
    cur_pod = ""
    cur_desc = ""
    by_cn = {}
    for seg in segs:
        p = seg.split(":")
        tag = p[0]
        if tag == "10":
            result["callsign"] = _at(p, 1).strip().upper()
            result["vsl"] = _at(p, 2).strip()
            result["voy"] = _at(p, 4).strip()
            result["etd"] = _at(p, 7).strip()
            result["eta"] = _at(p, 8).strip()
            result["pol"] = _at(p, 10).strip()
        elif tag == "12":
            cur_bl = _at(p, 1).strip()
            cur_pol = _at(p, 7).strip()
            cur_desc = ""
        elif tag == "13":
            cur_pod = _at(p, 1).strip()
        elif tag == "47":
            if not cur_desc:
                cur_desc = _at(p, 1).strip()
        elif tag == "51":
            cn = re.sub(r"[\s\-]", "", _at(p, 2)).upper()
            if not cn:
                continue
            sl = _at(p, 3).strip().upper()
            edi_iso = _at(p, 4).strip().upper()
            std = _IFCSUM_ISO_MAP.get(edi_iso, edi_iso)
            fe = "E" if _at(p, 5).strip().upper() == "E" else "F"
            wt = _js_parse_int_or0(_at(p, 7) or "0")
            if cn in by_cn:
                ex = by_cn[cn]
                ex["wt"] += wt
                if cur_desc and cur_desc not in ex["desc"]:
                    ex["desc"] += " / " + cur_desc
                if cur_bl and cur_bl not in ex["bl"]:
                    ex["bl"] += "," + cur_bl
                continue
            cat = iso_category(std)
            cur = {
                "cn": cn, "l4": cn[-4:], "iso": std, "ediIso": edi_iso, "tp": "",
                "fe": fe, "pol": cur_pol, "pod": cur_pod, "npod": "", "tspot": "", "fpod": "",
                "wt": wt, "wtt": "WT" if wt else "",
                "bay": "", "row": "", "tier": "",
                "op": "",
                "dg": False, "dgc": "", "un": "", "pg": "",
                "rf": False, "fr": False, "tk": False, "oog": False,
                "sl": sl if fe == "F" else "", "eseal": sl if fe == "E" else "", "reseal": "",
                "bl": cur_bl, "desc": cur_desc,
                "tmp": "", "st": fe,
                "isBooking": False, "pendingCn": False,
            }
            # 특수 컨 판정은 cat 기준 (40FR 이 4583 으로 매핑돼 리퍼 오탐하는 것 방지)
            if cat == "RF":
                cur["rf"] = True
            elif cat == "FR":
                cur["fr"] = True
                cur["oog"] = True
            elif cat == "OT":
                cur["oog"] = True
            elif cat == "TK":
                cur["tk"] = True
            by_cn[cn] = cur
    result["containers"] = list(by_cn.values())
    if len(result["containers"]) == 0:
        result["errors"].append("숫자코드 IFCSUM: 컨테이너(51 세그먼트)를 찾지 못했습니다.")
    return result


# ─────────────────────────── 표준 BAPLIE (EDIFACT D.95B / SMDG) ───────────────────────────

_RE_NUM_BAPLIE_HEAD = re.compile(r"^\s*00:BAPLIE", re.IGNORECASE)
_RE_NUM_BAPLIE_SEG = re.compile(r"'50:[A-Z]{4}[0-9]{6,7}:")
_RE_NUM_IFCSUM_HEAD = re.compile(r"^\s*00:IFCSUM", re.IGNORECASE)
_RE_NUM_IFCSUM_SEG = re.compile(r"'51:[0-9]+:[A-Z]{4}[0-9]{6,7}:")


def _new_container():
    """LOC+147 에서 한 대를 열 때의 초기값 (utils.js:975 객체 리터럴과 같은 열쇠·같은 기본값)."""
    return {
        "cn": "", "l4": "", "iso": "", "tp": "", "fe": "F",
        "pol": "", "pod": "", "npod": "",
        "tspot": "",
        "fpod": "",
        "wt": 0, "wtt": "",
        "bay": "", "row": "", "tier": "",
        "op": "",
        "dg": False, "dgc": "", "un": "", "pg": "",
        "rf": False, "fr": False, "tk": False, "oog": False,
        "sl": "", "sh": "", "bl": "",
        "tmp": "",
        "st": "",
        "isBooking": False,
        "pendingCn": False,
    }


def _parse_tdt(seg, result):
    """TDT 세그먼트 — 항차·선사·선박명·콜사인 (utils.js:909~)."""
    parts = seg.split("+")
    result["voy"] = _at(parts, 2) or ""
    if _at(parts, 5):
        cc = parts[5].split(":")[0]
        if cc:
            result["carrier"] = cc

    # 선박명: 모든 element 의 모든 sub-token 을 역순으로 훑는다
    vsl = ""
    for pi in range(len(parts) - 1, 2, -1):
        fld = _at(parts, pi) or ""
        subs = fld.split(":")
        for i in range(len(subs) - 1, -1, -1):
            t = re.sub(r"['\"]", "", subs[i].strip())
            if (t and len(t) >= 3 and not re.match(r"^[0-9]+$", t)
                    and re.search(r"[A-Za-z]", t)
                    and (re.search(r"\s", t) or re.search(r"[A-Z]{4,}", t))):
                vsl = t
                break
        if vsl:
            break
    if not vsl:
        last_field = parts[-1] if parts else ""
        sub_tokens = last_field.split(":")
        for i in range(len(sub_tokens) - 1, -1, -1):
            t = re.sub(r"['\"]", "", sub_tokens[i].strip())
            if t and not re.match(r"^[0-9]+$", t) and re.search(r"[A-Za-z]", t):
                vsl = t
                break
    result["vsl"] = vsl

    # 콜사인: ':103::' qualifier 앞 토큰 (영문+숫자 4~7자)
    for pi in range(3, len(parts)):
        fld = _at(parts, pi) or ""
        subs = fld.split(":")
        for i in range(len(subs)):
            t = re.sub(r"['\"]", "", subs[i].strip())
            if not t or not (4 <= len(t) <= 7):
                continue
            if not re.match(r"^[A-Za-z0-9]+$", t):
                continue
            if not re.search(r"[A-Za-z]", t):
                continue
            if t == vsl or t == result["carrier"]:
                continue
            nxt = subs[i + 1] if (i + 1) < len(subs) else None
            if (nxt == "103") or re.match(r"^[A-Z][0-9]", t) or re.search(r"[0-9][A-Z]", t):
                result["callsign"] = t.upper()
                break
        if result["callsign"]:
            break


def parse_baplie(edi_text):
    """utils.js:886 parseBAPLIE — 표준 EDIFACT. 숫자코드 머리면 전용 파서로 넘긴다."""
    if _RE_NUM_BAPLIE_HEAD.match(edi_text) or _RE_NUM_BAPLIE_SEG.search(edi_text):
        return parse_numeric_baplie(edi_text)
    if _RE_NUM_IFCSUM_HEAD.match(edi_text) or _RE_NUM_IFCSUM_SEG.search(edi_text):
        return parse_numeric_ifcsum(edi_text)

    result = {"vsl": "", "voy": "", "pol": "", "etd": "", "eta": "",
              "carrier": "", "callsign": "", "containers": [], "errors": []}
    text = re.sub(r"\r?\n", "", edi_text)
    segments = [s for s in text.split("'") if len(s) > 0]
    cur = None

    for seg in segments:
        if seg.startswith("TDT+"):
            _parse_tdt(seg, result)
        elif seg.startswith("LOC+5+") and not cur:
            result["pol"] = _substring(seg, 6).split(":")[0]
        elif seg.startswith("DTM+178:") or seg.startswith("DTM+136:"):
            v = _at(seg.split(":"), 1)
            if v:
                result["etd"] = v[0:8]
        elif seg.startswith("LOC+147+"):
            if cur:
                result["containers"].append(cur)
            slot = _substring(seg, 8).split(":")[0]
            cur = _new_container()
            # 위치는 보통 7자리(BBBRRTT) 또는 6자리(BBRRTT)
            if len(slot) >= 7:
                cur["bay"] = normalize_bay(slot[0:3])
                cur["row"] = slot[3:5]
                cur["tier"] = slot[5:7]
            elif len(slot) == 6:
                cur["bay"] = normalize_bay(slot[0:2])
                cur["row"] = slot[2:4]
                cur["tier"] = slot[4:6]
        elif cur is not None and seg.startswith("EQD+CN+"):
            parts = seg.split("+")
            cur["cn"] = re.sub(r"[\s\-]", "", _at(parts, 2)).upper().strip()
            if not cur["cn"]:
                # 빈 컨번호(평택 적재 부킹 슬롯) — 임시 ID 로 살려 둔다
                slot_key = "%s_%s_%s" % (cur["bay"] or "00", cur["row"] or "00",
                                         cur["tier"] or "00")
                book_id = "__BOOK_" + slot_key
                dup = 0
                while any(x["cn"] == book_id for x in result["containers"]):
                    dup += 1
                    book_id = "__BOOK_%s_%d" % (slot_key, dup)
                cur["cn"] = book_id
                cur["isBooking"] = True
                cur["pendingCn"] = True
                cur["l4"] = ""
            else:
                cur["l4"] = cur["cn"][-4:]
            iso_field = _at(parts, 3) or ""
            cur["iso"] = (iso_field.split(":")[0] or "").upper()
            _tag_special(cur, cur["iso"])

            # status — 마지막 비어있지 않은 F/E/4/5 요소
            raw_status = ""
            for i in range(len(parts) - 1, 3, -1):
                pv = (_at(parts, i) or "").strip()
                if pv and pv in ("F", "E", "4", "5"):
                    raw_status = pv
                    break
            cur["st"] = raw_status
            if raw_status == "F":
                cur["fe"] = "F"
            elif raw_status == "E":
                cur["fe"] = "E"
            elif raw_status == "5":
                cur["fe"] = "F"
            elif raw_status == "4":
                cur["fe"] = "E"
            elif cur["iso"] and len(cur["iso"]) >= 4 and re.search(r"[A-Z][A-Z][A-Z]E$", cur["iso"]):
                cur["fe"] = "E"
                cur["st"] = "E(ISO)"

            iso = cur["iso"]
            if re.match(r"^458[2-5]$", iso):
                cur["tp"] = "40'RF"
            elif re.match(r"^228[2-5]$", iso):
                cur["tp"] = "20'RF"
            elif iso.startswith("22"):
                cur["tp"] = "20'GP"
            elif iso.startswith("25"):
                cur["tp"] = "20'HC"
            elif iso.startswith("42") or iso.startswith("44"):
                cur["tp"] = "40'GP"
            elif iso.startswith("45"):
                cur["tp"] = "40'HC"
        elif cur is not None and (seg.startswith("LOC+9+") or seg.startswith("LOC+6+")):
            cur["pol"] = _substring(seg, seg.find("+", 4) + 1).split(":")[0]
        elif cur is not None and (seg.startswith("LOC+11+") or seg.startswith("LOC+12+")):
            cur["pod"] = _substring(seg, seg.find("+", 4) + 1).split(":")[0]
        elif cur is not None and seg.startswith("LOC+76+"):
            cur["npod"] = _substring(seg, 7).split(":")[0]
        elif cur is not None and seg.startswith("LOC+83+"):
            cur["tspot"] = _substring(seg, 7).split(":")[0]
        elif cur is not None and (seg.startswith("LOC+97+") or seg.startswith("LOC+98+")):
            cur["fpod"] = _substring(seg, seg.find("+", 4) + 1).split(":")[0]
        elif cur is not None and seg.startswith("MEA+"):
            # MEA+WT++KGM:2100 / MEA+VGM++KGM:17272 — VGM 우선
            parts = seg.split(":")
            last = parts[-1]
            num = _js_parse_int(last)
            if num is not None and num > 100:
                is_vgm = "VGM" in seg
                if is_vgm or not cur["wt"]:
                    cur["wt"] = num
                    cur["wtt"] = "VGM" if is_vgm else "WT"
        elif cur is not None and (seg.startswith("TMP+2+") or seg.startswith("TMP+")):
            v = _substring(seg, 6).split(":")[0]
            if v:
                # 0°C 는 실제 온도다 — 미입력은 값이 진짜 빈 경우뿐
                cur["rf"] = True
                cur["tmp"] = _normalize_tmp(v)
            else:
                cur["rf"] = True
                cur["tmp"] = ""
                cur["tmp_missing"] = True
        elif cur is not None and seg.startswith("RNG+5+"):
            parts = seg.split(":")
            if len(parts) >= 3:
                p3 = _at(parts, 3)
                cur["tmp"] = parts[2] + ("~" + p3 if p3 else "")
                cur["rf"] = True
        elif cur is not None and seg.startswith("DGS+IMD+"):
            cur["dg"] = True
            parts = seg.split("+")
            cur["dgc"] = _at(parts, 2) or ""
            cur["un"] = _at(parts, 3) or ""
            if len(parts) >= 6 and parts[5]:
                cur["pg"] = parts[5].strip()
        elif cur is not None and seg.startswith("DIM+"):
            cur["oog"] = True
        elif cur is not None and seg.startswith("FTX+AAY+++"):
            cur["op"] = _substring(seg, 10)[0:5].strip()
        elif cur is not None and (seg.startswith("NAD+CF+") or seg.startswith("NAD+CA+")):
            code = _substring(seg, 7).split(":")[0]
            if code and not cur["op"]:
                cur["op"] = code
        elif cur is not None and seg.startswith("RFF+BM:"):
            cur["bl"] = _substring(seg, 7)

    if cur:
        result["containers"].append(cur)

    # 항차 메타 복사 + ISO 끝자리 F/E 동기화 (무게 기반 추정은 하지 않는다)
    for c in result["containers"]:
        if result["voy"] and not c.get("voy"):
            c["voy"] = result["voy"]
        if not c["iso"] or len(c["iso"]) < 4:
            continue
        last = c["iso"][-1]
        if c["fe"] == "E" and last != "E":
            c["iso_orig_parsed"] = c["iso"]
            c["iso"] = c["iso"][:-1] + "E"
        elif c["fe"] == "F" and last == "E":
            c["iso_orig_parsed"] = c["iso"]
            c["iso"] = c["iso"][:-1] + "F"

    if not result["vsl"]:
        result["errors"].append("선박명을 인식하지 못했습니다.")
    if len(result["containers"]) == 0:
        result["errors"].append("컨테이너를 찾지 못했습니다.")
    return result


# ─────────────────────────── ASC ($604 고정폭) ───────────────────────────

_ASC_SPEC_RE = re.compile(r"^(FR40|FR20|OT40|OT20|PL40|PL20)([0-9]{3})([FE])")
_ASC_M1_RE = re.compile(r"^([A-Z]{2}[0-9]{2})([0-9]{3})([FE])")
_ASC_M2_RE = re.compile(r"^([0-9]{2}[A-Z]{2})([0-9]{3})([FE])")
_ASC_M4_RE = re.compile(r"^([A-Z]{4})([0-9]{3})([FE])")
_ASC_SPEC_ISO = {"FR40": "42PF", "FR20": "22PF", "OT40": "42UT",
                 "OT20": "22UT", "PL40": "42PL", "PL20": "22PL"}
#            종류코드 → (40ft, 20ft)
_ASC_M1_MAP = {"GP": ("42GP", "22GP"), "HC": ("45GP", "25GP"), "HQ": ("45GP", "25GP"),
               "RH": ("45R1", "25R1"), "OT": ("42U1", "22U1"), "OP": ("42U1", "22U1"),
               "BK": ("42B0", "22B0")}
_ASC_WT_RE = re.compile(r"([0-9]{5})")


def parse_asc_file(text):
    """utils.js:1210 parseAscFile — $604 머리 + 고정폭 본문(0-6 좌표 / 7-18 컨번호 / 19-22 선사 / 44-54 타입)."""
    lines = re.split(r"\r?\n", text)
    containers = []
    vsl = ""
    voy = ""
    service_code = ""

    for ln in lines:
        if ln.startswith("$604"):
            parts = _substring(ln, 4).split("/")
            if len(parts) >= 3:
                service_code = (_at(parts, 0) or "").strip()
                vsl = (_at(parts, 1) or "").strip()
                voy = (_at(parts, 2) or "").strip()
            break

    for line in lines:
        if len(line) < 50:
            continue
        if line.startswith("$"):
            continue
        if line.lstrip().startswith("***"):
            continue

        slot = line[0:6].strip()
        if not re.match(r"^[0-9]{6}$", slot):
            continue
        cn = re.sub(r"[\s\-]", "", line[7:18]).upper()
        has_cn = is_valid_cn(cn)
        if cn and not has_cn:
            continue

        bay = normalize_bay(slot[0:2])
        row = slot[2:4]
        tier = slot[4:6]
        # BAY 00 그리드 메타 라인 차단 (cn 없음 + bay 0 동시)
        if not cn and bay == "0":
            continue

        op = line[19:22].strip()

        type_block = line[44:54].strip()
        tp = ""
        iso = ""
        fe = "F"
        wt = 0

        m_spec = _ASC_SPEC_RE.match(type_block)
        m1 = _ASC_M1_RE.match(type_block)
        m2 = _ASC_M2_RE.match(type_block)
        m4 = _ASC_M4_RE.match(type_block)

        if m_spec:
            tp = m_spec.group(1)
            fe = m_spec.group(3)
            iso = _ASC_SPEC_ISO.get(tp, tp)
            wt = (_js_parse_int(m_spec.group(2)) or 0) * 100
            wt_match = _ASC_WT_RE.search(line[54:100])
            if wt_match:
                wt = _js_parse_int(wt_match.group(1)) or 0
        elif m1:
            tp = m1.group(1)
            fe = m1.group(3)
            if tp.startswith("TK"):
                iso = "42T6" if tp.endswith("40") else "22T6"
            elif tp.startswith("RF"):
                iso = "22R5" if tp.endswith("20") else "45R1"
            elif tp.startswith("DC") and tp.endswith("20"):
                iso = "22GP"
            elif tp.startswith("DC") and tp.endswith("40"):
                iso = "42GP"
            elif tp == "HC40":
                iso = "45GP"
            else:
                sz40 = tp.endswith("40")
                pair = _ASC_M1_MAP.get(tp[0:2])
                if pair:
                    iso = pair[0] if sz40 else pair[1]
                else:
                    iso = "42GP" if sz40 else "22GP"
            wt_match = _ASC_WT_RE.search(line[54:100])
            wt = (_js_parse_int(wt_match.group(1)) or 0) if wt_match else 0
        elif m4:
            tp = m4.group(1)
            fe = m4.group(3)
            if tp == "DCHC":
                iso = "45GP"
            elif tp == "RFHC":
                iso = "45R1"
            elif tp == "RFHQ":
                iso = "45R1"
            elif tp == "DCDC":
                iso = "42GP"
            else:
                iso = tp
            wt_match = _ASC_WT_RE.search(line[54:100])
            if wt_match:
                wt = _js_parse_int(wt_match.group(1)) or 0
            else:
                wt = (_js_parse_int(m4.group(2)) or 0) * 100
        elif m2:
            iso = m2.group(1)
            wt = (_js_parse_int(m2.group(2)) or 0) * 100
            fe = m2.group(3)
            tp = iso

        # POL/POD — 끝 10자리가 가장 안정적 (POL5+POD5)
        pol = ""
        pod = ""
        tail = line.replace("\x00", "").strip()
        pol_pod_end = re.search(r"([A-Z]{5})([A-Z]{5})$", tail)
        if pol_pod_end:
            pol = pol_pod_end.group(1)
            pod = pol_pod_end.group(2)
        else:
            first6 = line[27:33]
            if re.match(r"^[A-Z]{6}$", first6):
                pol = first6[0:3]
                pod = first6[3:6]
            else:
                m_polpod = re.match(r"^([A-Z]{5})\s+([A-Z]{5})", line[27:44])
                if m_polpod:
                    pol = m_polpod.group(1)
                    pod = m_polpod.group(2)

        # ISO 끝자리 동기화 — F/E 명시값 우선 (무게 기반 추정 없음)
        fe_final = fe
        iso_final = iso
        if iso_final and len(iso_final) >= 4:
            last = iso_final[-1]
            if fe_final == "E" and last != "E":
                iso_final = iso_final[:-1] + "E"
            elif fe_final == "F" and last == "E":
                iso_final = iso_final[:-1] + "F"

        meta_area = line[54:].strip()
        tmp = ""
        if tp and tp.startswith("RF"):
            # 3자리 정수 = 소수점 한 자리 표기 (-180 → -18.0℃)
            tmp_match3 = re.search(r"(?:^|\s)(-?[0-9]{3})C(?=[0-9]|\s|\Z)", meta_area)
            if tmp_match3:
                raw = _js_parse_int(tmp_match3.group(1)) or 0
                tmp = _to_fixed1(raw / 10.0) + "℃"
            else:
                tmp_match2 = re.search(r"(?:^|\s)(-?[0-9]{1,2})C(?=[0-9]|\s|\Z)", meta_area)
                if tmp_match2:
                    tmp = _to_fixed1(_js_parse_float(tmp_match2.group(1)) or 0.0) + "℃"
        oog = bool(re.search(r"\bAK\b", meta_area))
        oog_dim = ""
        if oog:
            oog_m = re.search(r"AK\s*([0-9]{6})", meta_area)
            if oog_m:
                oog_dim = oog_m.group(1)
        rc_match = re.search(r"([A-Z]{10,11})\s*\Z", line)
        route_code = rc_match.group(1) if rc_match else ""
        pod_final = route_code[-3:] if len(route_code) >= 3 else ""

        is_fr_or_ot = tp and (tp.startswith("FR") or tp.startswith("OT") or tp.startswith("PL"))

        containers.append({
            "cn": cn, "bay": bay, "row": row, "tier": tier,
            "iso": iso_final,
            "tp": tp,
            "fe": fe_final,
            "wt": wt, "op": op, "pol": pol, "pod": pod,
            "dg": False, "dgc": "", "un": "",
            "rf": (tp and tp.startswith("RF")) or is_reefer_iso(iso_final),
            "tk": (tp and tp.startswith("TK")) or (iso_final and iso_final[2:3] == "T"),
            "oog": oog or is_fr_or_ot,
            "sl": "", "sh": "", "bl": "",
            "tmp": tmp,
            "oogDim": oog_dim,
            "routeCode": route_code,
            "podFinal": pod_final,
        })
    return {"vsl": vsl, "voy": voy, "serviceCode": service_code, "containers": containers}


# ─────────────────────────── 파일 종류 판별 · 단일 진입점 ───────────────────────────

_RE_ASC_HEAD = re.compile(r"(?m)^[ \t]*\$604")
_RE_EDIFACT_HEAD = re.compile(r"(?m)^[ \t]*UN[BH]\+")


def detect_kind(text, filename=""):
    """'asc' | 'numeric' | 'ifcsum' | 'edi' | ''  — $604 → 00:BAPLIE → 00:IFCSUM → UNB/UNH 순."""
    s = text or ""
    head = s[:4096]
    if _RE_ASC_HEAD.search(head):
        return "asc"
    if _RE_NUM_BAPLIE_HEAD.match(s) or _RE_NUM_BAPLIE_SEG.search(s):
        return "numeric"
    if _RE_NUM_IFCSUM_HEAD.match(s) or _RE_NUM_IFCSUM_SEG.search(s):
        return "ifcsum"
    if _RE_EDIFACT_HEAD.search(head) or "'UNH+" in s or "'EQD+CN+" in s or "'LOC+147+" in s:
        return "edi"
    # 내용으로 못 가리면 파일 이름으로 마지막 보조 판단
    low = str(filename or "").lower()
    if low.endswith(".asc"):
        return "asc"
    if low.endswith(".edi") or low.endswith(".txt"):
        return "edi"
    return ""


def parse_edi(text, filename=""):
    """네 형식 공통 진입점 — {"kind","vessel","voy","containers", …}."""
    kind = detect_kind(text, filename)
    if kind == "asc":
        r = parse_asc_file(text)
        return {"kind": "asc", "vessel": r["vsl"], "voy": r["voy"],
                "serviceCode": r["serviceCode"],
                "pol": "", "etd": "", "eta": "", "carrier": "", "callsign": "",
                "errors": [], "containers": r["containers"]}
    if kind == "numeric":
        r = parse_numeric_baplie(text)
    elif kind == "ifcsum":
        r = parse_numeric_ifcsum(text)
    else:
        kind = "edi"
        r = parse_baplie(text)
    return {"kind": kind, "vessel": r["vsl"], "voy": r["voy"],
            "pol": r["pol"], "etd": r["etd"], "eta": r["eta"],
            "carrier": r["carrier"], "callsign": r["callsign"],
            "errors": r["errors"], "containers": r["containers"]}
