# 메일파일럿 Uni 0.5 — 범용 메일 수집기 코어(IMAP·POP3 → 선박·항차 판독 → 폴더 적재 → 파이어베이스 등록 → 앱 채우기)
# ⚠ 보안: config.json 에 메일 비밀번호가 평문으로 저장된다. 개인 PC 전용이며 공용 PC에서 쓰지 않는다.
#   (MVP 한계 — 다음 판에서 암호화 예정. config.json 은 절대 커밋하지 않는다.)
"""메일파일럿 Uni — 사전(선박 목록) 없이 메일에서 선박·항차를 스스로 읽어내는 범용 수집기.

흐름:
  1) 메일 서버 접속 — 프리셋(후이즈/회사메일 · 네이버 · 한메일 · 지메일 · 직접입력)
     · 후이즈/회사메일: POP3(pop.whoisworks.com:995, SSL) — 아이디·비밀번호만으로 붙는다(앱 비밀번호 불필요)
     · 네이버 / 한메일 / 지메일: IMAP
  2) 최근 N일 메일을 고른다
     · IMAP: SINCE 검색
     · POP3: UIDL 목록 중 캐시(pop_uidl_cache.json)에 없는 것만 내려받는다.
             서버의 메일은 절대 지우지 않는다(DELE 금지 — 원본 보존).
  3) 제목 → 첨부파일명 순으로 항차 토큰(예: 2630W, V.535E, R083W)을 찾고
     선박은 ① 정본표(vessels_master.json)에 걸리면 그 코드·정식명을 그대로 쓰고
            ② 걸리지 않으면 항차 앞의 영문 대문자 낱말에서 이름을 뽑아 4자 코드를 만든다
  4) {mailbox_root}/{선박코드}/{항차}/{첨부파일명} 으로 적재
     판독 실패 메일은 {mailbox_root}/_미분류/{날짜}_{제목요약}/ 로 — 절대 버리지 않는다
     검수 대상 체크를 끈 선박은 {mailbox_root}/_기타/{선박코드}/{항차}/ 로 — 발견 기록은 그대로 남는다
  5) 파이어베이스(익명 인증 REST)에 vessels/{코드}, collector_heartbeat, collect_log 기록

IMAP 과 POP3 는 '메일을 가져오는 방법'만 다르다. 판독·적재·등록은 완전히 같은 함수를 쓴다.
"""

import base64
import email
import email.header
import email.utils
import hashlib
import imaplib
import json
import os
import poplib
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import app_upload                                       # 0.5 — 앱 채우기(항차·EDI 를 검수앱에 올린다)

VERSION = "MailPilot Uni 0.5-01"

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
CACHE_PATH = os.path.join(HERE, "vessels_cache.json")
MASTER_PATH = os.path.join(HERE, "vessels_master.json")   # 선박 정본표(테넌트 데이터 — 커밋하지 않는다)
UIDL_CACHE_PATH = os.path.join(HERE, "pop_uidl_cache.json")
UPLOAD_STATE_PATH = os.path.join(HERE, "upload_state.json")   # 앱에 올린 폴더 지문(커밋하지 않는다)
LOG_DIR = os.path.join(HERE, "logs")

HTTP_TIMEOUT = 15          # 초 — 모든 네트워크 요청 공통(조용한 실패 금지)
IMAP_TIMEOUT = 30          # 초
POP3_TIMEOUT = 30          # 초
UNCLASSIFIED_DIR = "_미분류"
OTHER_DIR = "_기타"         # 검수 대상 체크를 끈 선박의 적재 위치(발견 기록은 그대로 남긴다)
MAX_VESSEL_WORDS = 2       # 선박명으로 인정하는 낱말 수 상한(설계 확정치)
COLLECT_LOG_KEEP = 50      # collect_log 롤링 보존 건수

# 메일사 프리셋 — 프로토콜/서버/포트/SSL/안내문. gui.py 와 공용(중복 정의 금지).
PRESETS = {
    "whois": {
        "label": "후이즈/회사메일",
        "protocol": "pop3",
        "host": "pop.whoisworks.com",
        "port": 995,
        "ssl": True,
        "help": "웹메일 환경설정에서 POP3/SMTP 사용함 확인. 아이디는 메일주소 전체,\n"
                "비밀번호는 웹메일 로그인 비밀번호.\n"
                "(예: 아이디 office@greenmarine.co.kr — 2단계 인증·앱 비밀번호가 필요 없습니다.\n"
                " 서버에 있는 메일은 지우지 않고 복사만 해 옵니다.)",
    },
    "naver": {
        "label": "네이버 메일",
        "protocol": "imap",
        "host": "imap.naver.com",
        "port": 993,
        "ssl": True,
        "help": "네이버 메일 → 환경설정 → POP3/IMAP 설정 → 'IMAP/SMTP 사용'을 '사용함'으로.\n"
                "2단계 인증을 쓰면 로그인 비밀번호 대신 '애플리케이션 비밀번호'를 넣는다.",
    },
    "daum": {
        "label": "한메일(다음)",
        "protocol": "imap",
        "host": "imap.daum.net",
        "port": 993,
        "ssl": True,
        "help": "다음 메일 → 환경설정 → IMAP/POP3 → 'IMAP 사용'을 켠다.\n"
                "카카오 2단계 인증 사용 시 앱 비밀번호가 필요하다.",
    },
    "gmail": {
        "label": "지메일",
        "protocol": "imap",
        "host": "imap.gmail.com",
        "port": 993,
        "ssl": True,
        "help": "지메일은 '앱 비밀번호'가 반드시 필요하다(구글 계정 → 보안 → 2단계 인증 → 앱 비밀번호).\n"
                "일반 로그인 비밀번호로는 IMAP 접속이 막힌다.",
    },
    "custom": {
        "label": "직접 입력",
        "protocol": "imap",
        "host": "",
        "port": 993,
        "ssl": True,
        "help": "회사 메일 등 직접 입력. 메일 관리자에게 방식(IMAP/POP3)과 서버 주소·포트를 받는다.\n"
                "보통 IMAP 993 / POP3 995 이며 둘 다 SSL 을 쓴다.",
    },
}

# 화면에 보여 줄 순서 — 후이즈/회사메일이 기본(가장 손이 덜 간다)
PRESET_ORDER = ("whois", "naver", "daum", "gmail", "custom")

# 0.1 호환 별칭(예전 이름으로 부르는 코드가 있어도 깨지지 않게)
IMAP_PRESETS = PRESETS

# 첨부로 받아들이는 확장자(대소문자 무관)
ATTACH_EXTS = (".edi", ".asc", ".txt", ".xls", ".xlsx", ".pdf")

# 선박명 후보에서 걸러낼 잡음 낱말
NOISE_WORDS = {
    "RE", "FW", "FWD", "REPLY", "MV", "MS", "MT", "SS", "VESSEL", "SHIP",
    "INBOUND", "OUTBOUND", "IMPORT", "EXPORT", "BAY", "PLAN", "PLANS",
    "CLL", "CDL", "LIST", "LISTS", "EDI", "BAPLIE", "IFCSUM", "COPRAR",
    "LOADING", "LOAD", "DISCHARGE", "DISCHARGING", "DISCH", "CONTAINER",
    "CONTAINERS", "CNTR", "FINAL", "REVISED", "REVISION", "REV", "VGM",
    "TALLY", "REPORT", "SUMMARY", "MANIFEST", "STOWAGE", "PRESTOW",
    "SCHEDULE", "NOTICE", "CONFIRM", "CONFIRMED", "ATTACHED", "ATTACHMENT",
    "AT", "OF", "FOR", "THE", "AND", "TO", "FROM", "ON", "IN", "BY", "VIA",
    "PTK", "KRPTK", "PORT", "TERMINAL", "BERTH", "ETA", "ETD", "ETB",
    "DEAR", "SIR", "MADAM", "HELLO", "NOTIFY", "URGENT", "PLS", "PLEASE",
    "NEW", "UPDATE", "UPDATED", "ACTUAL", "DRAFT", "COPY", "FILE", "FILES",
    "DOC", "DOCS", "DATA", "INFO", "NO", "NOS", "VOY", "VOYAGE", "V",
}

VOWELS = set("AEIOU")

# 항차 토큰 패턴 — 앞에서부터 우선순위대로 시도한다
VOYAGE_PATTERNS = (
    re.compile(r"\bV\s*(\d{3,5}[EWNS])\b"),        # V.535E / V-535E / V 2630W
    re.compile(r"\b([A-Z]{1,2}\d{3,4}[EWNS])\b"),  # R083W 처럼 문자 접두가 붙은 항차
    re.compile(r"\b(\d{3,5}[EWNS])\b"),            # 2706W / 535E / 26355W
)

# 판독용 정규화에서 공백으로 바꿀 구분자
_SEP_CHARS = "_-/\\.,:;#&|+~*!?\"'`<>{}=@%^"
_SEP_TABLE = {ord(c): " " for c in _SEP_CHARS}


# ──────────────────────────────── 로그 ────────────────────────────────

_log_lock = threading.Lock()
_log_listeners = []


def add_log_listener(fn):
    """GUI 등에서 로그 한 줄을 실시간으로 받아보기 위한 콜백 등록."""
    _log_listeners.append(fn)


def _safe_print(text):
    """콘솔·파일이 못 쓰는 글자가 섞여도 프로그램이 죽지 않게 찍는다.

    화면(콘솔)은 유니코드를 그대로 받지만, 출력이 파일·파이프로 넘어가면 인코딩이 cp949 라
    '—'(U+2014) 같은 글자에서 UnicodeEncodeError 가 난다. 무인 실행에서 로그 한 줄 때문에
    수집기가 통째로 죽는 일을 막는다 — 못 쓰는 글자만 바꿔 찍고 계속 간다.
    (이 함수가 실패해도 같은 줄이 logs/YYYYMMDD.txt 에는 이미 적혀 있다.)
    """
    try:
        print(text)
        return True
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        try:
            print(text.encode(enc, "replace").decode(enc, "replace"))
        except Exception:
            pass
        return False
    except (ValueError, OSError):                    # stdout 이 닫혔거나 쓸 수 없는 경우
        return False


def log(msg, log_dir=None):
    """한국어 로그 한 줄 — 화면과 logs/YYYYMMDD.txt 양쪽에 남긴다."""
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = "[%s] %s" % (stamp, msg)
    directory = log_dir or LOG_DIR
    with _log_lock:
        try:
            os.makedirs(directory, exist_ok=True)
            path = os.path.join(directory, datetime.now().strftime("%Y%m%d") + ".txt")
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError as exc:                       # 로그 실패해도 수집은 계속
            _safe_print("로그 기록 실패: %s" % exc)
        _safe_print(line)
    for fn in list(_log_listeners):
        try:
            fn(line)
        except Exception:                            # GUI 콜백 오류가 수집을 막지 않게
            pass
    return line


# ──────────────────────────── 설정/캐시 입출력 ────────────────────────────

DEFAULT_CONFIG = {
    "provider": "whois",
    "protocol": "pop3",
    "host": "pop.whoisworks.com",
    "port": 995,
    "ssl": True,
    # 0.1 호환 거울값 — 예전 설정 파일과 섞여도 같은 값을 가리킨다
    "imap_host": "pop.whoisworks.com",
    "imap_port": 995,
    "email": "",
    "password": "",
    "mailbox_root": "",
    "collect_days": 7,
    "poll_minutes": 10,
    "firebase": {},
}


# ── 설정 읽기 도우미 — 0.1(imap_host/imap_port)과 0.2(host/port/protocol/ssl)를 모두 받는다 ──

def cfg_provider(cfg):
    key = (cfg or {}).get("provider") or ""
    return key if key in PRESETS else "custom"


def cfg_protocol(cfg):
    """'imap' 또는 'pop3'. 설정에 없으면 프리셋 값, 그것도 없으면 imap."""
    cfg = cfg or {}
    proto = (cfg.get("protocol") or "").strip().lower()
    if proto not in ("imap", "pop3"):
        proto = PRESETS.get(cfg.get("provider") or "", {}).get("protocol", "imap")
    return proto


def cfg_host(cfg):
    cfg = cfg or {}
    host = (cfg.get("host") or cfg.get("imap_host") or "").strip()
    if not host:
        host = PRESETS.get(cfg.get("provider") or "", {}).get("host", "")
    return host


def cfg_port(cfg):
    cfg = cfg or {}
    for key in ("port", "imap_port"):
        raw = cfg.get(key)
        if raw:
            try:
                return int(str(raw).strip())
            except (TypeError, ValueError):
                pass
    preset = PRESETS.get(cfg.get("provider") or "", {})
    if preset.get("port"):
        return int(preset["port"])
    return 995 if cfg_protocol(cfg) == "pop3" else 993


def cfg_ssl(cfg):
    cfg = cfg or {}
    if "ssl" in cfg:
        return bool(cfg.get("ssl"))
    preset = PRESETS.get(cfg.get("provider") or "", {})
    return bool(preset.get("ssl", True))


def account_key(cfg):
    """UIDL 캐시를 계정별로 나누는 열쇠(서버|아이디). 계정을 바꾸면 캐시가 섞이지 않는다."""
    return "%s|%s" % (cfg_host(cfg).lower(), ((cfg or {}).get("email") or "").lower())


def load_config(path=None):
    """config.json 을 읽는다. 없으면 None(설정 창만 뜨게 한다)."""
    path = path or CONFIG_PATH
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError) as exc:
        log("설정 파일을 읽지 못했습니다(%s): %s" % (path, exc))
        return None
    merged = dict(DEFAULT_CONFIG)
    merged.update(cfg or {})
    return merged


def save_config(cfg, path=None):
    """설정 저장. 비밀번호가 평문으로 들어가므로 개인 PC 전용."""
    path = path or CONFIG_PATH
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
    return path


def load_cache(path=None):
    """선박명→코드 정규화 사전(같은 이름은 언제나 같은 코드)."""
    path = path or CACHE_PATH
    if not os.path.exists(path):
        return {"names": {}, "codes": {}}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        data.setdefault("names", {})
        data.setdefault("codes", {})
        return data
    except (OSError, ValueError) as exc:
        log("선박 캐시를 읽지 못해 새로 만듭니다: %s" % exc)
        return {"names": {}, "codes": {}}


def save_cache(cache, path=None):
    path = path or CACHE_PATH
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        log("선박 캐시 저장 실패: %s" % exc)


# ── 검수 대상 체크(캐시 안 "tally" 칸) ──
# 캐시 구조: {"names": {선박명: 코드}, "codes": {코드: 선박명}, "tally": {코드: true/false}}
# 없는 코드는 True(검수 대상)로 본다 — 0.2 캐시를 그대로 읽어도 동작이 바뀌지 않는다.

def tally_enabled(cache, code):
    """이 선박이 검수 대상인가. 기록이 없으면 True(기본 = 받는다)."""
    if not code:
        return True
    table = (cache or {}).get("tally") or {}
    if code not in table:
        return True
    return bool(table[code])


def set_tally(cache, code, on):
    """검수 대상 체크를 켜고 끈다(캐시 딕셔너리를 그 자리에서 고친다)."""
    if cache is None or not code:
        return None
    cache.setdefault("tally", {})[code] = bool(on)
    return cache["tally"][code]


def load_uidl_cache(path=None):
    """POP3 로 이미 받아 본 메일의 UIDL 목록(계정별). 없으면 빈 캐시."""
    path = path or UIDL_CACHE_PATH
    if not os.path.exists(path):
        return {"accounts": {}}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        log("POP3 수신 이력을 읽지 못해 새로 만듭니다: %s" % exc)
        return {"accounts": {}}
    if not isinstance(data, dict):
        return {"accounts": {}}
    data.setdefault("accounts", {})
    return data


def save_uidl_cache(cache, path=None):
    path = path or UIDL_CACHE_PATH
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        log("POP3 수신 이력 저장 실패: %s" % exc)


def parse_firebase_config(text):
    """firebaseConfig 붙여넣기 관용 파서.

    JSON, JS 객체 리터럴(const firebaseConfig = { apiKey: "..." };), 따옴표 혼용을 모두 받는다.
    """
    if not text:
        return {}
    if isinstance(text, dict):
        return dict(text)
    raw = text.strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    try:
        return json.loads(raw)
    except ValueError:
        pass
    out = {}
    for key, val in re.findall(
        r"""['"]?([A-Za-z][A-Za-z0-9_]*)['"]?\s*:\s*['"]([^'"]*)['"]""", raw
    ):
        out[key] = val
    return out


# ──────────────────────────── 선박·항차 판독 ────────────────────────────

def _mask_brackets(text):
    """괄호 안 내용을 같은 길이의 공백으로 지운다(항차가 들어 있으면 남긴다 — 위치는 보존)."""
    def repl(match):
        chunk = match.group(0)
        for pat in VOYAGE_PATTERNS:
            if pat.search(chunk.upper()):
                return chunk
        return " " * len(chunk)
    text = re.sub(r"\[[^\]]*\]", repl, text)
    text = re.sub(r"\([^)]*\)", repl, text)
    return text


def normalize_for_read(text):
    """판독용 정규화 — 대문자화 + 구분자를 공백으로(길이 보존: 위치 계산이 어긋나지 않는다)."""
    if not text:
        return ""
    return _mask_brackets(text).upper().translate(_SEP_TABLE)


def find_voyage(text):
    """항차 토큰을 찾아 (토큰, 시작위치)를 돌려준다. 못 찾으면 (None, -1)."""
    norm = normalize_for_read(text)
    best = None
    for pat in VOYAGE_PATTERNS:
        match = pat.search(norm)
        if match and (best is None or match.start(1) < best[1]):
            best = (match.group(1), match.start(1))
        if best is not None and pat is VOYAGE_PATTERNS[0]:
            break                                   # V 접두형이 가장 확실하다
    if best is None:
        return None, -1
    return best[0], best[1]


def extract_vessel_name(text, voyage_pos):
    """항차 토큰 앞쪽에서 선박명을 뽑는다(영문 대문자 낱말 최대 2개). 없으면 None."""
    if voyage_pos is None or voyage_pos < 0:
        return None
    norm = normalize_for_read(text)
    head = norm[:voyage_pos]
    words = [w for w in re.split(r"\s+", head) if w]
    clean = []
    for word in words:
        if not re.fullmatch(r"[A-Z]{2,20}", word):   # 영문 대문자 낱말만
            continue
        if word in NOISE_WORDS:
            continue
        clean.append(word)
    if not clean:
        return None
    return " ".join(clean[-MAX_VESSEL_WORDS:])


def _word_code(word, take):
    """낱말 하나에서 '첫 글자 + 이어지는 자음'으로 take 글자를 만든다."""
    out = [word[0]]
    for ch in word[1:]:
        if len(out) >= take:
            break
        if ch not in VOWELS:
            out.append(ch)
    for ch in word[1:]:                              # 자음이 모자라면 남은 글자로 채운다
        if len(out) >= take:
            break
        out.append(ch)
    while len(out) < take:
        out.append(word[0])
    return "".join(out[:take])


def base_vessel_code(name):
    """선박명 → 4자 기본 코드. 두 낱말이면 낱말당 2자(SAWASDEE SPICA → SWSP)."""
    words = [w for w in re.split(r"\s+", (name or "").upper()) if re.fullmatch(r"[A-Z]+", w)]
    if not words:
        return "XXXX"
    if len(words) == 1:
        return _word_code(words[0], 4)
    return (_word_code(words[0], 2) + _word_code(words[1], 2))[:4]


def vessel_code(name, cache):
    """선박명에 대해 언제나 같은 코드를 돌려준다(충돌 시 숫자 부가)."""
    if not name:
        return None
    key = " ".join(name.upper().split())
    names = cache.setdefault("names", {})
    codes = cache.setdefault("codes", {})
    if key in names:
        return names[key]
    base = base_vessel_code(key)
    candidate, n = base, 2
    while candidate in codes and codes[candidate] != key:
        candidate = (base[:3] + str(n))[:4]
        n += 1
        if n > 99:
            candidate = (base[:2] + str(n))[:4]
    names[key] = candidate
    codes[candidate] = key
    return candidate


# ──────────────────────────── 선박 정본표(마스터) ────────────────────────────
#
# 정본표는 현장에서 쓰는 선박 등록 파일과 같은 모양이다(읽기 전용으로 받아 온다).
#   [{"code": "XTPG", "name": "XIN TAI PING", "aliases": ["XTP"], "ko": ["일조국제물류"]}, ...]
#   · code    현장이 쓰는 4자 정본 코드 — 자동 생성 코드보다 언제나 우선한다
#   · name    정식 선박명(폴더 이름은 코드, 서버에 남는 이름은 이 정식명)
#   · aliases 영문 별칭 — 제목·첨부명에 '낱말'로 나오면 그 배
#   · ko      한글·중국어 발신 별칭 — 낱말 경계가 없는 언어라 부분 문자열로 본다
# 정본표가 없으면(빈 목록) 0.3 과 완전히 같게 동작한다 — 제품은 빈 깡통으로 시작한다.

# 별칭·코드 뒤에 항차가 그대로 붙어 오는 형태를 받아 준다(XTPG0535E · R063W).
_MASTER_GLUE = r"(?:\d{2,5}[EWNS]|[EWNS])(?![A-Z0-9])"


def load_master(path=None):
    """정본표를 읽는다. 파일이 없거나 깨졌으면 빈 목록(자동 생성 경로만 쓴다)."""
    path = path or MASTER_PATH
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        log("선박 정본표를 읽지 못했습니다(%s): %s" % (path, exc))
        return []
    if not isinstance(data, list):
        log("선박 정본표 형식이 목록이 아닙니다(무시): %s" % path)
        return []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        code = str(item.get("code") or "").strip().upper()
        if not code:
            continue
        name = " ".join(str(item.get("name") or code).upper().split())
        aliases = [str(a).strip().upper() for a in (item.get("aliases") or []) if str(a).strip()]
        ko = [str(k).strip() for k in (item.get("ko") or []) if str(k).strip()]
        out.append({"code": code, "name": name, "aliases": aliases, "ko": ko})
    return out


def master_by_code(master, code):
    """코드로 정본 한 척을 찾는다. 없으면 None."""
    want = (code or "").strip().upper()
    for item in (master or []):
        if item["code"] == want:
            return item
    return None


def _master_word_hit(token, text_up):
    """영문 토큰이 '낱말'로 들어 있는가(다른 낱말의 앞부분에 걸리면 안 된다)."""
    if not token:
        return False
    return bool(re.search(r"(?<![A-Z0-9])" + re.escape(token) + r"(?![A-Z0-9])", text_up))


def _master_glued_hit(token, text_up):
    """영문 토큰 바로 뒤에 항차가 붙어 있는가(XTPG0535E · R063W)."""
    if not token:
        return False
    return bool(re.search(r"(?<![A-Z0-9])" + re.escape(token) + r"(?=" + _MASTER_GLUE + r")", text_up))


def _master_hit_len(item, text_up, text_raw):
    """이 정본이 이 글에 걸리는 '가장 긴 매칭 문자열'의 길이. 0이면 안 걸림."""
    best = 0
    for ko in item.get("ko") or []:                  # ㉮ 한글·중국어 별칭 — 부분 문자열
        if ko and ko in text_raw and len(ko) > best:
            best = len(ko)
    name = item.get("name") or ""                    # ㉯ 정식 선박명 — 낱말 경계
    if len(name) > best and _master_word_hit(name, text_up):
        best = len(name)
    for alias in item.get("aliases") or []:          # ㉯ 영문 별칭 — 낱말 경계 또는 항차 붙음
        if len(alias) > best and (_master_word_hit(alias, text_up)
                                  or _master_glued_hit(alias, text_up)):
            best = len(alias)
    code = item["code"]                              # 코드는 '항차가 붙은 형태'만 여기서 잡는다.
    # (코드가 낱말 하나로 떨어져 있는 경우는 자동 경로 끝의 귀속 규칙이 처리한다 —
    #  'UNDELIVERABLE ATPR' 같은 반송 메일 제목이 통째로 그 배로 빨려 들어가는 것을 막는다.)
    if len(code) > best and _master_glued_hit(code, text_up):
        best = len(code)
    return best


def match_master(text_raw, master):
    """원문(괄호 마스킹 전!)에서 정본 선박을 찾는다. 못 찾거나 모호하면 None.

    ㉮ ko 별칭은 부분 문자열, ㉯ 정식명·영문 별칭은 낱말 경계로 본다.
    여러 정본이 함께 걸리면 매칭 문자열이 가장 긴 하나. 완전 동률이면 모호로 보고 실패시킨다.
    """
    if not text_raw or not master:
        return None
    raw = str(text_raw)
    text_up = raw.upper().translate(_SEP_TABLE)      # 구분자만 공백으로(길이 보존)
    best_item, best_len, tie = None, 0, False
    for item in master:
        hit = _master_hit_len(item, text_up, raw)
        if hit > best_len:
            best_item, best_len, tie = item, hit, False
        elif hit and hit == best_len and item is not best_item:
            tie = True                               # 서로 다른 정본이 같은 길이로 걸림 → 병합 금지
    if tie or not best_item:
        return None
    return best_item


def master_code_for_name(name, master):
    """자동으로 뽑은 선박명을 정본에 귀속한다(코드 완전 일치 · 정식명의 낱말 경계 끝부분).

    예) 'TAI PING' → 'XIN TAI PING'(XTPG) · 'TNJP' → 코드 TNJP.
    여러 정본에 걸리면 귀속을 포기한다(모호 병합 금지).
    """
    key = " ".join((name or "").upper().split())
    if not key or not master:
        return None
    for item in master:
        if key == item["code"]:
            return item
    hits = []
    for item in master:
        full = item.get("name") or ""
        if full and (full == key or full.endswith(" " + key)):
            hits.append(item)
    return hits[0] if len(hits) == 1 else None


def resolve_master(text, master):
    """정본 판정 한 묶음 — 원문 매칭 먼저, 실패하면 이름 귀속. 판독과 이관이 같이 쓴다."""
    return match_master(text, master) or master_code_for_name(text, master)


def adopt_master(cache, item):
    """정본으로 확정된 배를 캐시에 심는다(선박 목록·폴더 정리가 이 코드를 알아보도록)."""
    if cache is None or not item:
        return None
    cache.setdefault("names", {})[item["name"]] = item["code"]
    cache.setdefault("codes", {})[item["code"]] = item["name"]
    return item["code"]


def read_mail_target(subject, filenames=None, cache=None, master=None):
    """메일 한 통의 적재 대상 판독 — 제목 먼저, 실패하면 첨부파일명 순.

    선박은 정본표가 먼저다. 정본에 걸리면 코드를 자동 생성하지 않고 정본 코드·정식명을 쓴다.
    항차 판독 규칙은 그대로다 — 정본에 걸려도 항차가 없으면 종전대로 미분류로 간다.
    """
    cache = cache if cache is not None else {"names": {}, "codes": {}}
    master = master or []
    sources = [("제목", subject or "")]
    for name in (filenames or []):
        sources.append(("첨부", name))
    for where, text in sources:
        voyage, pos = find_voyage(text)
        if not voyage:
            continue
        item = match_master(text, master)            # ① 정본 우선(원문 그대로 본다)
        if item:
            adopt_master(cache, item)
            return {
                "ok": True, "vessel": item["name"], "voyage": voyage,
                "code": item["code"], "source": where, "reason": "",
            }
        vessel = extract_vessel_name(text, pos)      # ② 기존 자동 경로
        if not vessel:
            continue
        owner = master_code_for_name(vessel, master)  # 자동 이름도 마지막에 정본에 귀속해 본다
        if owner:
            adopt_master(cache, owner)
            return {
                "ok": True, "vessel": owner["name"], "voyage": voyage,
                "code": owner["code"], "source": where, "reason": "",
            }
        return {
            "ok": True, "vessel": vessel, "voyage": voyage,
            "code": vessel_code(vessel, cache), "source": where,
            "reason": "",
        }
    # 항차는 찾았지만 선박명을 못 읽은 경우도 미분류(추측하지 않는다)
    for where, text in sources:
        voyage, _pos = find_voyage(text)
        if voyage:
            return {"ok": False, "vessel": None, "voyage": voyage, "code": None,
                    "source": where, "reason": "선박명 판독 실패"}
    return {"ok": False, "vessel": None, "voyage": None, "code": None,
            "source": "", "reason": "항차 판독 실패"}


# ──────────────────────────── 파일 적재 ────────────────────────────

_BAD_PATH = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def safe_name(name, fallback="무제", limit=80):
    """파일·폴더 이름으로 안전하게 만든다."""
    cleaned = _BAD_PATH.sub("_", (name or "")).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = fallback
    return cleaned[:limit]


def is_wanted_attachment(filename):
    return bool(filename) and filename.lower().endswith(ATTACH_EXTS)


def save_attachment(root, subdirs, filename, data):
    """첨부 저장. 같은 이름·같은 크기면 스킵, 다르면 '(2)' 부가.

    돌려주는 값: ("saved"|"skipped"|"renamed", 최종경로)
    """
    directory = os.path.join(root, *[safe_name(p) for p in subdirs])
    os.makedirs(directory, exist_ok=True)
    fname = safe_name(filename, fallback="attachment.bin", limit=120)
    path = os.path.join(directory, fname)
    if os.path.exists(path):
        if os.path.getsize(path) == len(data):
            return "skipped", path
        stem, ext = os.path.splitext(fname)
        n = 2
        while True:
            alt = os.path.join(directory, "%s (%d)%s" % (stem, n, ext))
            if not os.path.exists(alt):
                path = alt
                break
            if os.path.getsize(alt) == len(data):
                return "skipped", alt
            n += 1
        with open(path, "wb") as fh:
            fh.write(data)
        return "renamed", path
    with open(path, "wb") as fh:
        fh.write(data)
    return "saved", path


def voyage_dirname(root, parts, voy):
    """적재할 항차 폴더 이름 — 같은 항차인 기존 폴더가 있으면 **그 표기**를 쓴다(0.5-01).

    parts 는 항차 폴더의 부모 경로 조각([코드] 또는 [_기타, 코드]).
    선사가 같은 항차를 0535E / 535E 로 섞어 써도 폴더가 갈라지지 않는다.
    """
    base = os.path.join(root, *[safe_name(p) for p in parts])
    return app_upload.canonical_voy_dirname(base, voy) or voy


def unclassified_dirname(subject, when=None):
    """{날짜}_{제목요약} 폴더 이름."""
    when = when or datetime.now()
    stamp = when.strftime("%Y%m%d")
    summary = safe_name(" ".join((subject or "").split())[:40], fallback="제목없음", limit=40)
    return "%s_%s" % (stamp, summary)


# ──────────────────────────── 폴더 정리(체크 상태에 맞춰 왕복) ────────────────────────────
#
# 원칙 — 파일은 옮기기만 한다. 파일을 지우지도, 덮어쓰지도 않는다.
#        (항차를 다 옮겨 껍데기만 남은 '빈' 코드 폴더는 os.rmdir 로 치운다 — 파일이 있으면 실패해 그대로 남는다.)
#   · 체크 끈 선박 폴더  : {root}/{코드}      → {root}/_기타/{코드}
#   · 체크 켠 선박 폴더  : {root}/_기타/{코드} → {root}/{코드}
#   · 대상 자리에 같은 이름의 폴더가 이미 있으면 통째로 옮기지 않고 항차 폴더 단위로 옮긴다.
#     그래도 같은 항차 폴더가 양쪽에 있으면 그 항차는 손대지 않고 건너뛴다(skipped).
#   · 코드 사전에 없는 폴더·_미분류 는 아예 건드리지 않는다.

def _move_tree(src, dst, moved, skipped, log_dir=None):
    """폴더 하나를 옮긴다. 충돌하면 한 단계 내려가 항차 폴더 단위로 다시 시도한다."""
    if not os.path.isdir(src):
        return
    if not os.path.exists(dst):
        parent = os.path.dirname(dst)
        if parent:
            os.makedirs(parent, exist_ok=True)
        os.rename(src, dst)
        moved.append((src, dst))
        log("폴더 정리 — 옮김: %s → %s" % (src, dst), log_dir)
        return

    # 대상이 이미 있다 → 항차 폴더 단위로 내려가서 같은 규칙을 반복
    for name in sorted(os.listdir(src)):
        sub_src = os.path.join(src, name)
        sub_dst = os.path.join(dst, name)
        if os.path.exists(sub_dst):
            skipped.append((sub_src, sub_dst))
            log("폴더 정리 — 같은 이름이 이미 있어 건너뜀(그대로 둡니다): %s" % sub_dst, log_dir)
            continue
        os.rename(sub_src, sub_dst)
        moved.append((sub_src, sub_dst))
        log("폴더 정리 — 옮김: %s → %s" % (sub_src, sub_dst), log_dir)
    if os.path.isdir(src) and not os.listdir(src):
        # 항차를 다 옮겨 껍데기만 남은 코드 폴더는 치운다.
        # os.rmdir 은 '빈 폴더'만 지운다 — 파일이 하나라도 있으면 OSError 로 실패하고 그대로 남는다.
        try:
            os.rmdir(src)
            log("폴더 정리 — 빈 폴더를 치웠습니다: %s" % src, log_dir)
        except OSError as exc:
            log("폴더 정리 — 빈 폴더를 치우지 못해 그대로 둡니다: %s (%s)" % (src, exc), log_dir)


def organize_folders(root, cache, log_dir=None):
    """지금 체크 상태에 맞춰 기존 폴더를 왕복 이동. (moved, skipped) 각각 (원본, 대상) 목록."""
    moved, skipped = [], []
    if not root or not os.path.isdir(root):
        log("폴더 정리 — 메일박스 폴더가 없습니다: %s" % root, log_dir)
        return moved, skipped
    codes = (cache or {}).get("codes") or {}
    other_root = os.path.join(root, OTHER_DIR)

    # ① 루트에 있는 '체크 꺼진' 선박 → _기타 안으로
    for name in sorted(os.listdir(root)):
        src = os.path.join(root, name)
        if not os.path.isdir(src):
            continue
        if name.startswith("_"):                      # _기타·_미분류 등 살림 폴더는 무접촉
            continue
        if name not in codes:                         # 모르는 폴더는 무접촉
            continue
        if tally_enabled(cache, name):
            continue
        _move_tree(src, os.path.join(other_root, name), moved, skipped, log_dir)

    # ② _기타 안에 있는 '체크 켜진' 선박 → 루트로 복귀
    if os.path.isdir(other_root):
        for name in sorted(os.listdir(other_root)):
            src = os.path.join(other_root, name)
            if not os.path.isdir(src):
                continue
            if name not in codes:
                continue
            if not tally_enabled(cache, name):
                continue
            _move_tree(src, os.path.join(root, name), moved, skipped, log_dir)

    log("폴더 정리 완료 — 이동 %d건 · 건너뜀 %d건" % (len(moved), len(skipped)), log_dir)
    return moved, skipped


# ──────────────────────────── 정본 이관(자동 코드 → 정본 코드) ────────────────────────────
#
# 원칙은 폴더 정리와 같다 — 옮기기만 한다. 지우지도 덮어쓰지도 않는다.
#   · 캐시   : 옛 코드를 가리키던 이름들을 정본 코드로 갈아끼우고, 옛 코드는 codes 에서 뺀다
#   · 체크   : 옛 코드에 '끔(False)'이 있었으면 반드시 이월한다(모르는 새 눈 뜨지 않게)
#   · 폴더   : {root}/{옛코드} → {root}/{정본코드}, {root}/_기타/{옛코드} → {root}/_기타/{정본코드}
#              같은 항차가 양쪽에 있으면 그 항차는 건너뛴다(_move_tree 규칙 그대로)
#   · 서버   : vessels/{정본코드} 를 채우고, 성공하면 vessels/{옛코드} 노드를 지운다

def forget_vessel(cache, code):
    """선박 목록에서 항목 하나를 지운다(캐시에서만 — 폴더·파일은 건드리지 않는다)."""
    if cache is None or not code:
        return False
    names = cache.setdefault("names", {})
    hit = False
    for key in [k for k, v in names.items() if v == code]:
        names.pop(key, None)
        hit = True
    if cache.setdefault("codes", {}).pop(code, None) is not None:
        hit = True
    cache.setdefault("tally", {}).pop(code, None)
    return hit


def merge_vessel(root, cache, old_code, new_code, official_name=None,
                 log_dir=None, firebase=None):
    """옛 코드를 정본 코드로 합친다 — 캐시·폴더·서버를 한꺼번에. (이관과 GUI 가 함께 쓴다)

    돌려주는 값: {"moved": [(원본, 대상)], "skipped": [...], "errors": 정수}
    """
    out = {"moved": [], "skipped": [], "errors": 0}
    if not old_code or not new_code or old_code == new_code or cache is None:
        return out
    names = cache.setdefault("names", {})
    codes = cache.setdefault("codes", {})
    tally = cache.setdefault("tally", {})

    for key in [k for k, v in names.items() if v == old_code]:
        names[key] = new_code
    codes[new_code] = official_name or codes.get(new_code) or new_code
    if not any(v == old_code for v in names.values()):
        codes.pop(old_code, None)
    if old_code in tally:                            # 검수 대상 체크 이월(끔은 무조건 보존)
        was_on = bool(tally.pop(old_code))
        if not was_on:
            tally[new_code] = False
        elif new_code not in tally:
            tally[new_code] = True

    if root and os.path.isdir(root):
        for base in (root, os.path.join(root, OTHER_DIR)):
            src = os.path.join(base, old_code)
            if not os.path.isdir(src):
                continue
            try:
                _move_tree(src, os.path.join(base, new_code), out["moved"], out["skipped"], log_dir)
            except OSError as exc:
                out["errors"] += 1
                log("정본 이관 — 폴더를 옮기지 못했습니다(그대로 둡니다): %s (%s)" % (src, exc), log_dir)

    if firebase is not None and getattr(firebase, "enabled", False):
        res = firebase.register_vessel(new_code, codes.get(new_code) or new_code,
                                       tally=tally_enabled(cache, new_code))
        if res is None:
            out["errors"] += 1
            log("정본 이관 — 서버 등록 실패(옛 노드는 그대로 둡니다): %s → %s"
                % (old_code, new_code), log_dir)
        else:
            firebase.delete("vessels/%s" % old_code)
            left = firebase.get("vessels/%s" % old_code)
            if left:
                out["errors"] += 1
                log("정본 이관 — 서버의 옛 노드가 남아 있습니다: vessels/%s" % old_code, log_dir)
            else:
                log("정본 이관 — 서버 노드 정리: vessels/%s 삭제 · vessels/%s 등록"
                    % (old_code, new_code), log_dir)
    return out


def migrate_to_master(root, cache, master, log_dir=None, firebase=None):
    """기동 시 한 번 — 캐시에 쌓인 자동 코드를 정본 코드로 모은다. 여러 번 돌려도 안전(멱등)."""
    result = {"plan": [], "moved": [], "skipped": [], "errors": 0, "unmatched": []}
    if cache is None:
        return result
    if not master:
        log("선박 정본표가 없어 이관을 건너뜁니다 — 자동 생성 코드를 그대로 씁니다.", log_dir)
        return result
    names = cache.setdefault("names", {})
    codes = cache.setdefault("codes", {})
    plan = []
    for name, old in sorted(names.items()):
        item = resolve_master(name, master)
        if not item:
            result["unmatched"].append((name, old))
            continue
        if item["code"] == old:
            codes[old] = item["name"]                # 이미 정본 코드 — 정식명만 맞춰 둔다
            continue
        plan.append((name, old, item))
    for name, old, item in plan:
        log("정본 이관 — %s(%s) → %s(%s)" % (name, old, item["code"], item["name"]), log_dir)
        out = merge_vessel(root, cache, old, item["code"], item["name"], log_dir, firebase)
        result["plan"].append({"name": name, "old": old,
                               "new": item["code"], "official": item["name"]})
        result["moved"].extend(out["moved"])
        result["skipped"].extend(out["skipped"])
        result["errors"] += out["errors"]
    log("정본 이관 완료 — 코드 %d건 · 폴더 이동 %d건 · 건너뜀 %d건 · 실패 %d건 · 미확인 %d척"
        % (len(result["plan"]), len(result["moved"]), len(result["skipped"]),
           result["errors"], len(result["unmatched"])), log_dir)
    return result


# ──────────────────────────── 메일 해석 ────────────────────────────

def decode_header_text(value):
    """MIME 인코딩 헤더를 사람이 읽는 문자열로."""
    if value is None:
        return ""
    out = []
    try:
        parts = email.header.decode_header(value)
    except Exception:
        return str(value)
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            for candidate in (enc, "utf-8", "cp949", "euc-kr", "latin-1"):
                if not candidate:
                    continue
                try:
                    out.append(chunk.decode(candidate))
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            else:
                out.append(chunk.decode("utf-8", "replace"))
        else:
            out.append(chunk)
    return "".join(out)


def extract_attachments(msg):
    """메시지에서 (파일명, 바이트) 목록을 뽑는다(허용 확장자만)."""
    found = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        raw_name = part.get_filename()
        if not raw_name:
            continue
        name = decode_header_text(raw_name)
        if not is_wanted_attachment(name):
            continue
        try:
            data = part.get_payload(decode=True)
        except Exception as exc:
            log("첨부 해석 실패(%s): %s" % (name, exc))
            continue
        if data is None:
            continue
        found.append((name, data))
    return found


def parse_message(raw_bytes):
    """RFC822 원문 → (제목, 발신자, 날짜, [(첨부명, 바이트)])."""
    msg = email.message_from_bytes(raw_bytes)
    subject = decode_header_text(msg.get("Subject"))
    sender = decode_header_text(msg.get("From"))
    when = None
    try:
        when = email.utils.parsedate_to_datetime(msg.get("Date"))
    except Exception:
        when = None
    return subject, sender, when, extract_attachments(msg)


# ──────────────────────────── 파이어베이스 REST ────────────────────────────

def http_request(url, method="GET", payload=None, timeout=HTTP_TIMEOUT):
    """urllib 한 겹 감싸기 — 타임아웃 필수, 실패는 예외로 올려 호출부가 로그를 남긴다."""
    data = None
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", "replace")
    if not body or body == "null":
        return None
    try:
        return json.loads(body)
    except ValueError:
        return body


class FirebaseREST:
    """익명 인증(signUp) → idToken → RTDB REST. 토큰 만료 시 재발급."""

    def __init__(self, fb_config):
        cfg = fb_config or {}
        self.api_key = cfg.get("apiKey", "")
        self.db_url = (cfg.get("databaseURL", "") or "").rstrip("/")
        self.id_token = None
        self.token_at = 0.0
        self.token_ttl = 3300                        # 55분(만료 3600초 전에 갱신)
        self.cycle_min = 0                           # 수집 주기(분) — 하트비트에 실어 앱이 '끊김'을 판정한다

    @property
    def enabled(self):
        return bool(self.api_key and self.db_url)

    def sign_in(self, force=False):
        """익명 로그인. 성공하면 idToken 반환, 실패하면 None(로그 남김)."""
        if not self.enabled:
            log("파이어베이스 설정(apiKey/databaseURL)이 없어 등록을 건너뜁니다.")
            return None
        if self.id_token and not force and (time.time() - self.token_at) < self.token_ttl:
            return self.id_token
        url = ("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="
               + urllib.parse.quote(self.api_key))
        try:
            res = http_request(url, method="POST", payload={}) or {}
        except Exception as exc:
            log("파이어베이스 익명 인증 실패: %s" % exc)
            return None
        token = res.get("idToken")
        if not token:
            log("파이어베이스 익명 인증 응답에 idToken 이 없습니다: %s" % res)
            return None
        self.id_token, self.token_at = token, time.time()
        log("파이어베이스 익명 인증 성공")
        return token

    def _url(self, path, params=None):
        token = self.id_token or ""
        query = {"auth": token}
        query.update(params or {})
        return "%s/%s.json?%s" % (self.db_url, path.strip("/"), urllib.parse.urlencode(query))

    def _call(self, path, method, payload=None, params=None):
        if not self.sign_in():
            return None
        try:
            return http_request(self._url(path, params), method=method, payload=payload)
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):               # 토큰 만료 → 1회 재발급 후 재시도
                log("파이어베이스 인증 만료 추정(%s) — 토큰 재발급 후 재시도" % exc.code)
                if self.sign_in(force=True):
                    try:
                        return http_request(self._url(path, params), method=method, payload=payload)
                    except Exception as exc2:
                        log("파이어베이스 %s %s 재시도 실패: %s" % (method, path, exc2))
                        return None
            log("파이어베이스 %s %s 실패: %s" % (method, path, exc))
            return None
        except Exception as exc:
            log("파이어베이스 %s %s 실패: %s" % (method, path, exc))
            return None

    def patch(self, path, obj):
        return self._call(path, "PATCH", obj)

    def put(self, path, obj):
        return self._call(path, "PUT", obj)

    def get(self, path, params=None):
        return self._call(path, "GET", None, params)

    def delete(self, path):
        return self._call(path, "DELETE")

    # ── 수집기가 쓰는 3가지 기록 ──

    def register_vessel(self, code, name, last_mail_at=None, tally=None):
        """vessels/{코드} — 빈 깡통 채우기(update 식 PATCH, 기존 값 보존).

        tally 는 검수 대상 체크 상태. None 이면 아예 보내지 않는다(서버 값 보존).
        """
        now = _now_iso()
        body = {"name": name, "code": code, "lastMailAt": last_mail_at or now}
        if tally is not None:
            body["tally"] = bool(tally)
        existing = self.get("vessels/%s" % code)
        if not existing:
            body["discoveredAt"] = now
        return self.patch("vessels/%s" % code, body)

    def heartbeat(self, cycle_mails, cycle_files, cycle_skipped):
        """collector_heartbeat — 검수앱 src/health.js 가 읽는 모양 그대로.

        at 은 **밀리초 숫자**(앱이 `now - hb.at` 로 뺄셈한다 — 문자열이면 '수집기 없음'으로 뜬다),
        cycleMin 은 수집 주기(분). 앱은 주기×2 를 넘으면 '끊김'으로 본다.
        """
        return self.put("collector_heartbeat", {
            "at": int(time.time() * 1000), "cycleMin": max(1, int(self.cycle_min or 10)),
            "version": VERSION,
            "cycleMails": cycle_mails, "cycleFiles": cycle_files,
            "cycleSkipped": cycle_skipped,
        })

    def write_collect_log(self, summary):
        key = datetime.now().strftime("%Y%m%d_%H%M%S")
        res = self.put("collect_log/%s" % key, summary)
        keys = self.get("collect_log", params={"shallow": "true"}) or {}
        if isinstance(keys, dict) and len(keys) > COLLECT_LOG_KEEP:
            for old in sorted(keys.keys())[:len(keys) - COLLECT_LOG_KEEP]:
                self.delete("collect_log/%s" % old)
        return res


def _now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


# ──────────────────────────── 수집기 ────────────────────────────

def imap_connect(cfg, imap_factory=None):
    """IMAP 접속 + 로그인. 실패는 예외를 그대로 올린다(조용한 실패 금지)."""
    factory = imap_factory or (imaplib.IMAP4_SSL if cfg_ssl(cfg) else imaplib.IMAP4)
    host = cfg_host(cfg)
    port = cfg_port(cfg)
    if not host:
        raise ValueError("IMAP 서버 주소가 비어 있습니다.")
    try:
        conn = factory(host, port, ssl_context=ssl.create_default_context(), timeout=IMAP_TIMEOUT)
    except TypeError:                                # 목/구버전 호환
        conn = factory(host, port)
    conn.login(cfg.get("email", ""), cfg.get("password", ""))
    return conn


def imap_search_recent(conn, days):
    """최근 N일 메일 전체(읽음+안읽음) 검색 → 메시지 번호 목록."""
    conn.select("INBOX")
    since = (datetime.now() - timedelta(days=max(1, int(days or 7)))).strftime("%d-%b-%Y")
    typ, data = conn.search(None, "SINCE", since)
    if typ != "OK" or not data or not data[0]:
        return []
    raw = data[0]
    if isinstance(raw, bytes):
        raw = raw.decode("ascii", "replace")
    return raw.split()


def fetch_message(conn, num):
    typ, data = conn.fetch(num, "(RFC822)")
    if typ != "OK" or not data:
        return None
    for item in data:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], (bytes, bytearray)):
            return bytes(item[1])
        if isinstance(item, (bytes, bytearray)) and len(item) > 100:
            return bytes(item)
    return None


# ──────────────────────────── POP3 (후이즈/회사메일 — 아이디·비밀번호만) ────────────────────────────
#
# 설계 원칙
#   · 서버의 메일은 절대 지우지 않는다 — DELE 를 호출하는 코드는 이 파일 어디에도 없다.
#   · 받아 본 메일은 UIDL(서버가 주는 고유 번호)로 기억해 두 번 내려받지 않는다.
#   · UIDL 을 지원하지 않는 서버는 TOP 으로 헤더만 받아 Message-ID 해시로 대신한다.
#   · 내려받은 원문은 IMAP 과 똑같은 _handle_message() 로 들어간다(판독·적재 코드는 하나뿐).

def pop3_connect(cfg, pop_factory=None):
    """POP3 접속 + 로그인. 실패는 예외를 그대로 올린다(조용한 실패 금지)."""
    use_ssl = cfg_ssl(cfg)
    factory = pop_factory or (poplib.POP3_SSL if use_ssl else poplib.POP3)
    host = cfg_host(cfg)
    port = cfg_port(cfg)
    if not host:
        raise ValueError("POP3 서버 주소가 비어 있습니다.")
    kwargs = {"timeout": POP3_TIMEOUT}
    if use_ssl and pop_factory is None:
        kwargs["context"] = ssl.create_default_context()
    try:
        conn = factory(host, port, **kwargs)
    except TypeError:                                # 목/구버전 호환
        conn = factory(host, port)
    conn.user(cfg.get("email", ""))
    conn.pass_(cfg.get("password", ""))
    return conn


def _pop3_join(lines):
    out = []
    for line in lines or []:
        out.append(bytes(line) if isinstance(line, (bytes, bytearray)) else str(line).encode("utf-8", "replace"))
    return b"\r\n".join(out)


def pop3_top(conn, num, lines=0):
    """헤더만 받아 온다(TOP). 서버가 TOP 을 막아 두면 None."""
    try:
        res = conn.top(num, lines)
    except Exception:
        return None
    try:
        return _pop3_join(res[1])
    except (IndexError, TypeError):
        return None


def pop3_retr(conn, num):
    """메일 원문 전체(RETR). 서버에서 지우지 않는다."""
    res = conn.retr(num)
    return _pop3_join(res[1])


def _fallback_uid(header_bytes, num):
    """UIDL 미지원 서버용 대체 열쇠 — Message-ID 해시, 없으면 제목·날짜·발신자 해시."""
    msg = None
    mid = ""
    if header_bytes:
        try:
            msg = email.message_from_bytes(header_bytes)
            mid = (msg.get("Message-ID") or "").strip()
        except Exception:
            msg, mid = None, ""
    if mid:
        return "m:" + hashlib.md5(mid.encode("utf-8", "replace")).hexdigest()
    if msg is not None:
        base = "|".join((msg.get(h) or "") for h in ("Subject", "Date", "From"))
        if base.strip("|"):
            return "h:" + hashlib.md5(base.encode("utf-8", "replace")).hexdigest()
    return "n:%d" % num                              # 최후 수단(서버 정렬이 바뀌면 다시 받을 수 있다)


def pop3_uid_list(conn):
    """[(메시지번호, 고유열쇠)] 목록과 UIDL 지원 여부를 돌려준다."""
    try:
        res = conn.uidl()
        entries = []
        for line in res[1] or []:
            text = line.decode("ascii", "replace") if isinstance(line, (bytes, bytearray)) else str(line)
            parts = text.split(None, 1)
            if len(parts) == 2 and parts[0].isdigit():
                entries.append((int(parts[0]), parts[1].strip()))
        if entries:
            return entries, True
    except Exception:
        pass                                          # 아래 폴백으로 — 조용히 끝내지 않는다
    count = int(conn.stat()[0])
    entries = []
    for num in range(1, count + 1):
        entries.append((num, _fallback_uid(pop3_top(conn, num), num)))
    return entries, False


def _local_now():
    return datetime.now(timezone.utc).astimezone()


def collect_cutoff(days):
    """collect_days 경계 시각(이보다 오래된 메일은 내려받지 않는다)."""
    return _local_now() - timedelta(days=max(1, int(days or 7)))


def header_date(header_bytes):
    """헤더 바이트에서 Date 를 읽는다. 못 읽으면 None(그때는 날짜로 거르지 않는다)."""
    if not header_bytes:
        return None
    try:
        msg = email.message_from_bytes(header_bytes)
        when = email.utils.parsedate_to_datetime(msg.get("Date"))
    except Exception:
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=_local_now().tzinfo)
    return when


class Collector:
    """수집 루프 — run_cycle() 한 사이클, start()/stop() 로 주기 실행."""

    def __init__(self, cfg, imap_factory=None, firebase=None,
                 cache_path=None, log_dir=None, pop_factory=None, uidl_cache_path=None,
                 master_path=None, upload_state_path=None):
        self.cfg = cfg or {}
        self.imap_factory = imap_factory
        self.pop_factory = pop_factory
        self.cache_path = cache_path or CACHE_PATH
        self.uidl_cache_path = uidl_cache_path or UIDL_CACHE_PATH
        self.upload_state_path = upload_state_path or UPLOAD_STATE_PATH
        self.master_path = master_path or MASTER_PATH
        self.log_dir = log_dir or LOG_DIR
        self.cache = load_cache(self.cache_path)
        self.master = load_master(self.master_path)
        self._migrated = False                       # 기동 후 첫 사이클 직전에 한 번만 이관
        self.uidl_cache = load_uidl_cache(self.uidl_cache_path)
        self.firebase = firebase if firebase is not None else FirebaseREST(self.cfg.get("firebase"))
        try:
            self.firebase.cycle_min = max(1, int(self.cfg.get("poll_minutes") or 10))
        except (TypeError, ValueError):
            self.firebase.cycle_min = 10
        self._stop = threading.Event()
        self._thread = None
        self.last_summary = None

    # ── 기동 시 1회 이관 ──
    def migrate_once(self, root):
        """첫 사이클 직전에 한 번 — 자동 코드로 쌓인 캐시·폴더·서버 노드를 정본 코드로 모은다."""
        if self._migrated:
            return None
        self._migrated = True
        if not self.master:
            log("선박 정본표(vessels_master.json)가 없습니다 — 자동 생성 코드로 그대로 갑니다.",
                self.log_dir)
            return None
        log("선박 정본표 %d척을 읽었습니다 — 이관을 확인합니다." % len(self.master), self.log_dir)
        result = migrate_to_master(root, self.cache, self.master,
                                   log_dir=self.log_dir, firebase=self.firebase)
        save_cache(self.cache, self.cache_path)
        # 0.5-01 — 표기(0패딩)만 다른 같은 항차를 정본 표기 하나로 합친다. 실패해도 수집은 계속한다.
        try:
            result["voyageSpelling"] = app_upload.migrate_voyage_spelling(
                root, self.cache, self.master, self.firebase,
                lambda msg: log(msg, self.log_dir), state_path=self.upload_state_path)
        except Exception as exc:
            log("항차 표기 정규화 중 예기치 못한 오류: %s: %s" % (type(exc).__name__, exc),
                self.log_dir)
        return result

    # ── 한 사이클 ──
    def run_cycle(self):
        root = self.cfg.get("mailbox_root") or ""
        if not root:
            log("메일박스 폴더가 설정되지 않았습니다 — 수집을 중단합니다.", self.log_dir)
            return {"error": "mailbox_root 없음"}
        os.makedirs(root, exist_ok=True)
        self.migrate_once(root)

        summary ={"at": _now_iso(), "mails": 0, "files": 0, "skipped": 0,
                   "unclassified": 0, "old_skipped": 0, "vessels": [], "errors": 0}

        protocol = cfg_protocol(self.cfg)
        if protocol == "pop3":
            connected = self._cycle_pop3(root, summary)
        else:
            connected = self._cycle_imap(root, summary)
        if not connected:                            # 접속 자체가 안 됐으면 등록 단계로 넘어가지 않는다
            self.last_summary = summary
            return summary

        save_cache(self.cache, self.cache_path)
        log("사이클 완료 — 메일 %d · 저장 %d · 스킵 %d · 미분류 %d · 오류 %d"
            % (summary["mails"], summary["files"], summary["skipped"],
               summary["unclassified"], summary["errors"]), self.log_dir)
        self._fill_app(root, summary)                # 0.5 — 쌓인 자료를 검수앱에 채운다
        save_cache(self.cache, self.cache_path)      # 짝(E/W) 증거가 캐시에 늘었을 수 있다
        self._report(summary)
        self.last_summary = summary
        return summary

    # ── 앱 채우기(0.5) ──
    def _fill_app(self, root, summary):
        """메일박스를 훑어 항차·EDI 를 검수앱 파이어베이스에 올린다. 실패해도 사이클은 살린다."""
        try:
            result = app_upload.run(root, self.cache, self.master, self.firebase, self.cfg,
                                    lambda msg: log(msg, self.log_dir),
                                    state_path=self.upload_state_path)
        except Exception as exc:
            log("앱 채우기 중 예기치 못한 오류: %s: %s" % (type(exc).__name__, exc), self.log_dir)
            summary["errors"] += 1
            return None
        summary["appVoyages"] = list(result.get("registered") or [])
        summary["appUploads"] = result.get("uploads", 0)
        summary["errors"] += result.get("errors", 0)
        return result

    # ── IMAP 경로 ──
    def _cycle_imap(self, root, summary):
        conn = None
        try:
            conn = imap_connect(self.cfg, self.imap_factory)
        except Exception as exc:
            log("IMAP 접속 실패: %s" % exc, self.log_dir)
            summary["errors"] += 1
            return False

        try:
            nums = imap_search_recent(conn, self.cfg.get("collect_days", 7))
            log("최근 %s일 메일 %d통을 확인합니다." % (self.cfg.get("collect_days", 7), len(nums)),
                self.log_dir)
            for num in nums:
                if self._stop.is_set():
                    log("중지 요청 — 이번 사이클을 여기서 끊습니다.", self.log_dir)
                    break
                try:
                    raw = fetch_message(conn, num)
                except Exception as exc:
                    log("메일 %s 가져오기 실패: %s" % (num, exc), self.log_dir)
                    summary["errors"] += 1
                    continue
                if not raw:
                    continue
                summary["mails"] += 1
                try:
                    self._handle_message(raw, root, summary)
                except Exception as exc:
                    log("메일 %s 처리 실패: %s" % (num, exc), self.log_dir)
                    summary["errors"] += 1
        finally:
            for closer in ("close", "logout"):
                try:
                    getattr(conn, closer)()
                except Exception:
                    pass
        return True

    # ── POP3 경로(서버 메일은 지우지 않는다) ──
    def _cycle_pop3(self, root, summary):
        conn = None
        try:
            conn = pop3_connect(self.cfg, self.pop_factory)
        except Exception as exc:
            log("POP3 접속 실패: %s" % exc, self.log_dir)
            summary["errors"] += 1
            return False

        seen = self.uidl_cache.setdefault("accounts", {}).setdefault(account_key(self.cfg), {})
        days = self.cfg.get("collect_days", 7)
        cutoff = collect_cutoff(days)
        try:
            entries, uidl_ok = pop3_uid_list(conn)
            if not uidl_ok:
                log("서버가 UIDL 을 지원하지 않아 헤더(Message-ID) 해시로 중복을 가립니다.", self.log_dir)
            fresh = [e for e in entries if e[1] not in seen]
            log("서버 메일 %d통 중 새 메일 %d통을 확인합니다(최근 %s일 · 서버 원본은 지우지 않습니다)."
                % (len(entries), len(fresh), days), self.log_dir)

            for num, uid in fresh:
                if self._stop.is_set():
                    log("중지 요청 — 이번 사이클을 여기서 끊습니다.", self.log_dir)
                    break
                when = header_date(pop3_top(conn, num))
                if when is not None and when < cutoff:
                    seen[uid] = _now_iso()           # 캐시에 남겨 다음 사이클에 또 받지 않는다
                    summary["old_skipped"] += 1
                    continue
                try:
                    raw = pop3_retr(conn, num)
                except Exception as exc:
                    log("메일 %s 가져오기 실패: %s" % (num, exc), self.log_dir)
                    summary["errors"] += 1
                    continue
                if not raw:
                    continue
                summary["mails"] += 1
                try:
                    self._handle_message(raw, root, summary)
                except Exception as exc:
                    log("메일 %s 처리 실패: %s" % (num, exc), self.log_dir)
                    summary["errors"] += 1
                    continue                         # 처리 못 한 메일은 기억하지 않는다(다음에 다시 시도)
                seen[uid] = _now_iso()

            alive = set(uid for _num, uid in entries)
            for uid in [u for u in seen if u not in alive]:
                del seen[uid]                        # 서버에서 사라진 메일은 캐시에서도 정리(무한 증가 방지)
            if summary["old_skipped"]:
                log("최근 %s일보다 오래된 메일 %d통은 내려받지 않았습니다."
                    % (days, summary["old_skipped"]), self.log_dir)
        finally:
            try:
                conn.quit()                          # QUIT 만 — DELE 는 어디서도 부르지 않는다
            except Exception:
                pass
        save_uidl_cache(self.uidl_cache, self.uidl_cache_path)
        return True

    def _handle_message(self, raw, root, summary):
        subject, sender, when, attachments = parse_message(raw)
        if not attachments:
            return
        names = [n for n, _ in attachments]
        target = read_mail_target(subject, names, self.cache, self.master)
        if target["ok"]:
            # 0.5 — 짝(E/W) 증거는 제목·첨부명에 적혀 있을 때만 모은다(추론 금지).
            fresh = app_upload.collect_pairs(" ".join([subject or ""] + names),
                                             target["code"], self.cache,
                                             context_voy=target["voyage"])
            for dis, load in fresh:
                log("짝 확인: %s %s ↔ %s" % (target["code"], dis, load), self.log_dir)
            if tally_enabled(self.cache, target["code"]):
                parts = [target["code"]]
            else:
                # 검수 대상 체크가 꺼진 선박 — 버리지 않고 _기타 로 모은다(발견 기록은 그대로)
                parts = [OTHER_DIR, target["code"]]
            # 0.5-01 — 같은 항차인 기존 폴더가 있으면 그 표기로 적재한다(0535E → 535E)
            voy_dir = voyage_dirname(root, parts, target["voyage"])
            subdirs = parts + [voy_dir]
            if voy_dir != target["voyage"]:
                log("항차 표기 정규화 — %s 은(는) 기존 항차 %s 로 적재합니다."
                    % (target["voyage"], voy_dir), self.log_dir)
            if tally_enabled(self.cache, target["code"]):
                log("판독: %s → 선박 %s(%s) · 항차 %s [%s]"
                    % (subject, target["vessel"], target["code"], voy_dir,
                       target["source"]), self.log_dir)
            else:
                log("대상 아님 — _기타 적재: %s %s (%s)"
                    % (target["code"], voy_dir, subject), self.log_dir)
        else:
            subdirs = [UNCLASSIFIED_DIR, unclassified_dirname(subject, when)]
            summary["unclassified"] += 1
            log("미분류(%s): %s — 발신 %s" % (target["reason"], subject, sender), self.log_dir)

        for name, data in attachments:
            try:
                status, path = save_attachment(root, subdirs, name, data)
            except OSError as exc:
                log("첨부 저장 실패(%s): %s" % (name, exc), self.log_dir)
                summary["errors"] += 1
                continue
            if status == "skipped":
                summary["skipped"] += 1
                log("이미 있음 — 건너뜀: %s" % path, self.log_dir)
            else:
                summary["files"] += 1
                log("저장: %s" % path, self.log_dir)

        if target["ok"]:
            entry = {"code": target["code"], "name": target["vessel"], "voyage": voy_dir}
            if entry not in summary["vessels"]:
                summary["vessels"].append(entry)

    def _report(self, summary):
        """파이어베이스 등록 — 선박·하트비트·수집로그."""
        fb = self.firebase
        if fb is None or not getattr(fb, "enabled", False):
            log("파이어베이스 미설정 — 등록 단계를 건너뜁니다.", self.log_dir)
            return
        for entry in summary["vessels"]:
            fb.register_vessel(entry["code"], entry["name"], summary["at"],
                               tally=tally_enabled(self.cache, entry["code"]))
        fb.heartbeat(summary["mails"], summary["files"], summary["skipped"])
        fb.write_collect_log({
            "at": summary["at"], "mails": summary["mails"], "files": summary["files"],
            "skipped": summary["skipped"], "unclassified": summary["unclassified"],
            "errors": summary["errors"], "version": VERSION,
            "vessels": [e["code"] for e in summary["vessels"]],
        })

    # ── 주기 실행 ──
    def start(self):
        if self._thread and self._thread.is_alive():
            return False
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return True

    def _loop(self):
        minutes = max(1, int(self.cfg.get("poll_minutes") or 10))
        log("수집을 시작합니다(%d분 주기). 버전 %s" % (minutes, VERSION), self.log_dir)
        while not self._stop.is_set():
            try:
                self.run_cycle()
            except Exception as exc:
                log("사이클 중 예기치 못한 오류: %s" % exc, self.log_dir)
            self._stop.wait(minutes * 60)
        log("수집을 중지했습니다.", self.log_dir)

    def stop(self):
        self._stop.set()

    @property
    def running(self):
        return bool(self._thread and self._thread.is_alive())


# ──────────────────────────── 연결 테스트(설정 창에서 사용) ────────────────────────────

def test_imap(cfg, imap_factory=None, sample=3):
    """IMAP 로그인 → 폴더 수 → 최근 메일 제목 몇 건. (성공여부, 메시지) 반환."""
    conn = None
    try:
        conn = imap_connect(cfg, imap_factory)
        typ, boxes = conn.list()
        folders = len(boxes or []) if typ == "OK" else 0
        nums = imap_search_recent(conn, cfg.get("collect_days", 7))
        titles = []
        for num in list(nums)[-sample:][::-1]:
            raw = fetch_message(conn, num)
            if raw:
                titles.append(parse_message(raw)[0])
        lines = ["IMAP 로그인 성공 — 폴더 %d개 · 최근 %s일 메일 %d통"
                 % (folders, cfg.get("collect_days", 7), len(nums))]
        lines += ["  · " + t for t in titles] or ["  (표시할 최근 메일 없음)"]
        return True, "\n".join(lines)
    except Exception as exc:
        return False, "IMAP 접속 실패: %s" % exc
    finally:
        for closer in ("close", "logout"):
            try:
                getattr(conn, closer)()
            except Exception:
                pass


def test_pop3(cfg, pop_factory=None, sample=3):
    """POP3 로그인 → STAT(메일 수·용량) → 최근 몇 건 제목(TOP). (성공여부, 메시지) 반환."""
    conn = None
    try:
        conn = pop3_connect(cfg, pop_factory)
        stat = conn.stat()
        count, octets = int(stat[0]), int(stat[1])
        titles = []
        for num in range(count, max(0, count - sample), -1):
            head = pop3_top(conn, num)
            if not head:
                continue
            try:
                titles.append(decode_header_text(email.message_from_bytes(head).get("Subject")))
            except Exception:
                continue
        lines = ["POP3 로그인 성공 — 서버에 메일 %d통(%.1f MB)" % (count, octets / 1048576.0)]
        lines += ["  · " + t for t in titles] or ["  (표시할 최근 메일 없음)"]
        lines.append("  ※ 서버의 메일은 지우지 않습니다 — 복사만 해 옵니다.")
        return True, "\n".join(lines)
    except Exception as exc:
        return False, "POP3 접속 실패: %s" % exc
    finally:
        try:
            conn.quit()
        except Exception:
            pass


def test_mail(cfg, imap_factory=None, pop_factory=None, sample=3):
    """설정의 protocol 에 맞는 연결 테스트를 고른다(설정 창의 [연결 테스트] 진입점)."""
    if cfg_protocol(cfg) == "pop3":
        return test_pop3(cfg, pop_factory, sample)
    return test_imap(cfg, imap_factory, sample)


def test_firebase(fb_config, firebase=None):
    """익명 인증 + heartbeat 시험 쓰기. (성공여부, 메시지)."""
    fb = firebase or FirebaseREST(fb_config)
    if not fb.enabled:
        return False, "firebaseConfig 에 apiKey 또는 databaseURL 이 없습니다."
    if not fb.sign_in(force=True):
        return False, "익명 인증에 실패했습니다(로그 확인). 파이어베이스 인증에서 '익명'을 켜야 합니다."
    res = fb.put("collector_heartbeat", {
        "at": _now_iso(), "version": VERSION, "test": True,
        "cycleMails": 0, "cycleFiles": 0, "cycleSkipped": 0,
    })
    if res is None:
        return False, "익명 인증은 됐지만 데이터베이스 쓰기에 실패했습니다(규칙·주소 확인)."
    return True, "파이어베이스 연결 성공 — 익명 인증 + collector_heartbeat 시험 쓰기 완료"


def main():
    """CLI 실행: config.json 이 있으면 수집 루프, 없으면 안내."""
    cfg = load_config()
    if not cfg:
        print("설정 파일이 없습니다. gui.py 를 실행해 설정을 저장하십시오.")
        return 1
    Collector(cfg).run_cycle()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
