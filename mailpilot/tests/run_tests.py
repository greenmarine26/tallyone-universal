# 메일파일럿 Uni 0.5 테스트 러너 — 실서버 없이(픽스처·목) 판독·수집·POP3·파이어베이스·GUI를 전부 확인한다.
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
 16) 로그 출력 안전 — cp949 파일/파이프 출력에서도 UnicodeEncodeError 로 죽지 않는다
 17) 선박 정본표 — 실제 미분류 제목이 정본 코드로 붙는지 · 별칭 오인 방지 · 마스터 없음 회귀
 18) 정본 이관 — 캐시 코드 갈아끼우기 · 폴더 병합(충돌 스킵) · 체크 이월 · 서버 노드 · 멱등
 19) GUI — 정본/미확인 행 표시 · [정본 연결…] 병합 · [항목 삭제] · [정본표 가져오기…]
 20) EDI 판독 모듈(edi_parser) — 종류 판별 4종 · 합성 최소 케이스 · 실파일 스냅샷
     (기대값 정본은 검수앱 src/utils.js parseBAPLIE·parseAscFile 를 node 로 돌린 결과)
 21) 앱 채우기(app_upload) — 홈포트·짝 증거·info 계약(신규 PUT/기존 PATCH)·방향필터·
     fail-open·전량제외 PUT 생략·좌표 보존·다수결 override·지문 멱등·null 부재
 22) 실파일 종단 — 미니 메일박스로 사이클 한 판 → 검수앱 항차·EDI 가 실제로 채워지는지
 23) 하트비트 — 앱 health.js 가 읽는 모양(at 은 ms 숫자, cycleMin)
 24) 0.5-01 항차 표기 정규화 — 0패딩 흔들림(0535E/535E) 병합·정본 선정·중복 키 정리·멱등
     (XTPG 실사례 그대로 · DJCT 0221E 무접촉 · R083W 접두 보호 · 검수 흔적 보류)
 25) 0.6 선석배정 게이트 — 두 터미널 실응답 픽스처 판독(짝·시각·상태·부두) · 요청 1회/터미널 ·
     등록 게이트(출항·비관할·DEP.TALLY·fail-open) · 배정표 짝 승격 · 갈라진 카드 병합 ·
     지난 항차 제거(검수 흔적 보류) · 배정표 못 받으면 무삭제 · 멱등
 26) 0.7 예정등록 — 배정표 줄로 카드를 미리 세운다: 세울 25장 정본 대조 · info PUT 계약 ·
     기존 키 재사용(표기 흔들림) · 제외(비관할·마감·출항·정본표 없음·체크 끔·설정 끔) ·
     expected→collecting 전이 · 출항 예정 카드 철수 · 창 밖 빈 예정 카드 제거 · 멱등(쓰기 0)
 27) 0.7-01 미분류 재판독 — 실제 _미분류 폴더 이름 픽스처로 제자리 이동 · 판독 실패 잔류 ·
     _기타(체크 끔) 무접촉 · 같은 크기 스킵 · 다른 크기 '(2)' · 항차 표기 승계 · 빈 폴더만 rmdir ·
     업로드 지문 무효화 범위 · 멱등
 28) 0.8 화면 개편 — 좌측 메뉴(여섯 절)·우측 수집 기록 골격 · 절 전환 · 기능 위젯 보존 ·
     [정본으로 승인](파일 추가·별칭 보존·중복 방지·확인창 '아니오') · 선석배정 상태 표시 ·
     --autostart 예약 경로 불변
 30) 0.9 리스트 자동 업로드(app_upload) — 개정 서열(최종>수정>n차>무표시) · 방향 판정
     (내용>파일명>건너뜀) · 보수 머지(기존 값 불변·빈칸만·새 컨 추가·무삭제·멱등) ·
     검수원 입력 보호(rfSet·sl 수정 위에 재업로드 → 전값 불변) · GET 실패 시 PUT 0 ·
     의존성 부재 시 건너뜀 · 실파일 종단(미니 메일박스 → records 가 JS 정답표와 일치)
 29) 0.9 리스트 엑셀 판독 모듈(list_parser) — 파일 종류 판정 · 표준/세관CDL/중국어/SOC 갈래 ·
     규격·풀공 판정표 · SheetJS 숫자 서식 재현 · 실파일 픽스처 8종 컨 단위 전 필드 스냅샷
     (기대값 정본은 검수앱 src/utils.js parseListExcel 을 node 로 돌린 결과)
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
import time
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
    """GUI 코드를 '창 없이' 생성만 검증하기 위한 대역 모듈.

    한 번만 깐다 — 두 번 깔면 gui.py 가 이미 붙들고 있는 모듈과 달라져서
    시험이 messagebox 를 바꿔치기해도 gui 쪽에 먹지 않는다.
    """
    already = sys.modules.get("tkinter")
    if getattr(already, "_mailpilot_fake", False):
        return already

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
    tk.TclError = type("TclError", (Exception,), {})   # 0.8 창 크기 잡기의 except 절이 쓴다
    tk.Tk = FakeTk
    tk.StringVar = FakeVar
    tk.IntVar = FakeVar
    tk.BooleanVar = FakeVar
    tk.Text = FakeText
    tk.Canvas = FakeWidget
    for const in ("END", "W", "E", "N", "S", "BOTH", "X", "Y", "LEFT", "RIGHT",
                  "TOP", "BOTTOM", "DISABLED", "NORMAL"):
        setattr(tk, const, const.lower())

    tk.Toplevel = FakeTk                             # 0.4 [정본 연결…] 작은 창

    ttk = types.ModuleType("tkinter.ttk")
    for widget in ("Frame", "Label", "Entry", "Button", "Combobox",
                   "Scrollbar", "LabelFrame", "Notebook", "Checkbutton", "Radiobutton"):
        setattr(ttk, widget, FakeWidget)

    filedialog = types.ModuleType("tkinter.filedialog")
    filedialog.askdirectory = lambda **k: ""
    filedialog.askopenfilename = lambda **k: ""      # 시험 중에는 파일 고르기 창을 띄우지 않는다
    messagebox = types.ModuleType("tkinter.messagebox")
    messagebox.showinfo = lambda *a, **k: None
    messagebox.showwarning = lambda *a, **k: None
    messagebox.showerror = lambda *a, **k: None
    messagebox.askyesno = lambda *a, **k: False       # 시험 중에 폴더를 건드리지 않는다(기본 '아니오')

    tk.ttk, tk.filedialog, tk.messagebox = ttk, filedialog, messagebox
    tk._mailpilot_fake = True                         # 두 번 깔지 않기 위한 표식
    sys.modules["tkinter"] = tk
    sys.modules["tkinter.ttk"] = ttk
    sys.modules["tkinter.filedialog"] = filedialog
    sys.modules["tkinter.messagebox"] = messagebox
    return tk


def test_gui_smoke():
    print("\n[6] GUI 스모크")
    # 시험은 언제나 가짜 tkinter 로 돈다 — 진짜 tkinter 가 있는 PC(윈도)에서 돌리면
    # 확인창·파일 고르기 창이 진짜로 떠서 무인 실행이 그 자리에 멈춘다.
    _install_fake_tkinter()

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

        # 0.6-01 회귀 — 화면에 칸이 없는 설정이 [설정 저장]에서 사라지면 안 된다.
        #   라이브 사고: config.json 에 berth_plan 이 없어 0.6 첫 기동이 배정표를 안 읽었다.
        check("저장해도 화면에 없는 설정이 살아 있다(berth_plan·excluded_routes·home_port_aliases)",
              cfg.get("berth_plan") is True
              and cfg.get("excluded_routes") == ["PXS", "PQS", "JWKP"]
              and cfg.get("home_port_aliases"),
              json.dumps({k: cfg.get(k) for k in
                          ("berth_plan", "excluded_routes", "home_port_aliases")},
                         ensure_ascii=False))
        app2 = gui.MailPilotGUI(config_path=cfg_path)
        app2.extra_cfg["excluded_routes"] = ["ZZZ"]
        check("사람이 손으로 고친 설정도 다시 저장할 때 지켜진다",
              app2.collect_config().get("excluded_routes") == ["ZZZ"])
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
    _install_fake_tkinter()                            # 진짜 창을 띄우지 않는다(무인 실행 안전)
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
    _install_fake_tkinter()                            # 진짜 창을 띄우지 않는다(무인 실행 안전)
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


# ────────────────────── 16) 로그 출력이 프로그램을 죽이지 않는다 ──────────────────────

def test_log_encoding_safety():
    print("\n[16] 로그 — cp949 로 못 쓰는 글자('—')가 있어도 죽지 않는다(무인 실행 보호)")
    tmp = tempfile.mkdtemp(prefix="mailpilot_log_")
    real_stdout = sys.stdout
    sink = io.TextIOWrapper(io.BytesIO(), encoding="cp949", newline="")   # 파일·파이프 출력 재현
    try:
        message = "수집을 시작합니다 — 버전 %s · 무인" % core.VERSION
        sys.stdout = sink
        try:
            line = core.log(message, tmp)
        finally:
            sys.stdout = real_stdout
        sink.flush()
        printed = sink.buffer.getvalue().decode("cp949", "replace")
        path = os.path.join(tmp, datetime.datetime.now().strftime("%Y%m%d") + ".txt")
        with open(path, "r", encoding="utf-8") as fh:
            saved = fh.read()
        check("cp949 출력이라도 예외를 던지지 않는다", line.endswith(message), line[-30:])
        check("로그 파일에는 원문 그대로 남는다(— 포함)", message in saved)
        check("화면에는 못 쓰는 글자만 바꿔서 찍는다",
              "수집을 시작합니다" in printed and len(printed.strip()) > 0,
              printed.strip()[:50])
    except Exception as exc:
        sys.stdout = real_stdout
        check("로그 인코딩 안전", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        sys.stdout = real_stdout
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 17) 선박 정본표 — 판독에 정본 우선 ──────────────────────

# 현장 정본표(37척)와 같은 모양의 시험용 정본표(실제 값 일부 + 이번 판에서 보강한 별칭)
MASTER_FIXTURE = [
    {"code": "OBWH", "name": "OCEAN BLUE WHALE", "aliases": ["OWBH"], "ko": ["연태훼리"]},
    {"code": "TNJP", "name": "TEN JUPITER", "aliases": ["LYTJ"], "ko": ["연운항훼리"]},
    {"code": "RZOR", "name": "RIZHAO ORIENT",
     "aliases": ["R063", "R064", "RD"], "ko": ["일조국제물류", "일조국제", "日照东方", "日照"]},
    {"code": "DXQD", "name": "XIN QUN DAO", "aliases": ["XINQUNDAO"], "ko": []},
    {"code": "XTPG", "name": "XIN TAI PING", "aliases": ["XTT", "JXTP", "XTP"], "ko": []},
    {"code": "SWSP", "name": "SAWASDEE SPICA", "aliases": [], "ko": []},
    {"code": "ATPR", "name": "ATLANTIC PIONEER", "aliases": ["ATRP"], "ko": []},
    {"code": "KSKM", "name": "SUNNY KALMIA", "aliases": [], "ko": []},
    {"code": "NSFR", "name": "STAR FRONTIER", "aliases": [], "ko": []},
]

# 오늘 실제로 _미분류 로 떨어졌던 제목들 — 정본표가 있으면 붙어야 한다
MASTER_CASES = [
    ("연태훼리 2706W CLL 3차 (VGM최종본/231VAN)", [], "OBWH", "2706W"),
    ("[연운항훼리] 26354W LOADING LIST - 최종리스트", [], "TNJP", "26354W"),
    ("일조국제물류) R083W CLL 송부 드립니다._최종", [], "RZOR", "R083W"),
    ("日照东方船图 R082E", [], "RZOR", "R082E"),
    ("M.V. XINQUNDAO V.2630W // DALIAN DISCH LIST(AFTER KRPTK)", [], "DXQD", "2630W"),
    ("XIN TAI PING V-0535E Container Discharging List (In Bound)", [], "XTPG", "0535E"),
    ("(SKR-PTK) SAWASDEE SPICA 2606N CONTAINER LOADING LIST", [], "SWSP", "2606N"),
    ("자료 송부드립니다", ["XTPG0535E_CDL.xlsx"], None, None),      # 항차 토큰이 없어 종전대로 미분류
]


def test_master_read():
    print("\n[17] 선박 정본표 — 정본이 자동 생성 코드보다 먼저")
    rows, ok_all = [], True
    for subject, files, want_code, want_voyage in MASTER_CASES:
        cache = {"names": {}, "codes": {}}
        target = core.read_mail_target(subject, files, cache, MASTER_FIXTURE)
        code = target["code"] if target["ok"] else None
        voyage = target["voyage"] if target["ok"] else None
        rows.append((subject, code, voyage, target["vessel"] or "-",
                     "적재" if target["ok"] else "미분류(%s)" % target["reason"]))
        good = (code == want_code) and (voyage == want_voyage)
        ok_all = ok_all and good
        if not good:
            print("    기대 %s/%s ≠ 실제 %s/%s :: %s" % (want_code, want_voyage, code, voyage, subject))
    print("\n    %-58s %-5s %-8s %-18s %s" % ("제목", "코드", "항차", "정식명", "결과"))
    print("    " + "-" * 108)
    for subject, code, voyage, vessel, verdict in rows:
        print("    %-58s %-5s %-8s %-18s %s"
              % (subject[:56], code or "-", voyage or "-", vessel, verdict))
    print("")
    check("정본표 판독 8종 기대값 일치", ok_all)

    # 한글 별칭은 괄호 마스킹 전 원문에서 봐야 한다([연운항훼리] 는 대괄호 안에 있다)
    hit = core.match_master("[연운항훼리] 26354W LOADING LIST", MASTER_FIXTURE)
    check("괄호 안 한글 별칭도 원문 그대로 읽는다", hit is not None and hit["code"] == "TNJP",
          (hit or {}).get("code", "없음"))

    # 별칭 오인 방지 — XTP 는 XTPG0535E 안에서 걸리면 안 되고, 코드 XTPG 로 붙어야 한다
    glued = core.match_master("XTPG0535E_CDL.xlsx", MASTER_FIXTURE)
    check("XTPG0535E 는 별칭 XTP 가 아니라 코드 XTPG 로 잡힌다",
          glued is not None and glued["code"] == "XTPG", (glued or {}).get("code", "없음"))
    check("별칭이 다른 낱말의 앞부분이면 안 잡힌다(XTPGOODS)",
          core.match_master("XTPGOODS 2601E LIST", MASTER_FIXTURE) is None)

    # 자동으로 뽑은 이름의 정본 귀속 — 'TAI PING' → XIN TAI PING · 'TNJP' → 코드 일치
    check("자동 이름 'TAI PING' 이 정본 XTPG 로 귀속",
          (core.master_code_for_name("TAI PING", MASTER_FIXTURE) or {}).get("code") == "XTPG")
    check("자동 이름이 코드와 같으면 그 정본(TNJP)",
          (core.master_code_for_name("TNJP", MASTER_FIXTURE) or {}).get("code") == "TNJP")
    check("정본에 없는 이름은 귀속하지 않는다(INC SKM)",
          core.master_code_for_name("INC SKM", MASTER_FIXTURE) is None)

    # 모호하면 합치지 않는다 — 서로 다른 정본이 같은 길이로 걸리면 실패 처리
    tie = [{"code": "AAAA", "name": "ALPHA", "aliases": [], "ko": []},
           {"code": "BBBB", "name": "BRAVO", "aliases": [], "ko": []}]
    check("서로 다른 정본이 동률이면 매칭 실패(모호 병합 금지)",
          core.match_master("ALPHA BRAVO 2601E LIST", tie) is None)

    # 0.6-02 — 검수사 확인으로 SWAL(SAWASDEE ALTAIR)을 정본표에 넣었다. 같은 SAWASDEE 계열인
    #   SWAT(ATLANTIC)와 섞이면 안 되고, 자동 코드로 캐시에 있던 배가 정본으로 승격돼야 한다.
    sawasdee = [{"code": "SWAT", "name": "SAWASDEE ATLANTIC", "aliases": [], "ko": []},
                {"code": "SWAL", "name": "SAWASDEE ALTAIR", "aliases": [], "ko": []}]
    check("SAWASDEE 계열 — ALTAIR 는 SWAL · ATLANTIC 은 SWAT(섞이지 않는다)",
          (core.match_master("SAWASDEE ALTAIR 2601E CLL", sawasdee) or {}).get("code") == "SWAL"
          and (core.match_master("SAWASDEE ATLANTIC 2601E CLL",
                                 sawasdee) or {}).get("code") == "SWAT")
    promoted = {"names": {"SAWASDEE ALTAIR": "SWAL"}, "codes": {"SWAL": "SAWASDEE ALTAIR"}}
    res_sw = core.migrate_to_master("", promoted, sawasdee)
    check("SWAL 승격 — 정본표에 있으면 미확인이 아니고 옮길 것도 없다(코드가 이미 정본)",
          not res_sw["unmatched"] and not res_sw["plan"]
          and promoted["codes"]["SWAL"] == "SAWASDEE ALTAIR",
          json.dumps(res_sw, ensure_ascii=False))
    check("SWAL 승격 — 정본표에 없으면 미확인으로 남는다(승격 전 상태)",
          core.migrate_to_master("", {"names": {"SAWASDEE ALTAIR": "SWAL"}, "codes": {}},
                                 [sawasdee[0]])["unmatched"] == [("SAWASDEE ALTAIR", "SWAL")])
    check("SWAL 승격 — 등록 게이트(정본표에 있는 선박만 올린다)를 통과한다",
          core.master_by_code(sawasdee, "SWAL") is not None
          and core.tally_enabled({"tally": {}}, "SWAL"))

    # 정본에 걸려도 항차가 없으면 종전대로 미분류
    none_voy = core.read_mail_target("연태훼리 CLL 송부드립니다", [], {"names": {}, "codes": {}},
                                     MASTER_FIXTURE)
    check("정본에 걸려도 항차가 없으면 미분류(판독 규칙 그대로)",
          not none_voy["ok"] and none_voy["reason"] == "항차 판독 실패", none_voy["reason"])

    # 마스터 없음(빈 목록) — 0.3 과 똑같이 동작
    same = True
    for subject, files, _v, _voy in FIXTURES:
        a = core.read_mail_target(subject, files, {"names": {}, "codes": {}})
        b = core.read_mail_target(subject, files, {"names": {}, "codes": {}}, [])
        if a != b:
            same = False
    check("정본표가 비어 있으면 0.3 과 완전히 같은 판독", same)
    empty_master = core.load_master(os.path.join(HERE, "없는파일.json"))
    check("정본표 파일이 없으면 빈 목록", empty_master == [])

    # 정본으로 확정되면 캐시에도 정식명으로 심긴다(선박 목록·폴더 정리가 알아보도록)
    cache = {"names": {}, "codes": {}}
    core.read_mail_target("연태훼리 2706W CLL", [], cache, MASTER_FIXTURE)
    check("정본 판독 결과가 캐시에 정식명으로 남는다",
          cache["codes"].get("OBWH") == "OCEAN BLUE WHALE"
          and cache["names"].get("OCEAN BLUE WHALE") == "OBWH",
          json.dumps(cache["codes"], ensure_ascii=False))


# ────────────────────── 18) 정본 이관(기동 시 일괄) ──────────────────────

class _StubFirebase:
    """이관이 서버에 무엇을 하는지만 보는 대역(실 서버에 절대 붙지 않는다)."""

    enabled = True

    def __init__(self):
        self.calls = []
        self.nodes = {}

    def register_vessel(self, code, name, last_mail_at=None, tally=None):
        self.calls.append(("patch", code))
        self.nodes[code] = {"name": name, "tally": tally}
        return {"name": name}

    def delete(self, path):
        self.calls.append(("delete", path))
        self.nodes.pop(path.rsplit("/", 1)[-1], None)
        return None

    def get(self, path, params=None):
        return self.nodes.get(path.rsplit("/", 1)[-1])


def test_migrate_master():
    print("\n[18] 정본 이관 — 자동 코드 → 정본 코드(캐시·폴더·서버, 멱등)")
    tmp = tempfile.mkdtemp(prefix="mailpilot_mig_")
    root = os.path.join(tmp, "MAILBOX")
    try:
        _touch(os.path.join(root, "TAPN", "0535E", "a.txt"))
        _touch(os.path.join(root, "TAPN", "0536E", "b.txt"))
        _touch(os.path.join(root, "XTPG", "0535E", "already.txt"))     # 충돌 유발(같은 항차)
        _touch(os.path.join(root, core.OTHER_DIR, "SWS2", "2606N", "c.txt"))
        _touch(os.path.join(root, "RDDR", "R083W", "d.txt"))
        _touch(os.path.join(root, "INSK", "2601E", "e.txt"))           # 정본에 없는 배 — 무접촉
        before = _all_files(root)

        cache = {"names": {"TAI PING": "TAPN", "SAWASDEE SPICA": "SWS2", "RD": "RDDR",
                           "INC SKM": "INSK", "XTPG": "XTPG"},
                 "codes": {"TAPN": "TAI PING", "SWS2": "SAWASDEE SPICA", "RDDR": "RD",
                           "INSK": "INC SKM", "XTPG": "XTPG"},
                 "tally": {"SWS2": False, "TAPN": True}}
        fb = _StubFirebase()
        result = core.migrate_to_master(root, cache, MASTER_FIXTURE, firebase=fb)
        moves = sorted("%s→%s" % (p["old"], p["new"]) for p in result["plan"])
        print("    이관: %s" % moves)
        print("    미확인 잔류: %s" % sorted(old for _n, old in result["unmatched"]))

        check("이관 표대로 3건(TAPN→XTPG · RDDR→RZOR · SWS2→SWSP)",
              moves == ["RDDR→RZOR", "SWS2→SWSP", "TAPN→XTPG"], ", ".join(moves))
        check("정본에 없는 배(INSK)는 그대로 둔다",
              cache["names"].get("INC SKM") == "INSK" and cache["codes"].get("INSK") == "INC SKM")
        check("이미 정본 코드인 항목은 정식명만 맞춘다(XTPG)",
              cache["codes"].get("XTPG") == "XIN TAI PING", cache["codes"].get("XTPG"))
        check("캐시 이름이 정본 코드를 가리킨다",
              cache["names"]["TAI PING"] == "XTPG" and cache["names"]["RD"] == "RZOR"
              and cache["names"]["SAWASDEE SPICA"] == "SWSP")
        check("옛 코드는 codes 에서 빠진다",
              all(c not in cache["codes"] for c in ("TAPN", "SWS2", "RDDR")),
              ", ".join(sorted(cache["codes"])))
        check("검수 대상 '끔' 은 새 코드로 이월된다(SWS2 → SWSP=False)",
              cache["tally"].get("SWSP") is False and "SWS2" not in cache["tally"],
              json.dumps(cache["tally"]))

        after = _all_files(root)
        print("    이관 후 파일: %s" % after)
        check("충돌 없는 항차는 정본 폴더로 이동(TAPN/0536E → XTPG/0536E)",
              os.path.exists(os.path.join(root, "XTPG", "0536E", "b.txt")))
        check("같은 항차가 양쪽에 있으면 건너뛰고 둘 다 보존",
              os.path.exists(os.path.join(root, "TAPN", "0535E", "a.txt"))
              and os.path.exists(os.path.join(root, "XTPG", "0535E", "already.txt"))
              and len(result["skipped"]) == 1, "건너뜀 %d건" % len(result["skipped"]))
        check("_기타 안의 폴더도 정본 코드로 옮긴다(_기타/SWS2 → _기타/SWSP)",
              os.path.exists(os.path.join(root, core.OTHER_DIR, "SWSP", "2606N", "c.txt")))
        check("별칭으로 붙는 폴더도 옮긴다(RDDR → RZOR)",
              os.path.exists(os.path.join(root, "RZOR", "R083W", "d.txt")))
        check("정본에 없는 폴더는 무접촉(INSK)",
              os.path.exists(os.path.join(root, "INSK", "2601E", "e.txt")))
        check("파일은 하나도 지워지지 않는다(개수 동일)",
              len(before) == len(after) == 6, "이관 전 %d · 후 %d" % (len(before), len(after)))

        check("서버 — 정본 코드 등록 + 옛 코드 노드 삭제",
              ("patch", "XTPG") in fb.calls and ("delete", "vessels/TAPN") in fb.calls
              and "TAPN" not in fb.nodes and "XTPG" in fb.nodes,
              ", ".join("%s %s" % c for c in fb.calls))

        result2 = core.migrate_to_master(root, cache, MASTER_FIXTURE, firebase=fb)
        check("두 번 돌려도 안전(추가 이관·이동 없음 · 파일 그대로)",
              result2["plan"] == [] and result2["moved"] == [] and _all_files(root) == after,
              "이관 %d건" % len(result2["plan"]))

        # 정본표가 없으면 아무것도 하지 않는다(0.3 그대로)
        untouched = core.migrate_to_master(root, cache, [])
        check("정본표가 비면 이관하지 않는다", untouched["plan"] == [] and untouched["moved"] == [])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 19) GUI — 정본 표시 · 연결 · 삭제 · 가져오기 ──────────────────────

def test_gui_master():
    print("\n[19] GUI — 정본/미확인 표시 · 정본 연결 · 항목 삭제 · 정본표 가져오기")
    _install_fake_tkinter()                            # 진짜 창을 띄우지 않는다(무인 실행 안전)
    tmp = tempfile.mkdtemp(prefix="mailpilot_gui_master_")
    root = os.path.join(tmp, "MAILBOX")
    cfg_path = os.path.join(tmp, "config.json")
    cache_path = os.path.join(tmp, "vessels_cache.json")
    master_path = os.path.join(tmp, "vessels_master.json")
    source_path = os.path.join(tmp, "가져올_정본표.json")
    try:
        core.save_cache({"names": {"XTPG": "XTPG", "INC SKM": "INSK", "TAI PING": "TAPN"},
                         "codes": {"XTPG": "XIN TAI PING", "INSK": "INC SKM", "TAPN": "TAI PING"}},
                        cache_path)
        with open(master_path, "w", encoding="utf-8") as fh:
            json.dump(MASTER_FIXTURE, fh, ensure_ascii=False)
        _touch(os.path.join(root, "INSK", "2601E", "x.txt"))

        import gui
        app = gui.MailPilotGUI(config_path=cfg_path, cache_path=cache_path,
                               master_path=master_path)
        app.var_root.set(root)
        check("정본표를 읽어 온다", len(app.vessel_master) == len(MASTER_FIXTURE),
              "%d척" % len(app.vessel_master))
        check("정본 행은 '코드 — 정식 선박명'",
              app.vessel_row_label("XTPG") == "XTPG — XIN TAI PING", app.vessel_row_label("XTPG"))
        check("정본에 없는 행은 '(미확인)'",
              app.vessel_row_label("INSK") == "INSK — INC SKM (미확인)", app.vessel_row_label("INSK"))
        check("정본 연결 콤보 목록", app.master_choices()[0].startswith("ATPR — "),
              app.master_choices()[0])

        out = app.link_master_now("INSK", "KSKM")
        check("[정본 연결] — 캐시가 정본 코드로 바뀐다",
              app.cache["names"].get("INC SKM") == "KSKM" and "INSK" not in app.cache["codes"],
              json.dumps(app.cache["codes"], ensure_ascii=False))
        check("[정본 연결] — 폴더도 함께 옮긴다",
              os.path.exists(os.path.join(root, "KSKM", "2601E", "x.txt"))
              and out is not None and len(out["moved"]) == 1)
        check("[정본 연결] — 연결한 뒤에는 정식명으로 보인다",
              app.vessel_row_label("KSKM") == "KSKM — SUNNY KALMIA", app.vessel_row_label("KSKM"))
        check("[정본 연결] — 정본표에 없는 코드는 거절",
              app.link_master_now("KSKM", "ZZZZ") is None)

        app.delete_vessel_now("KSKM")
        check("[항목 삭제] — 목록에서만 빠지고 폴더·파일은 그대로",
              "KSKM" not in app.cache["codes"]
              and os.path.exists(os.path.join(root, "KSKM", "2601E", "x.txt")))

        # [정본표 가져오기…] — 파일을 자리에 놓고 곧바로 이관까지
        os.remove(master_path)
        app2 = gui.MailPilotGUI(config_path=cfg_path, cache_path=cache_path,
                                master_path=master_path)
        app2.var_root.set(root)
        check("정본표가 없으면 모두 '(미확인)'",
              app2.vessel_row_label("TAPN") == "TAPN — TAI PING (미확인)",
              app2.vessel_row_label("TAPN"))
        with open(source_path, "w", encoding="utf-8") as fh:
            json.dump(MASTER_FIXTURE, fh, ensure_ascii=False)
        res = app2.import_master_now(source_path)
        check("[정본표 가져오기] — 파일이 자리에 놓인다", os.path.exists(master_path))
        check("[정본표 가져오기] — 곧바로 이관까지 돈다(TAPN → XTPG)",
              res is not None and any(p["old"] == "TAPN" and p["new"] == "XTPG"
                                      for p in res["plan"])
              and app2.cache["names"]["TAI PING"] == "XTPG",
              json.dumps(res["plan"] if res else [], ensure_ascii=False))
        check("[정본표 가져오기] — 읽을 수 없는 파일은 자리에 놓지 않는다",
              app2.import_master_now(os.path.join(tmp, "없는파일.json")) is None)
    except Exception as exc:
        check("GUI 정본표", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 20) EDI 판독 모듈 — 4형식 · 실파일 스냅샷 ──────────────────────
#   기준: 검수앱 src/utils.js 의 parseBAPLIE·parseAscFile. 아래 기대값은 그 JS 를 node 로
#   돌린 결과와 실표본 24파일·10,299컨(전수 스윕은 709파일·276,192컨)에서 100% 일치한 값이다.

# 합성 최소 케이스 — 표준 EDIFACT BAPLIE (리퍼+온도+위험물+환적 3단 + 부킹 슬롯)
SYN_BAPLIE = (
    "UNB+UNOA:2+SND+RCV+260101:0000+1'\n"
    "UNH+1+BAPLIE:D:95B:UN:SMDG20'\n"
    "TDT+20+2609S+++:172:20+++V7A5452:103::PEGASUS PROTO'\n"
    "LOC+5+KRPTK:139:6'\n"
    "DTM+178:2601011200:203'\n"
    "LOC+147+0100284::5'\n"
    "MEA+VGM++KGM:24500'\n"
    "LOC+9+KRPTK'\n"
    "LOC+11+CNSHA'\n"
    "LOC+76+CNNGB'\n"
    "LOC+83+KRPUS'\n"
    "LOC+97+JPSKT'\n"
    "TMP+2+-018:CEL'\n"
    "EQD+CN+ABCU1234567+4530+++5'\n"
    "DGS+IMD+3+1170++2'\n"
    "NAD+CA+DJS:172:20'\n"
    "RFF+BM:BL0001'\n"
    "LOC+147+0100286::5'\n"
    "MEA+WT++KGM:2200'\n"
    "LOC+9+KRPTK'\n"
    "LOC+11+CNDLC'\n"
    "EQD+CN++2200+++4'\n"
    "FTX+AAY+++SKR  extra'\n"
    "UNT+22+1'\n"
    "UNZ+1+1'\n"
)

# 합성 최소 케이스 — 숫자코드 BAPLIE (CASP/CKL 계열)
SYN_NUMERIC = (
    "00:BAPLIE:BAYPLAN:9:TWE000001:CASP:2607052323'\n"
    "10:TMPZ:TIANHAI PINGZE:CN:2020W:DWS:::260705:KRPTK:PTK:CNNGB'\n"
    + ":".join(["50", "DWSU3001375", "2200", "F", "0010282", "", "", "", "", "",
                "", "", "", "", "20300.0", "", "TJM"]) + "'\n"
    "52:KRPTK::CNSHA::CNSHA:::'\n"
    + ":".join(["50", "RFXU1234567", "4530", "F", "0020184", "C", "-018", "", "",
                "", "", "", "", "", "12000", "", "EAS"]) + "'\n"
    "52:KRPTK::CNSHA::CNSHA:::'\n"
)

# 합성 최소 케이스 — 숫자코드 IFCSUM (RIZHAO 계열, 같은 컨번호 B/L split 병합)
SYN_IFCSUM = (
    "00:IFCSUM:MANIFEST:9:560100333:HTFR:20260726115429'\n"
    "10:HOAG:RIZHAO ORIENT:PA:R079E:::20260726:20260727::RIZHAO:::'\n"
    "12:BL001::::::CNRZH:RIZHAO:11:PP:20260726::::'\n"
    "13:KRPTK:PYEONGTAEK:KRPTK:PYEONGTAEK:::::'\n"
    "47:WOODEN FURNITURE::::'\n"
    "51:0:CICU8421595:008497:40HC:F:88:5430::68::::::'\n"
    "12:BL002::::::CNRZH:RIZHAO:11:PP:20260726::::'\n"
    "13:KRPTK:PYEONGTAEK:KRPTK:PYEONGTAEK:::::'\n"
    "47:STEEL COIL::::'\n"
    "51:0:CICU8421595:008497:40HC:F:88:1000::68::::::'\n"
    "51:1:TEST1234567:000000:40RH:E:1:0::::::::'\n"
)

# 실파일 발췌 — DJCF 0149S PTK.ASC 의 $604 머리 + 실제 본문 3줄(드라이 풀 · 리퍼 15.0℃ · 엠티)
SYN_ASC = (
    "$604DJCF/DONGJIN CONFIDENT   /0149S       /            /POL:PTK/260720  "
    "/RECORD=0674/F           /            NTX//NTX                   "
    "/00674                         \n"
    "010482 BMOU1563063 DJS     INCSGN           DC20191F        0001"
    "                       19140" + " " * 80 + "KRINCBNSGN\n"
    "060482 HALU8500868 HAS     INCPUS           RFHC089F    150C    "
    "                       08922" + " " * 80 + "KRINCKRPUS\n"
    "030786 HALU2025400 HAS     PTKKAN           DC20022E        "
    "                           02200" + " " * 80 + "KRPTKKRKAN\n"
)

# 실파일 스냅샷 — DPRT2609SPTK.EDI 머리 + 실제 컨 3대(드라이 · 리퍼 5.0℃ · 위험물)
REAL_EDI_SNAPSHOT = (
    "UNB+UNOA:2+TWE000001+CASP+20260725:0553+0'\n"
    "UNH+1+BAPLIE:D:95B:UN:SMDG20'\n"
    "BGM++0+9'\n"
    "DTM+137:202607250553:203'\n"
    "TDT+20+2609S+++:172:20+++V7A5452:103::PEGASUS PROTO'\n"
    "LOC+5+KRPTK:139:6'\n"
    "DTM+178:2607250553:203'\n"
    "LOC+147+0010682::5'\n"
    "MEA+WT++KGM:28200'\n"
    "LOC+9+BNSGN'\n"
    "LOC+11+KRKAN'\n"
    "LOC+83+KRKAN'\n"
    "RFF+BM:1'\n"
    "EQD+CN+DJLU2160636+2200+++5'\n"
    "NAD+CA+DJS:172:20'\n"
    "LOC+147+0060682::5'\n"
    "MEA+WT++KGM:22200'\n"
    "TMP+2+05.0:CEL'\n"
    "LOC+9+TKBKK'\n"
    "LOC+11+KRPUS'\n"
    "RFF+BM:1'\n"
    "EQD+CN+BMOU9840061+4530+++5'\n"
    "NAD+CA+NSS:172:20'\n"
    "LOC+147+0010282::5'\n"
    "MEA+WT++KGM:21810'\n"
    "LOC+9+KRPTK'\n"
    "LOC+11+KRKAN'\n"
    "RFF+BM:1'\n"
    "EQD+CN+TGIU3246581+2270+++5'\n"
    "NAD+CA+HAS:172:20'\n"
    "DGS+IMD+3+1219'\n"
)

# 실표본 전체 파일(있으면 함께 검사) — 파일이 없는 PC 에서는 발췌 스냅샷만으로 통과한다.
REAL_FULL_FILES = [
    # (상대경로, 종류, 선박, 항차, 컨수)
    ("DPRT/260725_DPRT-2608N&2609S PTK DEP.TALLY REPORT/DPRT2609SPTK.EDI",
     "edi", "PEGASUS PROTO", "2609S", 836),
    ("ATPR/260709_ATPR 2632W PTK DEP. TALLY REPORT/ATPR 2632W PTK.ASC",
     "asc", "ATLANTIC PIONEER", "2632W", 370),
    ("TMPZ/260705_TMPZ 2020E&W PTK DEP. TALLY REPORT/TMPZ 2020W PTK(MOC).edi",
     "numeric", "TIANHAI PINGZE", "2020W", 265),
]
SAMPLES_ROOT = os.path.join(os.path.dirname(os.path.dirname(PKG)), "_tally_samples")


def _cn_of(containers, cn):
    for c in containers:
        if c["cn"] == cn:
            return c
    return {}


def test_edi_parser():
    print("\n[20] EDI 판독 모듈 — 종류 판별 · BAPLIE/숫자코드/IFCSUM/ASC · 실파일 스냅샷")
    try:
        import edi_parser as ep
    except Exception as exc:
        check("edi_parser 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) 종류 판별
    check("종류 판별 — ASC($604)", ep.detect_kind(SYN_ASC, "x.asc") == "asc")
    check("종류 판별 — 숫자코드 BAPLIE(00:BAPLIE)",
          ep.detect_kind(SYN_NUMERIC, "x.edi") == "numeric")
    check("종류 판별 — 숫자코드 IFCSUM(00:IFCSUM)",
          ep.detect_kind(SYN_IFCSUM, "x.txt") == "ifcsum")
    check("종류 판별 — 표준 EDIFACT(UNB/UNH)",
          ep.detect_kind(SYN_BAPLIE, "x.edi") == "edi")

    # (2) 표준 BAPLIE
    r = ep.parse_edi(SYN_BAPLIE, "syn.edi")
    check("BAPLIE — 종류·선박·항차·콜사인",
          r["kind"] == "edi" and r["vessel"] == "PEGASUS PROTO"
          and r["voy"] == "2609S" and r["callsign"] == "V7A5452",
          "%s / %s / %s" % (r["vessel"], r["voy"], r["callsign"]))
    check("BAPLIE — 컨 2대(부킹 슬롯 포함)", len(r["containers"]) == 2,
          str(len(r["containers"])))
    c0 = r["containers"][0]
    check("BAPLIE — 좌표 LOC+147(선행 0 제거)",
          (c0["bay"], c0["row"], c0["tier"]) == ("10", "02", "84"),
          "%s-%s-%s" % (c0["bay"], c0["row"], c0["tier"]))
    check("BAPLIE — LOC 매핑(9=POL, 11=POD, 76=npod, 83=tspot, 97=fpod)",
          (c0["pol"], c0["pod"], c0["npod"], c0["tspot"], c0["fpod"])
          == ("KRPTK", "CNSHA", "CNNGB", "KRPUS", "JPSKT"))
    check("BAPLIE — VGM 중량 우선", c0["wt"] == 24500 and c0["wtt"] == "VGM")
    check("BAPLIE — TMP+2 온도 정규화('-018'→'-18') + rf",
          c0["tmp"] == "-18" and c0["rf"] is True, c0["tmp"])
    check("BAPLIE — DGS+IMD 위험물(클래스·UN·PG)",
          c0["dg"] is True and (c0["dgc"], c0["un"], c0["pg"]) == ("3", "1170", "2"))
    check("BAPLIE — NAD+CA 선사 · RFF+BM B/L · 항차 복사",
          c0["op"] == "DJS" and c0["bl"] == "BL0001" and c0["voy"] == "2609S")
    c1 = r["containers"][1]
    check("BAPLIE — 부킹 슬롯 __BOOK_ 임시 ID",
          c1["cn"] == "__BOOK_10_02_86" and c1["isBooking"] is True
          and c1["pendingCn"] is True and c1["l4"] == "", c1["cn"])
    check("BAPLIE — EQD status 4=Empty + ISO 끝자리 보정(2200→220E)",
          c1["fe"] == "E" and c1["iso"] == "220E"
          and c1["iso_orig_parsed"] == "2200" and c1["st"] == "4")
    check("BAPLIE — FTX+AAY 선사(5자 자르기)", c1["op"] == "SKR", c1["op"])
    check("BAPLIE — 빈 값은 ''·0·False (None 없음)",
          all(v is not None for c in r["containers"] for v in c.values()))

    # (3) 숫자코드 BAPLIE
    n = ep.parse_edi(SYN_NUMERIC, "syn_moc.edi")
    check("숫자코드 BAPLIE — 종류·선박·항차·콜사인",
          n["kind"] == "numeric" and n["vessel"] == "TIANHAI PINGZE"
          and n["voy"] == "2020W" and n["callsign"] == "TMPZ")
    check("숫자코드 BAPLIE — 컨 2대", len(n["containers"]) == 2)
    n0, n1 = n["containers"]
    check("숫자코드 BAPLIE — 50 세그먼트(좌표·중량·선사)",
          (n0["bay"], n0["row"], n0["tier"]) == ("1", "02", "82")
          and n0["wt"] == 20300 and n0["op"] == "TJM",
          "%s-%s-%s / %s" % (n0["bay"], n0["row"], n0["tier"], n0["wt"]))
    check("숫자코드 BAPLIE — 52 세그먼트(POL/POD/FPOD)",
          (n0["pol"], n0["pod"], n0["fpod"]) == ("KRPTK", "CNSHA", "CNSHA"))
    check("숫자코드 BAPLIE — 온도 필드(:C:-018) → rf + '-18'",
          n1["rf"] is True and n1["tmp"] == "-18", n1["tmp"])

    # (4) 숫자코드 IFCSUM
    f = ep.parse_edi(SYN_IFCSUM, "syn_ifcsum.txt")
    check("IFCSUM — 종류·선박·항차", f["kind"] == "ifcsum"
          and f["vessel"] == "RIZHAO ORIENT" and f["voy"] == "R079E")
    check("IFCSUM — B/L split 은 물리 1대로 병합", len(f["containers"]) == 2,
          str(len(f["containers"])))
    g0 = _cn_of(f["containers"], "CICU8421595")
    check("IFCSUM — 병합 시 중량 합산", g0.get("wt") == 6430, str(g0.get("wt")))
    check("IFCSUM — 병합 시 B/L·품명 병기",
          g0.get("bl") == "BL001,BL002"
          and g0.get("desc") == "WOODEN FURNITURE / STEEL COIL",
          "%s / %s" % (g0.get("bl"), g0.get("desc")))
    check("IFCSUM — ISO 텍스트 정규화(40HC→4500) · POL/POD",
          g0.get("iso") == "4500" and g0.get("pol") == "CNRZH"
          and g0.get("pod") == "KRPTK")
    g1 = _cn_of(f["containers"], "TEST1234567")
    check("IFCSUM — 40RH→45R1 리퍼 판정 · 엠티는 eseal 로",
          g1.get("iso") == "45R1" and g1.get("rf") is True
          and g1.get("fe") == "E" and g1.get("eseal") == "000000"
          and g1.get("sl") == "")

    # (5) ASC
    a = ep.parse_edi(SYN_ASC, "syn.asc")
    check("ASC — 종류·선박·항차·서비스코드",
          a["kind"] == "asc" and a["vessel"] == "DONGJIN CONFIDENT"
          and a["voy"] == "0149S" and a["serviceCode"] == "DJCF",
          "%s / %s / %s" % (a["vessel"], a["voy"], a["serviceCode"]))
    check("ASC — 컨 3대", len(a["containers"]) == 3, str(len(a["containers"])))
    a0, a1, a2 = a["containers"]
    check("ASC — 좌표(0-6) · 컨번호(7-18) · 선사(19-22)",
          (a0["bay"], a0["row"], a0["tier"]) == ("1", "04", "82")
          and a0["cn"] == "BMOU1563063" and a0["op"] == "DJS")
    check("ASC — 타입코드(44-54) DC20 → 22GP · 중량 19140",
          a0["iso"] == "22GP" and a0["tp"] == "DC20" and a0["wt"] == 19140)
    check("ASC — 리퍼 RFHC → 45R1 · 온도 '150C' → 15.0℃",
          a1["iso"] == "45R1" and a1["rf"] is True and a1["tmp"] == "15.0℃",
          a1["tmp"])
    check("ASC — 엠티 ISO 끝자리 보정(22GP→22GE)",
          a2["fe"] == "E" and a2["iso"] == "22GE")
    check("ASC — POL/POD 끝 10자리 · routeCode",
          (a0["pol"], a0["pod"], a0["routeCode"]) == ("KRINC", "BNSGN", "KRINCBNSGN"))

    # (6) 실파일 스냅샷 — DPRT 2609S 발췌 3대
    s = ep.parse_edi(REAL_EDI_SNAPSHOT, "DPRT2609SPTK.EDI")
    check("실파일 스냅샷 — 선박·항차·POL·ETD",
          s["vessel"] == "PEGASUS PROTO" and s["voy"] == "2609S"
          and s["pol"] == "KRPTK" and s["etd"] == "26072505",
          "%s / %s / %s" % (s["vessel"], s["voy"], s["etd"]))
    check("실파일 스냅샷 — 컨 3대", len(s["containers"]) == 3)
    s0 = _cn_of(s["containers"], "DJLU2160636")
    check("실파일 스냅샷 — DJLU2160636 (2200 · 1-06-82 · 28200 · tspot KRKAN)",
          (s0.get("iso"), s0.get("tp"), s0.get("bay"), s0.get("row"), s0.get("tier"),
           s0.get("wt"), s0.get("tspot"), s0.get("op"), s0.get("st"))
          == ("2200", "20'GP", "1", "06", "82", 28200, "KRKAN", "DJS", "5"),
          json.dumps(s0, ensure_ascii=False))
    s1 = _cn_of(s["containers"], "BMOU9840061")
    check("실파일 스냅샷 — BMOU9840061 리퍼 4530 · 온도 '05.0'→'5.0'",
          s1.get("iso") == "4530" and s1.get("rf") is True and s1.get("tmp") == "5.0",
          str(s1.get("tmp")))
    s2 = _cn_of(s["containers"], "TGIU3246581")
    check("실파일 스냅샷 — TGIU3246581 탱크(2270 → tk) · 위험물 3/1219",
          s2.get("tk") is True and s2.get("dg") is True
          and (s2.get("dgc"), s2.get("un")) == ("3", "1219"))

    # (7) 실표본 원본 파일이 이 PC 에 있으면 통째로도 확인한다
    seen = 0
    for rel, kind, vsl, voy, cnt in REAL_FULL_FILES:
        path = os.path.join(SAMPLES_ROOT, rel.replace("/", os.sep))
        if not os.path.exists(path):
            continue
        seen += 1
        with open(path, "rb") as fh:
            text = fh.read().decode("utf-8", errors="replace")
        got = ep.parse_edi(text, path)
        check("실표본 %s — 종류·선박·항차·컨수" % os.path.basename(path),
              got["kind"] == kind and got["vessel"] == vsl
              and got["voy"] == voy and len(got["containers"]) == cnt,
              "%s / %s / %s / %d대" % (got["kind"], got["vessel"], got["voy"],
                                       len(got["containers"])))
    if seen == 0:
        print("  [i] _tally_samples 원본이 없어 발췌 스냅샷만 검사했다.")


# ────────────────────── 21) 0.5 앱 채우기 — 항차·EDI 를 검수앱에 올린다 ──────────────────────
#   가짜 파이어베이스(경로→값 사전)로만 돈다. 실 서버에는 한 글자도 안 나간다.

class FakeDB:
    """RTDB 대역 — 경로를 그대로 열쇠로 쓰는 사전. 호출 기록을 남겨 '무엇을 썼는지' 본다."""

    enabled = True

    def __init__(self, initial=None):
        self.data = json.loads(json.dumps(initial or {}, ensure_ascii=False))
        self.calls = []
        self.vessels, self.beats, self.logs = [], [], []

    @staticmethod
    def _p(path):
        return str(path).strip("/")

    def get(self, path, params=None):
        self.calls.append(("GET", self._p(path), None))
        key = self._p(path)
        if params and str((params or {}).get("shallow")).lower() in ("true", "1"):
            return self._shallow(key)
        value = self.data.get(key)
        return json.loads(json.dumps(value, ensure_ascii=False)) if value is not None else None

    def _shallow(self, key):
        """?shallow=true — 자식 이름만. 평평한 경로 사전에서 한 단계 자식을 뽑아 낸다."""
        kids, prefix = {}, key + "/"
        for path, value in self.data.items():
            if path == key and isinstance(value, dict):
                for name in value:
                    kids[name] = True
            elif path.startswith(prefix):
                kids[path[len(prefix):].split("/")[0]] = True
        return kids or None

    def delete(self, path):
        key = self._p(path)
        self.calls.append(("DELETE", key, None))
        for gone in [p for p in list(self.data) if p == key or p.startswith(key + "/")]:
            self.data.pop(gone, None)
        return {"ok": True}

    def put(self, path, obj):
        self.calls.append(("PUT", self._p(path), obj))
        self.data[self._p(path)] = json.loads(json.dumps(obj, ensure_ascii=False))
        return {"ok": True}

    def patch(self, path, obj):
        self.calls.append(("PATCH", self._p(path), obj))
        cur = self.data.setdefault(self._p(path), {})
        if isinstance(cur, dict):
            cur.update(json.loads(json.dumps(obj, ensure_ascii=False)))
        return {"ok": True}

    # 0.3/0.4 경로(사이클 보고)도 받아 준다 — Collector 종단 시험용
    def register_vessel(self, code, name, last_mail_at=None, tally=None):
        self.vessels.append({"code": code, "name": name, "tally": tally})
        return {"ok": True}

    def heartbeat(self, mails, files, skipped):
        self.beats.append((mails, files, skipped))
        return {"ok": True}

    def write_collect_log(self, summary):
        self.logs.append(summary)
        return {"ok": True}

    def writes(self, method=None):
        return [c for c in self.calls if method is None or c[0] == method]


def _quiet(_msg):
    """시험용 로그 — 화면을 더럽히지 않는다(실패 원인은 check 상세로 본다)."""
    return None


AU_MASTER = [
    {"code": "DJCT", "name": "DONGJIN CONTINENTAL", "aliases": [], "ko": []},
    {"code": "ATPR", "name": "ATLANTIC PIONEER", "aliases": [], "ko": []},
    {"code": "STSE", "name": "SITC SENDAI", "aliases": [], "ko": []},
    {"code": "XTPG", "name": "XIN TAI PING", "aliases": [], "ko": []},
]


def _syn_baplie(voy, rows, vessel="TEST SHIP"):
    """합성 BAPLIE — rows: [(컨번호, ISO, POL, POD, 'bay/row/tier 7자리')]."""
    out = ["UNB+UNOA:2+SND+RCV+260101:0000+1'",
           "UNH+1+BAPLIE:D:95B:UN:SMDG20'",
           "TDT+20+%s+++:172:20+++V7A5452:103::%s'" % (voy, vessel),
           "LOC+5+KRPTK:139:6'",
           "DTM+178:2601011200:203'"]
    for cn, iso, pol, pod, pos in rows:
        out.append("LOC+147+%s::5'" % pos)
        out.append("MEA+WT++KGM:12000'")
        if pol:
            out.append("LOC+9+%s'" % pol)
        if pod:
            out.append("LOC+11+%s'" % pod)
        out.append("EQD+CN+%s+%s+++5'" % (cn, iso))
    out.append("UNT+%d+1'" % (len(out) + 1))
    out.append("UNZ+1+1'")
    return "\n".join(out) + "\n"


def _mk(root, rel, text):
    path = os.path.join(root, *rel.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="latin1", errors="replace") as fh:
        fh.write(text)
    return path


def _nulls(obj, trail="$"):
    """RTDB 로 나간 값 안에 None 이 있는지 재귀로 훑는다(null = 삭제라 절대 보내면 안 된다)."""
    bad = []
    if obj is None:
        bad.append(trail)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            bad += _nulls(v, "%s.%s" % (trail, k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            bad += _nulls(v, "%s[%d]" % (trail, i))
    return bad


def test_app_upload():
    print("\n[21] 0.5 앱 채우기 — 홈포트·짝·info 계약·방향필터·좌표보존·지문")
    try:
        import app_upload as au
    except Exception as exc:
        check("app_upload 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) 홈포트 판정 — 앱 JS isPyeongtaekPort 와 같은 기준
    check("홈포트 — 별칭·접미사 다 잡는다",
          all(au.is_home_port(x) for x in ("PTK", "KRPTK", "KRPYT", "KRPYOTM", "KRPYO", "XXPYT"))
          and not any(au.is_home_port(x) for x in ("", None, "CNSHA", "KRPUS", "PYOT")))
    check("홈포트 — 설정 별칭으로 다른 항도 된다",
          au.is_home_port("KRINC", ["KRINC"]) and not au.is_home_port("KRPUS", ["KRINC"]))

    # (2) 항차 방향
    check("항차 방향 — E/N 양하 · W/S 선적 · 그 외 빈값",
          (au.voy_direction("0221E"), au.voy_direction("2607N"), au.voy_direction("0222W"),
           au.voy_direction("631S"), au.voy_direction("2635")) ==
          ("discharge", "discharge", "loading", "loading", ""))

    # (3) 짝 증거 — 실제 제목·첨부명 그대로
    check("짝 증거 — 0221E&0222W(양쪽 표기)",
          au.find_pairs("DJCT 0221E&0222W PTK TALLY REPORT.xlsx") == [("0221E", "0222W")])
    check("짝 증거 — R083E&W(뒤 생략)",
          au.find_pairs("RO R083E&W PTK TALLY REPORT.pdf") == [("R083E", "R083W")])
    check("짝 증거 — 2705E & 2706W(사이 공백)",
          au.find_pairs("OCEAN BLUE WHALE 2705E & 2706W PTK TALLY REPORT.xls")
          == [("2705E", "2706W")])
    check("짝 증거 — 2608N&2609S(북/남 항로)",
          au.find_pairs("DPRT-2608N&2609S PTK DEP.TALLY REPORT") == [("2608N", "2609S")])
    check("짝 증거 — E&0222W(앞 항차는 폴더에서)",
          au.find_pairs("DJCT E&0222W REPORT", context_voy="0221E") == [("0221E", "0222W")])
    check("짝 증거 — 없는 곳에서 만들어 내지 않는다",
          au.find_pairs("ATPR 2635W WEI 공컨 씰체결 리스트.xlsx") == []
          and au.find_pairs("ATPR 2635E & WEIHAI LIST") == []
          and au.find_pairs("STSE 2657E PTK.ASC") == [])
    cache = {"names": {}, "codes": {}}
    au.collect_pairs("DJCT 0221E&0222W PTK TALLY REPORT.xlsx", "DJCT", cache)
    check("짝 캐시 — 양방향으로 기록",
          au.paired_partner(cache, "DJCT", "0221E") == "0222W"
          and au.paired_partner(cache, "DJCT", "0222W") == "0221E"
          and au.paired_partner(cache, "DJCT", "9999E") == "")
    check("짝 캐시 — 두 번 넣어도 새 짝은 0(로그 폭주 방지)",
          au.collect_pairs("DJCT 0221E&0222W", "DJCT", cache) == [])

    # (4) 대표 선정 4단 비교 — ① 해당 방향 홈포트분 ② 실번호 ③ 규격 ④ 총수
    a = {"dis_home": 5, "load_home": 0, "cn_count": 3, "iso_count": 3, "total": 3}
    b = {"dis_home": 4, "load_home": 0, "cn_count": 90, "iso_count": 90, "total": 90}
    check("대표 4단 — 평택분이 1순위(총수 많은 타항 자료를 이긴다)",
          au._rank(a, "discharge") > au._rank(b, "discharge"))
    c1 = {"dis_home": 5, "load_home": 0, "cn_count": 5, "iso_count": 1, "total": 5}
    c2 = {"dis_home": 5, "load_home": 0, "cn_count": 5, "iso_count": 4, "total": 5}
    check("대표 4단 — 동률이면 규격(iso) 보유 수", au._rank(c2, "discharge") > au._rank(c1, "discharge"))

    # (5) 종단 — 미니 메일박스 한 판
    tmp = tempfile.mkdtemp(prefix="mailpilot_upload_")
    try:
        root = os.path.join(tmp, "MB")
        # 양하 폴더 — 평택 POD 2대 + 타항 1대 + POL/POD 둘 다 빈 1대(fail-open)
        _mk(root, "DJCT/0221E/DJCT 0221E&0222W PTK TALLY REPORT.xlsx", "not-an-edi")
        _mk(root, "DJCT/0221E/DJCT 0221E PTK.edi", _syn_baplie("0221E", [
            ("ABCU1234567", "2200", "CNSHA", "KRPTK", "0100284"),
            ("ABCU1234568", "4500", "CNNGB", "KRPYOTM", "0100286"),
            ("ABCU1234569", "2200", "CNSHA", "KRPUS", "0100288"),
            ("ABCU1234570", "2200", "", "", "0100482"),
        ]))
        # 선적 폴더(짝) — 평택 POL 2대
        _mk(root, "DJCT/0222W/DJCT 0222W PTK.edi", _syn_baplie("0222W", [
            ("BBBU1000001", "2200", "KRPTK", "CNSHA", "0200284"),
            ("BBBU1000002", "4500", "PTK", "CNNGB", "0200286"),
        ]))
        # 방향이 어긋난 폴더 — E 폴더인데 안에 든 것은 선적 EDI(다수결 override)
        _mk(root, "STSE/2657E/STSE 2658W PTK.edi", _syn_baplie("2658W", [
            ("CCCU2000001", "2200", "KRPTK", "CNSHA", "0300284"),
            ("CCCU2000002", "2200", "KRPTK", "CNNGB", "0300286"),
        ]))
        # 타항 자료만 든 폴더 — 방향필터 전량 제외 → PUT 자체를 하면 안 된다
        _mk(root, "ATPR/2632W/INCB.edi", _syn_baplie("2632W", [
            ("DDDU3000001", "2200", "KRINC", "CNSHA", "0400284"),
        ]))
        # 정본표에 없는 선박 · 검수 대상이 아닌 선박 · _미분류 는 건드리지 않는다
        _mk(root, "UNAT/2635W/x.edi", _syn_baplie("2635W", [("EEEU4000001", "2200", "KRPTK", "CNSHA", "0500284")]))
        _mk(root, "XTPG/0535E/y.edi", _syn_baplie("0535E", [("FFFU5000001", "2200", "CNSHA", "KRPTK", "0600284")]))
        _mk(root, "_미분류/20260801_무엇/z.edi", _syn_baplie("9999E", [("GGGU6000001", "2200", "CNSHA", "KRPTK", "0700284")]))

        db = FakeDB({"voyages/ATPR_2632W/loading/ediContainers": {
            "OLDU9999999": {"cn": "OLDU9999999", "pol": "KRPTK", "bay": "70"}}})
        cache2 = {"names": {}, "codes": {}, "tally": {"XTPG": False}}
        state = os.path.join(tmp, "upload_state.json")
        res = au.run(root, cache2, AU_MASTER, db, {}, _quiet, state_path=state)

        keys = sorted(res["registered"])
        check("짝 증거대로 한 키로 묶인다(0221E/0222W → DJCT_0221E)",
              keys == ["ATPR_2632W", "DJCT_0221E", "STSE_2657E"],
              "등록 키 %s" % keys)
        info = db.data.get("voyages/DJCT_0221E/info") or {}
        check("info 신규 PUT 계약 — 필드·타입",
              info.get("vsl") == "DJCT" and info.get("voy") == "0221E"
              and info.get("mode") == "discharge"
              and isinstance(info.get("createdAt"), int) and info["createdAt"] > 0
              and info.get("createdBy") == "자동등록(수집기)"
              and info.get("autoRegistered") is True
              and info.get("autoStatus") == "collecting"
              and info.get("voy_d") == "0221E" and info.get("voy_l") == "0222W",
              json.dumps(info, ensure_ascii=False))
        check("정본표에 없는 선박(UNAT)·검수 대상 아님(XTPG)·_미분류 는 등록하지 않는다",
              "voyages/UNAT_2635W/info" not in db.data
              and "voyages/XTPG_0535E/info" not in db.data
              and not [k for k in db.data if "_9999E" in k])

        edi_d = db.data.get("voyages/DJCT_0221E/discharge/ediContainers") or {}
        check("방향 필터 — 양하는 POD 평택분만(+판정불가 보존)",
              sorted(edi_d.keys()) == ["ABCU1234567", "ABCU1234568", "ABCU1234570"],
              "남은 컨 %s" % sorted(edi_d.keys()))
        check("fail-open — POL·POD 둘 다 빈 컨은 지우지 않는다",
              "ABCU1234570" in edi_d and edi_d["ABCU1234570"]["_mode"] == "transit")
        check("_slotKey·_mode 표식",
              edi_d["ABCU1234567"]["_slotKey"] == "ABCU1234567"
              and edi_d["ABCU1234567"]["_mode"] == "discharge")
        raw = db.data.get("voyages/DJCT_0221E/discharge/raw/edi") or {}
        check("raw/edi 계약 — 원문·파일명·파서판·크기·시각",
              raw.get("fileName") == "DJCT 0221E PTK.edi"
              and raw.get("parserVersion") == au.PARSER_TAG
              and isinstance(raw.get("uploadedAt"), int)
              and raw.get("sizeBytes") == len(raw.get("text") or "")
              and "EQD+CN+ABCU1234567" in (raw.get("text") or ""))

        edi_l = db.data.get("voyages/DJCT_0221E/loading/ediContainers") or {}
        check("짝 선적 폴더는 같은 키의 loading 노드로 들어간다",
              sorted(edi_l.keys()) == ["BBBU1000001", "BBBU1000002"]
              and all(v["_mode"] == "loading" for v in edi_l.values()),
              "선적 컨 %s" % sorted(edi_l.keys()))

        check("다수결 override — E 폴더인데 내용이 선적이면 loading 노드",
              "voyages/STSE_2657E/loading/ediContainers" in db.data
              and "voyages/STSE_2657E/discharge/ediContainers" not in db.data
              and len(db.data["voyages/STSE_2657E/loading/ediContainers"]) == 2)

        check("방향필터 전량 제외 → PUT 생략(기존 노드 그대로 보존)",
              (db.data.get("voyages/ATPR_2632W/loading/ediContainers") or {}).keys()
              == {"OLDU9999999"}
              and "voyages/ATPR_2632W/loading/raw/edi" not in db.data)
        check("자료가 타항뿐이어도 항차(info)는 등록한다(홈에 카드는 뜬다)",
              (db.data.get("voyages/ATPR_2632W/info") or {}).get("voy_l") == "2632W")

        bad = []
        for path, value in db.data.items():
            bad += _nulls(value, path)
        check("RTDB 로 나간 값에 null 이 하나도 없다", not bad, "null 자리 %s" % bad[:3])

        # (6) 지문 멱등 — 두 번째 사이클은 아무것도 쓰지 않는다
        db.calls = []
        res2 = au.run(root, cache2, AU_MASTER, db, {}, _quiet, state_path=state)
        check("짝으로 묶인 폴더 2개가 항차 1개로 센다(같은 노드 두 번 쓰지 않는다)",
              res["folders"] == 4 and res["voyages"] == 3,
              "폴더 %d · 항차 %d" % (res["folders"], res["voyages"]))
        check("지문 멱등 — 같은 자료면 두 번째 사이클 업로드 0 · 쓰기 0",
              res2["uploads"] == 0 and res2["changed"] == 0 and res2["skipped"] == 3
              and not db.writes("PUT") and not db.writes("PATCH"),
              "changed=%d skipped=%d put=%d" % (res2["changed"], res2["skipped"],
                                                len(db.writes("PUT"))))

        # (7) 자료가 바뀌면 다시 올린다 + 좌표 보존 + 기존 info 는 안 덮는다
        db.data["voyages/DJCT_0221E/info"] = {
            "vsl": "DJCT", "voy": "0221E", "mode": "discharge",
            "createdBy": "김성일", "voy_d": "0221E", "berth": "1번",
        }
        db.data["voyages/DJCT_0221E/discharge/ediContainers"]["ABCU1234567"]["bay"] = "77"
        db.data["voyages/DJCT_0221E/discharge/ediContainers"]["ABCU1234567"]["pos"] = "770284"
        _mk(root, "DJCT/0221E/DJCT 0221E PTK.edi", _syn_baplie("0221E", [
            ("ABCU1234567", "2200", "CNSHA", "KRPTK", ""),
            ("ABCU1234568", "4500", "CNNGB", "KRPYOTM", "0100286"),
        ]))
        db.calls = []
        au.run(root, cache2, AU_MASTER, db, {}, _quiet, state_path=state)
        info2 = db.data.get("voyages/DJCT_0221E/info") or {}
        check("기존 info 는 PATCH 로만 — 사람 값 불변, 빈 voy_l 만 채움",
              info2.get("createdBy") == "김성일" and info2.get("berth") == "1번"
              and info2.get("voy_l") == "0222W" and "autoRegistered" not in info2
              and not [c for c in db.writes("PUT") if c[1].endswith("/info")],
              json.dumps(info2, ensure_ascii=False))
        after = db.data.get("voyages/DJCT_0221E/discharge/ediContainers") or {}
        check("좌표 보존 — 새 값에 없는 좌표는 기존 노드에서 물려받는다",
              after["ABCU1234567"].get("pos") == "770284"
              and after["ABCU1234568"].get("bay") == "10",
              json.dumps({k: {f: v.get(f) for f in ("bay", "row", "tier", "pos")}
                          for k, v in after.items()}, ensure_ascii=False))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # (8) 서버가 안 받아 주면 지문을 남기지 않는다 — 다음 사이클에 다시 시도한다
    tmp2 = tempfile.mkdtemp(prefix="mailpilot_fail_")
    try:
        root2 = os.path.join(tmp2, "MB")
        _mk(root2, "DJCT/0221E/a.edi",
            _syn_baplie("0221E", [("ABCU1234567", "2200", "CNSHA", "KRPTK", "0100284")]))

        class DeadDB(FakeDB):
            def put(self, path, obj):                  # 타임아웃·인증 실패 → FirebaseREST 는 None 을 준다
                self.calls.append(("PUT", self._p(path), obj))
                return None

        dead = DeadDB()
        st2 = os.path.join(tmp2, "u.json")
        r1 = au.run(root2, {"names": {}, "codes": {}}, AU_MASTER, dead, {}, _quiet, state_path=st2)
        r2 = au.run(root2, {"names": {}, "codes": {}}, AU_MASTER, dead, {}, _quiet, state_path=st2)
        check("업로드 실패는 지문을 남기지 않는다(조용한 실패 금지 · 다음 사이클 재시도)",
              r1["errors"] == 1 and r2["changed"] == 1 and r2["skipped"] == 0,
              "1차 오류 %d · 2차 새자료 %d" % (r1["errors"], r2["changed"]))
    finally:
        shutil.rmtree(tmp2, ignore_errors=True)

    # (9) 설정·서버가 없으면 조용히 건너뛴다(사이클을 죽이지 않는다)
    check("파이어베이스 미설정이면 건너뛴다",
          au.run("/nope", {}, AU_MASTER, core.FirebaseREST({}), {}, _quiet)["folders"] == 0)
    check("정본표가 비면 아무것도 올리지 않는다",
          au.run(os.getcwd(), {}, [], FakeDB(), {}, _quiet)["folders"] == 0)


# ────────────────────── 22) 0.5 실파일 종단 — 사이클 한 판이 앱을 채운다 ──────────────────────

def test_app_upload_e2e():
    print("\n[22] 0.5 실파일 종단 — 수집 사이클 → 검수앱 항차·EDI")
    try:
        import app_upload as au
        import edi_parser as ep
    except Exception as exc:
        check("모듈 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return
    pick = [("DJCT/260719_DJCT-0220E&0221W PTK DEP.TALLY REPORT/DJCT 0221W PTK.edi",
             "DJCT", "0221W", "loading"),
            ("ATPR/260709_ATPR 2632W PTK DEP. TALLY REPORT/ATPR 2632W PTK.ASC",
             "ATPR", "2632W", "loading")]
    have = [p for p in pick if os.path.exists(os.path.join(SAMPLES_ROOT, p[0].replace("/", os.sep)))]
    if not have:
        print("  [i] _tally_samples 원본이 없어 종단 시뮬을 건너뛴다(합성 종단은 [21]에서 확인).")
        return

    tmp = tempfile.mkdtemp(prefix="mailpilot_e2e_")
    try:
        root = os.path.join(tmp, "MB")
        want = {}
        for rel, code, voy, mode in have:
            src = os.path.join(SAMPLES_ROOT, rel.replace("/", os.sep))
            dst = os.path.join(root, code, voy, os.path.basename(src))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            with open(dst, "rb") as fh:
                text = fh.read().decode("latin1", "replace")
            cons = ep.parse_edi(text, os.path.basename(dst))["containers"]
            edi = au.build_edi_map(cons, mode, None)
            kept, _drop = au.direction_filter(edi, mode, None)
            want["%s_%s" % (code, voy)] = (mode, len(kept), os.path.basename(dst))

        FakeIMAP.MESSAGES = []
        db = FakeDB()
        cfg = {"provider": "custom", "protocol": "imap", "host": "imap.test.local", "port": 993,
               "ssl": True, "email": "u@test", "password": "pw", "mailbox_root": root,
               "collect_days": 7, "poll_minutes": 7, "firebase": {}}
        col = core.Collector(cfg, imap_factory=FakeIMAP, firebase=db,
                             cache_path=os.path.join(tmp, "vessels_cache.json"),
                             log_dir=os.path.join(tmp, "logs"),
                             upload_state_path=os.path.join(tmp, "upload_state.json"))
        col.master = AU_MASTER
        col._migrated = True                          # 이관은 [18]에서 따로 본다
        summary = col.run_cycle()

        check("사이클이 항차를 등록했다",
              sorted(summary.get("appVoyages") or []) == sorted(want.keys()),
              "등록 %s" % sorted(summary.get("appVoyages") or []))
        ok_counts, detail = True, []
        for key, (mode, count, fname) in want.items():
            got = db.data.get("voyages/%s/%s/ediContainers" % (key, mode)) or {}
            raw = db.data.get("voyages/%s/%s/raw/edi" % (key, mode)) or {}
            detail.append("%s %s %d/%d" % (key, mode, len(got), count))
            if len(got) != count or count == 0 or raw.get("fileName") != fname:
                ok_counts = False
        check("실파일 컨 수가 파서 결과(방향필터 뒤)와 같다", ok_counts, " · ".join(detail))
        check("info 가 홈 화면 계약을 지킨다",
              all((db.data.get("voyages/%s/info" % k) or {}).get("autoRegistered") is True
                  and isinstance((db.data.get("voyages/%s/info" % k) or {}).get("createdAt"), int)
                  for k in want))

        db.calls = []
        col.run_cycle()
        check("두 번째 사이클은 재업로드하지 않는다(지문 멱등)",
              not [c for c in db.writes("PUT") if "/voyages/" in "/" + c[1]],
              "쓰기 %d건" % len(db.writes("PUT")))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 23) 0.5 하트비트 — 앱 health.js 가 읽는 모양 ──────────────────────

def test_heartbeat_shape():
    print("\n[23] 0.5 하트비트 — at(ms 숫자) · cycleMin")
    calls = []
    original = core.http_request

    def fake_http(url, method="GET", payload=None, timeout=core.HTTP_TIMEOUT):
        calls.append({"url": url, "method": method, "payload": payload})
        if "identitytoolkit" in url:
            return {"idToken": "T", "localId": "a", "expiresIn": "3600"}
        return {"ok": True}

    core.http_request = fake_http
    try:
        fb = core.FirebaseREST({"apiKey": "K", "databaseURL": "https://d.firebaseio.com"})
        fb.cycle_min = 7
        fb.heartbeat(1, 2, 3)
    finally:
        core.http_request = original
    hb = [c for c in calls if "collector_heartbeat" in c["url"]]
    body = hb[0]["payload"] if hb else {}
    now_ms = int(time.time() * 1000)
    check("at 은 ms 숫자(앱이 뺄셈한다)",
          isinstance(body.get("at"), int) and abs(now_ms - body["at"]) < 60000,
          repr(body.get("at")))
    check("cycleMin 은 설정한 수집 주기", body.get("cycleMin") == 7)
    check("version 은 코어 버전", body.get("version") == core.VERSION)
    cfg = {"poll_minutes": 13, "mailbox_root": tempfile.gettempdir(), "firebase": {}}
    col = core.Collector(cfg, firebase=core.FirebaseREST({}))
    check("Collector 가 수집 주기를 하트비트에 실어 준다", col.firebase.cycle_min == 13)


# ────────────────────── 24) 0.5-01 항차 표기 정규화 — 0패딩 흔들림 ──────────────────────
#   실사례: XTPG 가 선사 표기대로 0534E/0534W/0535E 와 534E/534W/535E 로 갈라져 카드가 6장 떴다.
#   규칙: 같은 선박 + 같은 방향(E/N·W/S) + 숫자부 정수값 동일 = 같은 항차.
#         표기(정본)는 '자료가 많은 폴더'가 정한다 — 전역 패딩 제거가 아니다(DJCT 0221E 보호).

VS_MASTER = AU_MASTER + [{"code": "RZOR", "name": "RIZHAO ORIENT", "aliases": [], "ko": []}]


def _auto_info(code, voy, **extra):
    """수집기가 만든 모양의 info(라이브와 같은 필드)."""
    info = {"vsl": code, "voy": voy, "mode": "discharge" if voy[-1] in "EN" else "loading",
            "createdAt": 1785944829801, "createdBy": "자동등록(수집기)",
            "autoRegistered": True, "autoStatus": "collecting"}
    info.update(extra)
    return info


def test_voyage_spelling():
    print("\n[24] 0.5-01 항차 표기 정규화 — 0패딩 흔들림을 한 항차로")
    try:
        import app_upload as au
    except Exception as exc:
        check("app_upload 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) 같은 항차 판정 — 정수 비교 + 문자 접두 보호
    check("판정 — 0패딩 차이만 다르면 같은 항차(0535E ≡ 535E)",
          au.same_voyage("0535E", "535E") and au.same_voyage("0534W", "534W")
          and au.same_voyage("00221E", "221E"))
    check("판정 — 번호가 다르면 다른 항차", not au.same_voyage("0534E", "535E"))
    check("판정 — 방향이 다르면 다른 항차", not au.same_voyage("0534E", "0534W"))
    check("판정 — 문자 접두는 접두까지 같아야 한다(R083W ≠ 083W)",
          not au.same_voyage("R083W", "083W") and au.same_voyage("R083W", "R83W")
          and not au.same_voyage("R083W", "D083W"))
    check("판정 — 항차로 못 읽는 표기는 글자 그대로 비교(넘겨짚지 않는다)",
          au.same_voyage("ABC", "ABC") and not au.same_voyage("ABC", "ABCD"))
    check("voy_ident — (접두, 정수, 방향)",
          au.voy_ident("R083W") == ("R", 83, "loading")
          and au.voy_ident("0534E") == ("", 534, "discharge")
          and au.voy_ident("2607N") == ("", 2607, "discharge")
          and au.voy_ident("2635") is None)

    tmp = tempfile.mkdtemp(prefix="mailpilot_voy_")
    try:
        root = os.path.join(tmp, "MB")
        dis = _syn_baplie("535E", [("AAAU1000001", "2200", "CNSHA", "KRPTK", "0100284"),
                                   ("AAAU1000002", "2200", "CNNGB", "KRPTK", "0100286")])
        load = _syn_baplie("534W", [("BBBU2000001", "2200", "KRPTK", "CNSHA", "0200284")])

        # XTPG 실사례 — 파일 수까지 라이브 그대로(0534E 2 · 534E 3 · 0534W 7 · 534W 1 · 0535E 2 · 535E 6)
        _mk(root, "XTPG/0534E/CDL XTPG V-0534E(DWIC).xlsx", "x")
        _mk(root, "XTPG/0534E/CDL XTPG V-0534E(TCLC).xlsx", "x")
        _mk(root, "XTPG/534E/XTPG-534E&534W PTK DEP.TALLY REPORT.pdf", "x")
        _mk(root, "XTPG/534E/XTPG534WPTK.ASC", load)
        _mk(root, "XTPG/534E/XTPG534WPTK.EDI", load)
        for n in range(7):
            _mk(root, "XTPG/0534W/CLL XTPG V-0534W_%d.xlsx" % n, "x")
        _mk(root, "XTPG/534W/XTPG-534W LOAD EDI FILE.EDI", load)
        _mk(root, "XTPG/0535E/XTPG0535E_CDL.xlsx", "x")
        _mk(root, "XTPG/0535E/XTPG0535W CDL.xlsx", "x")
        _mk(root, "XTPG/535E/PTK XTPG 535E.ASC", dis)
        _mk(root, "XTPG/535E/PTK XTPG 535E.edi", dis)
        for name in ("PTK CDL OF XTPG 535E.xlsx", "DISCHE PLAN.pdf",
                     "OPR PLAN.pdf", "OPR SUMMARY.pdf"):
            _mk(root, "XTPG/535E/%s" % name, "x")
        # 검수 흔적이 있는 중복 키 — 지우지 않고 보고만 한다
        _mk(root, "XTPG/536E/PTK XTPG 536E.edi", dis)
        # DJCT — 0패딩이 정본. 중복이 없으니 무접촉(전역 패딩 제거 금지 회귀)
        _mk(root, "DJCT/0221E/DJCT 0221E PTK.edi", dis)
        # RZOR — 문자 접두가 다르면 합치지 않는다
        _mk(root, "RZOR/R083W/a.edi", load)
        _mk(root, "RZOR/083W/b.edi", load)

        db = FakeDB({
            "voyages/XTPG_0534E/info": _auto_info("XTPG", "0534E", voy_d="0534E"),
            "voyages/XTPG_0534W/info": _auto_info("XTPG", "0534W", voy_l="0534W"),
            "voyages/XTPG_0535E/info": _auto_info("XTPG", "0535E", voy_d="0535E"),
            "voyages/XTPG_534E/info": _auto_info("XTPG", "534E", voy_d="534E", voy_l="534W"),
            "voyages/XTPG_534E/loading/ediContainers": {
                "OLDU1000001": {"cn": "OLDU1000001", "pol": "KRPTK", "bay": "70"}},
            "voyages/XTPG_535E/info": _auto_info("XTPG", "535E", voy_d="535E"),
            "voyages/XTPG_535E/discharge/ediContainers": {
                "OLDU2000002": {"cn": "OLDU2000002", "pod": "KRPTK", "bay": "12"}},
            "voyages/XTPG_536E/info": _auto_info("XTPG", "536E", voy_d="536E"),
            "voyages/XTPG_0536E/info": _auto_info("XTPG", "0536E", voy_d="0536E"),
            "voyages/XTPG_0536E/records": {"r1": {"cn": "ZZZU9999999", "by": "김성일"}},
            "voyages/DJCT_0221E/info": _auto_info("DJCT", "0221E", voy_d="0221E"),
        })
        cache = {"names": {}, "codes": {}, "tally": {},
                 "pairs": {"XTPG": {"534E": "534W", "534W": "534E"}}}
        state = os.path.join(tmp, "u.json")
        with open(state, "w", encoding="utf-8") as fh:
            json.dump({"_v": au.STATE_V, "folders": {
                "XTPG/534E": {"fp": "old", "key": "XTPG_534E", "at": 1},
                "XTPG/0535E": {"fp": "old", "key": "XTPG_0535E", "at": 1},
                "DJCT/0221E": {"fp": "keep", "key": "DJCT_0221E", "at": 1}}}, fh)

        res = au.migrate_voyage_spelling(root, cache, VS_MASTER, db, _quiet, state_path=state)

        # (2) 폴더 병합 — 정본은 '자료가 많은 쪽'
        dirs = sorted(os.listdir(os.path.join(root, "XTPG")))
        check("폴더 병합 — XTPG 는 정본 폴더 3개만 남는다(0534W 는 자료가 많아 정본)",
              dirs == ["0534W", "534E", "535E", "536E"], "남은 폴더 %s" % dirs)
        counts = {d: len(os.listdir(os.path.join(root, "XTPG", d))) for d in dirs}
        check("폴더 병합 — 파일은 하나도 잃지 않는다(2+3=5 · 7+1=8 · 2+6=8)",
              counts == {"0534W": 8, "534E": 5, "535E": 8, "536E": 1}, "파일 수 %s" % counts)
        check("폴더 병합 — 정본 폴더가 EDI 를 승계한다",
              os.path.exists(os.path.join(root, "XTPG", "0534W", "XTPG-534W LOAD EDI FILE.EDI")))
        check("전역 패딩 제거 금지 — DJCT 0221E 는 손대지 않는다",
              sorted(os.listdir(os.path.join(root, "DJCT"))) == ["0221E"])
        check("문자 접두 — R083W 와 083W 는 다른 항차라 합치지 않는다",
              sorted(os.listdir(os.path.join(root, "RZOR"))) == ["083W", "R083W"])

        # (3) 서버 중복 키 정리
        check("서버 — 중복 항차 키 3개를 정본으로 합치고 지웠다",
              sorted(res["deleted"]) == ["XTPG_0534E", "XTPG_0534W", "XTPG_0535E"],
              "삭제 %s" % sorted(res["deleted"]))
        check("서버 — 검수 흔적(records)이 있는 중복 키는 지우지 않고 보고만 한다",
              res["held"] == ["XTPG_0536E"] and "voyages/XTPG_0536E/records" in db.data,
              "보류 %s" % res["held"])
        left = sorted((db.get("voyages", params={"shallow": "true"}) or {}).keys())
        check("서버 — 남은 항차 키 목록",
              left == ["DJCT_0221E", "XTPG_0536E", "XTPG_534E", "XTPG_535E", "XTPG_536E"],
              "남은 키 %s" % left)
        check("서버 — 정본 키의 EDI·info 는 그대로다(덮어쓰지 않는다)",
              (db.data.get("voyages/XTPG_534E/loading/ediContainers") or {}).keys()
              == {"OLDU1000001"}
              and (db.data.get("voyages/XTPG_535E/discharge/ediContainers") or {}).keys()
              == {"OLDU2000002"}
              and (db.data.get("voyages/XTPG_534E/info") or {}).get("voy_d") == "534E")

        # (4) 지문 무효화 — 합친 선박만
        left_state = au.load_state(state)["folders"]
        check("지문 — 합친 선박(XTPG)만 무효화, 다른 선박은 그대로",
              sorted(left_state) == ["DJCT/0221E"], "남은 지문 %s" % sorted(left_state))

        # (5) 새 메일 적재 — 같은 항차면 기존 폴더로
        check("적재 — V-0535E 메일은 기존 535E 폴더로 들어간다",
              core.voyage_dirname(root, ["XTPG"], "0535E") == "535E")
        check("적재 — 처음 보는 항차는 그 표기 그대로 새 폴더",
              core.voyage_dirname(root, ["XTPG"], "0540E") == "0540E")

        # (6) 짝 증거 — 표기가 달라도 이어진다
        check("짝 — 534W 로 적힌 증거가 0534W 폴더에 이어진다",
              au.paired_partner(cache, "XTPG", "0534W") == "534E"
              and au.paired_partner(cache, "XTPG", "0534E") == "534W")
        check("짝 — 표기만 다른 같은 짝은 '새 짝'으로 안 센다(로그 폭주 방지)",
              au.collect_pairs("XTPG 0534E&0534W REPORT", "XTPG", cache) == [])

        # (7) 키 결정 — 표기만 다른 기존 키를 재사용한다(새 키 금지)
        index = au.voyage_index(db, _quiet)
        check("키 — 0535E 자료는 기존 XTPG_535E 키로 간다",
              au.resolve_key(db, "XTPG", "0535E", (), index)[0] == "XTPG_535E")
        check("키 — 아예 새 항차는 새 키를 만든다",
              au.resolve_key(db, "XTPG", "0540E", (), index)[0] == "XTPG_0540E")

        # (8) 멱등 — 두 번째는 아무것도 하지 않는다
        db.calls = []
        res2 = au.migrate_voyage_spelling(root, cache, VS_MASTER, db, _quiet, state_path=state)
        check("멱등 — 두 번째 마이그레이션은 병합 0 · 삭제 0 · 쓰기 0",
              not res2["merged"] and not res2["deleted"] and res2["errors"] == 0
              and not db.writes("PUT") and not db.writes("PATCH") and not db.writes("DELETE"),
              "병합 %d · 삭제 %d · 쓰기 %d"
              % (len(res2["merged"]), len(res2["deleted"]),
                 len(db.writes("PUT")) + len(db.writes("DELETE"))))

        # (9) 병합 뒤 사이클 — 한 묶음 = 한 키, 새 키를 만들지 않는다
        res3 = au.run(root, cache, VS_MASTER, db, {}, _quiet, state_path=state)
        xtpg = sorted(k for k in res3["registered"] if k.startswith("XTPG_"))
        check("병합 뒤 사이클 — 534 는 한 묶음 한 키, 0패딩 키를 새로 만들지 않는다",
              xtpg == ["XTPG_534E", "XTPG_535E", "XTPG_536E"], "올린 키 %s" % xtpg)
        keys_now = sorted(k for k in (db.get("voyages", params={"shallow": "true"}) or {})
                          if k.startswith("XTPG_"))
        check("병합 뒤 사이클 — 0패딩 키가 되살아나지 않는다",
              keys_now == ["XTPG_0536E", "XTPG_534E", "XTPG_535E", "XTPG_536E"],
              "XTPG 키 %s" % keys_now)
        check("병합 뒤 사이클 — 선적 EDI 가 정본 키 loading 에 올라간다",
              "BBBU2000001" in (db.data.get("voyages/XTPG_534E/loading/ediContainers") or {}))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # (10) 서버·메일박스가 없어도 사이클을 죽이지 않는다
    check("메일박스가 없으면 조용히 건너뛴다",
          au.migrate_voyage_spelling("/nope", {}, VS_MASTER, FakeDB(), _quiet)["merged"] == [])
    check("정본표가 없으면 아무것도 합치지 않는다",
          au.migrate_voyage_spelling(tempfile.gettempdir(), {}, [], FakeDB(), _quiet)["merged"] == [])


# ────────────────────── 25) 0.6 선석배정 게이트 — 터미널이 항차의 진실 ──────────────────────
#   실응답 픽스처(2026-08-06 조회, 공개 자료):
#     tests/fixtures/berth_pnct_20260806.xml  — 넥사크로 Dataset ds_list 28줄
#     tests/fixtures/berth_pctc_20260806.html — 선석배정 차트 서버렌더 HTML 21줄
#   시각은 픽스처 조회 시점(2026-08-06 07:00)으로 못 박는다 — 오늘이 언제든 결과가 같아야 한다.

FIX_DIR = os.path.join(HERE, "fixtures")
BERTH_NOW = int(datetime.datetime(2026, 8, 6, 7, 0).timestamp() * 1000)


def _fixture(name):
    with open(os.path.join(FIX_DIR, name), "r", encoding="utf-8") as fh:
        return fh.read()


class _FakeRes:
    def __init__(self, body):
        self.body = body.encode("utf-8")

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeHTTP:
    """터미널 대역 — 부른 URL·본문·헤더를 남겨 '사이클당 1회'를 눈으로 확인한다."""

    def __init__(self, pnct=None, pctc=None, boom=()):
        self.pnct, self.pctc, self.boom = pnct, pctc, set(boom)
        self.calls = []

    def __call__(self, req, timeout=None):
        url = req.full_url
        body = req.data.decode("utf-8") if req.data else ""
        self.calls.append((url, body, dict(req.headers), timeout))
        if "pnct" in url:
            if "PNCT" in self.boom:
                raise IOError("연결 거부(시험)")
            return _FakeRes(self.pnct if self.pnct is not None else "")
        if "PCTC" in self.boom:
            raise IOError("연결 거부(시험)")
        return _FakeRes(self.pctc if self.pctc is not None else "")


def _berth_http(**kw):
    return FakeHTTP(pnct=_fixture("berth_pnct_20260806.xml"),
                    pctc=_fixture("berth_pctc_20260806.html"), **kw)


BERTH_CFG = {"berth_plan": True, "excluded_routes": ["PXS", "PQS", "JWKP"]}


def _valid_berth(text):
    """검수앱 src/utils.js isValidBerth 를 그대로 옮긴 잣대 — 수집기가 만든 표기가 통과하는가.

    통과 못 하는 값을 넣으면 앱이 저장된 berth 를 지워 버린다(HomePage 301행).
    """
    import re as _re
    value = str(text or "").strip()
    if not value:
        return False
    if _re.match(r"^[ewEW]\d+$", value):                 # E7/W6 단축형은 두 글자라도 통과
        return True
    if _re.match(r"^[A-Z]{3,5}$", value):                # 시설 약어(MBM·BCT) 차단
        return False
    return len(value) > 2


def test_berth_schedule():
    print("\n[25] 0.6 선석배정 게이트 — 터미널이 항차의 진실")
    try:
        import app_upload as au
        import berth_schedule as bs
    except Exception as exc:
        check("berth_schedule 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) PNCT 실응답 판독 — 값 형식 확정
    rows, why, notes = bs.parse_pnct(_fixture("berth_pnct_20260806.xml"), now_ms=BERTH_NOW)
    check("PNCT — 실응답 28줄을 읽는다", rows is not None and len(rows) == 28,
          why or "%d줄" % len(rows or []))
    by = {r["master_vvd"]: r for r in (rows or [])}
    obwh = by.get("OBWH090") or {}
    check("PNCT — 선사항차 짝 OBWH090(2705E/2706W) → voy_d/voy_l",
          obwh.get("voy_d") == "2705E" and obwh.get("voy_l") == "2706W",
          "%s/%s" % (obwh.get("voy_d"), obwh.get("voy_l")))
    check("PNCT — 선박코드는 VVD 앞 4자", obwh.get("vessel_code") == "OBWH")
    check("PNCT — &#32; 를 푼 선박명", obwh.get("vessel_name") == "OCEAN BLUE WHALE",
          repr(obwh.get("vessel_name")))
    check("PNCT — 시각 2026/08/05 10:00 → 2026-08-05 10:00",
          obwh.get("etb") == "2026-08-05 10:00" and obwh.get("atd") == "2026-08-05 18:30",
          "%s · %s" % (obwh.get("etb"), obwh.get("atd")))
    check("PNCT — ATD 가 지난 항차는 departed", obwh.get("departed") is True
          and obwh.get("status") == "departed")
    check("PNCT — 한쪽만 있는 짝 ATPR033(/2636W)",
          (by.get("ATPR033") or {}).get("voy_d") == ""
          and (by.get("ATPR033") or {}).get("voy_l") == "2636W")
    check("PNCT — 예정 항차는 planned · departed 아님",
          (by.get("TNJP059") or {}).get("status") == "planned"
          and (by.get("TNJP059") or {}).get("departed") is False)
    check("PNCT — 남/북 항차 NSDC009(2607N/2608S)",
          (by.get("NSDC009") or {}).get("voy_d") == "2607N"
          and (by.get("NSDC009") or {}).get("voy_l") == "2608S")
    # 0.6-02 — 검수사 화면 실측: F1 = 페리 선석 · T1~T3 = 1~3 Berth.
    check("PNCT — 선석 T2 → 앱 규약 '2번선석'(isValidBerth 통과) · 원문은 그대로",
          obwh.get("berth") == "2번선석" and obwh.get("berth_raw") == "T2"
          and obwh.get("pier") == "PNCT",
          "%r / %r" % (obwh.get("berth"), obwh.get("berth_raw")))
    check("PNCT — 선석 T3 → '3번선석'", (by.get("TNJP055") or {}).get("berth") == "3번선석",
          repr((by.get("TNJP055") or {}).get("berth")))
    check("PNCT — 페리 선석 F1 → '페리선석'",
          (by.get("RZOR078") or {}).get("berth") == "페리선석"
          and (by.get("RZOR078") or {}).get("berth_raw") == "F1",
          repr((by.get("RZOR078") or {}).get("berth")))
    check("PNCT — 실응답 28줄 모두 선석을 읽었다(빈 berth 없음)",
          all(r.get("berth") for r in (rows or [])),
          str([r["master_vvd"] for r in (rows or []) if not r.get("berth")]))
    check("PNCT — 모르는 선석 코드는 비우고 사유를 남긴다(지어내지 않는다)",
          bs.pnct_berth_text("T9") == "" and bs.pnct_berth_text("F2") == ""
          and bs.pnct_berth_text("") == "" and bs.pnct_berth_text("T3(S)") == "3번선석")
    check("PNCT — 만든 표기가 앱 isValidBerth 를 통과한다(3자 이상 · 대문자 약어 아님)",
          all(_valid_berth(r["berth"]) for r in (rows or [])),
          str(sorted({r["berth"] for r in (rows or [])})))

    # (2) PCTC 실응답 판독
    rows2, why2, notes2 = bs.parse_pctc(_fixture("berth_pctc_20260806.html"), now_ms=BERTH_NOW)
    check("PCTC — 실응답 21줄을 읽는다", rows2 is not None and len(rows2) == 21,
          why2 or "%d줄" % len(rows2 or []))
    by2 = {r["master_vvd"]: r for r in (rows2 or [])}
    stmj = by2.get("STMJ-0007-") or {}
    check("PCTC — 하이픈 짝 2643E-2644W → voy_d/voy_l",
          stmj.get("voy_d") == "2643E" and stmj.get("voy_l") == "2644W")
    check("PCTC — 모선항차 앞 4자가 선박코드", stmj.get("vessel_code") == "STMJ")
    check("PCTC — 완료 막대 + 출항시각이 지남 = departed",
          stmj.get("departed") is True and stmj.get("status") == "departed")
    check("PCTC — 계획완료 막대 + 접안시각이 지남 = working",
          (by2.get("PCSZ-0023-") or {}).get("status") == "working")
    check("PCTC — 계획완료 막대라도 접안 전이면 planned",
          (by2.get("SWSP-0007-") or {}).get("status") == "planned")
    check("PCTC — 선석 8B → 앱 규약 '동부두 8번선석'(isValidBerth 통과)",
          stmj.get("berth") == "동부두 8번선석" and stmj.get("berth_raw") == "8B"
          and stmj.get("pier") == "PCTC", repr(stmj.get("berth")))
    check("PCTC — 방향이 안 맞는 짝은 비운다(2606N-2606N · 2605W-2605W)",
          (by2.get("SWSP-0007-") or {}).get("voy_l") == ""
          and (by2.get("KBTR-0001-") or {}).get("voy_d") == ""
          and (by2.get("KBTR-0001-") or {}).get("voy_l") == "2605W"
          and any("2606N" in n for n in notes2))
    check("PCTC — 선사항차가 '-' 인 줄(유조선)은 짝 없이 통과",
          (by2.get("HDOT-0036-") or {}).get("voy_d") == ""
          and (by2.get("HDOT-0036-") or {}).get("voy_l") == "")

    # (3) 요청은 터미널당 딱 한 번 · 본문·헤더 모양
    http = _berth_http()
    rows3, why3 = bs.fetch_all(BERTH_CFG, None, opener=http, now_ms=BERTH_NOW)
    check("조회는 사이클당 터미널별 1회", len(http.calls) == 2, "%d회" % len(http.calls))
    check("PNCT 는 POST + 넥사크로 ds_cond 본문",
          "selectVslList.do" in http.calls[0][0] and "STR_DATE" in http.calls[0][1]
          and "text/xml" in json.dumps(http.calls[0][2]).lower())
    check("PCTC 는 GET(본문 없음)", "berthScheduleG" in http.calls[1][0]
          and http.calls[1][1] == "")
    check("타임아웃 20초", all(c[3] == 20 for c in http.calls))
    check("두 터미널 합계 49줄", rows3 is not None and len(rows3) == 49,
          why3 or "%d줄" % len(rows3 or []))
    check("비관할 항로(PXS·PQS·JWKP)에 excluded 표시",
          all(r["excluded"] == (r["route"] in ("PXS", "PQS", "JWKP")) for r in rows3))
    # 0.6-02 — 설정이 비어도 기본값을 찾아야 한다(옛 설정·시험 호출이 여기서 죽지 않게).
    check("설정에 excluded_routes 가 없으면 기본값(PXS·PQS·JWKP)",
          bs.excluded_routes({}) == ["PXS", "PQS", "JWKP"]
          and bs.excluded_routes(None) == ["PXS", "PQS", "JWKP"]
          and bs.excluded_routes({"excluded_routes": ["zzz"]}) == ["ZZZ"],
          str(bs.excluded_routes({})))

    # (4) 한쪽이라도 실패하면 배정표를 주지 않는다(반쪽으로 지우지 않기)
    for boom in ("PNCT", "PCTC"):
        bad = _berth_http(boom=[boom])
        rows4, why4 = bs.fetch_all(BERTH_CFG, None, opener=bad, now_ms=BERTH_NOW)
        check("%s 실패 사이클은 배정표 없음 + 사유" % boom,
              rows4 is None and bool(why4) and boom in why4, str(why4))
    empty = FakeHTTP(pnct="<Root/>", pctc="<html></html>")
    rows5, why5 = bs.fetch_all(BERTH_CFG, None, opener=empty, now_ms=BERTH_NOW)
    check("빈 응답도 조용히 넘기지 않고 사유를 남긴다", rows5 is None and bool(why5), str(why5))

    plan = au.BerthPlan(rows3)

    # (5) 항차 대조는 정수 비교(0패딩 흔들림) — 0.5-01 voy_ident 재사용
    check("대조 — 표기가 달라도 같은 항차면 찾는다(0221E ≡ 221E)",
          plan.find("DJCT", ["221E"]) is not None
          and plan.find("DJCT", ["0221E"]) is not None)
    check("대조 — 짝의 반대쪽으로도 찾는다(0222W → 같은 줄)",
          (plan.find("DJCT", ["0222W"]) or {}).get("voy_d") == "0221E")
    check("대조 — 배정표에 없는 항차는 None", plan.find("DJCT", ["9999E"]) is None
          and plan.find("ZZZZ", ["1E"]) is None)

    # (6) 등록 게이트
    cache = {"names": {}, "codes": {}, "tally": {}, "pairs": {}}
    ok_new, _r = au.registration_gate(plan, cache, "TNJP", ["26358E"])
    check("게이트 — 배정표에 있고 아직 안 나간 항차는 등록한다", ok_new)
    ok_dep, why_dep = au.registration_gate(plan, cache, "TNJP", ["26354E"])
    check("게이트 — 이미 나간 항차는 새 카드를 만들지 않는다(TNJP 26354E)",
          not ok_dep and "출항" in why_dep, why_dep)
    ok_ex, why_ex = au.registration_gate(plan, cache, "NGTR", ["2645E"])
    check("게이트 — 비관할 항로(PXS)는 새 카드를 만들지 않는다",
          not ok_ex and "비관할" in why_ex, why_ex)
    ok_out, _r = au.registration_gate(plan, cache, "MCAP", ["631S"])
    check("게이트 — 배정표에 없는 선박은 종전대로 받는다(fail-open)", ok_out)
    # 0.6-02 — 줄을 못 찾아도 '이 배는 통째로 비관할'이면 새 카드를 만들지 않는다.
    ok_off, why_off = au.registration_gate(plan, cache, "PCSG", ["2639E"])
    check("게이트 — 배정표 창 밖 항차라도 비관할 선박이면 막는다(PCSG 2639E)",
          not ok_off and "비관할" in why_off, why_off)
    check("선박 판정 — 배정표 줄이 모두 비관할일 때만 항로를 돌려준다",
          plan.excluded_route_for("PCSG") == "PQS"
          and plan.excluded_route_for("NGTR") == "PXS"
          and plan.excluded_route_for("TNJP") == ""
          and plan.excluded_route_for("ZZZZ") == "",
          "%r / %r" % (plan.excluded_route_for("PCSG"), plan.excluded_route_for("TNJP")))
    mixed = au.BerthPlan([
        {"vessel_code": "MIXD", "voy_d": "1E", "voy_l": "", "route": "PQS", "excluded": True},
        {"vessel_code": "MIXD", "voy_d": "3E", "voy_l": "", "route": "PTK", "excluded": False}])
    check("선박 판정 — 한 줄이라도 관할 항로면 선박 단위로 지우지 않는다(추측 금지)",
          mixed.excluded_route_for("MIXD") == "")
    ok_mix, _r = au.registration_gate(mixed, {"names": {}, "codes": {}}, "MIXD", ["9E"])
    check("게이트 — 항로가 섞인 선박은 종전대로 받는다(fail-open)", ok_mix)
    ok_none, _r = au.registration_gate(None, cache, "TNJP", ["26354E"])
    check("게이트 — 배정표를 못 받았으면 아무도 막지 않는다", ok_none)

    # (7) 기항 마감(DEP.TALLY)
    fresh = au.mark_closed("XTPG-534E&534W PTK DEP.TALLY REPORT.pdf", "XTPG", "534E", cache)
    check("DEP.TALLY — 제목·첨부명에서 마감을 읽고 짝까지 닫는다",
          set(fresh) == {"534E", "534W"}, str(fresh))
    check("DEP.TALLY — 표기가 달라도 같은 항차면 마감으로 본다(0534W)",
          bool(au.is_closed(cache, "XTPG", ["0534W"])))
    check("DEP.TALLY — 두 번째 메일은 새 마감이 아니다(로그 폭주 방지)",
          au.mark_closed("XTPG 534E DEP TALLY", "XTPG", "534E", cache) == [])
    ok_cl, why_cl = au.registration_gate(plan, cache, "XTPG", ["0534W"])
    check("게이트 — 마감된 항차는 새 카드를 만들지 않는다",
          not ok_cl and "마감" in why_cl, why_cl)
    check("DEP.TALLY — 그냥 'TALLY REPORT' 는 마감이 아니다",
          au.mark_closed("STSE 2657E&2658W PTK TALLY REPORT.xlsx", "STSE", "2657E", cache) == [])

    # (8) 배정표 짝 승격 — 갈라진 카드를 한 장으로 되돌리는 근거
    lines = []
    got = au.promote_pairs(plan, cache, lines.append)
    check("짝 승격 — 배정표의 선사항차 짝을 캐시에 올린다",
          au.paired_partner(cache, "TNJP", "26354E") == "26354W"
          and au.paired_partner(cache, "PCSZ", "2623E") == "2625W" and got > 0,
          "%d건" % got)
    check("짝 승격 — 비관할 항로는 올리지 않는다",
          au.paired_partner(cache, "NGTR", "2645E") == "")
    check("짝 승격 — 두 번째 호출은 0건(멱등)", au.promote_pairs(plan, cache, lines.append) == 0)

    # (9) info 보강 — 검수앱 계약(src/badgeRule.js · HomePage planDate)
    fresh_f, refresh_f = au.plan_info_fields(by.get("OBWH090"))
    check("보강 — planDate 는 '접안 ~ 출항'(실적 우선)",
          refresh_f.get("planDate") == "2026-08-05 10:00 ~ 2026-08-05 18:30",
          refresh_f.get("planDate"))
    check("보강 — planSrc 는 plan", refresh_f.get("planSrc") == "plan")
    check("보강 — terminalStatus 는 앱 계약값만",
          refresh_f.get("terminalStatus") in ("departed", "working", "planned"))
    check("보강 — vslFull 은 빈칸일 때만 채운다(fresh)",
          fresh_f.get("vslFull") == "OCEAN BLUE WHALE" and "vslFull" not in refresh_f)
    _f2, r2 = au.plan_info_fields(by2.get("STMJ-0007-"))
    check("보강 — PCTC 는 부두·선석까지 채운다",
          r2.get("pier") == "PCTC" and r2.get("berth") == "동부두 8번선석")
    check("보강 — PNCT 도 선석을 채운다(0.6-02 · T2 → 2번선석)",
          refresh_f.get("pier") == "PNCT" and refresh_f.get("berth") == "2번선석",
          "%r / %r" % (refresh_f.get("pier"), refresh_f.get("berth")))
    _f3, r3 = au.plan_info_fields(by2.get("XTPG-0029-"))
    check("보강 — 출항 시각이 없으면 planDate 를 아예 안 보낸다(지어내지 않는다)",
          "planDate" not in r3 and r3.get("terminalStatus") == "planned")

    _berth_reconcile(au, plan, http)


def _live_keys():
    """라이브(2026-08-06)에 실제로 올라가 있던 37키를 그대로 세운다 — 검수 흔적 없음·자동등록."""
    live = {
        "ATPR_2635E": ("2635E", ""), "ATPR_2635W": ("", "2635W"), "ATPR_2636W": ("", "2636W"),
        "DJCT_0221E": ("0221E", "0222W"), "DXQD_2629W": ("", "2629W"),
        "DXQD_2630E": ("2630E", "2630W"), "KSKM_2615S": ("", "2615S"),
        "MCAP_631S": ("", "631S"), "NSDC_2607N": ("2607N", ""), "NSFR_2615N": ("2615N", ""),
        "OBWH_2701E": ("2701E", "2702W"), "OBWH_2703E": ("2703E", "2704W"),
        "OBWH_2705E": ("2705E", "2706W"), "PCSG_2639E": ("2639E", ""),
        "PCSG_2640E": ("2640E", ""), "PCSG_2640W": ("", "2640W"), "PCSG_2641W": ("", "2641W"),
        "PCSZ_2623E": ("2623E", ""), "PCSZ_2625W": ("", "2625W"),
        "RZOR_R081E": ("R081E", "R081W"), "RZOR_R082E": ("R082E", "R082W"),
        "RZOR_R083E": ("R083E", "R083W"), "STMJ_2643E": ("2643E", ""),
        "STMJ_2644W": ("", "2644W"), "STSE_2657E": ("2657E", "2658W"),
        "SWDN_2608N": ("2608N", ""), "SWRG_2607N": ("2607N", ""), "SWSP_2606N": ("2606N", ""),
        "TMPZ_2023E": ("2023E", "2023W"), "TMPZ_2025E": ("2025E", ""),
        "TNJP_26354E": ("26354E", ""), "TNJP_26354W": ("", "26354W"),
        "TNJP_26355E": ("26355E", ""), "TNJP_26355W": ("", "26355W"),
        "XTPG_534E": ("534E", "534W"), "XTPG_535E": ("535E", ""), "YKTD_2612E": ("2612E", ""),
    }
    data = {}
    for key, (voy_d, voy_l) in live.items():
        code, voy = key.split("_", 1)
        extra = {}
        if voy_d:
            extra["voy_d"] = voy_d
        if voy_l:
            extra["voy_l"] = voy_l
        data["voyages/%s/info" % key] = _auto_info(code, voy, **extra)
    return data


def _berth_reconcile(au, plan, http):
    """(10) 라이브 37키를 그대로 세워 놓고 정리 한 판 — 병합·제거·보류·멱등."""
    cache = {"names": {}, "codes": {}, "tally": {}, "pairs": {}}
    data = _live_keys()
    data["voyages/TNJP_26355E/records"] = {"r1": {"cn": "ZZZU9999999", "by": "김성일"}}
    db = FakeDB(data)
    lines = []
    out = au.reconcile_with_plan(db, cache, plan, lines.append)
    text = "\n".join(lines)

    merged = {dup for dup, _canon in out["merged"]}
    check("정리 — 갈라진 짝을 배정표 근거로 한 장에 합친다(TNJP 26354W · STMJ 2644W · PCSZ 2625W)",
          {"TNJP_26354W", "STMJ_2644W", "PCSZ_2625W"} <= merged, str(sorted(merged)))
    check("정리 — 이미 나간 항차 카드를 치운다(OBWH 2701E/2703E/2705E · RZOR 3장 · DJCT 0221E)",
          {"OBWH_2701E", "OBWH_2703E", "OBWH_2705E", "RZOR_R081E", "RZOR_R082E",
           "RZOR_R083E", "DJCT_0221E", "TMPZ_2023E", "DXQD_2630E", "ATPR_2635E",
           "ATPR_2635W", "ATPR_2636W", "STMJ_2643E", "TNJP_26354E"} <= set(out["deleted"]),
          str(sorted(out["deleted"])))
    check("정리 — 검수 흔적이 있으면 나갔어도 지우지 않고 보고만 한다(TNJP 26355E)",
          "TNJP_26355E" in out["held"] and "TNJP_26355E" not in out["deleted"])
    check("정리 — 지우기 전에 대상 전체 목록을 사유와 함께 로그에 남긴다",
          "치울 카드" in text and "OBWH_2705E" in text and "비관할 항로 PQS" in text)
    check("정리 — 배정표에 없는 항차는 손대지 않는다(MCAP 631S · KSKM 2615S · YKTD 2612E)",
          not ({"MCAP_631S", "KSKM_2615S", "YKTD_2612E", "SWRG_2607N", "STSE_2657E",
                "XTPG_534E", "DXQD_2629W"} & set(out["deleted"] + out["held"])))
    # 0.6-02 — 비관할 항로(PQS) 카드는 이제 치운다. 2640E·2641W 는 배정표에 줄이 있고,
    #   2639E·2640W 는 창 밖이라 줄이 없다(선박 단위 판정으로 잡힌다).
    check("정리 — 비관할 항로(PQS) 카드를 치운다(PCSG 4장 · 줄이 있는 2장 + 창 밖 2장)",
          {"PCSG_2639E", "PCSG_2640E", "PCSG_2640W", "PCSG_2641W"} <= set(out["deleted"]),
          str(sorted(out["deleted"])))
    check("정리 — 비관할 항로 카드는 일정 보강도 하지 않는다(손대지 않고 지운다)",
          not [c for c in db.calls
               if c[0] in ("PUT", "PATCH") and "PCSG" in str(c[1])],
          str([c[:2] for c in db.calls if c[0] in ("PUT", "PATCH") and "PCSG" in str(c[1])]))
    check("정리 — 실패 0건", out["errors"] == 0, str(out["errors"]))

    # 37장 → 15장. 라이브라면 14장이지만 이 시험은 TNJP_26355E 에 검수 기록을 일부러 심어
    #   '나갔어도 흔적이 있으면 안 지운다'를 증명하므로 그 한 장이 더 남는다.
    left = sorted(k.split("/")[1] for k in db.data if k.endswith("/info"))
    check("정리 뒤 남은 카드 15장(37 → 15 · 흔적 있는 1장 포함)",
          len(left) == 15, "%d장: %s" % (len(left), ", ".join(left)))

    info = db.data.get("voyages/NSDC_2607N/info") or {}
    check("보강 — 배정표가 빈 짝을 채운다(NSDC 2607N → voy_l 2608S)",
          info.get("voy_l") == "2608S", json.dumps(info, ensure_ascii=False))
    check("보강 — 작업(예정)일시·상태·부두·선석이 채워진다",
          info.get("planDate") == "2026-08-07 21:00 ~ 2026-08-08 05:00"
          and info.get("planSrc") == "plan" and info.get("terminalStatus") == "planned"
          and info.get("pier") == "PNCT" and info.get("berth") == "2번선석",
          json.dumps(info, ensure_ascii=False))
    check("보강 — 사람이 넣은 값(vsl·createdBy·autoRegistered)은 그대로",
          info.get("createdBy") == "자동등록(수집기)" and info.get("vsl") == "NSDC"
          and info.get("autoRegistered") is True)
    merged_info = db.data.get("voyages/PCSZ_2623E/info") or {}
    check("병합 — 정본 카드가 양쪽 항차를 다 갖는다(PCSZ 2623E + 2625W)",
          merged_info.get("voy_d") == "2623E" and merged_info.get("voy_l") == "2625W"
          and merged_info.get("terminalStatus") == "working")
    check("null 을 보내지 않는다", not _nulls([c[2] for c in db.calls if c[0] in ("PUT", "PATCH")]))

    # 멱등 — 한 번 더 돌려도 지우거나 합칠 것이 없다
    before = len(db.calls)
    out2 = au.reconcile_with_plan(db, cache, plan, lines.append)
    check("정리 — 두 번째 판은 병합 0 · 삭제 0(멱등)",
          not out2["merged"] and not out2["deleted"] and out2["errors"] == 0,
          "%s / %s" % (out2["merged"], out2["deleted"]))
    check("멱등 — 두 번째 판은 쓰기(PUT/PATCH/DELETE)가 없다",
          not [c for c in db.calls[before:] if c[0] in ("PUT", "PATCH", "DELETE")],
          str([c[:2] for c in db.calls[before:] if c[0] in ("PUT", "PATCH", "DELETE")]))

    # 0.6-02 — 비관할 항로라도 검수 흔적·사람이 만든 카드는 지우지 않고 보고만 한다.
    db3 = FakeDB({
        "voyages/PCSG_2640E/info": _auto_info("PCSG", "2640E", voy_d="2640E"),
        "voyages/PCSG_2640E/records": {"r1": {"cn": "ZZZU9999999", "by": "김성일"}},
        "voyages/PCSG_2641W/info": dict(_auto_info("PCSG", "2641W", voy_l="2641W"),
                                        autoRegistered=False, createdBy="김성일"),
    })
    lines3 = []
    out3 = au.reconcile_with_plan(db3, {"names": {}, "codes": {}, "tally": {}, "pairs": {}},
                                  plan, lines3.append)
    check("정리 — 비관할 항로라도 검수 흔적이 있으면 지우지 않는다(PCSG 2640E)",
          "PCSG_2640E" in out3["held"] and "PCSG_2640E" not in out3["deleted"]
          and "voyages/PCSG_2640E/info" in db3.data, str(out3))
    check("정리 — 비관할 항로라도 사람이 만든 카드는 지우지 않는다(PCSG 2641W)",
          "PCSG_2641W" in out3["held"] and "PCSG_2641W" not in out3["deleted"]
          and "voyages/PCSG_2641W/info" in db3.data, str(out3))
    check("정리 — 보류한 카드는 사유를 로그에 남긴다",
          "검수 흔적" in "\n".join(lines3) and "사람이 만든" in "\n".join(lines3))

    _berth_cycle(au, http)


def _berth_cycle(au, http):
    """(11) 종단 — 사이클 한 판에서 게이트가 새 카드를 막고, 폴더·파일은 그대로인지."""
    tmp = tempfile.mkdtemp(prefix="mailpilot_berth_")
    try:
        root = os.path.join(tmp, "MB")
        dis = _syn_baplie("26354E", [("AAAU1000001", "2200", "CNSHA", "KRPTK", "0100284")])
        load = _syn_baplie("26358W", [("BBBU2000001", "2200", "KRPTK", "CNSHA", "0200284")])
        _mk(root, "TNJP/26354E/TNJP 26354E PTK.edi", dis)      # 이미 나간 항차
        _mk(root, "TNJP/26358E/TNJP 26358E PTK.edi", dis)      # 배정표에 있는 앞으로의 항차
        _mk(root, "NGTR/2645E/NGTR 2645E PTK.edi", dis)        # 비관할 항로(PXS)
        _mk(root, "MCAP/631S/MCAP 631S PTK.edi", load)         # 배정표에 없는 선박(fail-open)
        master = [{"code": c, "name": c, "aliases": [], "ko": []}
                  for c in ("TNJP", "NGTR", "MCAP")]
        db = FakeDB({})
        cache = {"names": {}, "codes": {}, "tally": {}, "pairs": {}}
        lines = []
        cfg = dict(BERTH_CFG)
        cfg["home_port_aliases"] = ["PTK", "KRPTK"]
        state_path = os.path.join(tmp, "upload_state.json")
        res = au.run(root, cache, master, db, cfg, lines.append, state_path=state_path,
                     opener=http, now_ms=BERTH_NOW)
        keys = sorted(k.split("/")[1] for k in db.data if k.endswith("/info"))
        # 0.7 — 배정표에 실린 앞으로의 TNJP 기항은 자료가 없어도 예정 카드로 선다.
        #   막아야 할 것(이미 나간 항차·비관할 항로)이 안 서는 것이 이 시험의 뼈대다.
        check("종단 — 이미 나간 항차·비관할 항로는 카드를 만들지 않는다",
              "TNJP_26354E" not in keys and "NGTR_2645E" not in keys
              and "MCAP_631S" in keys and "TNJP_26358E" in keys, str(keys))
        check("종단 — 막은 항차를 로그와 결과에 남긴다",
              set(res["blocked"]) == {"TNJP_26354E", "NGTR_2645E"}, str(res["blocked"]))
        check("종단(0.7) — 자료가 없는 앞으로의 기항도 예정 카드로 선다(TNJP 26356E·26357E)",
              {"TNJP_26356E", "TNJP_26357E"} <= set(keys)
              and set(res["expected"]) >= {"TNJP_26356E", "TNJP_26357E"}, str(keys))
        check("종단(0.7) — 자료가 닿은 예정 카드는 collecting 으로 넘어간다(TNJP 26358E)",
              (db.data.get("voyages/TNJP_26358E/info") or {}).get("autoStatus") == "collecting"
              and (db.data.get("voyages/TNJP_26356E/info") or {}).get("autoStatus") == "expected",
              json.dumps(db.data.get("voyages/TNJP_26358E/info"), ensure_ascii=False))
        check("종단(0.7) — 예정 카드에는 자료 노드(discharge/loading)를 만들지 않는다",
              not [k for k in db.data if k.startswith("voyages/TNJP_26356E/")
                   and not k.endswith("/info")],
              str([k for k in db.data if k.startswith("voyages/TNJP_26356E/")]))
        check("종단 — 배정표에 없는 선박은 종전대로 올라간다(fail-open)",
              "voyages/MCAP_631S/loading/ediContainers" in db.data)
        check("종단 — 배정표가 새 카드에 일정을 실어 준다",
              (db.data.get("voyages/TNJP_26358E/info") or {}).get("planSrc") == "plan"
              and (db.data.get("voyages/TNJP_26358E/info") or {}).get("voy_l") == "26358W")
        check("종단 — 폴더·파일은 그대로다(막았다고 지우지 않는다)",
              os.path.isfile(os.path.join(root, "TNJP", "26354E", "TNJP 26354E PTK.edi"))
              and os.path.isfile(os.path.join(root, "NGTR", "2645E", "NGTR 2645E PTK.edi")))

        # 배정표를 못 받은 사이클 — 게이트도 정리도 하지 않는다(자료를 잃지 않는 쪽)
        db2 = FakeDB({})
        lines2 = []
        bad = FakeHTTP(pnct=_fixture("berth_pnct_20260806.xml"),
                       pctc=_fixture("berth_pctc_20260806.html"), boom=["PCTC"])
        res2 = au.run(root, {"names": {}, "codes": {}, "tally": {}, "pairs": {}}, master, db2,
                      cfg, lines2.append, state_path=os.path.join(tmp, "s2.json"),
                      reconcile=True, opener=bad, now_ms=BERTH_NOW)
        keys2 = sorted(k.split("/")[1] for k in db2.data if k.endswith("/info"))
        check("배정표 실패 — 게이트 없이 종전대로 돈다(0.5-01 회귀)",
              keys2 == ["MCAP_631S", "NGTR_2645E", "TNJP_26354E", "TNJP_26358E"], str(keys2))
        check("배정표 실패 — 정리(삭제)를 아예 하지 않는다",
              res2["planReconciled"] is False
              and not [c for c in db2.calls if c[0] == "DELETE"])
        check("배정표 실패 — 사유를 로그 한 줄로 남긴다(조용한 실패 금지)",
              any("배정표를 받지 못해" in l for l in lines2), "")
        check("설정에서 끄면 바깥 사이트를 아예 부르지 않는다",
              au.fetch_plan({"berth_plan": False}, None)[0] is None)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ────────────────────── 26) 0.7 예정등록 — 자료보다 먼저 카드가 선다 ──────────────────────
#   같은 실응답 픽스처(2026-08-06 07:00)를 쓴다. 배정표 줄만 보고 세우는 카드이므로
#   '무엇이 서고 무엇이 안 서는가'가 곧 계약이다.

EXPECTED_MASTER_CODES = ("OBWH", "RZOR", "TNJP", "HAYN", "KBTR", "NSDC", "ATPR", "DXQD",
                         "TMPZ", "DJCF", "SWBT", "XTPG", "PCSZ", "SWSP", "NSFR", "SWDN",
                         "NGTR", "PCSG", "MCAP", "STMJ", "DJCT")

# 이 배정표(2026-08-06 07:00)에서 예정 카드가 서야 할 항차 — 손으로 대조한 정본.
EXPECTED_KEYS = [
    "ATPR_2636E", "ATPR_2637W", "DJCF_0149N", "DXQD_2631E", "HAYN_9001E", "KBTR_2605W",
    "NSDC_2607N", "NSFR_2615N", "OBWH_2707E", "OBWH_2709E", "OBWH_2711E", "PCSZ_2623E",
    "PCSZ_2625E", "RZOR_R084E", "RZOR_R085E", "RZOR_R086E", "SWBT_2614S", "SWDN_2608N",
    "SWSP_2606N", "TMPZ_2025E", "TMPZ_2026E", "TNJP_26356E", "TNJP_26357E", "TNJP_26358E",
    "XTPG_535E",
]


def _expected_master():
    return [{"code": c, "name": c, "aliases": [], "ko": []} for c in EXPECTED_MASTER_CODES]


def _plain_cache():
    return {"names": {}, "codes": {}, "tally": {}, "pairs": {}}


def _expected_info(code, voy, **extra):
    """0.7 예정등록이 만든 모양의 info."""
    info = {"vsl": code, "voy": voy, "mode": "discharge" if voy[-1] in "EN" else "loading",
            "createdAt": 1785944829801, "createdBy": "예정등록(수집기)",
            "autoRegistered": True, "autoStatus": "expected"}
    info.update(extra)
    return info


def _departed_plan(au, rows, master_vvd, atd):
    """한 줄만 '실적 출항'으로 바꾼 배정표 — 예정 카드 철수 시험용(원본은 안 건드린다)."""
    copy = json.loads(json.dumps(rows, ensure_ascii=False))
    for row in copy:
        if row.get("master_vvd") == master_vvd:
            row["atd"] = atd
            row["status"] = "departed"
            row["departed"] = True
    return au.BerthPlan(copy)


def test_expected_cards():
    print("\n[26] 0.7 예정등록 — 배정표 줄로 카드를 미리 세운다")
    try:
        import app_upload as au
        import berth_schedule as bs
    except Exception as exc:
        check("app_upload 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return
    rows, why = bs.fetch_all(BERTH_CFG, None, opener=_berth_http(), now_ms=BERTH_NOW)
    if rows is None:
        check("예정등록 — 배정표 픽스처", False, str(why))
        return
    plan = au.BerthPlan(rows)
    master = _expected_master()
    cfg = dict(BERTH_CFG)

    # (1) 빈 서버에 한 판 — 무엇이 서는가
    db, cache, lines = FakeDB({}), _plain_cache(), []
    out = au.register_expected(plan, cache, master, db, cfg, lines.append)
    keys = sorted(k.split("/")[1] for k in db.data if k.endswith("/info"))
    check("예정등록 — 배정표가 말하는 앞으로의 기항이 전부 카드로 선다(25장)",
          keys == EXPECTED_KEYS and sorted(out["created"]) == EXPECTED_KEYS,
          "%d장: %s" % (len(keys), ", ".join(keys)))
    check("예정등록 — 검수사 화면의 예정 카드가 그대로 선다(OBWH 2707E·RZOR R084E·"
          "TNJP 26356E·HAYN 9001E·KBTR 2605W)",
          {"OBWH_2707E", "RZOR_R084E", "TNJP_26356E", "HAYN_9001E", "KBTR_2605W"} <= set(keys))
    check("예정등록 — 세운 카드 목록을 로그 한 줄로 남긴다",
          any("새 예정 카드" in l and "OBWH_2707E" in l for l in lines), "")

    # (2) info 계약 — 현장 계약 그대로(PUT 한 번, 섹션은 안 만든다)
    info = db.data.get("voyages/OBWH_2707E/info") or {}
    check("예정 info — vsl·voy·mode·짝(voy_d/voy_l)",
          info.get("vsl") == "OBWH" and info.get("voy") == "2707E"
          and info.get("mode") == "discharge" and info.get("voy_d") == "2707E"
          and info.get("voy_l") == "2708W", json.dumps(info, ensure_ascii=False))
    check("예정 info — createdBy 예정등록(수집기) · autoRegistered · autoStatus expected",
          info.get("createdBy") == "예정등록(수집기)" and info.get("autoRegistered") is True
          and info.get("autoStatus") == "expected", json.dumps(info, ensure_ascii=False))
    check("예정 info — createdAt 은 밀리초 숫자",
          isinstance(info.get("createdAt"), int) and info["createdAt"] > 1_600_000_000_000,
          str(info.get("createdAt")))
    check("예정 info — 배정표 일정·부두·선석·상태·실명이 함께 실린다",
          info.get("planDate") == "2026-08-07 10:00 ~ 2026-08-07 19:00"
          and info.get("planSrc") == "plan" and info.get("terminalStatus") == "planned"
          and info.get("pier") == "PNCT" and info.get("berth") == "2번선석"
          and info.get("vslFull") == "OCEAN BLUE WHALE", json.dumps(info, ensure_ascii=False))
    check("예정 info — 만드는 것은 info 하나(PUT 1회 · 섹션은 자료가 올 때)",
          [c for c in db.calls if c[0] == "PUT" and "OBWH_2707E" in c[1]]
          == [("PUT", "voyages/OBWH_2707E/info", info)]
          and not [k for k in db.data if k.startswith("voyages/OBWH_2707E/")
                   and not k.endswith("/info")],
          str([k for k in db.data if k.startswith("voyages/OBWH_2707E/")]))
    check("예정등록 — 양하 항차가 없으면 선적 카드로 선다(KBTR 2605W · ATPR 2637W)",
          (db.data.get("voyages/KBTR_2605W/info") or {}).get("mode") == "loading"
          and (db.data.get("voyages/ATPR_2637W/info") or {}).get("mode") == "loading"
          and "voy_d" not in (db.data.get("voyages/KBTR_2605W/info") or {}))
    check("예정등록 — null 을 보내지 않는다",
          not _nulls([c[2] for c in db.calls if c[0] in ("PUT", "PATCH")]))

    # (3) 서면 안 되는 줄
    check("예정등록 — 이미 나간 항차는 세우지 않는다(OBWH 2705E·TNJP 26354E·STMJ 2643E·DJCT 0221E)",
          not ({"OBWH_2705E", "TNJP_26354E", "STMJ_2643E", "DJCT_0221E", "RZOR_R083E",
                "ATPR_2635E", "DXQD_2630E", "TMPZ_2023E"} & set(keys)), str(keys))
    check("예정등록 — 비관할 항로는 세우지 않는다(NGTR PXS · PCSG PQS · XINP JWKP)",
          not [k for k in keys if k.startswith(("NGTR_", "PCSG_", "XINP_"))], str(keys))
    check("예정등록 — 정본표에 없는 배는 세우지 않는다(HDOT·HDOB·XINP)",
          not [k for k in keys if k.startswith(("HDOT_", "HDOB_", "XINP_"))], str(keys))
    check("예정등록 — 선사항차를 못 읽은 줄(유조선)은 세우지 않는다",
          not [k for k in keys if k.split("_")[0] in ("HDOT", "HDOB")], str(keys))
    off = _plain_cache()
    core.set_tally(off, "OBWH", False)
    db_off = FakeDB({})
    au.register_expected(plan, off, master, db_off, cfg, lines.append)
    check("예정등록 — 검수 대상 체크를 끈 배는 세우지 않는다(OBWH)",
          not [k for k in db_off.data if k.startswith("voyages/OBWH_")],
          str(sorted(db_off.data)[:4]))
    closed = _plain_cache()
    au.mark_closed("OBWH 2707E&2708W PTK DEP.TALLY REPORT.pdf", "OBWH", "2707E", closed)
    db_cl = FakeDB({})
    au.register_expected(plan, closed, master, db_cl, cfg, lines.append)
    check("예정등록 — 기항 마감(DEP.TALLY)된 항차는 세우지 않는다(OBWH 2707E)",
          "voyages/OBWH_2707E/info" not in db_cl.data
          and "voyages/OBWH_2709E/info" in db_cl.data, str(sorted(db_cl.data)[:4]))
    db_no = FakeDB({})
    au.register_expected(plan, _plain_cache(), master, db_no,
                         dict(cfg, expected_cards=False), lines.append)
    check("예정등록 — 설정에서 끄면 아무것도 쓰지 않는다(expected_cards)",
          not db_no.data and not [c for c in db_no.calls if c[0] != "GET"], str(db_no.calls))

    # (4) 멱등 — 배정표 줄이 그대로면 다시 쓰지 않는다
    before = len(db.calls)
    out2 = au.register_expected(plan, cache, master, db, cfg, lines.append)
    check("예정등록 — 두 번째 사이클은 쓰기(PUT/PATCH/DELETE) 0(멱등)",
          not [c for c in db.calls[before:] if c[0] in ("PUT", "PATCH", "DELETE")]
          and not out2["created"] and out2["skipped"] == 25,
          "%s / skipped=%d" % ([c[:2] for c in db.calls[before:]
                                if c[0] in ("PUT", "PATCH", "DELETE")], out2["skipped"]))
    check("예정등록 — 두 번째 사이클은 서버를 읽지도 않는다(지문이 같으면 조회 0)",
          not [c for c in db.calls[before:] if c[0] == "GET"
               and c[1].startswith("voyages/") and c[1] != "voyages"],
          str([c[:2] for c in db.calls[before:] if c[0] == "GET"][:5]))

    # (5) 이미 있는 키 재사용 — 표기가 달라도 새 카드를 만들지 않는다(이중 카드 금지)
    db2 = FakeDB({
        "voyages/TNJP_026356E/info": _auto_info("TNJP", "026356E", voy_d="026356E"),
        "voyages/TNJP_026356E/discharge/ediContainers": {
            "OLDU1000001": {"cn": "OLDU1000001", "pod": "KRPTK", "bay": "12"}},
    })
    cache2, lines2 = _plain_cache(), []
    out3 = au.register_expected(plan, cache2, master, db2, cfg, lines2.append)
    keys2 = sorted(k.split("/")[1] for k in db2.data if k.endswith("/info"))
    kept = db2.data.get("voyages/TNJP_026356E/info") or {}
    check("예정등록 — 표기가 다른 같은 항차 키가 있으면 새 카드를 만들지 않는다(026356E ≡ 26356E)",
          "TNJP_26356E" not in keys2 and "TNJP_026356E" in keys2
          and "TNJP_026356E" in out3["filled"], str([k for k in keys2 if "TNJP" in k]))
    check("예정등록 — 기존 카드는 0.6 보강 경로 그대로(상태·만든이 무접촉 · 일정만 채움)",
          kept.get("autoStatus") == "collecting" and kept.get("createdBy") == "자동등록(수집기)"
          and kept.get("voy_l") == "26356W" and kept.get("planSrc") == "plan"
          and kept.get("berth") == "3번선석", json.dumps(kept, ensure_ascii=False))
    check("예정등록 — 기존 카드의 자료 노드는 손대지 않는다",
          db2.data.get("voyages/TNJP_026356E/discharge/ediContainers", {}).get("OLDU1000001"))

    # (6) expected → collecting — 실자료가 처음 닿는 순간만 넘어간다
    db3 = FakeDB({"voyages/OBWH_2707E/info": _expected_info("OBWH", "2707E", voy_d="2707E")})
    lines3 = []
    au.register_voyage(db3, "OBWH_2707E", "OBWH", "2707E", "2707E", "2708W", lines3.append)
    check("전이 — 실자료 등록(source mail)이 예정 카드를 collecting 으로 넘긴다",
          (db3.data.get("voyages/OBWH_2707E/info") or {}).get("autoStatus") == "collecting",
          json.dumps(db3.data.get("voyages/OBWH_2707E/info"), ensure_ascii=False))
    check("전이 — 만든이·만든시각 같은 다른 필드는 건드리지 않는다",
          (db3.data.get("voyages/OBWH_2707E/info") or {}).get("createdBy") == "예정등록(수집기)"
          and (db3.data.get("voyages/OBWH_2707E/info") or {}).get("createdAt") == 1785944829801)
    db4 = FakeDB({"voyages/OBWH_2707E/info": _expected_info("OBWH", "2707E", voy_d="2707E")})
    au.register_voyage(db4, "OBWH_2707E", "OBWH", "2707E", "2707E", "", lines3.append,
                       plan.find("OBWH", ["2707E"]), source="plan")
    au.register_voyage(db4, "OBWH_2707E", "OBWH", "2707E", "2707E", "", lines3.append,
                       plan.find("OBWH", ["2707E"]), source="expected")
    check("전이 — 배정표 보강·예정등록만으로는 넘어가지 않는다(자료가 진짜 와야 한다)",
          (db4.data.get("voyages/OBWH_2707E/info") or {}).get("autoStatus") == "expected",
          json.dumps(db4.data.get("voyages/OBWH_2707E/info"), ensure_ascii=False))
    db5 = FakeDB({"voyages/OBWH_2707E/info": _auto_info("OBWH", "2707E", voy_d="2707E")})
    before5 = len(db5.calls)
    au.register_voyage(db5, "OBWH_2707E", "OBWH", "2707E", "2707E", "", lines3.append)
    check("전이 — 이미 collecting 인 카드에는 상태를 다시 쓰지 않는다",
          not [c for c in db5.calls[before5:] if c[0] == "PATCH"], str(db5.calls[before5:]))

    # (7) 철수 — 배정표가 '나갔다'고 말하면 그 자리에서 치운다
    sailed = _departed_plan(au, rows, "OBWH091", "2026-08-06 05:00")
    lines4 = []
    out4 = au.register_expected(sailed, cache, master, db, cfg, lines4.append)
    check("철수 — 출항한 예정 카드를 그 사이클에 치운다(OBWH 2707E)",
          out4["retired"] == ["OBWH_2707E"] and "voyages/OBWH_2707E/info" not in db.data,
          "%s / %s" % (out4["retired"], "OBWH_2707E" in str(sorted(db.data))))
    check("철수 — 사유를 로그에 남긴다(조용한 삭제 금지)",
          any("예정 카드 철수" in l for l in lines4), "")
    check("철수 — 다른 예정 카드는 그대로다",
          "voyages/OBWH_2709E/info" in db.data and "voyages/TNJP_26356E/info" in db.data)
    out5 = au.register_expected(sailed, cache, master, db, cfg, lines4.append)
    check("철수 — 두 번째 판은 치울 것도 세울 것도 없다(멱등)",
          not out5["retired"] and not out5["created"] and out5["errors"] == 0, str(out5))
    db6 = FakeDB({
        "voyages/OBWH_2707E/info": _expected_info("OBWH", "2707E", voy_d="2707E"),
        "voyages/OBWH_2707E/records": {"r1": {"cn": "ZZZU9999999", "by": "김성일"}},
    })
    cache6 = _plain_cache()
    cache6["expected"] = {"OBWH": {"2707E/2708W": {"sig": "x", "key": "OBWH_2707E"}}}
    lines6 = []
    out6 = au.register_expected(sailed, cache6, master, db6, cfg, lines6.append)
    check("철수 — 검수 흔적이 있으면 지우지 않고 보고만 한다",
          out6["held"] == ["OBWH_2707E"] and "voyages/OBWH_2707E/info" in db6.data, str(out6))
    db7 = FakeDB({"voyages/OBWH_2707E/info": _auto_info("OBWH", "2707E", voy_d="2707E")})
    cache7 = _plain_cache()
    cache7["expected"] = {"OBWH": {"2707E/2708W": {"sig": "x", "key": "OBWH_2707E"}}}
    au.register_expected(sailed, cache7, master, db7, cfg, lines6.append)
    check("철수 — 자료가 닿아 collecting 이 된 카드는 예정 철수가 손대지 않는다",
          "voyages/OBWH_2707E/info" in db7.data)

    # (8) 기동 정리 — 배정표 창 밖으로 밀린 '빈 예정 카드'
    db8 = FakeDB({
        "voyages/ZZZA_1E/info": _expected_info("ZZZA", "1E", voy_d="1E"),
        "voyages/ZZZB_1E/info": _expected_info("ZZZB", "1E", voy_d="1E"),
        "voyages/ZZZB_1E/discharge/ediContainers": {
            "OLDU1000001": {"cn": "OLDU1000001", "pod": "KRPTK"}},
        "voyages/ZZZC_1E/info": _expected_info("ZZZC", "1E", voy_d="1E"),
        "voyages/ZZZC_1E/records": {"r1": {"cn": "ZZZU9999999", "by": "김성일"}},
        "voyages/ZZZD_1E/info": _auto_info("ZZZD", "1E", voy_d="1E"),
        "voyages/ZZZE_1E/info": dict(_expected_info("ZZZE", "1E", voy_d="1E"),
                                     autoRegistered=False, createdBy="김성일"),
    })
    cache8 = _plain_cache()
    cache8["expected"] = {"ZZZA": {"1E/-": {"sig": "x", "key": "ZZZA_1E"}}}
    lines8 = []
    out8 = au.reconcile_with_plan(db8, cache8, plan, lines8.append)
    check("기동 정리 — 배정표 창 밖으로 밀린 빈 예정 카드를 치운다(ZZZA)",
          out8["deleted"] == ["ZZZA_1E"] and "voyages/ZZZA_1E/info" not in db8.data,
          str(out8["deleted"]))
    check("기동 정리 — 자료가 담긴 예정 카드는 치우지 않는다(ZZZB)",
          "voyages/ZZZB_1E/info" in db8.data and "ZZZB_1E" not in out8["deleted"])
    check("기동 정리 — 검수 흔적이 있는 예정 카드는 치우지 않는다(ZZZC)",
          "voyages/ZZZC_1E/info" in db8.data and "ZZZC_1E" not in out8["deleted"])
    check("기동 정리 — 자료를 받는 중(collecting)인 카드는 종전대로 손대지 않는다(ZZZD)",
          "voyages/ZZZD_1E/info" in db8.data and "ZZZD_1E" not in out8["deleted"])
    check("기동 정리 — 사람이 만든 카드는 예정 표시가 있어도 치우지 않는다(ZZZE)",
          "voyages/ZZZE_1E/info" in db8.data and "ZZZE_1E" not in out8["deleted"])
    check("기동 정리 — 지운 카드의 예정등록 지문도 함께 지운다(다시 세우지 않게)",
          not (cache8.get("expected") or {}).get("ZZZA"),
          json.dumps(cache8.get("expected"), ensure_ascii=False))
    before8 = len(db8.calls)
    out9 = au.reconcile_with_plan(db8, cache8, plan, lines8.append)
    check("기동 정리 — 두 번째 판은 지울 것이 없다(멱등)",
          not out9["deleted"] and not [c for c in db8.calls[before8:] if c[0] == "DELETE"],
          str(out9["deleted"]))


# ────────────────────── 27) 0.7-01 미분류 재판독 ──────────────────────
#
# 실제로 NAVERMAILBOX/_미분류 에 남아 있던 폴더 이름을 그대로 쓴다(정본표 0.4 이전에 떨어진 것들).
# 지키는 선: 못 읽으면 그대로 · 파일은 옮기기만(같은 크기 스킵 · 다르면 '(2)') · 빈 폴더만 rmdir ·
#            _기타(체크 끔)는 무접촉 · 두 번 돌려도 안전(멱등).

# (폴더이름, 안에 든 파일들, 기대 코드, 기대 항차) — None 이면 잔류(판독 실패)
UNFILED_CASES = [
    ("20260805_일조국제물류) R083W CLL 송부 드립니다._최종",
     ["R083W_CLL Data 최종.xls"], "RZOR", "R083W"),
    ("20260805_연태훼리 2706W CLL 2차 (컨씰넘버최종본_231VAN)",
     ["2706W CLL Data_vgm 2차.xls"], "OBWH", "2706W"),
    ("20260803_[연운항훼리] 26355W LOADING LIST - 최종",
     ["26355W 최종.xlsx"], "TNJP", "26355W"),
    ("20260802_日照东方船图 R082E", ["2甲.PDF", "3甲.PDF"], "RZOR", "R082E"),
    ("20260805_6일 선석운영계획표 송부", ["8월6일 선석운영계획표.xlsx"], None, None),
    ("20260805_PCSZ 검수 자료", ["BAY PLAN.pdf"], None, None),
    ("20260803_2026년 7월 두우해운 빌 항차", ["BILL LINE-2026년 7월.xlsx"], None, None),
]


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def test_reclassify_unfiled():
    print("\n[27] 0.7-01 미분류 재판독 — 정본표 이전에 _미분류 로 떨어진 메일을 제자리로")
    import app_upload as au
    tmp = tempfile.mkdtemp(prefix="mailpilot_unfiled_")
    root = os.path.join(tmp, "MAILBOX")
    log_dir = tempfile.mkdtemp(prefix="mailpilot_unfiled_log_")   # 실 로그 폴더 격리
    state_path = os.path.join(tmp, "upload_state.json")
    try:
        unfiled = os.path.join(root, core.UNCLASSIFIED_DIR)
        for name, files, _code, _voy in UNFILED_CASES:
            for fname in files:
                _write(os.path.join(unfiled, name, fname), "DATA-" + fname)
        # 같은 배의 다른 항차도 각자 제 폴더로 간다
        _write(os.path.join(unfiled, "20260731_연태훼리 2702W CLL 1차",
                            "2702W CLL Data_vgm 1차.xls"), "DATA-2702")
        # 이미 제자리에 같은 파일이 있는 경우(같은 크기 → 스킵, 원본 보존)
        _write(os.path.join(unfiled, "20260804_연태훼리 2705E 입항관련서류 송부의 건",
                            "2705E 입항보고서.pdf"), "SAME")
        _write(os.path.join(root, "OBWH", "2705E", "2705E 입항보고서.pdf"), "SAME")
        # 같은 이름·다른 크기 → '(2)' 부가
        _write(os.path.join(unfiled, "20260802_연태훼리 2703E 입항관련서류 송부의 건",
                            "2703E RF CONTAINER LIST.xlsx"), "NEW-CONTENT-LONGER")
        _write(os.path.join(root, "OBWH", "2703E", "2703E RF CONTAINER LIST.xlsx"), "OLD")
        # 기존 항차 표기(0패딩 흔들림) — R083W 는 접두 보호 대상이라 별도로 XTPG 로 확인
        _write(os.path.join(unfiled, "20260730_XIN TAI PING V-535E BAY PLAN",
                            "XTP_535E.edi"), "EDI")
        _write(os.path.join(root, "XTPG", "0535E", "old.edi"), "OLD-EDI")
        # 체크 끈 선박(KSKM) — 판독은 되지만 _기타 는 무접촉이라 옮기지 않는다
        _write(os.path.join(unfiled, "20260806_SUNNY KALMIA 2609N BAY PLAN",
                            "KSKM_2609N.edi"), "EDI-KSKM")
        before = _all_files(root)

        cache = {"names": {}, "codes": {}, "tally": {"KSKM": False}}

        state = {"_v": au.STATE_V, "folders": {
            "RZOR/R083W": {"fp": "old", "key": "RZOR_R083W"},
            "OBWH/2706W": {"fp": "old", "key": "OBWH_2706W"},
            "SWSP/2606N": {"fp": "keep", "key": "SWSP_2606N"}}}
        with open(state_path, "w", encoding="utf-8") as fh:
            json.dump(state, fh, ensure_ascii=False)

        out = core.reclassify_unfiled(root, cache, MASTER_FIXTURE,
                                      log_dir=log_dir, state_path=state_path)
        after = _all_files(root)
        print("    재분류: %s" % [(r["folder"][:28], "%s/%s" % (r["code"], r["voyage"]))
                                  for r in out["reclassified"]])
        print("    이동 %d · 이미있음 %d · 잔류 %d · 실패 %d"
              % (out["moved"], out["skipped"], out["left"], out["errors"]))

        for name, files, code, voy in UNFILED_CASES:
            if code:
                check("재판독 — %s → %s/%s" % (name[9:29], code, voy),
                      all(os.path.exists(os.path.join(root, code, voy, f)) for f in files)
                      and not os.path.isdir(os.path.join(unfiled, name)))
            else:
                check("판독 실패는 그대로 둔다 — %s" % name[9:29],
                      all(os.path.exists(os.path.join(unfiled, name, f)) for f in files))

        check("체크 끈 선박(KSKM)은 무접촉 — _미분류 에 그대로 · _기타 도 안 만든다",
              os.path.exists(os.path.join(unfiled, "20260806_SUNNY KALMIA 2609N BAY PLAN",
                                          "KSKM_2609N.edi"))
              and not os.path.isdir(os.path.join(root, core.OTHER_DIR)))
        check("같은 이름·같은 크기는 스킵 — 원본을 지우지 않는다",
              os.path.exists(os.path.join(unfiled, "20260804_연태훼리 2705E 입항관련서류 송부의 건",
                                          "2705E 입항보고서.pdf"))
              and _read(os.path.join(root, "OBWH", "2705E", "2705E 입항보고서.pdf")) == "SAME",
              "이미있음 %d파일" % out["skipped"])
        check("같은 이름·다른 크기는 '(2)' 로 옮긴다(덮어쓰기 없음)",
              _read(os.path.join(root, "OBWH", "2703E",
                                 "2703E RF CONTAINER LIST.xlsx")) == "OLD"
              and _read(os.path.join(root, "OBWH", "2703E",
                                     "2703E RF CONTAINER LIST (2).xlsx")) == "NEW-CONTENT-LONGER")
        check("항차 표기는 기존 폴더를 따른다(535E → 0535E)",
              os.path.exists(os.path.join(root, "XTPG", "0535E", "XTP_535E.edi"))
              and not os.path.isdir(os.path.join(root, "XTPG", "535E")))
        check("옮긴 폴더는 빈 폴더만 rmdir — 파일이 남으면 그대로",
              not os.path.isdir(os.path.join(unfiled,
                                             "20260805_일조국제물류) R083W CLL 송부 드립니다._최종"))
              and os.path.isdir(os.path.join(unfiled,
                                             "20260804_연태훼리 2705E 입항관련서류 송부의 건")))
        check("파일은 하나도 사라지지 않는다(_미분류 포함 총계 동일)",
              len(_all_files(root)) == len(before), "전 %d · 후 %d" % (len(before), len(after)))
        check("옮긴 선박의 업로드 지문만 무효화(다른 선박은 보존)",
              _state(state_path) == {"SWSP/2606N"}, str(sorted(_state(state_path))))
        check("재분류 7폴더 · 이동 8파일 · 잔류 5폴더(실패 3 + 중복 1 + 체크끔 1)",
              len(out["reclassified"]) == 7 and out["moved"] == 8
              and out["skipped"] == 1 and out["left"] == 5 and out["errors"] == 0,
              "%d폴더 · %d파일 · 잔류 %d" % (len(out["reclassified"]), out["moved"], out["left"]))

        # 멱등 — 두 번째 판은 옮길 것이 없다
        snapshot = _all_files(root)
        out2 = core.reclassify_unfiled(root, cache, MASTER_FIXTURE,
                                       log_dir=log_dir, state_path=state_path)
        check("두 번 돌려도 안전(멱등) — 이동 0 · 파일 그대로",
              out2["moved"] == 0 and not out2["reclassified"] and _all_files(root) == snapshot,
              "이동 %d파일 · 재분류 %d폴더" % (out2["moved"], len(out2["reclassified"])))
        check("두 번째 판은 업로드 지문을 다시 건드리지 않는다",
              _state(state_path) == {"SWSP/2606N"}, str(sorted(_state(state_path))))

        check("_미분류 폴더가 없으면 조용히 죽지 않고 빈 결과",
              core.reclassify_unfiled(os.path.join(tmp, "빈메일박스"), cache, MASTER_FIXTURE,
                                      log_dir=log_dir)["moved"] == 0)
        check("폴더 이름에서 제목을 되살린다(safe_name 절단 · 날짜 없는 이름)",
              core.unfiled_subject("20260805_Re_ 연태훼리 2706W CLL 1차") == "Re_ 연태훼리 2706W CLL 1차"
              and core.unfiled_subject("날짜없는폴더") == "날짜없는폴더")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(log_dir, ignore_errors=True)


# ────────────────────── 28) 0.8 화면 개편 — 좌측 메뉴·항목 / 우측 수집 기록 ──────────────────────

def _menu_text(app, key):
    """메뉴 버튼에 지금 찍힌 글자(가짜 위젯은 configure 로 받은 값을 기억한다)."""
    button = app.menu_buttons.get(key)
    kwargs = getattr(button, "kwargs", None)
    if isinstance(kwargs, dict) and "text" in kwargs:
        return str(kwargs["text"])
    try:
        return str(button.cget("text"))
    except Exception:
        return ""


def test_gui_layout_and_approve():
    print("\n[28] 0.8 화면 개편 — 좌우 2단 · 절 전환 · [정본으로 승인]")
    _install_fake_tkinter()                            # 진짜 창을 띄우지 않는다(무인 실행 안전)
    import gui
    import berth_schedule as bsch

    tmp = tempfile.mkdtemp(prefix="mailpilot_ui08_")
    cfg_path = os.path.join(tmp, "config.json")
    cache_path = os.path.join(tmp, "vessels_cache.json")
    master_path = os.path.join(tmp, "vessels_master.json")
    berth_before = dict(bsch._LAST_FETCH)              # 다른 시험의 기록을 되돌려 놓는다
    try:
        # 정본 한 척(별칭·한글 별칭 있음) + 미확인 두 척
        with open(master_path, "w", encoding="utf-8") as fh:
            json.dump([{"code": "XTPG", "name": "XIN TAI PING",
                        "aliases": ["XTP"], "ko": ["일조국제물류"]}], fh, ensure_ascii=False)
        core.save_cache({"names": {"XIN TAI PING": "XTPG", "SAWASDEE ALTAIR": "SWAL",
                                   "TAI PING": "TAPN"},
                         "codes": {"XTPG": "XIN TAI PING", "SWAL": "SAWASDEE ALTAIR",
                                   "TAPN": "TAI PING"}},
                        cache_path)

        app = gui.MailPilotGUI(config_path=cfg_path, cache_path=cache_path,
                               master_path=master_path)

        # ① 골격 — 좌측 메뉴 + 절, 우측 수집 기록
        check("좌측 메뉴가 여섯 절을 다 잡고 있다",
              [k for k, _n in gui.SECTIONS] == ["run", "mail", "store", "db", "vessel", "berth"]
              and sorted(app.menu_buttons) == sorted(k for k, _n in gui.SECTIONS),
              ", ".join(n for _k, n in gui.SECTIONS))
        check("절 화면이 메뉴 수만큼 만들어져 있다",
              sorted(app.section_frames) == sorted(app.menu_buttons),
              "%d개" % len(app.section_frames))
        check("우측 수집 기록(로그) 패널이 있다", getattr(app, "txt_log", None) is not None)
        check("창을 열면 [수집 상태] 절이 보인다", app.current_section == "run", app.current_section)
        check("보이는 절의 메뉴 글자에만 표식이 붙는다",
              _menu_text(app, "run").startswith("▶") and not _menu_text(app, "vessel").startswith("▶"),
              "%s / %s" % (_menu_text(app, "run"), _menu_text(app, "vessel")))

        # ② 절 전환 — 기능 위젯은 어느 절에 있든 그대로 살아 있다
        check("절을 바꾸면 그 절이 보인다",
              app.show_section("vessel") == "vessel" and app.current_section == "vessel")
        check("바뀐 절의 메뉴 글자로 표식이 옮겨간다",
              _menu_text(app, "vessel").startswith("▶") and not _menu_text(app, "run").startswith("▶"))
        check("없는 절을 부르면 화면을 바꾸지 않는다",
              app.show_section("없는절") is None and app.current_section == "vessel")
        for name in ("btn_run", "btn_organize", "txt_fb", "txt_log", "cvs_vessels",
                     "frm_vessels", "lbl_condition", "lbl_help", "cmb_provider",
                     "ent_host", "ent_port", "rb_imap", "rb_pop3", "chk_ssl"):
            check("기능 위젯 보존 — %s" % name, getattr(app, name, None) is not None)
        check("수집 조건 문구는 그대로 만들어진다",
              app.var_condition.get().startswith("지금 조건: 최근 "), app.var_condition.get()[:24])

        # ③ [정본으로 승인] — 미확인 항목을 로컬 정본표에 올린다
        check("정본에 있는 배는 (미확인) 이 아니다",
              app.vessel_row_label("XTPG") == "XTPG — XIN TAI PING", app.vessel_row_label("XTPG"))
        check("정본표에 없는 배는 (미확인) 으로 보인다",
              app.vessel_row_label("SWAL").endswith("(미확인)"), app.vessel_row_label("SWAL"))

        out = app.approve_master_now("SWAL")
        with open(master_path, "r", encoding="utf-8") as fh:
            saved = json.load(fh)
        codes = [item.get("code") for item in saved]
        check("[정본으로 승인] 이 정본표 파일에 항목을 더한다",
              out is not None and codes == ["XTPG", "SWAL"], ", ".join(codes))
        check("승인한 항목은 코드·읽어낸 이름으로 적힌다",
              saved[1]["name"] == "SAWASDEE ALTAIR" and saved[1]["aliases"] == []
              and saved[1]["ko"] == [],
              json.dumps(saved[1], ensure_ascii=False))
        check("먼저 있던 정본의 별칭·한글 별칭은 그대로 남는다",
              saved[0]["aliases"] == ["XTP"] and saved[0]["ko"] == ["일조국제물류"],
              json.dumps(saved[0], ensure_ascii=False))
        check("승인하면 목록이 곧바로 정본으로 갱신된다",
              app.vessel_row_label("SWAL") == "SWAL — SAWASDEE ALTAIR",
              app.vessel_row_label("SWAL"))
        check("승인한 배에는 손질 단추를 더 붙이지 않는다",
              core.master_by_code(app.vessel_master, "SWAL") is not None)

        # ④ 중복 방지 — 두 번 눌러도 한 줄만 남는다
        again = app.approve_master_now("SWAL")
        with open(master_path, "r", encoding="utf-8") as fh:
            saved2 = json.load(fh)
        check("이미 정본인 코드를 또 승인해도 늘지 않는다",
              again is None and len(saved2) == 2, "%d척" % len(saved2))
        check("이미 정본인 코드는 확인창도 띄우지 않고 끝난다",
              app.on_approve_master("SWAL") is None)

        # ⑤ 확인창에서 '아니오' 면 파일을 건드리지 않는다(가짜 messagebox 기본값 = 아니오)
        check("확인창에서 '아니오' 면 정본표에 올리지 않는다",
              app.on_approve_master("TAPN") is None
              and core.master_by_code(app.vessel_master, "TAPN") is None)
        check("확인창 문구에 어디에 적히는지 나온다",
              master_path in app.approve_message("TAPN", "TAI PING")
              and "폴더와 파일은 건드리지 않습니다" in app.approve_message("TAPN", "TAI PING"),
              app.approve_message("TAPN", "TAI PING").splitlines()[0])

        import tkinter.messagebox as mbox
        yes_before = mbox.askyesno
        mbox.askyesno = lambda *a, **k: True
        try:
            app.collector = _StubCollector({"names": {}, "codes": {}})
            picked = app.on_approve_master("TAPN")
        finally:
            mbox.askyesno = yes_before
        check("'예' 를 누르면 정본표에 올라간다",
              picked is not None and core.master_by_code(app.vessel_master, "TAPN") is not None,
              json.dumps(picked, ensure_ascii=False) if picked else "None")
        check("수집 중이면 돌고 있는 수집기도 새 정본표를 본다",
              core.master_by_code(getattr(app.collector, "master", []), "TAPN") is not None)
        app.collector = None

        # ⑥ 선석배정 상태 — 읽기 표시만(코어 판정에 쓰지 않는다)
        bsch._LAST_FETCH.update({"at": "", "ok_at": "", "rows": {}, "why": ""})
        check("아직 읽은 적이 없으면 그렇게 적는다",
              "아직 선석배정표를 읽은 적이 없습니다" in app.berth_status_text(),
              app.berth_status_text()[:30])
        bsch._remember_fetch({"PNCT": 41, "PCTC": 12}, "")
        text_ok = app._refresh_berth()
        check("두 터미널을 다 받으면 줄 수를 보여 준다",
              "PCTC 12줄" in text_ok and "PNCT 41줄" in text_ok
              and "두 터미널 모두 받았습니다" in text_ok, text_ok.replace("\n", " / "))
        bsch._remember_fetch({"PNCT": 0, "PCTC": 9}, "PNCT 응답 없음")
        text_bad = app._refresh_berth()
        check("실패하면 사유와 마지막 성공 시각을 보여 준다",
              "실패 사유: PNCT 응답 없음" in text_bad and "마지막 성공: " in text_bad,
              text_bad.replace("\n", " / "))
        check("상태 문구는 화면 변수에도 그대로 실린다", app.var_berth.get() == text_bad)

        # ⑦ 무인 기동 경로는 화면을 바꿔도 그대로다
        app.var_email.set("me@example.com")
        app.var_password.set("pw")
        app.var_root.set(tmp)
        scheduled = []
        app.master.after = lambda ms, fn=None, *a: (scheduled.append((ms, fn)), "after#ui")[1]
        check("--autostart 예약 경로 불변",
              app.request_autostart(delay_ms=77) is True and len(scheduled) == 1
              and scheduled[0][0] == 77 and scheduled[0][1] == app._autostart_now,
              "예약 %d건" % len(scheduled))
    except Exception as exc:
        check("0.8 화면 개편", False, "%s: %s" % (type(exc).__name__, exc))
    finally:
        bsch._LAST_FETCH.update(berth_before)
        shutil.rmtree(tmp, ignore_errors=True)


def _read(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def _state(path):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return set((json.load(fh).get("folders") or {}).keys())
    except (OSError, ValueError):
        return set()


# ────────────────────── 29) 리스트 엑셀 판독 모듈 — 4갈래 · 실파일 스냅샷 ──────────────────────
#   정답표: tests/fixtures/list_expected.json — 검수앱 src/utils.js parseListExcel 을
#   node(SheetJS)로 돌린 결과 그대로다. 파이썬 이식본이 컨 단위 전 필드에서 같아야 PASS.

# 합성 리스트 격자(엑셀 없이 파서 본체만 확인) — fixtures/list_synth.xlsx 와 같은 내용.
LIST_SYNTH_HDR = [
    "CNTR NO.", "SEAL NO.", "엠티실번호", "Tp/Sz", "Size", "F/E", "Weight", "POL", "POD",
    "OPR", "TEMP", "REMARK", "ITEM", "B/L No.", "Shipper", "Gate In", "TS PORT",
    "PrintPOD", "Cargo Type", "DG",
]
LIST_SYNTH_STD = [
    ["제목 줄 — 헤더 앞 잡음"],
    LIST_SYNTH_HDR,
    ["ABCU1234567", "SL0001", "", "DC20", "", "F", "12,340", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL001", "한울", "07-01", "", "", "FULL", "N"],
    ["ABCU1234568", "SL0002", "", "DC20", "", "E", "2,300", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL002"],
    ["ABCU1234569", "SL0003", "", "RFHC", "", "", "25,000", "KRPTK", "CNSHA", "SKR",
     "-18", "", "", "BL003"],
    ["ABCU1234570", "", "", "RFHC", "", "R/D", "3,000", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL004"],
    ["ABCU1234571", "SL0005", "", "4HDC", "", "F", "20,000", "KRPTK", "CNSHA", "SKR",
     "", "IMDG 9 UN_CD 3480 RF +23 특수 제작", "", "BL005"],
    ["", "ABCU1234572", "", "DC20", "", "F", "9,000", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL006"],
    ["ABCU1234573", "SL0007", "ESL07", "DC20", "", "E", "2,200", "KRPTK", "CNSHA", "SKR",
     "", "", "공컨테이너", "BL007"],
    ["ABCU1234574", "SL0008", "", "", "20F", "", "2,400", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL008"],
    ["ABCU1234575", "SL0009", "", "22GPE", "", "", "2,500", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL009"],
    ["ABCU1234576", "SL0010", "", "40FR", "", "F", "18,000", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL010"],
    ["ABCU1234577", "SL0011", "", "40TK", "", "F", "18,000", "KRPTK", "CNSHA", "SKR",
     "", "", "", "BL011"],
]
LIST_SYNTH_SOC = [
    ["SOC NO. LIST"],
    ["Container", "Seal", "Tp/Sz", "L/S"],
    ["SOCU0000010", "SS0001", "DC20", "S"],
    ["SOCU0000021", "", "DC20", "S"],
]
LIST_SYNTH_MEMO = [["작업 메모"], ["ZZZU9999990"], [""]]


def _lp_pad(grid):
    """SheetJS 는 시트 폭만큼 빈칸을 채운 격자를 준다 — 같은 모양으로 맞춘다."""
    width = max(len(r) for r in grid)
    return [list(r) + [""] * (width - len(r)) for r in grid]


def _lp_diff(expected, actual, source):
    """기대 레코드(JS) 와 실제 레코드(PY) 를 컨 단위 전 필드로 대조 — 어긋난 자리 목록."""
    out = []
    if len(expected) != len(actual):
        return ["컨 수 %d != %d" % (len(expected), len(actual))]
    for i in range(len(expected)):
        want = dict(expected[i])
        got = dict(actual[i])
        src = got.pop("_source", None)
        if source is not None and src != source:
            out.append("[%d] _source %r != %r" % (i, src, source))
        for key in sorted(set(want) | set(got)):
            a = want.get(key, "<없음>")
            b = got.get(key, "<없음>")
            if isinstance(a, (int, float)) and isinstance(b, (int, float)) \
                    and not isinstance(a, bool) and not isinstance(b, bool):
                same = float(a) == float(b)
            else:
                same = a == b
            if not same:
                out.append("[%d] %s %s: %r != %r" % (i, want.get("cn", "?"), key, a, b))
    return out


def test_list_parser():
    print("\n[29] 리스트 엑셀 판독 모듈 — 표준/세관CDL/중국어/SOC · 실파일 스냅샷")
    try:
        import list_parser as lp
    except Exception as exc:
        check("list_parser 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) 지연 임포트 — 없으면 사유 문자열을 돌려준다(조용한 실패 금지)
    dep = lp.excel_deps_status()
    check("의존성 상태 — openpyxl·xlrd 두 열쇠", set(dep) == {"openpyxl", "xlrd"}, repr(dep))
    have_xlsx = lp._load_openpyxl()[0] is not None
    have_xls = lp._load_xlrd()[0] is not None
    if not have_xlsx:
        check("openpyxl 없을 때 사유 문자열", "openpyxl이 없습니다" in str(dep["openpyxl"]))
    if not have_xls:
        check("xlrd 없을 때 사유 문자열", "xlrd가 없습니다" in str(dep["xlrd"]))

    # (2) 파일 종류 판정 — 리스트 후보만. XRAY·합본·마감텔리·플랜은 뺀다.
    kinds = [
        ("ATPR ( 2632E ) CLL.xlsx", "list"),
        ("DJCO 0216W CDL.xls", "list"),
        ("검수업체컨테이너목록조회_20260726.xls", "list"),
        ("船代出口预配.xlsx", "list"),
        ("2632WLOADLIST.xlsx", "merged"),
        ("STMJ 2639E XRAY LIST.xlsx", "xray"),
        ("PTK X-RAY 대상.xls", "xray"),
        ("ATPR 2632W PTK TALLY REPORT.xlsx", "report"),
        ("DXQD 2627W PTK BAY PLAN.xlsx", "report"),
        ("OBWH 2680W PTK LOADING SUMMARY.xlsx", "report"),
        ("JDJC0222W_RECAP.xlsx", "skip"),
        ("XTI 0534W MEMO BL.xls", "skip"),
        ("DXQD 2627W PTK BAY PLAN.pdf", "skip"),
        ("DJCT0220WPTK.EDI", "skip"),
        ("ATPR 2632W PTK.ASC", "skip"),
    ]
    bad = [(n, want, lp.detect_list_kind(n)) for n, want in kinds
           if lp.detect_list_kind(n) != want]
    check("파일 종류 판정 15종 — 리스트만 통과", not bad, repr(bad[:3]))

    # (3) 시트 갈래 판정
    check("시트 갈래 — 표준", lp.detect_sheet_format(_lp_pad(LIST_SYNTH_STD)) == "standard")
    check("시트 갈래 — 세관 CDL",
          lp.detect_sheet_format([["컨테이너번호", "B/L TYPE", "규격"], ["ABCU1234567", "C", "22GP"]])
          == "customs")
    check("시트 갈래 — 중국어(RIZHAO)",
          lp.detect_sheet_format([[""], [""], [""], [""], [""],
                                  ["提单号", "箱号", "箱量"], ["BL", "ABCU1234567", "20GP*1"]])
          == "rizhao")
    check("시트 갈래 — 리스트 아님", lp.detect_sheet_format([["합계"], ["12"]]) == "none")

    # (4) 하위 함수 — 정본(utils.js)의 규격·풀공 판정표
    iso_tab = [
        (("", "DC20"), "22G1"), (("", "DCHC"), ""), (("20", "DC"), "22G1"),
        (("4H", "RF"), "45R1"), (("", "D5"), "45G1"), (("", "R5"), "45R1"),
        (("", "4HDC"), "45G1"), (("", "5R"), "45R1"), (("", "2D"), "22G1"),
        (("", "40'H"), "45G1"), (("", "20'D"), "22G1"), (("", "45'H"), "L5G1"),
        (("", "22G1"), "22G1"), (("", "DC43"), "45G1"),
        # '43DC' 는 표준 ISO 꼴(\d\d[A-Z][A-Z])에 먼저 걸려 그대로 남는다 — 검수앱과 같은 값.
        (("", "43DC"), "43DC"),
    ]
    bad = [(a, w, lp.derive_iso(*a)) for a, w in iso_tab if lp.derive_iso(*a) != w]
    check("derive_iso 15종 — 선사별 규격 표기", not bad, repr(bad[:3]))
    fe_tab = [("R/F", "F"), ("R/E", "E"), ("R/D", "D"), ("RE", "E"), ("RD", "D"),
              ("D-F", "F"), ("45RE", ""), ("22R1", ""), ("", "")]
    bad = [(a, w, lp.fe_from_slash(a)) for a, w in fe_tab if lp.fe_from_slash(a) != w]
    check("fe_from_slash 9종 — R/F·R/E·R/D", not bad, repr(bad[:3]))
    check("norm_header — 점·괄호·공백 정리",
          lp.norm_header(" Cntr. No. (B) ") == "cntr no b")
    check("is_reefer_iso — FR 오탐 없음",
          lp.is_reefer_iso("45R1") and lp.is_reefer_iso("40RH")
          and not lp.is_reefer_iso("40FR") and not lp.is_reefer_iso("4583"))

    # (5) SheetJS 숫자 서식 재현 — 실파일에서 나온 서식만
    ssf = [
        (2830, "#,##0_ ", "2,830 "),
        (28600, "General", "28600"),
        (17862.0, "###,###,###,##0.0#_ ", "17,862.0 "),
        (2.95, "[$-10804]0.00", "$2.95"),
        (17808, "#,##0.00", "17,808.00"),
        (-1234, "#,##0_);[Red]\\(#,##0\\)", "(1,234)"),
        (0, "0_ ", "0 "),
    ]
    bad = [(v, f, w, lp._ssf_format(v, f)) for v, f, w in ssf if lp._ssf_format(v, f) != w]
    check("숫자 서식 7종 — SheetJS w 문자열과 같음", not bad, repr(bad[:3]))

    # (6) 정답표 불러오기
    fx = os.path.join(HERE, "fixtures")
    try:
        with open(os.path.join(fx, "list_expected.json"), "r", encoding="utf-8") as fh:
            expected = json.load(fh)["표본"]
    except (OSError, ValueError) as exc:
        check("정답표(list_expected.json) 읽기", False, "%s: %s" % (type(exc).__name__, exc))
        return
    check("정답표 8파일", len(expected) == 8, repr(sorted(expected)))

    # (7) 격자 직판독 — 엑셀 라이브러리 없이 파서 본체만 (합성 리스트)
    sheets = [("STD", _lp_pad(LIST_SYNTH_STD)), ("SOC", _lp_pad(LIST_SYNTH_SOC)),
              ("MEMO", _lp_pad(LIST_SYNTH_MEMO))]
    got = lp.parse_list_sheets(sheets, source="list_synth.xlsx")
    want = expected["list_synth.xlsx"]["records"]
    diff = _lp_diff(want, got["records"], "list_synth.xlsx")
    check("합성 격자 — 컨 12대 전 필드 일치(검수앱과 같음)", not diff, "; ".join(diff[:3]))
    by_cn = dict((r["cn"], r) for r in got["records"])
    check("F/E 열 — 풀/공", by_cn["ABCU1234567"]["fe"] == "F"
          and by_cn["ABCU1234568"]["fe"] == "E")
    check("ISO 끝자리 동기화 — 공이면 끝자리 E", by_cn["ABCU1234568"]["iso"] == "22GE")
    check("온도가 적혔으면 풀 리퍼",
          by_cn["ABCU1234569"]["fe"] == "F" and by_cn["ABCU1234569"]["rf"] is True
          and by_cn["ABCU1234569"]["tmp"] == "-18")
    check("R/D — 리퍼드라이 표시(참일 때만 넣는다)",
          by_cn["ABCU1234570"].get("rfdry") is True
          and "rfdry" not in by_cn["ABCU1234567"])
    check("REMARK — IMDG/UN/온도/제작컨",
          by_cn["ABCU1234571"]["dg"] is True and by_cn["ABCU1234571"]["dgc"] == "9"
          and by_cn["ABCU1234571"]["un"] == "3480"
          and by_cn["ABCU1234571"]["tmp"] == "23"
          and by_cn["ABCU1234571"]["mkcon"] is True)
    check("ITEM '공컨테이너' — 공 판정 + 엠티실 별도 열",
          by_cn["ABCU1234573"]["fe"] == "E" and by_cn["ABCU1234573"]["eseal"] == "ESL07")
    check("무게 — 쉼표 제거 후 정수", by_cn["ABCU1234567"]["wt"] == 12340)
    check("특수화물 — FR·TK 표시",
          by_cn["ABCU1234576"]["fr"] is True and by_cn["ABCU1234577"]["tk"] is True)
    check("SOC 양식 — 실 있으면 풀, 없으면 공",
          by_cn["SOCU0000010"]["fe"] == "F" and by_cn["SOCU0000021"]["fe"] == "E")
    check("실번호 열의 컨번호는 컨으로 줍지 않는다", "ABCU1234572" not in by_cn)
    check("정식 시트가 있으면 메모 시트 셀스캔은 끈다", "ZZZU9999990" not in by_cn)
    check("None 금지 — 빈 값은 ''·0·False",
          all(v is not None for r in got["records"] for v in r.values()))

    # (8) 실파일 픽스처 — 읽기 경로까지 포함한 종단 대조
    files = [
        ("list_synth.xlsx", "합성(.xlsx 읽기)", True),
        ("list_cll_lugg.xlsx", "선사 CLL — 수화물 판별", True),
        ("list_customs.xlsx", "세관 CDL(적하목록)", True),
        ("list_rizhao.xlsx", "중국어 리스트(RIZHAO)", True),
        ("list_std.xls", "선사 CLL(.xls BIFF)", False),
        ("list_cll_csc.xls", "선사 CLL CSC(.xls BIFF)", False),
        ("list_crownix.xls", "동진 EP LIST(.xls SST 보정 경로)", False),
        ("list_named_xls.xls", "이름만 .xls 인 xlsx(매직바이트 판별)", True),
    ]
    for name, label, needs_xlsx in files:
        if needs_xlsx and not have_xlsx:
            check("픽스처 %s — %s" % (name, label), True, "openpyxl 없음 — 건너뜀")
            continue
        if not needs_xlsx and not have_xls:
            check("픽스처 %s — %s" % (name, label), True, "xlrd 없음 — 건너뜀")
            continue
        out, err = lp.parse_list_excel(os.path.join(fx, name), name)
        if err:
            check("픽스처 %s — %s" % (name, label), False, err)
            continue
        want = expected[name]
        diff = _lp_diff(want["records"], out["records"], name)
        if want.get("luggCns", []) != out["lugg_cns"]:
            diff.append("수화물 %r != %r" % (want.get("luggCns"), out["lugg_cns"]))
        check("픽스처 %s — %s (컨 %d)" % (name, label, len(want["records"])),
              not diff, "; ".join(diff[:3]))

    # (9) 못 읽는 파일은 조용히 넘기지 않는다
    out, err = lp.parse_list_excel(b"NOT-AN-EXCEL-FILE", "x.xlsx")
    check("엑셀이 아니면 사유를 돌려준다", out is None and bool(err), str(err)[:60])


# ────────────────────── 30) 0.9 리스트 자동 업로드 — records 보수 머지 ──────────────────────
#
#   현장 계약: **검수원이 이미 넣은 값은 단 한 바이트도 바뀌지 않는다.**
#   그래서 이 절의 중심은 '무엇을 올리는가' 가 아니라 '무엇을 절대 안 건드리는가' 다.

def _lp_fixture_records(name):
    """정답표(JS 오라클)에서 한 파일의 records 를 꺼낸다 — 컨 사전으로."""
    with open(os.path.join(HERE, "fixtures", "list_expected.json"), "r", encoding="utf-8") as fh:
        table = json.load(fh)["표본"]
    return dict((r["cn"], dict(r)) for r in table[name]["records"])


def _lu_file(name, records, rank=None, mtime=0.0, mode="discharge"):
    """scan_lists 가 내는 모양의 리스트 파일 한 장(병합 단위 시험용)."""
    import app_upload as au
    return {"name": name, "rank": au.list_rank(name) if rank is None else rank,
            "mtime": mtime, "mode": mode, "records": records, "folder_dir": mode}


def test_list_upload():
    print("\n[30] 0.9 리스트 자동 업로드 — 개정 서열 · 방향 판정 · 보수 머지 · 검수원 보호")
    try:
        import app_upload as au
        import list_parser as lp
    except Exception as exc:
        check("모듈 불러오기", False, "%s: %s" % (type(exc).__name__, exc))
        return

    # (1) 개정 서열 — 최종/FINAL > REVISED/수정 > n차 > 무표시 (실제 메일박스 파일명 그대로)
    ranks = [
        ("R082W_CLL Data 최종.xls", au.RANK_FINAL),
        ("R082W_CLL Data 최종_REV 1.xls", au.RANK_FINAL),        # 최종이 먼저 걸린다(동순위는 mtime)
        ("26354W 최종 리스트.xlsx", au.RANK_FINAL),
        ("FINAL LOADING LIST.xls", au.RANK_FINAL),
        ("RD-Loading List(R082W)_FIIS_REV 1.xls", au.RANK_REVISED),
        ("REVISED CLL.xls", au.RANK_REVISED),
        ("rzdf_ship_1785421739775 - 수정.xls", au.RANK_REVISED),
        ("2706W CLL Data_vgm 3차.xls", au.RANK_NTH + 3),
        ("2706W CLL Data_vgm 1차.xls", au.RANK_NTH + 1),
        ("SWSP ( 2606N ) CLL.xlsx", au.RANK_PLAIN),
        ("FINALLY DONE.xls", au.RANK_PLAIN),                      # 낱말이 아니면 안 걸린다
        ("PREVIEW LIST.xls", au.RANK_PLAIN),                      # PREVIEW 의 REV 는 마커가 아니다
    ]
    bad = [(n, w, au.list_rank(n)) for n, w in ranks if au.list_rank(n) != w]
    check("개정 서열 12종 — 최종>수정>n차>무표시", not bad, repr(bad[:3]))
    check("서열 정렬 — 3차가 1차를 이기고, 수정이 3차를 이긴다",
          au.list_rank("x 3차.xls") > au.list_rank("x 1차.xls")
          and au.list_rank("x REV.xls") > au.list_rank("x 3차.xls")
          and au.list_rank("x 최종.xls") > au.list_rank("x REV.xls"))

    # (2) 방향 판정 — 내용이 먼저, 그 다음 파일명, 그래도 모르면 건너뛴다
    modes = [
        ((600, 0, "PCSZ 2623E CNTR LIST.xlsx"), "discharge"),
        ((0, 345, "XINQUNDAO 2629W DIS LIST AFTER KRPTK.XLS"), "loading"),   # 내용 > 이름
        ((395, 0, "SWDN ( 2608N ) CLL.xlsx"), "discharge"),                  # 내용 > CLL 이름
        ((241, 0, "M.V.XINQUNDAO V.2630E DLC LOADING LIST.XLS"), "discharge"),
        ((0, 0, "CDL PCSG 2639E CSC-DWS.xlsx"), "discharge"),                # 이름 힌트
        ((0, 0, "PCSG 2640W CLL (CSC).xls"), "loading"),
        ((0, 0, "RD-Loading List(R081W)_FIIS.xls"), "loading"),
        ((0, 0, "MCAP-631S MAE EMPTY LOAD LIST.xlsx"), "loading"),
        ((3, 3, "CDL 무엇.xlsx"), "discharge"),                              # 동수 → 이름 힌트
        ((0, 0, "SWSP 2606N (Excel).xls"), ""),                              # 불명 → 건너뛴다
        ((0, 0, "DXQD V-2630W EMPTY NOLIST.xlsx"), ""),
        ((3, 3, "무엇.xlsx"), ""),
        ((0, 0, "CDL 과 CLL 이 같이 든 이름.xls"), ""),                        # 양쪽 힌트 → 불명
    ]
    bad = [(a, w, au.list_mode(*a)) for a, w in modes if au.list_mode(*a) != w]
    check("방향 판정 13종 — 내용>이름>건너뜀", not bad, repr(bad[:3]))
    check("불명일 때 폴더 방향으로 넘겨짚지 않는다(SWSP 2606N 실사례)",
          au.list_mode(0, 0, "SWSP 2606N (Excel).xls") == "")

    # (3) 개정 서열 병합 — 높은 순위가 이기고, 낮은 순위는 빈칸만 메운다
    hi = [{"cn": "AAAU1000001", "sl": "AAA111", "sl_orig": "AAA111", "wt": 12000,
           "iso": "22G1", "tmp": "", "tmp_missing": False, "fe": "F"}]
    lo = [{"cn": "AAAU1000001", "sl": "BBB222", "sl_orig": "BBB222", "wt": 0,
           "iso": "", "tmp": "-18", "tmp_missing": True, "fe": "F"},
          {"cn": "AAAU1000002", "sl": "CCC333", "sl_orig": "CCC333", "wt": 9000,
           "iso": "45G1", "tmp": "", "tmp_missing": False, "fe": "E"}]
    merged, conflicts = au.merge_list_files(
        [_lu_file("리스트 1차.xls", lo, mtime=200.0), _lu_file("리스트 최종.xls", hi, mtime=100.0)],
        _quiet)
    a = merged.get("AAAU1000001") or {}
    check("개정 병합 — 높은 서열의 실번호가 남는다(mtime 이 더 새 1차를 이긴다)",
          a.get("sl") == "AAA111" and a.get("sl_orig") == "AAA111")
    check("개정 병합 — 낮은 서열은 빈칸만 메운다(온도)", a.get("tmp") == "-18")
    check("개정 병합 — 낮은 서열의 새 컨은 더한다", "AAAU1000002" in merged)
    check("개정 병합 — 실번호 충돌은 로그로만(덮지 않음)", conflicts == 1, "충돌 %d" % conflicts)
    same = au.merge_list_files([_lu_file("a.xls", hi, mtime=1.0),
                               _lu_file("b.xls", [dict(hi[0])], mtime=2.0)], _quiet)
    check("개정 병합 — 같은 값이면 충돌이 아니다", same[1] == 0)

    # (4) 보수 머지 — 새 컨 추가 · 빈칸만 채움 · 기존 값 불변 · 무삭제
    old = {
        "AAAU1000001": {"cn": "AAAU1000001", "l4": "0001", "sl": "OLDSEAL", "sl_orig": "OLDSEAL",
                        "eseal": "", "eseal_orig": "", "wt": 0, "tmp": "", "tmp_missing": True,
                        "iso": "", "fe": "F", "rfSet": "-20", "rfCheckedBy": "성일",
                        "sl_history": [{"from": "X", "to": "OLDSEAL"}]},
        "ZZZU9999999": {"cn": "ZZZU9999999", "sl": "KEEPME", "wt": 100},   # 리스트에 없는 컨
    }
    new = {
        "AAAU1000001": {"cn": "AAAU1000001", "l4": "0001", "sl": "NEWSEAL", "sl_orig": "NEWSEAL",
                        "eseal": "", "eseal_orig": "", "wt": 14937, "tmp": "-18",
                        "tmp_missing": True, "iso": "45R1", "fe": "F", "rf": True},
        "BBBU2000002": {"cn": "BBBU2000002", "sl": "NEW222", "sl_orig": "NEW222", "wt": 8000},
    }
    out, added, filled, conf = au.merge_into_records(old, new, _quiet, "discharge")
    a = out["AAAU1000001"]
    check("보수 머지 — 비어 있지 않은 실번호는 절대 안 바뀐다",
          a["sl"] == "OLDSEAL" and a["sl_orig"] == "OLDSEAL")
    check("보수 머지 — 무게 0 은 빈칸이라 채운다", a["wt"] == 14937)
    check("보수 머지 — 빈 규격·온도를 채운다", a["iso"] == "45R1" and a["tmp"] == "-18")
    check("보수 머지 — 온도가 채워지면 tmp_missing 을 푼다", a["tmp_missing"] is False)
    check("보수 머지 — 없던 필드는 더한다", a.get("rf") is True)
    check("보수 머지 — 현장 입력(rfSet·이력)은 그대로", a["rfSet"] == "-20"
          and a["sl_history"] == [{"from": "X", "to": "OLDSEAL"}] and a["rfCheckedBy"] == "성일")
    check("보수 머지 — 새 컨은 더한다", "BBBU2000002" in out and added == 1)
    check("보수 머지 — 리스트에 없는 기존 컨은 지우지 않는다(v1 무삭제)",
          out["ZZZU9999999"] == old["ZZZU9999999"])
    check("보수 머지 — 실번호 충돌은 세어 남긴다", conf == 1 and filled == 1)
    check("보수 머지 — 참/거짓은 빈칸이 아니다(False 를 True 로 뒤집지 않는다)",
          au.merge_into_records({"C": {"cn": "C", "dg": False, "rf": False}},
                                {"C": {"cn": "C", "dg": True, "rf": True}}, _quiet)[0]["C"]
          == {"cn": "C", "dg": False, "rf": False})
    pair = au.merge_into_records(
        {"D": {"cn": "D", "sl": "HAVE", "sl_orig": ""}},
        {"D": {"cn": "D", "sl": "OTHER", "sl_orig": "OTHER"}}, _quiet)[0]["D"]
    check("보수 머지 — sl 만 있고 sl_orig 가 비면 짝을 맞춘다(실오류 오탐 방지)",
          pair["sl"] == "HAVE" and pair["sl_orig"] == "HAVE")
    check("보수 머지 — 멱등(두 번 돌려도 같다)",
          au.merge_into_records(out, new, _quiet)[0] == out
          and au.merge_into_records(out, new, _quiet)[1:3] == (0, 0))

    # (5) 검수원 입력 보호 — 실파일 정답표로 만든 records 에 손을 댄 뒤 같은 리스트를 다시 올린다
    base = _lp_fixture_records("list_customs.xlsx")
    worked = json.loads(json.dumps(base, ensure_ascii=False))
    victims = sorted(worked)[:3]
    worked[victims[0]].update({"sl": "손으로고친실", "sl_orig": base[victims[0]]["sl"],
                               "sl_history": [{"from": base[victims[0]]["sl"],
                                               "to": "손으로고친실", "by": "성일"}]})
    worked[victims[1]].update({"rfSet": "-18", "rfAct": "-17.4", "rfSrc": "manual",
                               "rfCheckedAt": 1785000000000, "rfCheckedBy": "성일"})
    worked[victims[2]].update({"eseal": "EMPTY999", "eseal_orig": "EMPTY999",
                               "memo": "봉인 파손 확인"})
    before = json.loads(json.dumps(worked, ensure_ascii=False))
    db = FakeDB({"voyages/STSE_2657E/discharge/records": worked})
    files = [_lu_file("list_customs.xlsx",
                      [dict(r, _source="list_customs.xlsx") for r in base.values()],
                      mtime=1.0)]
    added, filled, conf, ok = au.upload_lists(db, "STSE_2657E", "discharge", files, _quiet)
    after = db.data["voyages/STSE_2657E/discharge/records"]
    changed = []
    for cn, rec in before.items():
        for field, value in rec.items():
            if after.get(cn, {}).get(field) != value:
                changed.append("%s.%s %r→%r" % (cn, field, value, after.get(cn, {}).get(field)))
    check("검수원 보호 — 손댄 records 위에 같은 리스트를 다시 올려도 전값 불변",
          not changed and ok, "; ".join(changed[:3]))
    check("검수원 보호 — 새 컨 0 · 실번호 충돌만 보고", added == 0 and conf == 1,
          "추가 %d · 충돌 %d" % (added, conf))
    db.calls = []
    au.upload_lists(db, "STSE_2657E", "discharge", files, _quiet)
    check("변경이 없으면 PUT 을 하지 않는다(멱등)", not db.writes("PUT"),
          "쓰기 %d건" % len(db.writes("PUT")))

    # (6) 기존 노드를 못 읽으면 아무것도 올리지 않는다(되덮기 금지)
    class _BlindDB(FakeDB):
        def get(self, path, params=None):
            raise IOError("네트워크 끊김")
    blind = _BlindDB({})
    r = au.upload_lists(blind, "STSE_2657E", "discharge", files, _quiet)
    check("GET 실패 — PUT 0 · 실패로 보고(다음 사이클 재시도)",
          r == (0, 0, 0, False) and not blind.writes("PUT"))
    odd = FakeDB({"voyages/STSE_2657E/discharge/records": "이상한값"})
    r = au.upload_lists(odd, "STSE_2657E", "discharge", files, _quiet)
    check("기존 records 모양이 사전이 아니면 손대지 않는다",
          r[3] is False and not odd.writes("PUT"))

    # (7) 판독 모듈이 없으면 리스트 단계만 건너뛴다(수집·EDI 는 계속)
    saved = list(au._LP_MOD)
    try:
        au._LP_MOD[0], au._LP_MOD[1] = None, "openpyxl이 없습니다 — 시험"
        lines = []
        got = au.scan_lists(HERE, ["x.xlsx"], None, lines.append)
        check("의존성 부재 — 리스트 0장 + 사유 로그",
              got == [] and any("건너뜁니다" in m for m in lines), repr(lines[:1]))
    finally:
        au._LP_MOD[0], au._LP_MOD[1] = saved[0], saved[1]

    # (8) 실파일 종단 — 미니 메일박스 한 판이 records 를 JS 정답표대로 채운다
    if lp._load_openpyxl()[0] is None or lp._load_xlrd()[0] is None:
        print("  [i] openpyxl·xlrd 가 없어 실파일 종단을 건너뛴다(격자 경로는 위에서 확인).")
        return
    fx = os.path.join(HERE, "fixtures")
    plan = {"discharge": ["list_customs.xlsx", "list_crownix.xls", "list_rizhao.xlsx"],
            "loading": ["list_std.xls", "list_synth.xlsx"]}
    tmp = tempfile.mkdtemp(prefix="mailpilot_list_")
    try:
        root = os.path.join(tmp, "MB")
        vdir = os.path.join(root, "STSE", "2657E")
        os.makedirs(vdir, exist_ok=True)
        for names in plan.values():
            for name in names:
                shutil.copyfile(os.path.join(fx, name), os.path.join(vdir, name))
        # 방향 불명(건너뛰기) · 마감텔리(report) 는 올리면 안 된다
        shutil.copyfile(os.path.join(fx, "list_named_xls.xls"),
                        os.path.join(vdir, "list_named_xls.xls"))
        shutil.copyfile(os.path.join(fx, "list_std.xls"),
                        os.path.join(vdir, "STSE 2657E PTK TALLY REPORT.xls"))

        db = FakeDB()
        state = os.path.join(tmp, "upload_state.json")
        res = au.run(root, {"names": {}, "codes": {}}, AU_MASTER, db, {}, _quiet, state_path=state)

        diff = []
        for mode, names in plan.items():
            want = {}
            for name in names:
                for cn, rec in _lp_fixture_records(name).items():
                    want[cn] = dict(rec, _source=name)
            got = db.data.get("voyages/STSE_2657E/%s/records" % mode) or {}
            if set(got) != set(want):
                diff.append("%s 컨 %d != %d" % (mode, len(got), len(want)))
                continue
            for cn in want:
                for field in sorted(set(want[cn]) | set(got[cn])):
                    a, b = want[cn].get(field, "<없음>"), got[cn].get(field, "<없음>")
                    if isinstance(a, (int, float)) and isinstance(b, (int, float)) \
                            and not isinstance(a, bool) and not isinstance(b, bool):
                        if float(a) == float(b):
                            continue
                    elif a == b:
                        continue
                    diff.append("%s %s %s: %r != %r" % (mode, cn, field, a, b))
        check("실파일 종단 — records 가 JS 정답표와 컨·전필드 일치(양하 16 · 선적 14)",
              not diff, "; ".join(diff[:3]))
        check("실파일 종단 — 방향 불명 파일은 안 올린다(list_named_xls 6대 제외)",
              len(db.data.get("voyages/STSE_2657E/discharge/records") or {}) == 16
              and len(db.data.get("voyages/STSE_2657E/loading/records") or {}) == 14)
        check("실파일 종단 — 마감텔리(TALLY REPORT)는 리스트가 아니다",
              all("TALLY REPORT" not in str((r or {}).get("_source", ""))
                  for r in (db.data.get("voyages/STSE_2657E/loading/records") or {}).values()))
        check("실파일 종단 — 사이클 보고에 리스트 통계가 실린다",
              res["listAdded"] == 30 and sorted(res["lists"])
              == ["STSE_2657E/discharge", "STSE_2657E/loading"],
              "추가 %d · %s" % (res["listAdded"], res["lists"]))
        check("실파일 종단 — null 을 보내지 않는다",
              not [b for c in db.writes("PUT") for b in _nulls(c[2])])

        db.calls = []
        au.run(root, {"names": {}, "codes": {}}, AU_MASTER, db, {}, _quiet, state_path=state)
        check("두 번째 사이클 — 지문 그대로면 재업로드 0", not db.writes("PUT"),
              "쓰기 %d건" % len(db.writes("PUT")))

        # 지문이 바뀌어 다시 돌아도(리스트 파일 추가) 이미 올라간 값은 그대로다
        shutil.copyfile(os.path.join(fx, "list_cll_lugg.xlsx"),
                        os.path.join(vdir, "list_cll_lugg.xlsx"))
        snap = json.loads(json.dumps(db.data.get("voyages/STSE_2657E/loading/records"),
                                     ensure_ascii=False))
        au.run(root, {"names": {}, "codes": {}}, AU_MASTER, db, {}, _quiet, state_path=state)
        now = db.data.get("voyages/STSE_2657E/loading/records") or {}
        kept = all(now.get(cn) == rec for cn, rec in snap.items())
        check("리스트가 늘어도 이미 올라간 값은 그대로(새 컨만 는다)",
              kept and len(now) > len(snap), "%d → %d" % (len(snap), len(now)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    print("=" * 60)
    print("메일파일럿 Uni 테스트 — %s (python %s)"
          % (core.VERSION, sys.version.split()[0]))
    print("=" * 60)
    # 시험은 이 PC 에 놓인 실제 정본표를 읽지 않는다 — 기본값은 '정본표 없음'(0.3 회귀 기준).
    # 정본표가 필요한 시험(17~19)은 스스로 픽스처·임시 파일을 넘겨 쓴다.
    core.MASTER_PATH = os.path.join(tempfile.gettempdir(), "mailpilot_시험_정본표없음.json")
    # 0.5-01 교훈 — 시험 로그가 실 수집기 로그 폴더를 더럽히지 않게 임시 폴더로 돌린다.
    core.LOG_DIR = tempfile.mkdtemp(prefix="mailpilot_시험로그_")
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
    test_log_encoding_safety()
    test_master_read()
    test_migrate_master()
    test_gui_master()
    test_edi_parser()
    test_app_upload()
    test_app_upload_e2e()
    test_heartbeat_shape()
    test_voyage_spelling()
    test_berth_schedule()
    test_expected_cards()
    test_reclassify_unfiled()
    test_gui_layout_and_approve()
    test_list_parser()
    test_list_upload()

    failed =[name for name, ok, _d in RESULTS if not ok]
    print("\n" + "=" * 60)
    print("결과: %d개 중 %d개 PASS" % (len(RESULTS), len(RESULTS) - len(failed)))
    if failed:
        print("실패: " + ", ".join(failed))
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
