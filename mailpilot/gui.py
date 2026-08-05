# 메일파일럿 Uni 0.1 — 설정·상태 창(tkinter). 메일사 선택 → 계정 입력 → firebaseConfig 붙여넣기 → 수집 시작.
# ⚠ 보안: 여기서 입력한 비밀번호는 config.json 에 평문 저장된다. 개인 PC 전용, 공용 PC 금지.
"""tkinter 설정 창.

  · 메일사 프리셋(네이버/한메일/지메일/직접입력) — 고르면 서버·포트 자동 입력
  · 이메일 / 비밀번호(*표시)
  · firebaseConfig 붙여넣기(앱 설정과 같은 값을 그대로 붙여넣으면 된다)
  · 메일박스 폴더 선택
  · [연결 테스트] IMAP 로그인 + 폴더 수 + 최근 메일 3건 / 파이어베이스 익명 인증 + 시험 쓰기
  · [저장] [수집 시작/중지] · 최근 로그 표시
"""

import os
import queue
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import mailpilot as core

PAD = 6


class MailPilotGUI:
    """설정 + 상태 창 본체."""

    def __init__(self, master=None, config_path=None):
        self.config_path = config_path or core.CONFIG_PATH
        self.master = master or tk.Tk()
        self.master.title("메일파일럿 Uni %s — 설정"
                          % core.VERSION.split()[-1])
        self.collector = None
        self.log_queue = queue.Queue()

        cfg = core.load_config(self.config_path) or dict(core.DEFAULT_CONFIG)
        self.provider_labels = {k: v["label"] for k, v in core.IMAP_PRESETS.items()}
        self.label_to_key = {v: k for k, v in self.provider_labels.items()}

        self.var_provider = tk.StringVar(
            self.master, self.provider_labels.get(cfg.get("provider", "naver"), "네이버 메일"))
        self.var_host = tk.StringVar(self.master, cfg.get("imap_host", ""))
        self.var_port = tk.StringVar(self.master, str(cfg.get("imap_port", 993)))
        self.var_email = tk.StringVar(self.master, cfg.get("email", ""))
        self.var_password = tk.StringVar(self.master, cfg.get("password", ""))
        self.var_root = tk.StringVar(self.master, cfg.get("mailbox_root", ""))
        self.var_days = tk.StringVar(self.master, str(cfg.get("collect_days", 7)))
        self.var_poll = tk.StringVar(self.master, str(cfg.get("poll_minutes", 10)))
        self.var_status = tk.StringVar(self.master, "대기 중")

        self._build(cfg)
        core.add_log_listener(self.log_queue.put)
        self._pump_logs()

    # ────────────────────── 화면 구성 ──────────────────────
    def _build(self, cfg):
        root = ttk.Frame(self.master, padding=PAD)
        root.pack(fill="both", expand=True)

        box1 = ttk.LabelFrame(root, text="1. 메일 계정", padding=PAD)
        box1.pack(fill="x", pady=PAD)

        ttk.Label(box1, text="메일사").grid(row=0, column=0, sticky="w")
        self.cmb_provider = ttk.Combobox(
            box1, textvariable=self.var_provider, state="readonly",
            values=[core.IMAP_PRESETS[k]["label"] for k in ("naver", "daum", "gmail", "custom")],
            width=14)
        self.cmb_provider.grid(row=0, column=1, sticky="w", padx=PAD)
        self.cmb_provider.bind("<<ComboboxSelected>>", self.on_provider_change)

        ttk.Label(box1, text="IMAP 서버").grid(row=0, column=2, sticky="w")
        ttk.Entry(box1, textvariable=self.var_host, width=24).grid(row=0, column=3, padx=PAD)
        ttk.Label(box1, text="포트").grid(row=0, column=4, sticky="w")
        ttk.Entry(box1, textvariable=self.var_port, width=6).grid(row=0, column=5, padx=PAD)

        ttk.Label(box1, text="이메일").grid(row=1, column=0, sticky="w", pady=PAD)
        ttk.Entry(box1, textvariable=self.var_email, width=30).grid(
            row=1, column=1, columnspan=2, sticky="w", padx=PAD)
        ttk.Label(box1, text="비밀번호").grid(row=1, column=3, sticky="e")
        ttk.Entry(box1, textvariable=self.var_password, width=22, show="*").grid(
            row=1, column=4, columnspan=2, sticky="w", padx=PAD)

        self.lbl_help = ttk.Label(box1, text="", foreground="#555", justify="left")
        self.lbl_help.grid(row=2, column=0, columnspan=6, sticky="w", pady=(PAD, 0))

        box2 = ttk.LabelFrame(root, text="2. 저장 위치 · 주기", padding=PAD)
        box2.pack(fill="x", pady=PAD)
        ttk.Label(box2, text="메일박스 폴더").grid(row=0, column=0, sticky="w")
        ttk.Entry(box2, textvariable=self.var_root, width=48).grid(row=0, column=1, padx=PAD)
        ttk.Button(box2, text="찾기…", command=self.on_pick_folder).grid(row=0, column=2)
        ttk.Label(box2, text="최근 며칠").grid(row=0, column=3, sticky="e", padx=(PAD, 0))
        ttk.Entry(box2, textvariable=self.var_days, width=5).grid(row=0, column=4)
        ttk.Label(box2, text="주기(분)").grid(row=0, column=5, sticky="e", padx=(PAD, 0))
        ttk.Entry(box2, textvariable=self.var_poll, width=5).grid(row=0, column=6)

        box3 = ttk.LabelFrame(root, text="3. firebaseConfig (앱에 넣은 것과 같은 값을 붙여넣기)",
                              padding=PAD)
        box3.pack(fill="both", pady=PAD)
        self.txt_fb = tk.Text(box3, height=8, width=88)
        self.txt_fb.pack(fill="both", expand=True)
        existing = cfg.get("firebase") or {}
        if existing:
            import json as _json
            self.txt_fb.insert("1.0", _json.dumps(existing, ensure_ascii=False, indent=2))

        bar = ttk.Frame(root)
        bar.pack(fill="x", pady=PAD)
        ttk.Button(bar, text="연결 테스트", command=self.on_test).pack(side="left")
        ttk.Button(bar, text="저장", command=self.on_save).pack(side="left", padx=PAD)
        self.btn_run = ttk.Button(bar, text="수집 시작", command=self.on_toggle_run)
        self.btn_run.pack(side="left")
        ttk.Label(bar, textvariable=self.var_status).pack(side="right")

        box4 = ttk.LabelFrame(root, text="최근 로그", padding=PAD)
        box4.pack(fill="both", expand=True)
        self.txt_log = tk.Text(box4, height=12, width=88, state="disabled")
        self.txt_log.pack(fill="both", expand=True, side="left")
        scroll = ttk.Scrollbar(box4, command=self.txt_log.yview)
        scroll.pack(fill="y", side="right")
        self.txt_log.configure(yscrollcommand=scroll.set)

        self.on_provider_change()

    # ────────────────────── 동작 ──────────────────────
    def current_provider(self):
        return self.label_to_key.get(self.var_provider.get(), "custom")

    def on_provider_change(self, event=None):
        key = self.current_provider()
        preset = core.IMAP_PRESETS.get(key, core.IMAP_PRESETS["custom"])
        if key != "custom":
            self.var_host.set(preset["host"])
            self.var_port.set(str(preset["port"]))
        self.lbl_help.configure(text=preset["help"])

    def on_pick_folder(self):
        path = filedialog.askdirectory(title="메일박스 폴더 선택")
        if path:
            self.var_root.set(path)

    def collect_config(self):
        """화면 입력 → config 딕셔너리."""
        def _int(value, default):
            try:
                return int(str(value).strip())
            except (TypeError, ValueError):
                return default
        return {
            "provider": self.current_provider(),
            "imap_host": self.var_host.get().strip(),
            "imap_port": _int(self.var_port.get(), 993),
            "email": self.var_email.get().strip(),
            "password": self.var_password.get(),
            "mailbox_root": self.var_root.get().strip(),
            "collect_days": _int(self.var_days.get(), 7),
            "poll_minutes": _int(self.var_poll.get(), 10),
            "firebase": core.parse_firebase_config(self.txt_fb.get("1.0", "end")),
        }

    def on_save(self):
        cfg = self.collect_config()
        missing = [name for name, val in (("이메일", cfg["email"]),
                                          ("비밀번호", cfg["password"]),
                                          ("메일박스 폴더", cfg["mailbox_root"]))
                   if not val]
        if missing:
            messagebox.showwarning("입력 필요", "다음 항목이 비어 있습니다: " + ", ".join(missing))
            return None
        path = core.save_config(cfg, self.config_path)
        core.log("설정을 저장했습니다: %s" % path)
        messagebox.showinfo("저장 완료",
                            "설정을 저장했습니다.\n%s\n\n※ 비밀번호가 평문으로 저장됩니다. "
                            "개인 PC 전용입니다." % path)
        return cfg

    def on_test(self):
        cfg = self.collect_config()
        self.var_status.set("연결 테스트 중…")
        threading.Thread(target=self._test_worker, args=(cfg,), daemon=True).start()

    def _test_worker(self, cfg):
        ok_imap, msg_imap = core.test_imap(cfg)
        core.log(msg_imap)
        if cfg.get("firebase"):
            ok_fb, msg_fb = core.test_firebase(cfg["firebase"])
        else:
            ok_fb, msg_fb = False, "firebaseConfig 가 비어 있습니다(선택 사항이지만 넣어야 선박리스트가 앱에 뜹니다)."
        core.log(msg_fb)
        self.var_status.set("테스트 완료 — 메일 %s · 파이어베이스 %s"
                            % ("OK" if ok_imap else "실패", "OK" if ok_fb else "실패"))

    def on_toggle_run(self):
        if self.collector and self.collector.running:
            self.collector.stop()
            self.btn_run.configure(text="수집 시작")
            self.var_status.set("중지 요청됨")
            return
        cfg = self.on_save()
        if not cfg:
            return
        self.collector = core.Collector(cfg)
        self.collector.start()
        self.btn_run.configure(text="수집 중지")
        self.var_status.set("수집 중")

    # ────────────────────── 로그 표시 ──────────────────────
    def _pump_logs(self):
        try:
            while True:
                line = self.log_queue.get_nowait()
                self.txt_log.configure(state="normal")
                self.txt_log.insert("end", line + "\n")
                self.txt_log.see("end")
                self.txt_log.configure(state="disabled")
        except queue.Empty:
            pass
        except Exception:
            pass
        try:
            self.master.after(500, self._pump_logs)
        except Exception:
            pass

    def run(self):
        self.master.mainloop()


def main():
    MailPilotGUI().run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
