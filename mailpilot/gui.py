# 메일파일럿 Uni 0.8 — 설정·상태 창(tkinter). 좌측 메뉴·항목 / 우측 수집 기록.
# ⚠ 보안: 여기서 입력한 비밀번호는 config.json 에 평문 저장된다. 개인 PC 전용, 공용 PC 금지.
"""tkinter 설정 창 — 0.8 「화면 개편」.

화면 골격(현장 수집기 화면과 같은 짜임):

    ┌ 머리글(제목·버전·상태) ─────────────────────────────┐
    │ 메뉴  │ 고른 절(항목)          │  수집 기록(로그)    │
    │ 수집 상태                      │  — 세로 전체        │
    │ 메일 계정                      │                     │
    │ 저장 위치·주기                 │                     │
    │ 데이터베이스                   │                     │
    │ 선박 관리                      │                     │
    │ 선석배정 상태                  │                     │
    └───────────────────────────────────────────────────┘

  · 좌측 메뉴로 절을 갈아 끼운다 — 항목이 많아 한 화면에 다 펴면 글자가 잘린다.
  · 우측 「수집 기록」은 늘 보인다(수집 중에 무슨 일이 벌어지는지 눈을 떼지 않아도 된다).

절마다 담은 것(0.7-01 까지의 기능 그대로, 자리만 옮겼다):

  수집 상태     [수집 시작/중지] [연결 테스트] [저장] · 상태 문구 · 지금 수집 조건(한국어)
  메일 계정     메일사 프리셋(후이즈/회사메일 · 네이버 · 한메일 · 지메일 · 직접입력)
                — 고르면 방식(IMAP/POP3)·서버·포트·SSL 이 한꺼번에 채워진다.
                직접입력일 때만 방식·서버·포트·SSL 을 손으로 고칠 수 있다. 이메일/비밀번호(*).
  저장 위치·주기 메일박스 폴더 · 최근 며칠 · 주기(분)
  데이터베이스   firebaseConfig 붙여넣기(앱에 넣은 것과 같은 값) · [연결 테스트]
  선박 관리     발견된 선박 체크리스트 — 체크를 끄면 그 선박의 새 메일은 _기타 로 간다
                · 정본표에 있는 배는 "코드 — 정식 선박명", 없는 배는 "(미확인)"
                · 미확인 항목은 [정본으로 승인](0.8 신규) 으로 정본표에 바로 올리거나,
                  [정본 연결…] 로 다른 정본 코드에 합치거나, [항목 삭제] 로 목록에서 뺀다
                · [폴더 정리] [새로고침] [정본표 가져오기…]
  선석배정 상태  마지막 조회 시각 · 터미널별 줄 수 · 실패 사유(읽기 표시만)

  `python gui.py --autostart` — 설정이 갖춰져 있으면 창이 뜬 직후 수집을 스스로 시작한다(무인 재시작).
"""

import json
import os
import queue
import shutil
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import berth_schedule as bsch     # 0.8 — 선석배정 상태(읽기 표시만, 판정에 쓰지 않는다)
import mailpilot as core

PAD = 6

# 좌측 메뉴 — (키, 이름) 순서대로 세로로 놓인다. 첫 항목이 창을 열었을 때 보이는 절이다.
SECTIONS = (
    ("run", "수집 상태"),
    ("mail", "메일 계정"),
    ("store", "저장 위치 · 주기"),
    ("db", "데이터베이스"),
    ("vessel", "선박 관리"),
    ("berth", "선석배정 상태"),
)


class MailPilotGUI:
    """설정 + 상태 창 본체."""

    def __init__(self, master=None, config_path=None, cache_path=None, master_path=None):
        self.config_path = config_path or core.CONFIG_PATH
        self.cache_path = cache_path or core.CACHE_PATH
        self.master_path = master_path or core.MASTER_PATH     # 선박 정본표 파일 자리
        self.master = master or tk.Tk()
        self.master.title("메일파일럿 Uni %s — 수집기"
                          % core.VERSION.split()[-1])
        self.collector = None
        self._autostarting = False       # --autostart 로 켜는 중이면 저장 확인창을 띄우지 않는다
        self.log_queue = queue.Queue()
        # 선박 캐시는 GUI 와 Collector 가 '같은 딕셔너리'를 본다(체크를 켜고 끄면 즉시 반영된다)
        self.cache = core.load_cache(self.cache_path)
        # 선박 정본표 — 있으면 목록에 정식 선박명이 뜨고, 없으면 모두 '(미확인)' 으로 보인다
        self.vessel_master = core.load_master(self.master_path)
        self.tally_vars = {}
        self._vessel_rows = []
        # 0.8 — 좌측 메뉴로 갈아 끼우는 절. 한 번만 만들어 두고 보이기/숨기기로만 바꾼다.
        self.section_frames = {}
        self.menu_buttons = {}
        self.current_section = None

        cfg = core.load_config(self.config_path) or dict(core.DEFAULT_CONFIG)
        # 0.6 — 화면에 칸이 없는 설정(모항 별칭·선석배정·비관할 항로 …)을 기억해 뒀다가
        #   저장할 때 그대로 되돌려 넣는다. 종전엔 [설정 저장]이 화면 칸만으로 config 를 새로
        #   만들어 이 값들이 사라졌다(0.6 첫 기동에서 berth_plan 이 없어져 배정표를 못 읽었다).
        self.extra_cfg = {k: v for k, v in cfg.items() if k not in self.GUI_FIELDS}
        self.provider_labels = {k: v["label"] for k, v in core.PRESETS.items()}
        self.label_to_key = {v: k for k, v in self.provider_labels.items()}

        default_provider = cfg.get("provider") or core.DEFAULT_CONFIG["provider"]
        self.var_provider = tk.StringVar(
            self.master,
            self.provider_labels.get(default_provider, core.PRESETS["whois"]["label"]))
        self.var_protocol = tk.StringVar(self.master, core.cfg_protocol(cfg))
        self.var_ssl = tk.BooleanVar(self.master, core.cfg_ssl(cfg))
        self.var_host = tk.StringVar(self.master, core.cfg_host(cfg))
        self.var_port = tk.StringVar(self.master, str(core.cfg_port(cfg)))
        self.var_email = tk.StringVar(self.master, cfg.get("email", ""))
        self.var_password = tk.StringVar(self.master, cfg.get("password", ""))
        self.var_root = tk.StringVar(self.master, cfg.get("mailbox_root", ""))
        self.var_days = tk.StringVar(self.master, str(cfg.get("collect_days", 7)))
        self.var_poll = tk.StringVar(self.master, str(cfg.get("poll_minutes", 10)))
        self.var_status = tk.StringVar(self.master, "대기 중")
        self.var_condition = tk.StringVar(self.master, "")
        self.var_berth = tk.StringVar(self.master, "")

        self._build(cfg)
        core.add_log_listener(self.log_queue.put)
        self._pump_logs()

    # ────────────────────── 화면 구성 ──────────────────────
    def _build(self, cfg):
        """좌우 2단 — 좌측은 메뉴+절, 우측은 수집 기록(세로 전체)."""
        self._size_window()

        root = ttk.Frame(self.master, padding=PAD)
        root.pack(fill="both", expand=True)
        # 현장 수집기와 같은 비율 — 좌 3 : 우 2. 창을 늘리면 양쪽이 함께 늘어난다.
        root.grid_columnconfigure(0, weight=3)
        root.grid_columnconfigure(1, weight=2)
        root.grid_rowconfigure(1, weight=1)

        # ── 머리글 ──
        header = ttk.Frame(root)
        header.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, PAD))
        ttk.Label(header, text="⚓ 메일파일럿 Uni %s" % core.VERSION.split()[-1],
                  font=("Malgun Gothic", 13, "bold")).pack(side="left")
        ttk.Label(header, textvariable=self.var_status,
                  foreground="#1a5").pack(side="right")

        # ── 좌: 메뉴 + 고른 절 ──
        left = ttk.Frame(root)
        left.grid(row=1, column=0, sticky="nsew", padx=(0, PAD))
        # 절이 남는 자리를 다 쓴다. minsize 를 두는 이유 — 절마다 요구 폭이 달라
        #   메뉴를 누를 때마다 좌우 경계가 들썩이는 것을 막는다.
        left.grid_columnconfigure(1, weight=1, minsize=520)
        left.grid_rowconfigure(0, weight=1)

        menu = ttk.Frame(left)
        menu.grid(row=0, column=0, sticky="ns", padx=(0, PAD))
        for idx, (key, label) in enumerate(SECTIONS):
            btn = ttk.Button(menu, text=self._menu_label(label, False),
                             command=lambda k=key: self.show_section(k))
            # sticky="ew" 라 메뉴 칸 너비는 가장 긴 이름에 맞춰진다 — 한글이 잘리지 않는다
            btn.grid(row=idx, column=0, sticky="ew", pady=1)
            self.menu_buttons[key] = btn

        self.frm_section = ttk.Frame(left)
        self.frm_section.grid(row=0, column=1, sticky="nsew")
        self.frm_section.grid_columnconfigure(0, weight=1)
        self.frm_section.grid_rowconfigure(0, weight=1)

        builders = {"run": self._section_run, "mail": self._section_mail,
                    "store": self._section_store, "db": self._section_db,
                    "vessel": self._section_vessel, "berth": self._section_berth}
        for key, _label in SECTIONS:
            frame = builders[key](self.frm_section, cfg)
            frame.grid(row=0, column=0, sticky="nsew")
            frame.grid_remove()                     # 고른 절만 다시 보인다
            self.section_frames[key] = frame

        # ── 우: 수집 기록(세로 전체) ──
        box_log = ttk.LabelFrame(root, text="수집 기록", padding=PAD)
        box_log.grid(row=1, column=1, sticky="nsew")
        self.txt_log = tk.Text(box_log, height=12, width=52, wrap="word", state="disabled")
        scroll = ttk.Scrollbar(box_log, command=self.txt_log.yview)
        scroll.pack(fill="y", side="right")
        self.txt_log.pack(fill="both", expand=True, side="left")
        self.txt_log.configure(yscrollcommand=scroll.set)

        self.show_section(SECTIONS[0][0])
        self.on_provider_change()

    def _size_window(self):
        """창 크기·최소 크기 — 좌우 2단이 겹치지 않게 넉넉히 잡는다."""
        for name, value in (("geometry", "1180x760"), ("minsize", (980, 620))):
            fn = getattr(self.master, name, None)
            if fn is None:
                continue
            try:
                fn(*value) if isinstance(value, tuple) else fn(value)
            except tk.TclError as exc:              # 창이 없는 환경(시험 대역) — 조용히 넘기지 않는다
                core.log("창 크기(%s)를 잡지 못했습니다: %s" % (name, exc))

    def _menu_label(self, name, active):
        """고른 절의 메뉴 글자에는 표식을 붙인다(글자 폭은 그대로 둔다)."""
        return ("▶ " if active else "   ") + name

    def show_section(self, key):
        """좌측 메뉴 — 고른 절만 보이게 갈아 끼운다."""
        if key not in self.section_frames:
            core.log("없는 화면을 부르려 했습니다: %s" % key)
            return None
        for name, frame in self.section_frames.items():
            if name == key:
                frame.grid()
            else:
                frame.grid_remove()
        for (name, label) in SECTIONS:
            button = self.menu_buttons.get(name)
            if button is not None:
                button.configure(text=self._menu_label(label, name == key))
        self.current_section = key
        if key == "berth":
            self._refresh_berth()                   # 열자마자 최신 상태를 보여 준다
        return key

    # ── 절 1) 수집 상태 ──
    def _section_run(self, parent, _cfg):
        frm = ttk.LabelFrame(parent, text="수집 상태", padding=PAD)
        frm.grid_columnconfigure(0, weight=1)

        bar = ttk.Frame(frm)
        bar.grid(row=0, column=0, sticky="ew")
        self.btn_run = ttk.Button(bar, text="수집 시작", command=self.on_toggle_run)
        self.btn_run.pack(side="left")
        ttk.Button(bar, text="연결 테스트", command=self.on_test).pack(side="left", padx=PAD)
        ttk.Button(bar, text="저장", command=self.on_save).pack(side="left")

        ttk.Label(frm, textvariable=self.var_status, foreground="#1a5").grid(
            row=1, column=0, sticky="w", pady=(PAD, 0))

        # 지금 무엇을 어떤 조건으로 가져오는지 늘 보이게(창을 열면 바로 읽힌다)
        self.lbl_condition = ttk.Label(frm, textvariable=self.var_condition,
                                       foreground="#1a5", justify="left", wraplength=440)
        self.lbl_condition.grid(row=2, column=0, sticky="w", pady=(PAD, 0))
        self._refresh_condition()
        self._watch_condition_vars()

        ttk.Label(frm, justify="left", foreground="#555", wraplength=440,
                  text="· [수집 시작]을 누르면 설정을 저장하고 곧바로 첫 판을 돕니다.\n"
                       "· 창을 닫으면 수집도 멈춥니다 — 계속 받으려면 창을 열어 두십시오.\n"
                       "· 무인 재시작(run_mailpilot.bat)은 창이 뜨는 대로 스스로 시작합니다.").grid(
            row=3, column=0, sticky="w", pady=(PAD, 0))
        return frm

    # ── 절 2) 메일 계정 ──
    def _section_mail(self, parent, _cfg):
        box1 = ttk.LabelFrame(parent, text="메일 계정", padding=PAD)

        ttk.Label(box1, text="메일사").grid(row=0, column=0, sticky="w")
        self.cmb_provider = ttk.Combobox(
            box1, textvariable=self.var_provider, state="readonly",
            values=[core.PRESETS[k]["label"] for k in core.PRESET_ORDER],
            width=16)
        self.cmb_provider.grid(row=0, column=1, columnspan=2, sticky="w", padx=PAD)
        self.cmb_provider.bind("<<ComboboxSelected>>", self.on_provider_change)

        ttk.Label(box1, text="방식").grid(row=1, column=0, sticky="w", pady=(PAD, 0))
        # 한 칸에 모아 담는다 — 칸마다 따로 두면 옆 칸(서버·이메일) 폭에 끌려 멀리 벌어진다
        proto = ttk.Frame(box1)
        proto.grid(row=1, column=1, columnspan=4, sticky="w", padx=PAD, pady=(PAD, 0))
        self.rb_imap = ttk.Radiobutton(proto, text="IMAP", variable=self.var_protocol,
                                       value="imap", command=self.on_protocol_change)
        self.rb_imap.pack(side="left")
        self.rb_pop3 = ttk.Radiobutton(proto, text="POP3", variable=self.var_protocol,
                                       value="pop3", command=self.on_protocol_change)
        self.rb_pop3.pack(side="left", padx=PAD)
        self.chk_ssl = ttk.Checkbutton(proto, text="SSL", variable=self.var_ssl)
        self.chk_ssl.pack(side="left", padx=PAD)

        ttk.Label(box1, text="메일 서버").grid(row=2, column=0, sticky="w", pady=(PAD, 0))
        self.ent_host = ttk.Entry(box1, textvariable=self.var_host, width=26)
        self.ent_host.grid(row=2, column=1, columnspan=2, sticky="w", padx=PAD, pady=(PAD, 0))
        ttk.Label(box1, text="포트").grid(row=2, column=3, sticky="e", pady=(PAD, 0))
        self.ent_port = ttk.Entry(box1, textvariable=self.var_port, width=6)
        self.ent_port.grid(row=2, column=4, sticky="w", padx=PAD, pady=(PAD, 0))

        ttk.Label(box1, text="이메일").grid(row=3, column=0, sticky="w", pady=(PAD, 0))
        ttk.Entry(box1, textvariable=self.var_email, width=30).grid(
            row=3, column=1, columnspan=3, sticky="w", padx=PAD, pady=(PAD, 0))

        ttk.Label(box1, text="비밀번호").grid(row=4, column=0, sticky="w", pady=(PAD, 0))
        ttk.Entry(box1, textvariable=self.var_password, width=30, show="*").grid(
            row=4, column=1, columnspan=3, sticky="w", padx=PAD, pady=(PAD, 0))

        self.lbl_help = ttk.Label(box1, text="", foreground="#555", justify="left",
                                  wraplength=500)
        self.lbl_help.grid(row=5, column=0, columnspan=5, sticky="w", pady=(PAD, 0))
        return box1

    # ── 절 3) 저장 위치 · 주기 ──
    def _section_store(self, parent, _cfg):
        box2 = ttk.LabelFrame(parent, text="저장 위치 · 주기", padding=PAD)
        box2.grid_columnconfigure(1, weight=1)

        ttk.Label(box2, text="메일박스 폴더").grid(row=0, column=0, sticky="w")
        ttk.Entry(box2, textvariable=self.var_root, width=34).grid(
            row=0, column=1, sticky="ew", padx=PAD)
        ttk.Button(box2, text="찾기…", command=self.on_pick_folder).grid(row=0, column=2)

        row = ttk.Frame(box2)
        row.grid(row=1, column=0, columnspan=3, sticky="w", pady=(PAD, 0))
        ttk.Label(row, text="최근 며칠").pack(side="left")
        ttk.Entry(row, textvariable=self.var_days, width=5).pack(side="left", padx=(PAD, 0))
        ttk.Label(row, text="주기(분)").pack(side="left", padx=(PAD * 2, 0))
        ttk.Entry(row, textvariable=self.var_poll, width=5).pack(side="left", padx=(PAD, 0))

        ttk.Label(box2, justify="left", foreground="#555", wraplength=440,
                  text="· 메일박스 폴더 아래에 {선박코드}/{항차}/ 로 첨부가 쌓입니다.\n"
                       "· 판독 못 한 메일은 _미분류 에, 체크를 끈 선박은 _기타 에 둡니다.").grid(
            row=2, column=0, columnspan=3, sticky="w", pady=(PAD, 0))
        return box2

    # ── 절 4) 데이터베이스 ──
    def _section_db(self, parent, cfg):
        box3 = ttk.LabelFrame(parent, text="데이터베이스 (firebaseConfig)", padding=PAD)
        box3.grid_columnconfigure(0, weight=1)
        box3.grid_rowconfigure(1, weight=1)

        ttk.Label(box3, justify="left", foreground="#555", wraplength=440,
                  text="검수앱에 넣은 firebaseConfig 를 그대로 붙여넣으십시오. "
                       "이 값이 있어야 선박·항차가 앱 화면에 뜹니다.").grid(
            row=0, column=0, sticky="w")
        self.txt_fb = tk.Text(box3, height=12, width=52)
        self.txt_fb.grid(row=1, column=0, sticky="nsew", pady=(PAD, 0))
        existing = cfg.get("firebase") or {}
        if existing:
            self.txt_fb.insert("1.0", json.dumps(existing, ensure_ascii=False, indent=2))
        ttk.Button(box3, text="연결 테스트", command=self.on_test).grid(
            row=2, column=0, sticky="w", pady=(PAD, 0))
        return box3

    # ── 절 5) 선박 관리 ──
    def _section_vessel(self, parent, _cfg):
        box_v = ttk.LabelFrame(parent, text="선박 관리 (검수 대상 체크)", padding=PAD)
        box_v.grid_columnconfigure(0, weight=1)
        box_v.grid_rowconfigure(2, weight=1)

        ttk.Label(box_v, foreground="#555", justify="left", wraplength=440,
                  text="체크를 끄면 그 선박의 새 메일은 _기타 폴더로 들어갑니다(발견 기록은 남습니다).\n"
                       "정본표에 없는 배는 (미확인) 으로 보입니다 — [정본으로 승인] 으로 정본표에 "
                       "올리거나, [정본 연결…] 로 다른 코드에 합치거나, [항목 삭제] 로 뺍니다.").grid(
            row=0, column=0, sticky="w")

        head = ttk.Frame(box_v)
        head.grid(row=1, column=0, sticky="ew", pady=(PAD, 0))
        ttk.Button(head, text="새로고침", command=self.on_refresh_vessels).pack(side="left")
        # 수집 중에는 잠근다 — 옮기는 도중에 새 첨부가 떨어지면 반쪽만 정리된다
        self.btn_organize = ttk.Button(head, text="폴더 정리", command=self.on_organize)
        self.btn_organize.pack(side="left", padx=PAD)
        ttk.Button(head, text="정본표 가져오기…", command=self.on_import_master).pack(side="left")

        body = ttk.Frame(box_v)
        body.grid(row=2, column=0, sticky="nsew", pady=(PAD, 0))
        self.cvs_vessels = tk.Canvas(body, height=260, highlightthickness=0)
        scroll_v = ttk.Scrollbar(body, orient="vertical", command=self.cvs_vessels.yview)
        self.frm_vessels = ttk.Frame(self.cvs_vessels)
        self.frm_vessels.grid_columnconfigure(0, weight=1)
        self.frm_vessels.bind(
            "<Configure>",
            lambda _e: self.cvs_vessels.configure(scrollregion=self.cvs_vessels.bbox("all")))
        self._vessels_window = self.cvs_vessels.create_window(
            (0, 0), window=self.frm_vessels, anchor="nw")
        # 목록 폭을 캔버스에 맞춘다 — 행이 남는 자리를 다 쓰게(가로로 잘리지 않게)
        self.cvs_vessels.bind(
            "<Configure>",
            lambda e: self.cvs_vessels.itemconfigure(self._vessels_window, width=e.width))
        self.cvs_vessels.configure(yscrollcommand=scroll_v.set)
        self.cvs_vessels.pack(side="left", fill="both", expand=True)
        scroll_v.pack(side="right", fill="y")
        self._bind_wheel(self.cvs_vessels)
        self._render_vessels()
        return box_v

    def _bind_wheel(self, canvas):
        """목록 위에 마우스를 올렸을 때만 휠로 굴린다(로그 쪽 휠을 뺏지 않게)."""
        def on_wheel(event):
            try:
                canvas.yview_scroll(int(-(event.delta or 0) / 120), "units")
            except tk.TclError as exc:
                core.log("선박 목록을 굴리지 못했습니다: %s" % exc)

        canvas.bind("<Enter>", lambda _e: canvas.bind_all("<MouseWheel>", on_wheel))
        canvas.bind("<Leave>", lambda _e: canvas.unbind_all("<MouseWheel>"))

    # ── 절 6) 선석배정 상태 ──
    def _section_berth(self, parent, _cfg):
        box_b = ttk.LabelFrame(parent, text="선석배정 상태 (읽기 표시)", padding=PAD)
        box_b.grid_columnconfigure(0, weight=1)

        ttk.Label(box_b, foreground="#555", justify="left", wraplength=440,
                  text="사이클마다 터미널 두 곳(PNCT·PCTC)의 선석배정표를 한 번씩 읽습니다. "
                       "여기서는 마지막 결과만 보여 줍니다 — 값을 고치는 곳이 아닙니다.").grid(
            row=0, column=0, sticky="w")
        ttk.Label(box_b, textvariable=self.var_berth, justify="left",
                  wraplength=440).grid(row=1, column=0, sticky="w", pady=(PAD, 0))
        ttk.Button(box_b, text="새로고침", command=self._refresh_berth).grid(
            row=2, column=0, sticky="w", pady=(PAD, 0))
        self._refresh_berth()
        return box_b

    def berth_status_text(self):
        """마지막 선석배정 조회 결과를 한국어 몇 줄로(값을 지어내지 않는다)."""
        status = bsch.last_fetch_status()
        if not status.get("at"):
            return ("아직 선석배정표를 읽은 적이 없습니다 — 수집을 한 판 돌리면 "
                    "여기에 채워집니다.")
        rows = status.get("rows") or {}
        counts = " · ".join("%s %d줄" % (name, rows[name]) for name in sorted(rows)) or "없음"
        lines = ["마지막 조회: %s" % status["at"], "터미널별 줄 수: %s" % counts]
        if status.get("why"):
            lines.append("실패 사유: %s" % status["why"])
            lines.append("마지막 성공: %s" % (status.get("ok_at") or "아직 없음"))
            lines.append("※ 한쪽이라도 못 받으면 그 판의 선석배정 판정은 통째로 건너뜁니다.")
        else:
            lines.append("상태: 두 터미널 모두 받았습니다.")
        return "\n".join(lines)

    def _refresh_berth(self):
        """표시 문구를 새로 만든다 — 달라졌을 때만 화면 변수를 건드린다."""
        text = self.berth_status_text()
        if text != self.var_berth.get():
            self.var_berth.set(text)
        return text

    # ────────────────────── 동작 ──────────────────────
    def current_provider(self):
        return self.label_to_key.get(self.var_provider.get(), "custom")

    def on_provider_change(self, event=None):
        """프리셋을 고르면 방식·서버·포트·SSL 을 한꺼번에 채운다(직접입력만 손으로 고친다)."""
        key = self.current_provider()
        preset = core.PRESETS.get(key, core.PRESETS["custom"])
        if key != "custom":
            self.var_protocol.set(preset.get("protocol", "imap"))
            self.var_host.set(preset["host"])
            self.var_port.set(str(preset["port"]))
            self.var_ssl.set(bool(preset.get("ssl", True)))
        self.lbl_help.configure(text=preset["help"])
        self._set_manual_fields(key == "custom")

    def on_protocol_change(self, event=None):
        """직접입력에서 방식만 바꿨을 때 표준 포트를 따라 준다(손으로 고친 값은 건드리지 않는다)."""
        if self.current_provider() != "custom":
            return
        standard = {"imap": ("993", "143"), "pop3": ("995", "110")}
        want = standard.get(self.var_protocol.get(), ("993", "143"))
        other = standard["pop3"] if self.var_protocol.get() == "imap" else standard["imap"]
        if self.var_port.get().strip() in other or not self.var_port.get().strip():
            self.var_port.set(want[0] if self.var_ssl.get() else want[1])

    def _set_manual_fields(self, editable):
        """프리셋을 쓰면 서버·포트·방식 칸을 잠근다(오타로 접속이 막히는 일을 줄인다)."""
        state = "normal" if editable else "readonly"
        for widget in (self.ent_host, self.ent_port):
            try:
                widget.configure(state=state)
            except Exception:
                pass
        btn_state = "normal" if editable else "disabled"
        for widget in (self.rb_imap, self.rb_pop3, self.chk_ssl):
            try:
                widget.configure(state=btn_state)
            except Exception:
                pass

    def on_pick_folder(self):
        path = filedialog.askdirectory(title="메일박스 폴더 선택")
        if path:
            self.var_root.set(path)

    # ────────────────────── 수집 조건 표시 ──────────────────────
    def condition_text(self):
        """지금 설정으로 무엇을 가져오는지 한 줄로(정본 문구)."""
        days = (self.var_days.get() or "").strip() or "7"
        poll = (self.var_poll.get() or "").strip() or "10"
        return ("지금 조건: 최근 %s일 · %s분 주기 · 첨부(EDI·ASC·TXT·XLS·XLSX·PDF) 있는 메일만 · "
                "판독 실패는 _미분류 보존 · 서버 원본은 지우지 않습니다." % (days, poll))

    def _refresh_condition(self, *_args):
        self.var_condition.set(self.condition_text())

    def _watch_condition_vars(self):
        """최근 며칠·주기를 고치면 조건 문구가 곧바로 따라오게 한다."""
        for var in (self.var_days, self.var_poll):
            try:
                var.trace_add("write", self._refresh_condition)
            except AttributeError as exc:            # 아주 옛 tkinter — 조용히 넘기지 않고 알린다
                core.log("수집 조건 자동 갱신을 걸지 못했습니다(%s) — 저장 시 갱신됩니다." % exc)

    # ────────────────────── 발견된 선박 체크리스트 ──────────────────────
    def vessel_display_name(self, code):
        """읽어낸 이름(정본에 없을 때 승인·표시에 쓴다)."""
        return (self.cache.get("codes") or {}).get(code) or code

    def vessel_row_label(self, code):
        """행 문구 — 정본에 있으면 '코드 — 정식 선박명', 없으면 '코드 — 읽어낸 이름 (미확인)'."""
        item = core.master_by_code(self.vessel_master, code)
        if item:
            return "%s — %s" % (code, item["name"])
        return "%s — %s (미확인)" % (code, self.vessel_display_name(code))

    def _render_vessels(self):
        """캐시의 codes 를 코드순으로 체크박스 목록으로 그린다(미확인 행에는 손질 단추를 붙인다)."""
        for widget in self._vessel_rows:
            try:
                widget.destroy()
            except Exception as exc:
                core.log("선박 목록을 지우는 중 오류: %s" % exc)
        self._vessel_rows = []
        self.tally_vars = {}
        codes = self.cache.get("codes") or {}
        if not codes:
            empty = ttk.Label(self.frm_vessels,
                              text="아직 발견된 선박이 없습니다 — 수집을 한 번 돌리면 여기에 채워집니다.",
                              foreground="#555")
            empty.grid(row=0, column=0, sticky="w")
            self._vessel_rows.append(empty)
            return
        for row, code in enumerate(sorted(codes)):
            # 0.8 — 한 척 = 한 묶음(체크 줄 + 미확인이면 그 아래 단추 줄).
            #   좌측이 좁아져 단추를 옆으로 늘어놓으면 끝 단추가 잘린다.
            holder = ttk.Frame(self.frm_vessels)
            holder.grid(row=row, column=0, sticky="ew")
            self._vessel_rows.append(holder)
            var = tk.BooleanVar(self.master, core.tally_enabled(self.cache, code))
            self.tally_vars[code] = var
            chk = ttk.Checkbutton(holder, text=self.vessel_row_label(code), variable=var,
                                  command=lambda c=code: self.on_toggle_tally(c))
            chk.pack(anchor="w")
            if core.master_by_code(self.vessel_master, code) is not None:
                continue                              # 정본에 있는 배는 손질 단추가 필요 없다
            buttons = ttk.Frame(holder)
            buttons.pack(anchor="w", padx=(20, 0), pady=(0, PAD))
            # 0.8 — 미확인 항목을 그 자리에서 정본으로 올린다(문서 승인을 매번 기다리지 않게)
            ttk.Button(buttons, text="정본으로 승인",
                       command=lambda c=code: self.on_approve_master(c)).pack(side="left")
            ttk.Button(buttons, text="정본 연결…",
                       command=lambda c=code: self.on_link_master(c)).pack(side="left", padx=PAD)
            ttk.Button(buttons, text="항목 삭제",
                       command=lambda c=code: self.on_delete_vessel(c)).pack(side="left")

    def on_refresh_vessels(self):
        """캐시·정본표를 다시 읽어 목록을 새로 그린다(수집 중 새로 발견·이관된 선박 반영)."""
        self.vessel_master = core.load_master(self.master_path)
        fresh = core.load_cache(self.cache_path)
        # 같은 딕셔너리를 계속 쓴다 — Collector 와 공유 중이라 통째로 바꾸면 연결이 끊긴다
        self.cache["names"] = fresh.get("names", {})
        self.cache["codes"] = fresh.get("codes", {})
        self.cache["tally"] = fresh.get("tally", {})
        self._render_vessels()
        core.log("발견된 선박 목록을 새로 읽었습니다 — %d척" % len(self.cache.get("codes") or {}))

    def on_toggle_tally(self, code):
        """체크 즉시 캐시 저장 + (설정이 있으면) 파이어베이스에도 반영."""
        var = self.tally_vars.get(code)
        on = bool(var.get()) if var is not None else True
        core.set_tally(self.cache, code, on)
        core.save_cache(self.cache, self.cache_path)
        if self.collector is not None and getattr(self.collector, "cache", None) is not self.cache:
            core.set_tally(self.collector.cache, code, on)   # 캐시가 갈렸을 때의 안전장치
        core.log("검수 대상 %s — %s" % (code, "켬(원래 자리로 적재)" if on
                                       else "끔(새 메일은 _기타 로 적재)"))
        self._push_tally(code, on)

    def _push_tally(self, code, on):
        """vessels/{코드} 에 tally 만 PATCH — 실패해도 수집은 계속하되 로그로 드러낸다."""
        fb_cfg = core.parse_firebase_config(self.txt_fb.get("1.0", "end"))
        if not fb_cfg:
            return None

        def worker():
            try:
                fb = core.FirebaseREST(fb_cfg)
                if not fb.enabled:
                    core.log("파이어베이스 설정이 모자라 검수 대상 표시를 서버에 올리지 못했습니다: %s" % code)
                    return
                res = fb.patch("vessels/%s" % code, {"tally": bool(on)})
                if res is None:
                    core.log("검수 대상 표시 서버 반영 실패 — %s (위 로그의 사유 확인)" % code)
                else:
                    core.log("검수 대상 표시 서버 반영: %s = %s" % (code, bool(on)))
            except Exception as exc:
                core.log("검수 대상 표시 서버 반영 중 오류(%s): %s" % (code, exc))

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return thread

    # ────────────────────── 정본표(선박 정본 코드) ──────────────────────
    def _firebase_or_none(self):
        """화면에 붙여넣은 firebaseConfig 로 REST 객체를 만든다(모자라면 None — 로컬만 고친다)."""
        fb_cfg = core.parse_firebase_config(self.txt_fb.get("1.0", "end"))
        if not fb_cfg:
            return None
        fb = core.FirebaseREST(fb_cfg)
        if not fb.enabled:
            core.log("firebaseConfig 에 apiKey/databaseURL 이 모자라 서버 반영은 건너뜁니다.")
            return None
        return fb

    def master_choices(self):
        """정본 연결 콤보에 쓸 '코드 — 정식 선박명' 목록(코드순)."""
        return ["%s — %s" % (item["code"], item["name"])
                for item in sorted(self.vessel_master, key=lambda x: x["code"])]

    # ── 0.8 신규: 미확인 항목을 정본으로 승인 ──
    def approve_message(self, code, name):
        """승인 확인창 문구 — 무엇이 어디에 적히는지 먼저 보여 준다."""
        return ("%s — %s 를 선박 정본표에 올립니다.\n\n"
                "· 앞으로 이 코드로 오는 메일은 (미확인)이 아니라 정식 선박으로 잡힙니다.\n"
                "· 적히는 곳: %s\n"
                "· 메일박스 폴더와 파일은 건드리지 않습니다.\n"
                "· 이름이 틀렸으면 승인하지 말고 [정본 연결…] 을 쓰십시오.\n\n"
                "진행할까요?" % (code, name, self.master_path))

    def on_approve_master(self, code):
        """미확인 항목 하나를 정본표에 추가한다(확인창 한 번 · 중복이면 알리고 끝)."""
        if core.master_by_code(self.vessel_master, code) is not None:
            messagebox.showinfo("정본으로 승인", "%s 는 이미 정본표에 있습니다." % code)
            return None
        name = self.vessel_display_name(code)
        if not messagebox.askyesno("정본으로 승인", self.approve_message(code, name)):
            return None
        return self.approve_master_now(code, name)

    def approve_master_now(self, code, name=None):
        """확인창 없이 정본표에 한 척을 추가한다 — 중복이면 아무것도 하지 않는다."""
        code = (code or "").strip().upper()
        if not code:
            core.log("정본 승인 실패 — 코드가 비어 있습니다.")
            return None
        if core.master_by_code(self.vessel_master, code) is not None:
            core.log("정본 승인 건너뜀 — 이미 정본표에 있습니다: %s" % code)
            return None
        name = " ".join(str(name or self.vessel_display_name(code)).upper().split()) or code
        items = self._read_master_file()
        if items is None:
            return None                              # 읽지 못했으면 덮어쓰지 않는다
        if any(isinstance(item, dict)
               and str(item.get("code") or "").strip().upper() == code for item in items):
            core.log("정본 승인 건너뜀 — 정본표 파일에 이미 있습니다: %s" % code)
            self.vessel_master = core.load_master(self.master_path)
            self._render_vessels()
            return None
        items.append({"code": code, "name": name, "aliases": [], "ko": []})
        if not self._write_master_file(items):
            return None
        self.vessel_master = core.load_master(self.master_path)
        # 수집 중이면 돌고 있는 수집기도 새 정본표를 보게 한다(재시작을 기다리지 않게)
        if self.collector is not None:
            self.collector.master = self.vessel_master
        self._render_vessels()
        note = ("정본 승인 — %s(%s) 를 정본표에 올렸습니다 · 정본 %d척"
                % (code, name, len(self.vessel_master)))
        core.log(note)
        self.var_status.set(note)
        return {"code": code, "name": name, "count": len(self.vessel_master)}

    def _read_master_file(self):
        """정본표 파일을 원문 그대로 읽는다(별칭·한글 별칭을 잃지 않게). 못 읽으면 None."""
        if not os.path.exists(self.master_path):
            return []
        try:
            with open(self.master_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as exc:
            core.log("정본표를 읽지 못해 승인을 멈춥니다(%s): %s" % (self.master_path, exc))
            messagebox.showerror("정본으로 승인", "정본표를 읽지 못했습니다: %s" % exc)
            return None
        if not isinstance(data, list):
            core.log("정본표 형식이 목록이 아니어서 승인을 멈춥니다: %s" % self.master_path)
            messagebox.showerror("정본으로 승인",
                                 "정본표 형식이 목록이 아닙니다: %s" % self.master_path)
            return None
        return data

    def _write_master_file(self, items):
        """임시 파일에 먼저 쓰고 갈아 끼운다 — 쓰다 멈춰도 정본표가 반쪽이 되지 않는다."""
        tmp_path = self.master_path + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as fh:
                json.dump(items, fh, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.master_path)
        except OSError as exc:
            core.log("정본표를 저장하지 못했습니다: %s" % exc)
            messagebox.showerror("정본으로 승인", "정본표를 저장하지 못했습니다: %s" % exc)
            return False
        return True

    def on_link_master(self, code):
        """미확인 항목 하나를 어느 정본에 합칠지 고르는 작은 창."""
        if not self.vessel_master:
            messagebox.showwarning("정본 연결",
                                   "선박 정본표가 없습니다.\n[정본표 가져오기…] 로 먼저 등록하십시오.")
            return None
        choices = self.master_choices()
        win = tk.Toplevel(self.master)
        win.title("정본 연결 — %s" % code)
        frame = ttk.Frame(win, padding=PAD)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="%s 을(를) 어느 정본 선박으로 합칠까요?\n"
                              "폴더 %s 안의 항차도 함께 옮깁니다(같은 항차는 건너뜁니다)."
                              % (code, code), justify="left").pack(anchor="w")
        var = tk.StringVar(win, choices[0])
        ttk.Combobox(frame, textvariable=var, state="readonly",
                     values=choices, width=40).pack(anchor="w", pady=PAD)
        bar = ttk.Frame(frame)
        bar.pack(anchor="e")

        def do_link():
            picked = (var.get() or "").split("—")[0].strip()
            try:
                win.destroy()
            except Exception as exc:
                core.log("정본 연결 창을 닫지 못했습니다: %s" % exc)
            self.link_master_now(code, picked)

        ttk.Button(bar, text="연결", command=do_link).pack(side="left", padx=PAD)
        ttk.Button(bar, text="취소", command=win.destroy).pack(side="left")
        return win

    def link_master_now(self, old_code, new_code):
        """미확인 항목을 정본 코드로 병합 — 캐시·폴더·서버까지(이관 함수 그대로 쓴다)."""
        item = core.master_by_code(self.vessel_master, new_code)
        if item is None:
            core.log("정본 연결 실패 — 정본표에 없는 코드입니다: %s" % new_code)
            return None
        root_dir = self.var_root.get().strip()
        out = core.merge_vessel(root_dir, self.cache, old_code, new_code, item["name"],
                                firebase=self._firebase_or_none())
        core.save_cache(self.cache, self.cache_path)
        self._render_vessels()
        note = ("정본 연결 — %s → %s(%s) · 폴더 이동 %d건 · 건너뜀 %d건 · 실패 %d건"
                % (old_code, new_code, item["name"],
                   len(out["moved"]), len(out["skipped"]), out["errors"]))
        core.log(note)
        self.var_status.set(note)
        return out

    def on_delete_vessel(self, code):
        """미확인 항목을 목록에서 뺀다 — 폴더·파일은 그대로 둔다(확인창 먼저)."""
        ok = messagebox.askyesno(
            "항목 삭제",
            "선박 목록에서 %s 를 지웁니다.\n\n"
            "· 메일박스의 %s 폴더와 파일은 그대로 둡니다.\n"
            "· 서버(vessels/%s) 노드는 지웁니다.\n"
            "· 같은 이름이 또 들어오면 다시 나타납니다.\n\n진행할까요?" % (code, code, code))
        if not ok:
            return None
        return self.delete_vessel_now(code)

    def delete_vessel_now(self, code):
        core.forget_vessel(self.cache, code)
        core.save_cache(self.cache, self.cache_path)
        self._render_vessels()
        fb = self._firebase_or_none()
        if fb is not None:
            fb.delete("vessels/%s" % code)            # 실패는 core 쪽에서 로그로 드러난다
        core.log("선박 항목 삭제 — %s (메일박스 폴더는 그대로 둡니다)" % code)
        return True

    def on_import_master(self):
        """정본표(json) 파일을 골라 자리에 놓고 곧바로 이관까지 돌린다."""
        path = filedialog.askopenfilename(
            title="선박 정본표(json) 선택",
            filetypes=[("JSON 파일", "*.json"), ("모든 파일", "*.*")])
        if not path:
            return None
        return self.import_master_now(path)

    def import_master_now(self, path):
        items = core.load_master(path)
        if not items:
            messagebox.showwarning("정본표 가져오기",
                                   "선박 정본표를 읽지 못했습니다(형식 확인): %s" % path)
            return None
        try:
            if os.path.abspath(path) != os.path.abspath(self.master_path):
                shutil.copyfile(path, self.master_path)
        except OSError as exc:
            core.log("정본표를 자리에 놓지 못했습니다: %s" % exc)
            messagebox.showerror("정본표 가져오기", "파일을 복사하지 못했습니다: %s" % exc)
            return None
        self.vessel_master = core.load_master(self.master_path)
        core.log("선박 정본표를 등록했습니다 — %d척 (%s)" % (len(self.vessel_master), self.master_path))
        result = core.migrate_to_master(self.var_root.get().strip(), self.cache,
                                        self.vessel_master, firebase=self._firebase_or_none())
        core.save_cache(self.cache, self.cache_path)
        self._render_vessels()
        note = ("정본 %d척 · 코드 이관 %d건 · 폴더 이동 %d건 · 건너뜀 %d건 · 실패 %d건"
                % (len(self.vessel_master), len(result["plan"]), len(result["moved"]),
                   len(result["skipped"]), result["errors"]))
        self.var_status.set("정본표 가져오기 완료 — " + note)
        messagebox.showinfo("정본표 가져오기", note)
        return result

    def organize_message(self):
        """폴더 정리 확인창 문구 — 무엇이 어디로 가는지 먼저 보여 준다."""
        codes = sorted(self.cache.get("codes") or {})
        off = [c for c in codes if not core.tally_enabled(self.cache, c)]
        on = [c for c in codes if core.tally_enabled(self.cache, c)]
        return ("메일박스 폴더를 지금 체크 상태에 맞춰 정리합니다.\n\n"
                "· 체크 끈 선박 폴더 → _기타 안으로: %s\n"
                "· _기타 에 있는 체크 켠 선박 → 원래 자리로: %s\n\n"
                "· 파일은 옮기기만 합니다 — 지우거나 덮어쓰지 않습니다.\n"
                "· 같은 항차 폴더가 양쪽에 있으면 그 항차는 손대지 않고 건너뜁니다.\n"
                "· _미분류 와 모르는 폴더는 건드리지 않습니다.\n\n진행할까요?"
                % (", ".join(off) or "없음", ", ".join(on) or "없음"))

    def on_organize(self):
        root_dir = self.var_root.get().strip()
        if not root_dir or not os.path.isdir(root_dir):
            messagebox.showwarning("폴더 정리", "메일박스 폴더를 먼저 지정하십시오: %s" % (root_dir or "(비어 있음)"))
            return None
        if not messagebox.askyesno("폴더 정리", self.organize_message()):
            return None
        self.var_status.set("폴더 정리 중…")

        def worker():
            try:
                moved, skipped = core.organize_folders(root_dir, self.cache)
            except OSError as exc:
                core.log("폴더 정리 실패: %s" % exc)
                self.var_status.set("폴더 정리 실패")
                self._later(lambda: messagebox.showerror("폴더 정리 실패", str(exc)))
                return
            note = "이동 %d건 · 건너뜀 %d건" % (len(moved), len(skipped))
            core.log("폴더 정리 결과 — " + note)
            self.var_status.set("폴더 정리 완료 — " + note)
            self._later(lambda: messagebox.showinfo("폴더 정리 완료", note))

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        return thread

    def _later(self, fn):
        """작업 스레드에서 만든 알림을 화면 스레드로 넘긴다(실패하면 로그로 남긴다)."""
        try:
            self.master.after(0, fn)
        except Exception as exc:
            core.log("알림 표시 실패: %s" % exc)

    # 화면이 직접 관리하는 칸 — 이 밖의 설정은 collect_config 가 손대지 않고 그대로 물려준다.
    GUI_FIELDS = ("provider", "protocol", "host", "port", "ssl", "imap_host", "imap_port",
                  "email", "password", "mailbox_root", "collect_days", "poll_minutes",
                  "firebase")

    def collect_config(self):
        """화면 입력 → config 딕셔너리. 화면에 없는 설정은 읽어 둔 값을 그대로 지킨다."""
        def _int(value, default):
            try:
                return int(str(value).strip())
            except (TypeError, ValueError):
                return default
        host = self.var_host.get().strip()
        protocol = (self.var_protocol.get() or "imap").strip().lower()
        port = _int(self.var_port.get(), 995 if protocol == "pop3" else 993)
        cfg = dict(core.DEFAULT_CONFIG)
        cfg.update(getattr(self, "extra_cfg", {}) or {})
        cfg.update({
            "provider": self.current_provider(),
            "protocol": protocol,
            "host": host,
            "port": port,
            "ssl": bool(self.var_ssl.get()),
            # 0.1 호환 거울값 — 같은 값을 가리킨다(예전 설정을 읽는 도구가 있어도 깨지지 않게)
            "imap_host": host,
            "imap_port": port,
            "email": self.var_email.get().strip(),
            "password": self.var_password.get(),
            "mailbox_root": self.var_root.get().strip(),
            "collect_days": _int(self.var_days.get(), 7),
            "poll_minutes": _int(self.var_poll.get(), 10),
            "firebase": core.parse_firebase_config(self.txt_fb.get("1.0", "end")),
        })
        return cfg

    def missing_fields(self, cfg=None):
        """수집에 반드시 필요한 값 중 비어 있는 것(이메일·비밀번호·메일박스 폴더)."""
        cfg = cfg if cfg is not None else self.collect_config()
        return [name for name, val in (("이메일", cfg.get("email")),
                                       ("비밀번호", cfg.get("password")),
                                       ("메일박스 폴더", cfg.get("mailbox_root")))
                if not val]

    def on_save(self, announce=True):
        cfg = self.collect_config()
        missing = self.missing_fields(cfg)
        if missing:
            messagebox.showwarning("입력 필요", "다음 항목이 비어 있습니다: " + ", ".join(missing))
            return None
        path = core.save_config(cfg, self.config_path)
        self._refresh_condition()
        core.log("설정을 저장했습니다: %s" % path)
        if announce:                     # 무인 자동 시작에서는 확인창을 띄우지 않는다(사람이 없다)
            messagebox.showinfo("저장 완료",
                                "설정을 저장했습니다.\n%s\n\n※ 비밀번호가 평문으로 저장됩니다. "
                                "개인 PC 전용입니다." % path)
        return cfg

    def on_test(self):
        cfg = self.collect_config()
        self.var_status.set("연결 테스트 중…")
        threading.Thread(target=self._test_worker, args=(cfg,), daemon=True).start()

    def _test_worker(self, cfg):
        ok_mail, msg_mail = core.test_mail(cfg)
        core.log(msg_mail)
        if cfg.get("firebase"):
            ok_fb, msg_fb = core.test_firebase(cfg["firebase"])
        else:
            ok_fb, msg_fb = False, "firebaseConfig 가 비어 있습니다(선택 사항이지만 넣어야 선박리스트가 앱에 뜹니다)."
        core.log(msg_fb)
        self.var_status.set("테스트 완료 — 메일(%s) %s · 파이어베이스 %s"
                            % (core.cfg_protocol(cfg).upper(),
                               "OK" if ok_mail else "실패", "OK" if ok_fb else "실패"))

    def _set_running_ui(self, running):
        """수집 중에는 [폴더 정리]를 잠근다 — 옮기는 중에 새 파일이 떨어지지 않게."""
        try:
            self.btn_run.configure(text="수집 중지" if running else "수집 시작")
        except Exception as exc:
            core.log("수집 버튼 상태를 바꾸지 못했습니다: %s" % exc)
        try:
            self.btn_organize.configure(state="disabled" if running else "normal")
        except Exception as exc:
            core.log("폴더 정리 버튼 상태를 바꾸지 못했습니다: %s" % exc)

    def on_toggle_run(self):
        if self.collector and self.collector.running:
            self.collector.stop()
            self._set_running_ui(False)
            self.var_status.set("중지 요청됨")
            return
        cfg = self.on_save(announce=not self._autostarting)
        if not cfg:
            return
        self.collector = core.Collector(cfg, cache_path=self.cache_path,
                                        master_path=self.master_path)
        # 캐시를 '같은 딕셔너리'로 묶는다 — 수집 중에 체크를 켜고 꺼도 다음 메일부터 곧바로 반영된다
        for key in ("names", "codes", "tally"):
            merged = dict((self.collector.cache.get(key) or {}))
            merged.update(self.cache.get(key) or {})   # 화면에서 방금 고친 값이 우선
            self.cache[key] = merged
        self.collector.cache = self.cache
        self._render_vessels()
        self.collector.start()
        self._set_running_ui(True)
        self.var_status.set("수집 중")

    # ────────────────────── 무인 자동 시작(--autostart) ──────────────────────
    def request_autostart(self, delay_ms=400):
        """창이 뜬 뒤(mainloop 진입 후) 수집을 스스로 켠다 — PC 재시작·수집기 재기동을 무인으로.

        설정이 모자라면 켜지 않고 로그 한 줄만 남긴다(사람이 창에서 채워 넣으면 된다).
        """
        missing = self.missing_fields()
        if missing:
            core.log("--autostart: 설정이 모자라 자동 시작하지 않습니다 — %s (창에서 입력 후 [수집 시작])"
                     % ", ".join(missing))
            return False
        try:
            self.master.after(delay_ms, self._autostart_now)
        except Exception as exc:
            core.log("--autostart: 자동 시작을 예약하지 못했습니다: %s" % exc)
            return False
        core.log("--autostart: 설정이 갖춰져 있습니다 — 창이 뜨는 대로 수집을 시작합니다.")
        return True

    def _autostart_now(self):
        """예약된 자동 시작 본체 — 확인창 없이 on_toggle_run 을 그대로 쓴다."""
        if self.collector is not None and getattr(self.collector, "running", False):
            return False
        self._autostarting = True
        try:
            core.log("--autostart: 수집을 자동으로 시작합니다.")
            self.on_toggle_run()
        finally:
            self._autostarting = False
        return True

    # ────────────────────── 로그 표시 ──────────────────────
    def _pump_logs(self):
        try:
            while True:
                line = self.log_queue.get_nowait()
                self.txt_log.configure(state="normal")
                self.txt_log.insert("end", line + "\n")
                self.txt_log.see("end")               # 자동 따라가기 — 늘 마지막 줄을 보여 준다
                self.txt_log.configure(state="disabled")
        except queue.Empty:
            pass
        except Exception:
            pass
        try:
            if self.current_section == "berth":       # 보고 있을 때만 다시 만든다
                self._refresh_berth()
        except Exception as exc:
            core.log("선석배정 상태를 새로 읽지 못했습니다: %s" % exc)
        try:
            self.master.after(500, self._pump_logs)
        except Exception:
            pass

    def run(self):
        self.master.mainloop()


def main(argv=None):
    """`--autostart` 를 주면 설정이 갖춰진 경우 창이 뜬 직후 수집을 스스로 시작한다."""
    args = list(sys.argv[1:] if argv is None else argv)
    app = MailPilotGUI()
    if "--autostart" in args:
        app.request_autostart()
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
