# 메일파일럿 Uni 0.1 테스트 러너 — 실서버 없이(픽스처·목) 판독·수집·파이어베이스·GUI를 전부 확인한다.
"""실행: python mailpilot/tests/run_tests.py

  1) 판독 유닛테스트 — 실제 유형 제목 12종 → 선박/항차/코드 표
  2) 코드 안정성 — 같은 이름은 언제나 같은 코드, 충돌 시 숫자 부가
  3) firebaseConfig 관용 파서
  4) 가짜 IMAP 으로 수집 1사이클 — 폴더 구조·중복 스킵·미분류
  5) 파이어베이스 REST 목 — signUp → PATCH 순서·payload·auth 파라미터
  6) tkinter 가짜 모듈로 GUI 스모크(디스플레이 없이 생성·입력 수집 검증)
"""

import email.message
import io
import json
import os
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


def build_eml(subject, filenames, sender="ops@example.com", body=b"TEST-ATTACH-DATA"):
    """첨부가 든 .eml 원문(bytes) 생성."""
    msg = email.message.EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = "tally@example.com"
    msg["Date"] = "Tue, 04 Aug 2026 09:12:00 +0900"
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

        def get(self):
            return self._v

        def set(self, v):
            self._v = v

    class FakeWidget:
        def __init__(self, *args, **kwargs):
            self.kwargs = dict(kwargs)

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
    tk.Text = FakeText
    for const in ("END", "W", "E", "N", "S", "BOTH", "X", "Y", "LEFT", "RIGHT",
                  "TOP", "BOTTOM", "DISABLED", "NORMAL"):
        setattr(tk, const, const.lower())

    ttk = types.ModuleType("tkinter.ttk")
    for widget in ("Frame", "Label", "Entry", "Button", "Combobox",
                   "Scrollbar", "LabelFrame", "Notebook", "Checkbutton"):
        setattr(ttk, widget, FakeWidget)

    filedialog = types.ModuleType("tkinter.filedialog")
    filedialog.askdirectory = lambda **k: ""
    messagebox = types.ModuleType("tkinter.messagebox")
    messagebox.showinfo = lambda *a, **k: None
    messagebox.showwarning = lambda *a, **k: None
    messagebox.showerror = lambda *a, **k: None

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

    failed = [name for name, ok, _d in RESULTS if not ok]
    print("\n" + "=" * 60)
    print("결과: %d개 중 %d개 PASS" % (len(RESULTS), len(RESULTS) - len(failed)))
    if failed:
        print("실패: " + ", ".join(failed))
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
