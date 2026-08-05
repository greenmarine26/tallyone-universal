# 메일파일럿 Uni 0.3 테스트 러너 — 실서버 없이(픽스처·목) 판독·수집·POP3·파이어베이스·GUI를 전부 확인한다.
"""실행: python mailpilot/tests/run_tests.py

  1) 판독 유닛테스트 — 실제 유형 제목 12종 → 선박/항차/코드 표
  2) 코드 안정성 — 같은 이름은 언제나 같은 코드, 충돌 시 숫자 부가
  3) firebaseConfig 관용 파서
  4) 가짜 IMAP 으로 수집 1사이클 — 폴더 구조·중복 스킵·미분류
  5) 파이어베이스 REST 목 — signUp → PATCH 순서·payload·auth 파라미터
  6) tkinter 가짜 모듈로 GUI 스모크(디스플레이 없이 생성·입력 수집 검증)
  7) 가짜 POP3 수집 — 같은 픽스처 12종이 IMAP 과 똑같이 적재되는지(판독 경로 공용 증명),
     UIDL 캐시 중복 0, DELE 호출 0, 연결 테스트(STAT+TOP)
  8) collect_days 경계(오래된 메일 스킵 + 캐시 기록) · UIDL 미지원 폴백 · TOP 미지원
  9) 설정 도우미(0.1 호환) · 프리셋 전환 시 GUI 자동값 · config protocol 저장/로드
 10) 검수 대상 체크 — 0.2 캐시 회귀 · 끈 선박은 _기타 적재 · 발견 기록/등록(tally)은 그대로
 11) 폴더 정리 — 체크 상태에 맞춰 왕복 이동, 충돌 항차는 건너뛰고 삭제·덮어쓰기 없음
 12) GUI — 수집 조건 문구(정본) · 체크 토글 즉시 저장 · 폴더 정리 확인창
 13) 폴더 정리 — 항차를 다 옮긴 빈 코드 폴더 치우기(파일 삭제 없음 · 멱등)
 14) GUI — 수집 중 [폴더 정리] 잠금 · --autostart 무인 시작(설정 불완전이면 시작 안 함)
 15) 버전 라벨 — README·run_mailpilot.bat 이 core.VERSION 과 같은지, --autostart 전달
"""

import datetime
import email.message
import email.utils
import io
import json
import os
import poplib
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
sys.path.insert(0, PKG)

import mailpilot as core  # noqa: E402

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print("  [%s] %s%s" % ("PASS" if ok else "FAIL", name, (" — " + detail) if detail else ""))
    return ok


# ────────────────────── 픽스처: 실제 유형 제목 12종 ──────────────────────

FIXTURES = [
    # (제목, 첨부파일명들, 기대 선박, 기대 항차)
    ("[SIF-TIS2-AK51] INBOUND BAY PLAN OF MV.XIN TAI PING V-535E AT KRPTK",
     ["XINTAIPING_535E.edi"], "TAI PING", "535E"),
    ("연태훼리 2706W CLL 3차 (VGM최종본/231VAN)",
     ["연태훼리 2706W CLL.xlsx"], None, None),
    ("RE: (SKR-PTK) SAWASDEE SPICA 2606N CONTAINER LOADING LIST",
     ["SPICA_2606N_CLL.xls"], "SAWASDEE SPICA", "2606N"),
    ("M.V. XINQUNDAO V.2630W // DALIAN DISCH LIST(AFTER KRPTK)",
     ["disch_list.pdf"], "XINQUNDAO", "2630W"),
    ("일조국제물류) R083W_로딩리스트_최종",
     ["R083W_LOADING.xlsx"], None, None),
    ("Coastal Schedule (Week 32) - PTK/INC/BUS",
     ["schedule.pdf"], None, None),
    ("FW: STAR MAJESTY 2643E & 2644W PTK TALLY REPORT",
     ["STMJ 2643E&2644W PTK TALLY REPORT.xlsx"], "STAR MAJESTY", "2643E"),
    ("TIANJIN PEARL V.26355W BAPLIE 송부",
     ["TNJP_26355W_ACTUAL_BAPLIE.edi"], "TIANJIN PEARL", "26355W"),
    ("ATLANTIC PARIS 2625E CNTR LIST 최종",
     ["ATPR 2625E CNTR LIST.xlsx"], "ATLANTIC PARIS", "2625E"),
    ("SAWASDEE DENIZ 2608S ACTUAL BAPLIE",
     ["SWDN_2608S_ACTUAL_BAPLIE.edi", "SWDN2608S.ASC"], "SAWASDEE DENIZ", "2608S"),
    ("자료 송부드립니다",                       # 제목엔 없고 첨부파일명에만 항차가 있는 경우
     ["TNJP_26349W_ACTUAL_BAPLIE.edi"], "TNJP", "26349W"),
    ("DONGJIN VENUS 0088E DG LIST",
     ["DGLIST.pdf"], "DONGJIN VENUS", "0088E"),
]


def build_eml(subject, filenames, sender="ops@example.com", body=b"TEST-ATTACH-DATA",
              date=None, msgid=None):
    """첨부가 든 .eml 원문(bytes) 생성."""
    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = "tally@example.com"
    msg["Date"] = date or "Tue, 04 Aug 2026 09:12:00 +0900"
    if msgid:
        msg["Message-ID"] = msgid
    msg.set_content("자료 송부합니다.")
    for name in filenames:
        msg.add_attachment(body + name.encode("utf-8"),
                           maintype="application", subtype="octet-stream", filename=name)
    return msg.as_bytes()


# ────────────────────── 1) 판독 표 ──────────────────────

def test_read_table():
    print("\n[1] 판독 유닛테스트 — 제목 → 선박/항차/코드")
    cache = {"names": {}, "codes": {}}
    rows, ok_all = [], True
    for subject, files, want_vessel, want_voyage in FIXTURES:
        target = core.read_mail_target(subject, files, cache)
        vessel = target["vessel"]
        voyage = target["voyage"] if target["ok"] else None
        rows.append((subject, vessel, target["voyage"], target["code"],
                     "적재" if target["ok"] else "미분류(%s)" % target["reason"]))
        good = (vessel == want_vessel) and (voyage == want_voyage)
        ok_all = ok_all and good
        if not good:
            print("    기대 %s/%s ≠ 실제 %s/%s :: %s"
                  % (want_vessel, want_voyage, vessel, voyage, subject))
    print("\n    %-62s %-16s %-8s %-5s %s" % ("제목", "선박", "항차", "코드", "결과"))
    print("    " + "-" * 110)
    for subject, vessel, voyage, code, verdict in rows:
        print("    %-62s %-16s %-8s %-5s %s"
              % (subject[:60], vessel or "-", voyage or "-", code or "-", verdict))
    print("")
    check("판독 12종 기대값 일치", ok_all)
    # 미분류로 떨어진 3건은 '버리지 않는다' — 미분류 폴더명이 만들어져야 한다
    name = core.unclassified_dirname("Coastal Schedule (Week 32) - PTK/INC/BUS")
    check("미분류 폴더명 생성", bool(name) and "_" in name, name)


# ────────────────────── 2) 코드 안정성 ──────────────────────

def test_code_stability():
    print("\n[2] 선박코드 안정성")
    cache = {"names": {}, "codes": {}}
    first = core.vessel_code("SAWASDEE DENIZ", cache)
    again = core.vessel_code("sawasdee  deniz", cache)      # 대소문자·공백 달라도 같은 코드
    check("같은 이름 = 같은 코드", first == again == "SWDN", "%s / %s" % (first, again))

    fresh = {"names": {}, "codes": {}}
    check("캐시를 새로 만들어도 같은 코드",
          core.vessel_code("SAWASDEE DENIZ", fresh) == first)

    known = {"STAR MAJESTY": "STMJ", "ATLANTIC PARIS": "ATPR",
             "TIANJIN PEARL": "TNPR", "XINQUNDAO": "XNQN"}
    c = {"names": {}, "codes": {}}
    bad = [n for n, code in known.items() if core.vessel_code(n, c) != code]
    check("대표 선박 코드 규칙(첫 글자+자음)", not bad, "불일치: %s" % bad if bad else "")

    c2 = {"names": {}, "codes": {}}
    a = core.vessel_code("SAWASDEE DENIZ", c2)
    b = core.vessel_code("SAWADI DANUBE", c2)               # 같은 기본코드 → 숫자 부가
    check("코드 충돌 시 숫자 부가", a == "SWDN" and b != a and len(b) == 4, "%s vs %s" % (a, b))


# ────────────────────── 3) firebaseConfig 파서 ──────────────────────

def test_firebase_parser():
    print("\n[3] firebaseConfig 관용 파서")
    js = """
    const firebaseConfig = {
      apiKey: "AIzaSyTEST-KEY",
      authDomain: "demo.firebaseapp.com",
      databaseURL: "https://demo-default-rtdb.firebaseio.com",
      projectId: "demo",
      appId: "1:123:web:abc"
    };
    """
    parsed = core.parse_firebase_config(js)
    check("JS 리터럴 파싱", parsed.get("apiKey") == "AIzaSyTEST-KEY"
          and parsed.get("databaseURL", "").endswith("firebaseio.com"), json.dumps(parsed)[:60])
    parsed2 = core.parse_firebase_config('{"apiKey":"K","databaseURL":"https://d.firebaseio.com"}')
    check("JSON 파싱", parsed2.get("apiKey") == "K")
    check("빈 입력", core.parse_firebase_config("") == {})


# ────────────────────── 4) 가짜 IMAP 수집 사이클 ──────────────────────

class FakeIMAP:
    """imaplib.IMAP4_SSL 대역 — 픽스처 .eml 을 fetch 응답으로 준다."""

    def __init__(self, host, port=993, ssl_context=None, timeout=None):
        self.host, self.port = host, port
        self.messages = list(FakeIMAP.MESSAGES)
        self.logged_in = False
        self.selected = None

    MESSAGES = []

    def login(self, user, password):
        if not user or not password:
            raise RuntimeError("자격 증명 없음")
        self.logged_in = True
        return ("OK", [b"LOGIN completed"])

    def list(self):
        return ("OK", [b'(\\HasNoChildren) "/" "INBOX"', b'(\\HasNoChildren) "/" "Sent"'])

    def select(self, box="INBOX"):
        self.selected = box
        return ("OK", [str(len(self.messages)).encode()])

    def search(self, charset, *criteria):
        nums = " ".join(str(i + 1) for i in range(len(self.messages)))
        return ("OK", [nums.encode()])

    def fetch(self, num, spec):
        idx = int(num) - 1
        raw = self.messages[idx]
        return ("OK", [(b"%d (RFC822 {%d}" % (idx + 1, len(raw)), raw), b")"])

    def close(self):
        return ("OK", [b"closed"])

    def logout(self):
        return ("BYE", [b"logout"])


def test_collect_cycle():
    print("\n[4] 가짜 IMAP 수집 1사이클")
    FakeIMAP.MESSAGES = [build_eml(s, f) for s, f, _v, _y in FIXTURES]
    tmp = tempfile.mkdtemp(prefix="mailpilot_test_")
    root = os.path.join(tmp, "MAILBOX")
    cfg = {"provider": "custom", "imap_host": "imap.test.local", "imap_port": 993,
           "email": "u@test", "password": "pw", "mailbox_root": root,
           "collect_days": 7, "poll_minutes": 10, "firebase": {}}
    col = core.Collector(cfg, imap_factory=FakeIMAP, firebase=None,
                         cache_path=os.path.join(tmp, "vessels_cache.json"),
                         log_dir=os.path.join(tmp, "logs"))
    col.firebase = core.FirebaseREST({})              # 미설정 → 등록 건너뜀
    s1 = col.run_cycle()

    check("메일 12통 처리", s1["mails"] == 12, str(s1["mails"]))
    expect_dirs = {
        os.path.join("TAPN", "535E", "XINTAIPING_535E.edi"),
        os.path.join("SWSP", "2606N", "SPICA_2606N_CLL.xls"),
        os.path.join("XNQN", "2630W", "disch_list.pdf"),
        os.path.join("STMJ", "2643E", "STMJ 2643E&2644W PTK TALLY REPORT.xlsx"),
        os.path.join("TNPR", "26355W", "TNJP_26355W_ACTUAL_BAPLIE.edi"),
        os.path.join("ATPR", "2625E", "ATPR 2625E CNTR LIST.xlsx"),
        os.path.join("SWDN", "2608S", "SWDN2608S.ASC"),
        os.path.join("TNJP", "26349W", "TNJP_26349W_ACTUAL_BAPLIE.edi"),
        os.path.join("DNVN", "0088E", "DGLIST.pdf"),
    }
    missing = [d for d in expect_dirs if not os.path.exists(os.path.join(root, d))]
    check("선박/항차 폴더 적재", not missing, "없음: %s" % missing if missing else "9경로 확인")

    unc = os.path.join(root, core.UNCLASSIFIED_DIR)
    unc_dirs = sorted(os.listdir(unc)) if os.path.isdir(unc) else []
    unc_files = sum(len(files) for _r, _d, files in os.walk(unc)) if unc_dirs else 0
    check("미분류 3건 보존(버리지 않음)",
          len(unc_dirs) == 3 and unc_files == 3, "폴더 %s" % unc_dirs)
    check("사이클 요약 미분류 수", s1["unclassified"] == 3, str(s1["unclassified"]))
    check("첨부 저장 수 = 13", s1["files"] == 13, str(s1["files"]))
    check("오류 0", s1["errors"] == 0, str(s1["errors"]))

    s2 = col.run_cycle()                              # 같은 메일 재수집 → 전부 스킵
    check("재수집 시 중복 스킵", s2["files"] == 0 and s2["skipped"] == 13,
          "저장 %d · 스킵 %d" % (s2["files"], s2["skipped"]))

    # 같은 이름·다른 내용 → (2) 부가
    status, path = core.save_attachment(root, ["ATPR", "2625E"],
                                        "ATPR 2625E CNTR LIST.xlsx", b"DIFFERENT-CONTENT-XX")
    check("같은 이름 다른 내용 → (2) 부가",
          status == "renamed" and "(2)" in os.path.basename(path), os.path.basename(path))

    cache = core.load_cache(os.path.join(tmp, "vessels_cache.json"))
    check("선박 캐시 저장", len(cache["names"]) == 9, "%d척" % len(cache["names"]))

    log_files = os.listdir(os.path.join(tmp, "logs"))
    check("한국어 로그 파일 생성", bool(log_files), ", ".join(log_files))
    shutil.rmtree(tmp, ignore_errors=True)
    return s1


# ────────────────────── 5) 파이어베이스 REST 목 ──────────────────────

def test_firebase_rest():
    print("\n[5] 파이어베이스 REST 목 — signUp → PATCH/PUT 순서·payload·auth")
    calls = []
    original = core.http_request

    def fake_http(url, method="GET", payload=None, timeout=core.HTTP_TIMEOUT):
        calls.append({"url": url, "method": method, "payload": payload, "timeout": timeout})
        if "identitytoolkit" in url:
            return {"idToken": "TOKEN-123", "localId": "anon-1", "expiresIn": "3600"}
        if method == "GET" and "collect_log.json" in url:
            return {"20260801_010101": True}
        if method == "GET":
            return None
        return {"ok": True}

    core.http_request = fake_http
    try:
        fb = core.FirebaseREST({"apiKey": "KEY-X",
                                "databaseURL": "https://demo-default-rtdb.firebaseio.com/"})
        check("설정 있으면 enabled", fb.enabled)
        fb.register_vessel("SWDN", "SAWASDEE DENIZ")
        fb.heartbeat(12, 13, 0)
        fb.write_collect_log({"mails": 12, "files": 13})
    finally:
        core.http_request = original

    check("첫 요청은 익명 signUp(POST, body {})",
          calls[0]["method"] == "POST" and "accounts:signUp?key=KEY-X" in calls[0]["url"]
          and calls[0]["payload"] == {}, calls[0]["url"].split("?")[0])
    check("모든 요청 타임아웃 15초", all(c["timeout"] == core.HTTP_TIMEOUT for c in calls))

    db_calls = [c for c in calls if "firebaseio.com" in c["url"]]
    check("RTDB 요청에 auth=idToken 부착",
          all("auth=TOKEN-123" in c["url"] for c in db_calls), "%d건" % len(db_calls))

    patch = [c for c in db_calls if c["method"] == "PATCH"]
    check("vessels/{코드} PATCH(update식)",
          len(patch) == 1 and "/vessels/SWDN.json" in patch[0]["url"]
          and patch[0]["payload"]["name"] == "SAWASDEE DENIZ"
          and patch[0]["payload"]["code"] == "SWDN"
          and "discoveredAt" in patch[0]["payload"]
          and "lastMailAt" in patch[0]["payload"],
          json.dumps(patch[0]["payload"], ensure_ascii=False) if patch else "없음")

    hb = [c for c in db_calls if c["method"] == "PUT" and "collector_heartbeat" in c["url"]]
    check("collector_heartbeat PUT",
          len(hb) == 1 and hb[0]["payload"]["cycleMails"] == 12
          and hb[0]["payload"]["cycleFiles"] == 13
          and hb[0]["payload"]["cycleSkipped"] == 0
          and hb[0]["payload"]["version"] == core.VERSION,
          json.dumps(hb[0]["payload"], ensure_ascii=False) if hb else "없음")

    cl = [c for c in db_calls if "collect_log" in c["url"]]
    check("collect_log 기록 + 롤링 조회(shallow)",
          any(c["method"] == "PUT" for c in cl)
          and any(c["method"] == "GET" and "shallow=true" in c["url"] for c in cl),
          "%d건" % len(cl))

    # 인증 실패해도 조용히 죽지 않는다
    def dead_http(url, method="GET", payload=None, timeout=None):
        raise OSError("네트워크 없음")
    core.http_request = dead_http
    try:
        fb2 = core.FirebaseREST({"apiKey": "K", "databaseURL": "https://x.firebaseio.com"})
        res = fb2.patch("vessels/AAAA", {"name": "A"})
        check("네트워크 실패 시 예외 대신 None + 로그", res is None)
    finally:
        core.http_request = original

    check("설정 없으면 비활성", not core.FirebaseREST({}).enabled)


# ────────────────────── 6) GUI 스모크(가짜 tkinter) ──────────────────────

def _install_fake_tkinter():
    """디스플레이·tkinter 없는 환경에서 GUI 코드를 생성만 검증하기 위한 대역 모듈."""
    class FakeVar:
        def __init__(self, master=None, value=""):
            self._v = value
            self._traces = []

        def get(self):
            return self._v

        def set(self, v):
            self._v = v
            for fn in list(self._traces):             # trace_add("write", …) 대역
                fn("var", "", "write")

        def trace_add(self, mode, fn):
            self._traces.append(fn)
            return "trace#%d" % len(self._traces)

    class FakeWidget:
        def __init__(self, *args, **kwargs):
            self.kwargs = dict(kwargs)

        def configure(self, **kwargs):
            self.kwargs.update(kwargs)                # state/text 변경을 시험에서 읽을 수 있게 기억
            return None

        def __getattr__(self, name):
            def _noop(*a, **k):
                return None
            return _noop

    class FakeText(FakeWidget):
        def __init__(self, *args, **kwargs):
            FakeWidget.__init__(self, *args, **kwargs)
            self.buffer = ""

        def insert(self, index, text):
            self.buffer += text

        def get(self, start="1.0", end="end"):
            return self.buffer

        def delete(self, *a):
            self.buffer = ""

    class FakeTk(FakeWidget):
        def after(self, ms, fn=None, *a):
            return "after#1"                          # 실제로 호출하지 않는다(무한 재귀 방지)

        def mainloop(self):
            return None

    tk = types.ModuleType("tkinter")
    tk.Tk = FakeTk
    tk.StringVar = FakeVar
    tk.IntVar = FakeVar
    tk.BooleanVar = FakeVar
    tk.Text = FakeText
    tk.Canvas = FakeWidget
    for const in ("END", "W", "E", "N", "S", "BOTH", "X", "Y", "LEFT", "RIGHT",
                  "TOP", "BOTTOM", "DISABLED", "NORMAL"):
        setattr(tk, const, const.lower())

    ttk = types.ModuleType("tkinter.ttk")
    for widget in ("Frame", "Label", "Entry", "Button", "Combobox",
                   "Scrollbar", "LabelFrame", "Notebook", "Checkbutton", "Radiobutton"):
        setattr(ttk, widget, FakeWidget)

    filedialog = types.ModuleType("tkinter.filedialog")
    filedialog.askdirectory = lambda **k: ""
    messagebox = types.ModuleType("tkinter.messagebox")
    messagebox.showinfo = lambda *a, **k: None
    messagebox.showwarning = lambda *a, **k: None
    messagebox.showerror = lambda *a, **k: None
    messagebox.askyesno = lambda *a, **k: False       # 시험 중에 폴더를 건드리지 않는다(기본 '아니오')

    tk.ttk, tk.filedialog, tk.messagebox = ttk, filedialog, messagebox
    sys.modules["tkinter"] = tk
    sys.modules["tkinter.ttk"] = ttk
    sys.modules["tkinter.filedialog"] = filedialog
    sys.modules["tkinter.messagebox"] = messagebox
    return tk


def test_gui_smoke():
    print("\n[6] GUI 스모크")
    try:
        import tkinter  # noqa: F401
        real = True
    except ImportError:
        real = False
    if not real:
        _install_fake_tkinter()
        print("    (이 환경에는 tkinter 가 없어 가짜 모듈로 생성만 검증합니다)")

    tmp = tempfile.mkdtemp(prefix="mailpilot_gui_")
    cfg_path = os.path.join(tmp, "config.json")
    try:
        import gui
        app = gui.MailPilotGUI(config_path=cfg_path)
        check("GUI 인스턴스 생성", app is not None)

        app.var_provider.set("지메일")
        app.on_provider_change()
        check("프리셋 선택 시 서버 자동 입력",
              app.var_host.get() == "imap.gmail.com" and app.var_port.get() == "993",
              "%s:%s" % (app.var_host.get(), app.var_port.get()))
        check("프리셋 안내문 존재", all(core.IMAP_PRESETS[k]["help"] for k in core.IMAP_PRESETS))

        app.var_email.set("me@gmail.com")
        app.var_password.set("app-password")
        app.var_root.set(tmp)
        app.txt_fb.insert("1.0", 'const firebaseConfig = {apiKey:"K1", '
                                 'databaseURL:"https://d-default-rtdb.firebaseio.com"};')
        cfg = app.collect_config()
        check("화면 입력 → config 수집",
              cfg["provider"] == "gmail" and cfg["email"] == "me@gmail.com"
              and cfg["firebase"]["apiKey"] == "K1" and cfg["mailbox_root"] == tmp,
              json.dumps({k: v for k, v in cfg.items() if k != "password"}, ensure_ascii=False)[:90])

        saved = app.on_save()
        check("저장 → config.json 기록",
              saved is not None and os.path.exists(cfg_path)
              and core.load_config(cfg_path)["email"] == "me@gmail.com")
    except Exception as exc:
        check("GUI 스모크", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 7) 가짜 POP3 수집 사이클 ──────────────────────

class FakePOP3:
    """poplib.POP3_SSL 대역 — 픽스처 .eml 을 UIDL/TOP/RETR 응답으로 준다.

    DELE 는 호출되면 즉시 예외를 던진다(서버 메일을 지우는 코드가 생기면 테스트가 깨진다).
    """

    MESSAGES = []
    UIDL_SUPPORTED = True
    TOP_SUPPORTED = True
    DELE_CALLS = []
    INSTANCES = []

    def __init__(self, host, port=995, timeout=None, context=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.messages = list(FakePOP3.MESSAGES)
        self.user_name = None
        self.logged_in = False
        self.retr_calls = []
        self.top_calls = []
        self.quit_called = False
        FakePOP3.INSTANCES.append(self)

    # ── 접속·인증 ──
    def user(self, name):
        self.user_name = name
        return b"+OK"

    def pass_(self, password):
        if not self.user_name or not password:
            raise poplib.error_proto(b"-ERR authentication failed")
        self.logged_in = True
        return b"+OK logged in"

    # ── 목록 ──
    def stat(self):
        return (len(self.messages), sum(len(m) for m in self.messages))

    def uidl(self, which=None):
        if not FakePOP3.UIDL_SUPPORTED:
            raise poplib.error_proto(b"-ERR unknown command")
        lines = [("%d UID%04d" % (i + 1, i + 1)).encode() for i in range(len(self.messages))]
        return (b"+OK", lines, sum(len(x) for x in lines))

    @staticmethod
    def _split_lines(raw):
        return raw.replace(b"\r\n", b"\n").split(b"\n")

    def top(self, num, lines=0):
        if not FakePOP3.TOP_SUPPORTED:
            raise poplib.error_proto(b"-ERR TOP not supported")
        self.top_calls.append(num)
        raw = self.messages[num - 1].replace(b"\r\n", b"\n")
        head = raw.split(b"\n\n", 1)[0]
        out = head.split(b"\n")
        return (b"+OK", out, len(head))

    def retr(self, num):
        self.retr_calls.append(num)
        raw = self.messages[num - 1]
        out = FakePOP3._split_lines(raw)
        return (b"+OK", out, len(raw))

    def dele(self, num):
        FakePOP3.DELE_CALLS.append(num)
        raise AssertionError("DELE 호출 금지 — 서버 메일은 지우지 않는다")

    def quit(self):
        self.quit_called = True
        return b"+OK"


def _reset_pop(messages, uidl=True, top=True):
    FakePOP3.MESSAGES = list(messages)
    FakePOP3.UIDL_SUPPORTED = uidl
    FakePOP3.TOP_SUPPORTED = top
    FakePOP3.DELE_CALLS = []
    FakePOP3.INSTANCES = []


def _tree(root):
    """{루트 기준 상대경로: 파일크기} — 두 경로의 적재 결과를 그대로 견주기 위한 지문."""
    out = {}
    for base, _dirs, files in os.walk(root):
        for name in files:
            full = os.path.join(base, name)
            out[os.path.relpath(full, root).replace("\\", "/")] = os.path.getsize(full)
    return out


def _pop_cfg(root, tmp, days=7):
    return {"provider": "whois", "protocol": "pop3", "host": "pop.test.local", "port": 995,
            "ssl": True, "email": "office@test", "password": "pw", "mailbox_root": root,
            "collect_days": days, "poll_minutes": 10, "firebase": {}}


def _make_collector(cfg, tmp, tag):
    col = core.Collector(cfg, pop_factory=FakePOP3, firebase=None,
                         cache_path=os.path.join(tmp, "vessels_%s.json" % tag),
                         log_dir=os.path.join(tmp, "logs"),
                         uidl_cache_path=os.path.join(tmp, "pop_uidl_%s.json" % tag))
    col.firebase = core.FirebaseREST({})
    return col


def test_pop3_cycle():
    print("\n[7] 가짜 POP3 수집 — IMAP 과 같은 판독 파이프라인인지")
    msgs = [build_eml(s, f) for s, f, _v, _y in FIXTURES]
    tmp = tempfile.mkdtemp(prefix="mailpilot_pop_")
    try:
        # ① IMAP 경로 결과(기준표)
        FakeIMAP.MESSAGES = list(msgs)
        root_imap = os.path.join(tmp, "MB_IMAP")
        cfg_imap = {"provider": "custom", "protocol": "imap", "host": "imap.test.local",
                    "port": 993, "ssl": True, "email": "u@test", "password": "pw",
                    "mailbox_root": root_imap, "collect_days": 7, "poll_minutes": 10,
                    "firebase": {}}
        col_i = core.Collector(cfg_imap, imap_factory=FakeIMAP, firebase=None,
                               cache_path=os.path.join(tmp, "vessels_imap.json"),
                               log_dir=os.path.join(tmp, "logs"))
        col_i.firebase = core.FirebaseREST({})
        s_imap = col_i.run_cycle()

        # ② POP3 경로 결과
        _reset_pop(msgs)
        root_pop = os.path.join(tmp, "MB_POP")
        col_p = _make_collector(_pop_cfg(root_pop, tmp), tmp, "pop")
        s_pop = col_p.run_cycle()

        check("POP3 로그인(아이디=메일주소 전체 / 비밀번호)",
              FakePOP3.INSTANCES[0].logged_in
              and FakePOP3.INSTANCES[0].user_name == "office@test",
              "%s:%s" % (FakePOP3.INSTANCES[0].host, FakePOP3.INSTANCES[0].port))
        check("프리셋 기본 포트 995 · SSL", FakePOP3.INSTANCES[0].port == 995)

        same_counts = all(s_pop[k] == s_imap[k] for k in
                          ("mails", "files", "skipped", "unclassified", "errors"))
        check("POP3 사이클 요약 = IMAP 사이클 요약", same_counts,
              "POP %s / IMAP %s"
              % ({k: s_pop[k] for k in ("mails", "files", "unclassified", "errors")},
                 {k: s_imap[k] for k in ("mails", "files", "unclassified", "errors")}))

        t_imap, t_pop = _tree(root_imap), _tree(root_pop)
        check("적재 결과 파일 트리 동일(같은 판독 파이프라인)", t_imap == t_pop,
              "%d경로 일치" % len(t_pop) if t_imap == t_pop
              else "IMAP만: %s / POP만: %s"
                   % (sorted(set(t_imap) - set(t_pop))[:3], sorted(set(t_pop) - set(t_imap))[:3]))

        check("POP3 도 미분류 3건 보존", s_pop["unclassified"] == 3, str(s_pop["unclassified"]))
        check("1사이클 RETR = 메일 수", len(FakePOP3.INSTANCES[0].retr_calls) == 12,
              "%d회" % len(FakePOP3.INSTANCES[0].retr_calls))

        # ③ 2사이클 — UIDL 캐시로 중복 0
        s_pop2 = col_p.run_cycle()
        second = FakePOP3.INSTANCES[1]
        check("2사이클 UIDL 캐시 중복 0(RETR 0회 · 저장 0 · 스킵 0)",
              len(second.retr_calls) == 0 and s_pop2["mails"] == 0
              and s_pop2["files"] == 0 and s_pop2["skipped"] == 0,
              "RETR %d · 메일 %d · 저장 %d" % (len(second.retr_calls), s_pop2["mails"],
                                              s_pop2["files"]))
        cached = core.load_uidl_cache(os.path.join(tmp, "pop_uidl_pop.json"))
        acct = core.account_key(_pop_cfg(root_pop, tmp))
        check("UIDL 캐시 12건 저장", len(cached["accounts"].get(acct, {})) == 12,
              "%d건 / 계정열쇠 %s" % (len(cached["accounts"].get(acct, {})), acct))

        # ④ 새 계정 캐시가 새로 만들어진 콜렉터에서도 유지되는지(파일 기반)
        col_p3 = _make_collector(_pop_cfg(root_pop, tmp), tmp, "pop")
        s_pop3 = col_p3.run_cycle()
        check("수집기를 새로 띄워도 다시 받지 않음",
              len(FakePOP3.INSTANCES[2].retr_calls) == 0 and s_pop3["mails"] == 0)

        check("DELE 호출 0(서버 메일 보존)", FakePOP3.DELE_CALLS == [], str(FakePOP3.DELE_CALLS))
        check("QUIT 로 정상 종료", all(i.quit_called for i in FakePOP3.INSTANCES))

        # ⑤ 서버에서 사라진 메일은 캐시에서도 정리
        _reset_pop(msgs[:3])
        col_p4 = _make_collector(_pop_cfg(root_pop, tmp), tmp, "pop")
        col_p4.run_cycle()
        cached2 = core.load_uidl_cache(os.path.join(tmp, "pop_uidl_pop.json"))
        check("서버에서 사라진 UIDL 은 캐시에서 정리(무한 증가 방지)",
              len(cached2["accounts"].get(acct, {})) == 3,
              "%d건" % len(cached2["accounts"].get(acct, {})))

        # ⑥ 연결 테스트 — 로그인 + STAT + 최근 3건 제목
        _reset_pop(msgs)
        ok, msg = core.test_pop3(_pop_cfg(root_pop, tmp), pop_factory=FakePOP3)
        titles_ok = msg.count("\n  · ") == 3 and "메일 12통" in msg
        check("연결 테스트(POP3) — 로그인+STAT+최근 3건 제목", ok and titles_ok,
              msg.replace("\n", " | ")[:110])
        ok_bad, msg_bad = core.test_pop3(dict(_pop_cfg(root_pop, tmp), password=""),
                                         pop_factory=FakePOP3)
        check("연결 테스트 실패는 사유를 돌려준다", not ok_bad and "POP3 접속 실패" in msg_bad,
              msg_bad[:60])

        ok_disp, _m = core.test_mail(_pop_cfg(root_pop, tmp), pop_factory=FakePOP3)
        check("test_mail 이 protocol 에 맞는 경로를 고른다", ok_disp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 8) collect_days 경계 · UIDL/TOP 폴백 ──────────────────────

def _rfc_date(days_ago):
    when = datetime.datetime.now(datetime.timezone.utc).astimezone() - \
        datetime.timedelta(days=days_ago)
    return email.utils.format_datetime(when)


def test_pop3_edges():
    print("\n[8] collect_days 경계 · UIDL 미지원 폴백")
    tmp = tempfile.mkdtemp(prefix="mailpilot_pop_edge_")
    try:
        fresh = build_eml("SAWASDEE DENIZ 2608S ACTUAL BAPLIE", ["SWDN_2608S_ACTUAL_BAPLIE.edi"],
                          date=_rfc_date(1))
        old = build_eml("ATLANTIC PARIS 2625E CNTR LIST 최종", ["ATPR 2625E CNTR LIST.xlsx"],
                        date=_rfc_date(8))
        _reset_pop([fresh, old])
        root = os.path.join(tmp, "MB")
        col = _make_collector(_pop_cfg(root, tmp, days=7), tmp, "edge")
        s1 = col.run_cycle()
        check("8일 전 메일은 내려받지 않는다(collect_days 7)",
              s1["mails"] == 1 and s1["old_skipped"] == 1
              and len(FakePOP3.INSTANCES[0].retr_calls) == 1,
              "메일 %d · 오래됨 %d · RETR %d"
              % (s1["mails"], s1["old_skipped"], len(FakePOP3.INSTANCES[0].retr_calls)))
        check("경계 안 메일만 적재",
              os.path.exists(os.path.join(root, "SWDN", "2608S", "SWDN_2608S_ACTUAL_BAPLIE.edi"))
              and not os.path.exists(os.path.join(root, "ATPR")))
        acct = core.account_key(_pop_cfg(root, tmp))
        cached = core.load_uidl_cache(os.path.join(tmp, "pop_uidl_edge.json"))
        check("스킵한 오래된 메일도 캐시에 기록(재RETR 방지)",
              len(cached["accounts"].get(acct, {})) == 2,
              "%d건" % len(cached["accounts"].get(acct, {})))
        col.run_cycle()
        check("2사이클에 오래된 메일 TOP·RETR 재요청 없음",
              len(FakePOP3.INSTANCES[1].retr_calls) == 0
              and len(FakePOP3.INSTANCES[1].top_calls) == 0,
              "RETR %d · TOP %d" % (len(FakePOP3.INSTANCES[1].retr_calls),
                                    len(FakePOP3.INSTANCES[1].top_calls)))

        # UIDL 미지원 — Message-ID 해시 / 없으면 헤더 해시로 대신한다
        with_id = build_eml("STAR MAJESTY 2643E & 2644W PTK TALLY REPORT",
                            ["STMJ 2643E&2644W PTK TALLY REPORT.xlsx"],
                            msgid="<abc-1@test.local>")
        no_id = build_eml("TIANJIN PEARL V.26355W BAPLIE 송부",
                          ["TNJP_26355W_ACTUAL_BAPLIE.edi"])
        _reset_pop([with_id, no_id], uidl=False)
        root2 = os.path.join(tmp, "MB2")
        col2 = _make_collector(_pop_cfg(root2, tmp), tmp, "nouidl")
        s2 = col2.run_cycle()
        keys = sorted(core.load_uidl_cache(
            os.path.join(tmp, "pop_uidl_nouidl.json"))["accounts"].get(
                core.account_key(_pop_cfg(root2, tmp)), {}))
        check("UIDL 미지원 서버도 2통 모두 적재", s2["mails"] == 2 and s2["files"] == 2,
              "메일 %d · 저장 %d" % (s2["mails"], s2["files"]))
        check("Message-ID 해시(m:) + 헤더 해시(h:) 로 열쇠 생성",
              any(k.startswith("m:") for k in keys) and any(k.startswith("h:") for k in keys),
              ", ".join(k[:10] for k in keys))
        col2.run_cycle()
        check("UIDL 미지원 서버에서도 2사이클 중복 0",
              len(FakePOP3.INSTANCES[1].retr_calls) == 0)

        # TOP 미지원 — 날짜로 거르지 못해도 조용히 죽지 않고 전부 받아 온다
        _reset_pop([with_id, no_id], uidl=True, top=False)
        root3 = os.path.join(tmp, "MB3")
        col3 = _make_collector(_pop_cfg(root3, tmp), tmp, "notop")
        s3 = col3.run_cycle()
        check("TOP 미지원 서버에서도 수집 계속(오류 0)",
              s3["mails"] == 2 and s3["errors"] == 0,
              "메일 %d · 오류 %d" % (s3["mails"], s3["errors"]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 9) 설정 도우미 · 프리셋 전환 ──────────────────────

def test_config_and_presets():
    print("\n[9] 설정 도우미(0.1 호환) · 프리셋 전환 · protocol 저장/로드")
    whois = core.PRESETS["whois"]
    check("후이즈/회사메일 프리셋 = POP3 995 SSL",
          whois["protocol"] == "pop3" and whois["host"] == "pop.whoisworks.com"
          and whois["port"] == 995 and whois["ssl"] is True,
          "%s %s:%s" % (whois["protocol"], whois["host"], whois["port"]))
    check("기본 선택이 후이즈/회사메일",
          core.PRESET_ORDER[0] == "whois" and core.DEFAULT_CONFIG["provider"] == "whois")
    check("후이즈 안내문에 POP3 사용함·아이디 전체·웹메일 비밀번호",
          all(k in whois["help"] for k in ("POP3", "메일주소 전체", "웹메일 로그인 비밀번호")))
    check("네이버·한메일·지메일은 IMAP 유지",
          all(core.PRESETS[k]["protocol"] == "imap" for k in ("naver", "daum", "gmail"))
          and core.PRESETS["naver"]["host"] == "imap.naver.com")
    check("gui/mailpilot 공용 PRESETS(중복 정의 없음)",
          core.IMAP_PRESETS is core.PRESETS)

    legacy = {"provider": "naver", "imap_host": "imap.naver.com", "imap_port": 993,
              "email": "a@naver.com", "password": "pw"}
    check("0.1 설정(imap_host/imap_port)도 그대로 읽는다",
          core.cfg_protocol(legacy) == "imap" and core.cfg_host(legacy) == "imap.naver.com"
          and core.cfg_port(legacy) == 993 and core.cfg_ssl(legacy) is True)
    bare = {"provider": "whois", "email": "office@greenmarine.co.kr"}
    check("프리셋만 있어도 서버·포트·방식을 채운다",
          core.cfg_protocol(bare) == "pop3" and core.cfg_host(bare) == "pop.whoisworks.com"
          and core.cfg_port(bare) == 995)
    check("계정별 UIDL 캐시 열쇠 분리",
          core.account_key(bare) != core.account_key(dict(bare, email="other@x")))

    tmp = tempfile.mkdtemp(prefix="mailpilot_cfg_")
    cfg_path = os.path.join(tmp, "config.json")
    try:
        import gui                                    # 6)에서 가짜 tkinter 가 이미 설치돼 있다
        app = gui.MailPilotGUI(config_path=cfg_path)
        check("설정 없는 첫 실행 = 후이즈/회사메일 자동 선택",
              app.var_provider.get() == "후이즈/회사메일"
              and app.var_protocol.get() == "pop3"
              and app.var_host.get() == "pop.whoisworks.com"
              and app.var_port.get() == "995" and app.var_ssl.get() is True,
              "%s %s:%s" % (app.var_protocol.get(), app.var_host.get(), app.var_port.get()))

        app.var_provider.set("네이버 메일")
        app.on_provider_change()
        check("프리셋 전환 → IMAP 993 자동",
              app.var_protocol.get() == "imap" and app.var_host.get() == "imap.naver.com"
              and app.var_port.get() == "993",
              "%s %s:%s" % (app.var_protocol.get(), app.var_host.get(), app.var_port.get()))

        app.var_provider.set("후이즈/회사메일")
        app.on_provider_change()
        check("되돌리면 POP3 995 로 복귀",
              app.var_protocol.get() == "pop3" and app.var_port.get() == "995")

        app.var_provider.set("직접 입력")
        app.on_provider_change()
        app.var_protocol.set("pop3")
        app.on_protocol_change()
        check("직접입력에서 방식 바꾸면 표준 포트 따라감(993→995)",
              app.var_port.get() == "995", app.var_port.get())
        app.var_host.set("mail.example.co.kr")

        app.var_email.set("office@greenmarine.co.kr")
        app.var_password.set("web-login-pw")
        app.var_root.set(tmp)
        cfg = app.collect_config()
        check("collect_config 에 protocol/host/port/ssl + 0.1 거울값",
              cfg["protocol"] == "pop3" and cfg["host"] == "mail.example.co.kr"
              and cfg["port"] == 995 and cfg["ssl"] is True
              and cfg["imap_host"] == cfg["host"] and cfg["imap_port"] == cfg["port"],
              json.dumps({k: cfg[k] for k in ("provider", "protocol", "host", "port", "ssl")},
                         ensure_ascii=False))
        app.on_save()
        loaded = core.load_config(cfg_path)
        check("config protocol 저장/로드",
              loaded["protocol"] == "pop3" and core.cfg_protocol(loaded) == "pop3"
              and core.cfg_port(loaded) == 995)
    except Exception as exc:
        check("프리셋 전환 GUI", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 10) 0.3 — 검수 대상 체크 · _기타 적재 · 폴더 정리 ──────────────────────

# 오늘 실제로 판독된 제목(코드 TAPN) — 게이트 시험용 픽스처
S_TAPN = "XIN TAI PING V-0535E Container Discharging List (In Bound)"
F_TAPN = ["XINTAIPING_0535E.edi"]


class FakeFirebase:
    """register_vessel/heartbeat/collect_log 호출을 잡아 두는 대역(네트워크 없음)."""

    enabled = True

    def __init__(self):
        self.vessels = []
        self.beats = []
        self.logs = []

    def register_vessel(self, code, name, last_mail_at=None, tally=None):
        self.vessels.append({"code": code, "name": name, "at": last_mail_at, "tally": tally})
        return {"ok": True}

    def heartbeat(self, mails, files, skipped):
        self.beats.append((mails, files, skipped))
        return {"ok": True}

    def write_collect_log(self, summary):
        self.logs.append(summary)
        return {"ok": True}


def _tally_collector(tmp, root, tag, cache=None, firebase=None):
    cfg = {"provider": "custom", "protocol": "imap", "host": "imap.test.local", "port": 993,
           "ssl": True, "email": "u@test", "password": "pw", "mailbox_root": root,
           "collect_days": 7, "poll_minutes": 10, "firebase": {}}
    col = core.Collector(cfg, imap_factory=FakeIMAP, firebase=firebase,
                         cache_path=os.path.join(tmp, "vessels_%s.json" % tag),
                         log_dir=os.path.join(tmp, "logs"))
    if firebase is None:
        col.firebase = core.FirebaseREST({})
    if cache is not None:
        col.cache = cache
    return col


def test_tally_gate():
    print("\n[10] 검수 대상 체크 — 기본 회귀 · _기타 게이트")
    # S1) tally 키가 아예 없는 0.2 캐시 → 0.2 와 똑같이 {코드}/{항차} 로 적재
    check("tally 기록 없으면 기본 True(검수 대상)",
          core.tally_enabled({"names": {}, "codes": {}}, "TAPN") is True)
    tmp = tempfile.mkdtemp(prefix="mailpilot_tally_")
    try:
        FakeIMAP.MESSAGES = [build_eml(S_TAPN, F_TAPN)]
        root1 = os.path.join(tmp, "MB_BASE")
        legacy = {"names": {}, "codes": {}}                # 0.2 캐시(그대로)
        col1 = _tally_collector(tmp, root1, "base", cache=legacy)
        s1 = col1.run_cycle()
        base_path = os.path.join(root1, "TAPN", "0535E", "XINTAIPING_0535E.edi")
        check("S1 회귀 — 0.2 캐시(tally 없음)는 {코드}/{항차} 그대로",
              os.path.exists(base_path) and s1["files"] == 1
              and not os.path.exists(os.path.join(root1, core.OTHER_DIR)),
              os.path.relpath(base_path, root1).replace("\\", "/"))

        # S2) 체크를 끄면 _기타/{코드}/{항차} 로 — 발견 기록·파이어베이스 등록은 그대로
        FakeIMAP.MESSAGES = [build_eml(S_TAPN, F_TAPN)]
        root2 = os.path.join(tmp, "MB_OFF")
        cache = {"names": {"TAI PING": "TAPN"}, "codes": {"TAPN": "TAI PING"}}
        core.set_tally(cache, "TAPN", False)
        fake_fb = FakeFirebase()
        col2 = _tally_collector(tmp, root2, "off", cache=cache, firebase=fake_fb)
        s2 = col2.run_cycle()
        off_path = os.path.join(root2, core.OTHER_DIR, "TAPN", "0535E", "XINTAIPING_0535E.edi")
        check("S2 게이트 — 체크 끈 선박은 _기타/{코드}/{항차} 로 적재",
              os.path.exists(off_path) and not os.path.exists(os.path.join(root2, "TAPN")),
              os.path.relpath(off_path, root2).replace("\\", "/"))
        check("S2 — 미분류로 새지 않는다(파일 1건 저장·미분류 0)",
              s2["files"] == 1 and s2["unclassified"] == 0,
              "저장 %d · 미분류 %d" % (s2["files"], s2["unclassified"]))
        check("S2 — 발견 기록(summary.vessels)은 체크와 무관하게 남는다",
              s2["vessels"] == [{"code": "TAPN", "name": "TAI PING", "voyage": "0535E"}],
              json.dumps(s2["vessels"], ensure_ascii=False))
        check("S2 — register_vessel 이 tally=False 로 호출된다",
              len(fake_fb.vessels) == 1 and fake_fb.vessels[0]["code"] == "TAPN"
              and fake_fb.vessels[0]["tally"] is False,
              json.dumps(fake_fb.vessels, ensure_ascii=False))

        # 다시 켜면 원래 자리로
        FakeIMAP.MESSAGES = [build_eml(S_TAPN, F_TAPN)]
        root3 = os.path.join(tmp, "MB_ON")
        core.set_tally(cache, "TAPN", True)
        fb2 = FakeFirebase()
        col3 = _tally_collector(tmp, root3, "on", cache=cache, firebase=fb2)
        col3.run_cycle()
        check("체크를 다시 켜면 {코드}/{항차} 로 복귀 · tally=True 등록",
              os.path.exists(os.path.join(root3, "TAPN", "0535E", "XINTAIPING_0535E.edi"))
              and fb2.vessels[0]["tally"] is True)

        # register_vessel 하위호환 — tally 를 안 주면 payload 에 넣지 않는다
        calls = []
        original = core.http_request

        def fake_http(url, method="GET", payload=None, timeout=core.HTTP_TIMEOUT):
            calls.append({"url": url, "method": method, "payload": payload})
            if "identitytoolkit" in url:
                return {"idToken": "T", "expiresIn": "3600"}
            return None if method == "GET" else {"ok": True}

        core.http_request = fake_http
        try:
            fb3 = core.FirebaseREST({"apiKey": "K", "databaseURL": "https://d.firebaseio.com"})
            fb3.register_vessel("TAPN", "TAI PING")                    # 0.2 호출 방식
            fb3.register_vessel("SWSP", "SAWASDEE SPICA", None, False)  # 위치 인자로도 받는다
        finally:
            core.http_request = original
        patches = [c for c in calls if c["method"] == "PATCH"]
        check("register_vessel 하위호환 — tally 미지정이면 payload 에 없음",
              "tally" not in patches[0]["payload"] and patches[1]["payload"]["tally"] is False,
              json.dumps([p["payload"] for p in patches], ensure_ascii=False))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 11) 폴더 정리(왕복 이동 · 충돌 보존) ──────────────────────

def _touch(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("x")


def _all_files(root):
    return sorted(os.path.relpath(os.path.join(b, f), root).replace("\\", "/")
                  for b, _d, files in os.walk(root) for f in files)


def test_organize_folders():
    print("\n[11] 폴더 정리 — 체크 상태에 맞춰 왕복(삭제·덮어쓰기 없음)")
    tmp = tempfile.mkdtemp(prefix="mailpilot_org_")
    root = os.path.join(tmp, "MAILBOX")
    try:
        _touch(os.path.join(root, "TAPN", "0535E", "a.txt"))
        _touch(os.path.join(root, "TAPN", "0536E", "a2.txt"))
        _touch(os.path.join(root, "SWS2", "2606N", "b.txt"))
        _touch(os.path.join(root, core.OTHER_DIR, "DJCT", "0221E", "c.txt"))
        _touch(os.path.join(root, core.OTHER_DIR, "TAPN", "0535E", "old.txt"))  # 충돌 유발
        os.makedirs(os.path.join(root, core.UNCLASSIFIED_DIR, "x"), exist_ok=True)
        os.makedirs(os.path.join(root, "UNKNOWN"), exist_ok=True)
        before = _all_files(root)

        cache = {"names": {"TAI PING": "TAPN", "SAWASDEE SPICA": "SWS2",
                           "DONGJIN CITY": "DJCT"},
                 "codes": {"TAPN": "TAI PING", "SWS2": "SAWASDEE SPICA",
                           "DJCT": "DONGJIN CITY"},
                 "tally": {"TAPN": False, "DJCT": True}}
        moved, skipped = core.organize_folders(root, cache)
        after = _all_files(root)
        print("    이동: %s" % [(os.path.relpath(s, root).replace("\\", "/"),
                                 os.path.relpath(d, root).replace("\\", "/"))
                                for s, d in moved])
        print("    건너뜀: %s" % [os.path.relpath(s, root).replace("\\", "/")
                                  for s, _d in skipped])
        print("    정리 후 파일: %s" % after)

        check("체크 끈 선박(TAPN) 항차가 _기타 로 이동",
              os.path.exists(os.path.join(root, core.OTHER_DIR, "TAPN", "0536E", "a2.txt")))
        check("_기타 의 체크 켠 선박(DJCT)이 루트로 복귀",
              os.path.exists(os.path.join(root, "DJCT", "0221E", "c.txt"))
              and not os.path.exists(os.path.join(root, core.OTHER_DIR, "DJCT")))
        check("충돌 항차는 건너뛰고 양쪽 원본 보존(덮어쓰기 없음)",
              len(skipped) == 1
              and os.path.exists(os.path.join(root, "TAPN", "0535E", "a.txt"))
              and os.path.exists(os.path.join(root, core.OTHER_DIR, "TAPN", "0535E", "old.txt")),
              "건너뜀 %d건" % len(skipped))
        check("체크 기록 없는 선박(SWS2)은 무접촉",
              os.path.exists(os.path.join(root, "SWS2", "2606N", "b.txt")))
        check("_미분류·모르는 폴더는 무접촉",
              os.path.isdir(os.path.join(root, core.UNCLASSIFIED_DIR, "x"))
              and os.path.isdir(os.path.join(root, "UNKNOWN")))
        check("파일은 하나도 지워지지 않는다(개수 동일)",
              len(before) == len(after) == 5, "정리 전 %d · 후 %d" % (len(before), len(after)))
        check("이동 2건(TAPN/0536E · _기타/DJCT)", len(moved) == 2, "%d건" % len(moved))

        # 두 번 눌러도 안전(멱등) — 남은 것은 충돌 항차뿐
        moved2, skipped2 = core.organize_folders(root, cache)
        check("한 번 더 눌러도 안전(추가 이동 없음 · 파일 그대로)",
              moved2 == [] and len(skipped2) == 1 and _all_files(root) == after,
              "이동 %d · 건너뜀 %d" % (len(moved2), len(skipped2)))
        check("메일박스 폴더가 없으면 조용히 죽지 않고 빈 결과",
              core.organize_folders(os.path.join(tmp, "없는폴더"), cache) == ([], []))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 12) GUI — 조건 문구 · 체크 토글 ──────────────────────

class _StubCollector:
    """수집 중 토글 시 캐시가 갈렸을 때의 안전장치를 확인하기 위한 대역."""

    def __init__(self, cache):
        self.cache = cache
        self.running = True


def test_gui_tally():
    print("\n[12] GUI — 수집 조건 문구 · 선박 체크 토글")
    try:
        import tkinter  # noqa: F401
    except ImportError:
        _install_fake_tkinter()
    tmp = tempfile.mkdtemp(prefix="mailpilot_gui_tally_")
    cfg_path = os.path.join(tmp, "config.json")
    cache_path = os.path.join(tmp, "vessels_cache.json")
    try:
        core.save_cache({"names": {"TAI PING": "TAPN", "SAWASDEE SPICA": "SWSP"},
                         "codes": {"TAPN": "TAI PING", "SWSP": "SAWASDEE SPICA"}},
                        cache_path)
        import gui
        app = gui.MailPilotGUI(config_path=cfg_path, cache_path=cache_path)

        app.var_days.set("3")
        app.var_poll.set("15")
        want = ("지금 조건: 최근 3일 · 15분 주기 · 첨부(EDI·ASC·TXT·XLS·XLSX·PDF) 있는 메일만 · "
                "판독 실패는 _미분류 보존 · 서버 원본은 지우지 않습니다.")
        check("수집 조건 문구(정본)", app.condition_text() == want, app.condition_text())
        check("최근 며칠·주기를 고치면 화면 문구가 바로 따라온다",
              app.var_condition.get() == want, app.var_condition.get()[:40])

        check("발견된 선박이 코드순으로 체크박스로 뜬다",
              sorted(app.tally_vars) == ["SWSP", "TAPN"], ", ".join(sorted(app.tally_vars)))
        check("처음엔 전부 체크(기본 = 검수 대상)",
              all(v.get() for v in app.tally_vars.values()))

        app.tally_vars["TAPN"].set(False)
        app.on_toggle_tally("TAPN")
        saved = core.load_cache(cache_path)
        check("체크 끄면 캐시에 즉시 저장(tally False)",
              saved.get("tally", {}).get("TAPN") is False
              and core.tally_enabled(saved, "SWSP") is True,
              json.dumps(saved.get("tally", {}), ensure_ascii=False))
        check("끈 선박은 게이트에서도 _기타 행",
              core.tally_enabled(app.cache, "TAPN") is False)

        stub_cache = {"names": {}, "codes": {}}
        app.collector = _StubCollector(stub_cache)
        app.tally_vars["SWSP"].set(False)
        app.on_toggle_tally("SWSP")
        check("수집 중 토글해도 Collector 캐시에 반영",
              core.tally_enabled(stub_cache, "SWSP") is False)
        app.collector = None

        app.on_refresh_vessels()
        check("새로고침해도 캐시 딕셔너리는 같은 객체(공유 유지)",
              app.cache is not None and core.tally_enabled(app.cache, "TAPN") is False
              and sorted(app.tally_vars) == ["SWSP", "TAPN"])

        check("확인창 문구에 어디로 가는지 적혀 있다",
              "_기타" in app.organize_message() and "TAPN" in app.organize_message()
              and "지우거나 덮어쓰지 않습니다" in app.organize_message(),
              app.organize_message().splitlines()[0])

        app.var_root.set(os.path.join(tmp, "MB"))
        os.makedirs(os.path.join(tmp, "MB", "TAPN", "0535E"), exist_ok=True)
        check("확인창에서 '아니오'면 아무것도 옮기지 않는다",
              app.on_organize() is None
              and os.path.isdir(os.path.join(tmp, "MB", "TAPN", "0535E")))

        import tkinter.messagebox as mbox
        yes_before = mbox.askyesno
        mbox.askyesno = lambda *a, **k: True
        try:
            thread = app.on_organize()
            if thread is not None and hasattr(thread, "join"):
                thread.join(10)
        finally:
            mbox.askyesno = yes_before
        check("'예'를 누르면 실제로 _기타 로 옮긴다",
              os.path.isdir(os.path.join(tmp, "MB", core.OTHER_DIR, "TAPN", "0535E")),
              ", ".join(sorted(os.listdir(os.path.join(tmp, "MB")))))
    except Exception as exc:
        check("GUI 체크리스트", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _widget_state(widget):
    """가짜 위젯은 configure 로 받은 값을, 진짜 tkinter 위젯은 cget 으로 읽는다."""
    kwargs = getattr(widget, "kwargs", None)
    if isinstance(kwargs, dict) and "state" in kwargs:
        return str(kwargs["state"])
    try:
        return str(widget.cget("state"))
    except Exception:
        return None


# ────────────────────── 13) 폴더 정리 — 껍데기만 남은 폴더 치우기 ──────────────────────

def test_organize_empty_cleanup():
    print("\n[13] 폴더 정리 — 항차를 다 옮긴 빈 폴더는 치운다(파일은 하나도 안 지운다)")
    tmp = tempfile.mkdtemp(prefix="mailpilot_org2_")
    root = os.path.join(tmp, "MAILBOX")
    try:
        # 대상 자리에 같은 코드 폴더가 이미 있어야 '항차 단위 이동' 경로를 탄다
        _touch(os.path.join(root, "HTPN", "0101E", "a.txt"))
        _touch(os.path.join(root, core.OTHER_DIR, "HTPN", "0202E", "b.txt"))
        # 충돌로 항차가 남는 쪽 — 폴더가 그대로 있어야 한다
        _touch(os.path.join(root, "KEEP", "0303E", "c.txt"))
        _touch(os.path.join(root, core.OTHER_DIR, "KEEP", "0303E", "old.txt"))
        before = _all_files(root)

        cache = {"codes": {"HTPN": "HAI TAI PING", "KEEP": "KEEP SHIP"},
                 "tally": {"HTPN": False, "KEEP": False}}
        moved, skipped = core.organize_folders(root, cache)
        after = _all_files(root)
        print("    정리 후 파일: %s" % after)

        check("항차를 다 옮긴 코드 폴더는 사라진다(빈 폴더만 rmdir)",
              not os.path.exists(os.path.join(root, "HTPN")),
              ", ".join(sorted(os.listdir(root))))
        check("옮긴 항차는 _기타 밑에 그대로 있다",
              os.path.exists(os.path.join(root, core.OTHER_DIR, "HTPN", "0101E", "a.txt"))
              and os.path.exists(os.path.join(root, core.OTHER_DIR, "HTPN", "0202E", "b.txt")))
        check("충돌로 항차가 남은 폴더는 지우지 않는다",
              os.path.isdir(os.path.join(root, "KEEP", "0303E"))
              and len(skipped) == 1, "건너뜀 %d건" % len(skipped))
        check("빈 폴더를 치워도 파일 개수는 그대로",
              len(before) == len(after) == 4, "정리 전 %d · 후 %d" % (len(before), len(after)))
        check("이동 1건(HTPN/0101E)", len(moved) == 1, "%d건" % len(moved))

        moved2, skipped2 = core.organize_folders(root, cache)
        check("한 번 더 눌러도 안전(추가 이동 없음 · 파일 그대로)",
              moved2 == [] and len(skipped2) == 1 and _all_files(root) == after,
              "이동 %d · 건너뜀 %d" % (len(moved2), len(skipped2)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 14) GUI — 수집 중 잠금 · 무인 자동 시작 ──────────────────────

def test_gui_lock_and_autostart():
    print("\n[14] GUI — 수집 중 [폴더 정리] 잠금 · --autostart 무인 시작")
    try:
        import tkinter  # noqa: F401
    except ImportError:
        _install_fake_tkinter()
    tmp = tempfile.mkdtemp(prefix="mailpilot_auto_")
    cfg_path = os.path.join(tmp, "config.json")
    cache_path = os.path.join(tmp, "vessels_cache.json")
    try:
        import gui
        app = gui.MailPilotGUI(config_path=cfg_path, cache_path=cache_path)

        # ① 수집 중 [폴더 정리] 잠금
        check("[폴더 정리] 버튼을 잡고 있다(상태를 바꿀 수 있다)",
              getattr(app, "btn_organize", None) is not None)
        app._set_running_ui(True)
        check("수집을 시작하면 [폴더 정리]가 잠긴다",
              _widget_state(app.btn_organize) == "disabled", str(_widget_state(app.btn_organize)))
        check("수집 중에는 버튼 글자가 '수집 중지'",
              app.btn_run.kwargs.get("text", "수집 중지") == "수집 중지")
        app._set_running_ui(False)
        check("수집을 멈추면 [폴더 정리]가 풀린다",
              _widget_state(app.btn_organize) == "normal", str(_widget_state(app.btn_organize)))

        # ② 설정이 모자라면 자동 시작하지 않는다
        check("설정이 비면 자동 시작하지 않는다(로그만 남긴다)",
              app.request_autostart() is False, ", ".join(app.missing_fields()) or "(없음)")

        # ③ 설정이 갖춰지면 mainloop 진입 후로 예약한다
        app.var_email.set("me@example.com")
        app.var_password.set("pw")
        app.var_root.set(tmp)
        check("이메일·비밀번호·메일박스가 다 차면 빠진 항목 없음", app.missing_fields() == [])
        scheduled = []

        def _fake_after(ms, fn=None, *a):
            scheduled.append((ms, fn))
            return "after#auto"

        app.master.after = _fake_after
        ok_sched = app.request_autostart(delay_ms=123)
        check("설정이 갖춰지면 창이 뜬 뒤로 자동 시작을 예약한다",
              ok_sched is True and len(scheduled) == 1 and scheduled[0][0] == 123
              and scheduled[0][1] == app._autostart_now,
              "예약 %d건" % len(scheduled))

        # ④ 예약된 콜백은 on_toggle_run 을 그대로 쓴다(진짜 수집기는 띄우지 않는다)
        calls = []
        app.on_toggle_run = lambda: calls.append("run")
        check("예약 콜백이 수집 시작(on_toggle_run)을 부른다",
              app._autostart_now() is True and calls == ["run"], "호출 %d회" % len(calls))
        app.collector = _StubCollector({"names": {}, "codes": {}})
        check("이미 수집 중이면 두 번 시작하지 않는다",
              app._autostart_now() is False and calls == ["run"], "호출 %d회" % len(calls))
        app.collector = None

        # ⑤ 무인 저장 — 확인창이 뜨면 재시작이 멈춘다
        import tkinter.messagebox as mbox
        shown = []
        info_before = mbox.showinfo
        mbox.showinfo = lambda *a, **k: shown.append(a)
        try:
            quiet = app.on_save(announce=False)
            loud = app.on_save()
        finally:
            mbox.showinfo = info_before
        check("무인 저장은 확인창을 띄우지 않는다(사람 손 없이 재시작)",
              quiet is not None and loud is not None and len(shown) == 1,
              "확인창 %d회" % len(shown))
        check("무인 저장도 config.json 은 남긴다",
              os.path.exists(cfg_path)
              and core.load_config(cfg_path)["email"] == "me@example.com")
    except Exception as exc:
        check("GUI 잠금·자동 시작", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 15) 버전 라벨 · 실행 배치 ──────────────────────

def test_version_labels():
    print("\n[15] 버전 라벨 · run_mailpilot.bat")
    version = core.VERSION.split()[-1]
    bat_path = os.path.join(PKG, "run_mailpilot.bat")
    readme_path = os.path.join(PKG, "README.md")
    try:
        with open(bat_path, "r", encoding="utf-8", errors="replace") as fh:
            bat = fh.read()
        with open(readme_path, "r", encoding="utf-8") as fh:
            readme = fh.read()
    except OSError as exc:
        check("버전 라벨 파일 읽기", False, str(exc))
        return
    check("run_mailpilot.bat 이 gui 에 --autostart 를 넘긴다",
          "--autostart" in bat and "gui.py" in bat)
    check("run_mailpilot.bat 머리글 버전 = %s" % version,
          ("MailPilot Uni %s" % version) in bat)
    check("README 머리글 버전 = %s" % version,
          ("# 메일파일럿 Uni %s" % version) in readme)
    check("README·bat 에 옛 버전(0.2) 표기가 남아 있지 않다",
          "0.2" not in readme and "0.2" not in bat)


def main():
    print("=" * 60)
    print("메일파일럿 Uni 테스트 — %s (python %s)"
          % (core.VERSION, sys.version.split()[0]))
    print("=" * 60)
    test_read_table()
    test_code_stability()
    test_firebase_parser()
    test_collect_cycle()
    test_firebase_rest()
    test_gui_smoke()
    test_pop3_cycle()
    test_pop3_edges()
    test_config_and_presets()
    test_tally_gate()
    test_organize_folders()
    test_gui_tally()
    test_organize_empty_cleanup()
    test_gui_lock_and_autostart()
    test_version_labels()

    failed = [name for name, ok, _d in RESULTS if not ok]
    print("\n" + "=" * 60)
    print("결과: %d개 중 %d개 PASS" % (len(RESULTS), len(RESULTS) - len(failed)))
    if failed:
        print("실패: " + ", ".join(failed))
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
