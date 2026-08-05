# 메일파일럿 Uni 0.2 — 범용 메일 수집기 코어(IMAP·POP3 → 선박·항차 자동 판독 → 폴더 적재 → 파이어베이스 등록)
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
     그 앞의 영문 대문자 낱말에서 선박명을 뽑아 4자 선박코드를 만든다
  4) {mailbox_root}/{선박코드}/{항차}/{첨부파일명} 으로 적재
     판독 실패 메일은 {mailbox_root}/_미분류/{날짜}_{제목요약}/ 로 — 절대 버리지 않는다
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
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

VERSION = "MailPilot Uni 0.2"

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
CACHE_PATH = os.path.join(HERE, "vessels_cache.json")
UIDL_CACHE_PATH = os.path.join(HERE, "pop_uidl_cache.json")
LOG_DIR = os.path.join(HERE, "logs")

HTTP_TIMEOUT = 15          # 초 — 모든 네트워크 요청 공통(조용한 실패 금지)
IMAP_TIMEOUT = 30          # 초
POP3_TIMEOUT = 30          # 초
UNCLASSIFIED_DIR = "_미분류"
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
            print("로그 기록 실패: %s" % exc)
        print(line)
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


def read_mail_target(subject, filenames=None, cache=None):
    """메일 한 통의 적재 대상 판독 — 제목 먼저, 실패하면 첨부파일명 순."""
    cache = cache if cache is not None else {"names": {}, "codes": {}}
    sources = [("제목", subject or "")]
    for name in (filenames or []):
        sources.append(("첨부", name))
    for where, text in sources:
        voyage, pos = find_voyage(text)
        if not voyage:
            continue
        vessel = extract_vessel_name(text, pos)
        if not vessel:
            continue
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


def unclassified_dirname(subject, when=None):
    """{날짜}_{제목요약} 폴더 이름."""
    when = when or datetime.now()
    stamp = when.strftime("%Y%m%d")
    summary = safe_name(" ".join((subject or "").split())[:40], fallback="제목없음", limit=40)
    return "%s_%s" % (stamp, summary)


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

    def register_vessel(self, code, name, last_mail_at=None):
        """vessels/{코드} — 빈 깡통 채우기(update 식 PATCH, 기존 값 보존)."""
        now = _now_iso()
        body = {"name": name, "code": code, "lastMailAt": last_mail_at or now}
        existing = self.get("vessels/%s" % code)
        if not existing:
            body["discoveredAt"] = now
        return self.patch("vessels/%s" % code, body)

    def heartbeat(self, cycle_mails, cycle_files, cycle_skipped):
        return self.put("collector_heartbeat", {
            "at": _now_iso(), "version": VERSION,
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
                 cache_path=None, log_dir=None, pop_factory=None, uidl_cache_path=None):
        self.cfg = cfg or {}
        self.imap_factory = imap_factory
        self.pop_factory = pop_factory
        self.cache_path = cache_path or CACHE_PATH
        self.uidl_cache_path = uidl_cache_path or UIDL_CACHE_PATH
        self.log_dir = log_dir or LOG_DIR
        self.cache = load_cache(self.cache_path)
        self.uidl_cache = load_uidl_cache(self.uidl_cache_path)
        self.firebase = firebase if firebase is not None else FirebaseREST(self.cfg.get("firebase"))
        self._stop = threading.Event()
        self._thread = None
        self.last_summary = None

    # ── 한 사이클 ──
    def run_cycle(self):
        root = self.cfg.get("mailbox_root") or ""
        if not root:
            log("메일박스 폴더가 설정되지 않았습니다 — 수집을 중단합니다.", self.log_dir)
            return {"error": "mailbox_root 없음"}
        os.makedirs(root, exist_ok=True)

        summary = {"at": _now_iso(), "mails": 0, "files": 0, "skipped": 0,
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
        self._report(summary)
        self.last_summary = summary
        return summary

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
        target = read_mail_target(subject, names, self.cache)
        if target["ok"]:
            subdirs = [target["code"], target["voyage"]]
            log("판독: %s → 선박 %s(%s) · 항차 %s [%s]"
                % (subject, target["vessel"], target["code"], target["voyage"], target["source"]),
                self.log_dir)
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
            entry = {"code": target["code"], "name": target["vessel"], "voyage": target["voyage"]}
            if entry not in summary["vessels"]:
                summary["vessels"].append(entry)

    def _report(self, summary):
        """파이어베이스 등록 — 선박·하트비트·수집로그."""
        fb = self.firebase
        if fb is None or not getattr(fb, "enabled", False):
            log("파이어베이스 미설정 — 등록 단계를 건너뜁니다.", self.log_dir)
            return
        for entry in summary["vessels"]:
            fb.register_vessel(entry["code"], entry["name"], summary["at"])
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
