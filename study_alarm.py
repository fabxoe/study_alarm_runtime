#!/usr/bin/env python3
"""study_alarm.py — 공부 알람 GUI (macOS, PyQt6)"""

import sys, subprocess, threading
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QScrollArea, QFrame, QComboBox, QSlider, QCheckBox
)
from PyQt6.QtCore import Qt, QTimer, QPropertyAnimation, pyqtProperty
from PyQt6.QtGui import QPainter, QColor, QBrush

SCHEDULE = [
    ("10:00", "공부 시작",  "공부 시작!\n10:00 ~ 10:50",       "study"),
    ("10:50", "휴식",       "10분 휴식!\n10:50 ~ 11:00",       "break"),
    ("11:00", "공부 시작",  "공부 시작!\n11:00 ~ 11:50",       "study"),
    ("11:50", "점심 시간",  "점심 시간!\n11:50 ~ 12:50",       "lunch"),
    ("12:50", "공부 시작",  "공부 시작!\n12:50 ~ 13:40",       "study"),
    ("13:40", "휴식",       "10분 휴식!\n13:40 ~ 13:50",       "break"),
    ("13:50", "공부 시작",  "공부 시작!\n13:50 ~ 14:40",       "study"),
    ("14:40", "휴식",       "10분 휴식!\n14:40 ~ 14:50",       "break"),
    ("14:50", "공부 시작",  "공부 시작!\n14:50 ~ 15:40",       "study"),
    ("15:40", "휴식",       "10분 휴식!\n15:40 ~ 15:50",       "break"),
    ("15:50", "공부 시작",  "공부 시작!\n15:50 ~ 16:40",       "study"),
    ("16:40", "휴식",       "10분 휴식!\n16:40 ~ 16:50",       "break"),
    ("16:50", "공부 시작",  "공부 시작!\n16:50 ~ 17:40",       "study"),
    ("17:40", "휴식",       "10분 휴식!\n17:40 ~ 17:50",       "break"),
    ("17:50", "공부 시작",  "공부 시작!\n17:50 ~ 18:40",       "study"),
    ("18:40", "휴식",       "10분 휴식!\n18:40 ~ 18:50",       "break"),
    ("18:50", "공부 시작",  "공부 시작!\n18:50 ~ 19:00",       "study"),
    ("19:00", "완료!",      "수고했습니다!\n오늘 공부 종료 🎉",  "done"),
]

KIND_COLOR = {"study":"#2A9D6E","break":"#7A7A9A","lunch":"#C47A00","done":"#5B45E0"}
KIND_BG    = {"study":"#F0FBF7","break":"#F6F6FA","lunch":"#FFF8EC","done":"#F0EEFF"}
KIND_LABEL = {"study":"공부","break":"휴식","lunch":"점심","done":"완료"}
KIND_ICON  = {"study":"📚","break":"☕","lunch":"🍱","done":"🎉"}

SCALE_MIN, SCALE_MAX, SCALE_STEP = 0.7, 2.0, 0.1

class ToggleSwitch(QCheckBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._position = 1.0
        self.animation = QPropertyAnimation(self, b"position")
        self.animation.setDuration(150)
        self.stateChanged.connect(self._on_state_change)
        self.setFixedSize(36, 22)

    @pyqtProperty(float)
    def position(self):
        return self._position

    @position.setter
    def position(self, pos):
        self._position = pos
        self.update()

    def _on_state_change(self, value):
        self.animation.setEndValue(1.0 if value else 0.0)
        self.animation.start()

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        bg_col = QColor("#4CD964") if self.isChecked() else QColor("#E5E5EA")
        p.setBrush(QBrush(bg_col))
        p.setPen(Qt.PenStyle.NoPen)
        r = self.rect()
        h = r.height()
        w = r.width()
        p.drawRoundedRect(0, 0, w, h, float(h)/2.0, float(h)/2.0)
        
        thumb_r = h - 4
        thumb_x = int(2 + (w - thumb_r - 4) * self._position)
        p.setBrush(QBrush(QColor("white")))
        p.drawEllipse(thumb_x, 2, thumb_r, thumb_r)
        
        p.end()

def parse_dt(hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)


class RowWidget(QFrame):
    def __init__(self, hhmm, label, kind):
        super().__init__()
        self.kind = kind
        self.color = KIND_COLOR[kind]
        self.base_bg = KIND_BG[kind]
        self._apply_style(False)

        lo = QHBoxLayout(self)
        lo.setContentsMargins(12, 8, 12, 8)

        self.time_lbl = QLabel(hhmm)
        self.time_lbl.setFixedWidth(52)
        self._style_child(self.time_lbl, bold=True, size=13, color=self.color)

        self.label_lbl = QLabel(label)
        self._style_child(self.label_lbl, size=13, color="#1A1830")

        self.badge = QLabel(KIND_LABEL[kind])
        self._style_badge(11)

        lo.addWidget(self.time_lbl)
        lo.addWidget(self.label_lbl)
        lo.addStretch()
        lo.addWidget(self.badge)

    def _style_child(self, w, bold=False, size=12, color="#1A1830"):
        fw = "bold" if bold else "normal"
        w.setStyleSheet(
            f"color:{color};font-size:{size}px;font-weight:{fw};"
            "background:transparent;border:none;"
        )

    def _style_badge(self, size):
        self.badge.setStyleSheet(
            f"background:{self.color};color:white;font-size:{size}px;"
            "font-weight:bold;padding:2px 8px;border-radius:4px;border:none;"
        )

    def _apply_style(self, active):
        if active:
            self.setStyleSheet(
                f"QFrame{{background:#EDEAFF;"
                f"border:2px solid #5B45E0;"
                "border-radius:6px;margin:2px 0;}}"
            )
        else:
            self.setStyleSheet(
                f"QFrame{{background:{self.base_bg};"
                f"border-left:5px solid {self.color};"
                "border-radius:6px;margin:2px 0;}}"
            )

    def set_active(self, active):
        self._apply_style(active)
        self._style_child(self.time_lbl, bold=True, size=self._cur_size, color=self.color)
        self._style_child(self.label_lbl, size=self._cur_size, color="#1A1830")

    _cur_size = 13

    def rescale(self, s):
        self._cur_size = int(13 * s)
        self.time_lbl.setFixedWidth(int(52 * s))
        self._style_child(self.time_lbl, bold=True, size=self._cur_size, color=self.color)
        self._style_child(self.label_lbl, size=self._cur_size, color="#1A1830")
        self._style_badge(int(11 * s))


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("공부 알람")
        self.scale = 1.0
        self.running = False
        self.fired: set = set()
        self._build()
        self.setFixedSize(420, 680)
        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(1000)

    def keyPressEvent(self, event):
        mod = event.modifiers()
        key = event.key()
        if mod == Qt.KeyboardModifier.MetaModifier:
            if key in (Qt.Key.Key_Plus, Qt.Key.Key_Equal):
                self.scale = min(SCALE_MAX, round(self.scale + SCALE_STEP, 1))
                self._rescale()
            elif key == Qt.Key.Key_Minus:
                self.scale = max(SCALE_MIN, round(self.scale - SCALE_STEP, 1))
                self._rescale()
            elif key == Qt.Key.Key_0:
                self.scale = 1.0
                self._rescale()
        super().keyPressEvent(event)

    def _rescale(self):
        s = self.scale
        self.setFixedSize(int(420 * s), int(680 * s))

        self.title_lbl.setStyleSheet(
            f"font-family:Georgia;font-size:{int(22*s)}px;font-weight:bold;color:#1A1830;")
        self.clock.setStyleSheet(
            f"font-size:{int(13*s)}px;color:#8A87A8;")
        self.cd_top_lbl.setStyleSheet(
            f"color:#8A87A8;font-size:{int(11*s)}px;background:transparent;border:none;")
        self.cd_timer.setStyleSheet(
            f"color:#5B45E0;font-family:Georgia;font-size:{int(44*s)}px;"
            "font-weight:bold;background:transparent;border:none;")
        self.cd_next.setStyleSheet(
            f"color:#8A87A8;font-size:{int(12*s)}px;background:transparent;border:none;")
        self.session_lbl.setStyleSheet(
            f"font-size:{int(11*s)}px;font-weight:bold;")
        self.schedule_hdr.setStyleSheet(
            f"color:#8A87A8;font-size:{int(10*s)}px;")
        self.sound_lbl_w.setStyleSheet(
            f"color:#8A87A8;font-size:{int(12*s)}px;")
        self.sound_box.setStyleSheet(self._combo_style(s))
        self.test_sound_btn.setStyleSheet(
            f"QPushButton{{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
            f"border-radius:6px;padding:{int(4*s)}px {int(10*s)}px;font-size:{int(11*s)}px;font-weight:bold;}}"
            f"QPushButton:hover{{background:#E8E2FF;border-color:#9B87F5;}}"
        )
        self.vol_lbl_w.setStyleSheet(
            f"color:#8A87A8;font-size:{int(12*s)}px;")
        self.vol_slider.setStyleSheet(self._slider_style(s))
        self.vol_slider.setFixedHeight(max(20, int(20*s)))
        self.vol_pct.setStyleSheet(
            f"color:#5B45E0;font-size:{int(12*s)}px;font-weight:bold;min-width:34px;")
        if hasattr(self, 'sound_toggle'):
            self.sound_toggle_lbl.setStyleSheet(f"color:#8A87A8;font-size:{int(11*s)}px;font-weight:bold;")
            self.sound_toggle.setFixedSize(int(36*s), int(22*s))
        self.btn.setFixedHeight(int(46 * s))
        self._style_btn(not self.running)
        if hasattr(self, 'test_delay_btn'):
            self.test_delay_btn.setStyleSheet(
                f"QPushButton{{background:transparent;color:#8A87A8;font-size:{int(11*s)}px;"
                f"text-decoration:underline;border:none;margin-top:{int(4*s)}px;}}"
                f"QPushButton:hover{{color:#5B45E0;}}"
            )
        self.status_lbl.setStyleSheet(
            f"color:#B0AEC8;font-size:{int(10*s)}px;")

        for row in self.rows:
            row.rescale(s)

    def _combo_style(self, s):
        fs = int(12 * s)
        return f"""
            QComboBox {{
                background:#F0EEFF;color:#1A1830;
                border:1.5px solid #C8BEFF;border-radius:8px;
                padding:5px 32px 5px 12px;font-size:{fs}px;font-weight:500;
            }}
            QComboBox:hover {{ background:#E8E2FF;border-color:#9B87F5; }}
            QComboBox::drop-down {{ border:none;width:28px; }}
            QComboBox::down-arrow {{
                image:none;width:0;height:0;
                border-left:4px solid transparent;
                border-right:4px solid transparent;
                border-top:5px solid #7B6AE0;
            }}
            QComboBox QAbstractItemView {{
                background:white;color:#1A1830;
                border:1.5px solid #C8BEFF;border-radius:8px;
                padding:4px;outline:none;
                selection-background-color:#F0EEFF;selection-color:#5B45E0;
            }}
            QComboBox QAbstractItemView::item {{
                padding:6px 12px;border-radius:4px;
            }}
        """

    def _slider_style(self, s):
        h = max(4, int(4 * s))
        r = h // 2
        th = max(16, int(16 * s))
        tr = th // 2
        return f"""
            QSlider::groove:horizontal {{
                height:{h}px;border-radius:{r}px;
                background:#E8E2FF;
            }}
            QSlider::sub-page:horizontal {{
                height:{h}px;border-radius:{r}px;
                background:#7B6AE0;
            }}
            QSlider::handle:horizontal {{
                width:{th}px;height:{th}px;
                margin:{-(th//2 - r)}px 0;
                border-radius:{tr}px;
                background:#5B45E0;
            }}
            QSlider::handle:horizontal:hover {{
                background:#4835C0;
            }}
        """

    def _build(self):
        lo = QVBoxLayout(self)
        lo.setContentsMargins(24, 20, 24, 16)
        lo.setSpacing(0)

        # 헤더
        hdr = QHBoxLayout()
        self.title_lbl = QLabel("공부 알람")
        self.title_lbl.setStyleSheet(
            "font-family:Georgia;font-size:22px;font-weight:bold;color:#1A1830;")
        self.clock = QLabel()
        self.clock.setStyleSheet("font-size:13px;color:#8A87A8;")
        hdr.addWidget(self.title_lbl); hdr.addStretch(); hdr.addWidget(self.clock)
        lo.addLayout(hdr)
        lo.addSpacing(12)

        # 카운트다운 카드
        cd = QFrame()
        cd.setStyleSheet("QFrame{background:#EDEAFF;border-radius:10px;border:1px solid #DDD8F5;}")
        cdlo = QVBoxLayout(cd)
        cdlo.setContentsMargins(16, 14, 16, 14)
        cdlo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cd_top_lbl = QLabel("다음 알람까지")
        self.cd_top_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cd_top_lbl.setStyleSheet(
            "color:#8A87A8;font-size:11px;background:transparent;border:none;")
        self.cd_timer = QLabel("--:--")
        self.cd_timer.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cd_timer.setStyleSheet(
            "color:#5B45E0;font-family:Georgia;font-size:44px;"
            "font-weight:bold;background:transparent;border:none;")
        self.cd_next = QLabel("시작 버튼을 눌러주세요")
        self.cd_next.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.cd_next.setStyleSheet(
            "color:#8A87A8;font-size:12px;background:transparent;border:none;")
        cdlo.addWidget(self.cd_top_lbl)
        cdlo.addWidget(self.cd_timer)
        cdlo.addWidget(self.cd_next)
        lo.addWidget(cd)
        lo.addSpacing(14)

        # 현재 세션
        self.session_lbl = QLabel("")
        self.session_lbl.setStyleSheet("color:#5B45E0;font-size:11px;font-weight:bold;")
        lo.addWidget(self.session_lbl)
        lo.addSpacing(4)

        self.schedule_hdr = QLabel("오늘 스케줄")
        self.schedule_hdr.setStyleSheet("color:#8A87A8;font-size:10px;")
        lo.addWidget(self.schedule_hdr)
        lo.addSpacing(4)

        # 스크롤 목록
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea { border: none; background: transparent; }
            QScrollBar:vertical {
                background: transparent; width: 6px; margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: rgba(0,0,0,0.18); border-radius: 3px; min-height: 30px;
            }
            QScrollBar::handle:vertical:hover { background: rgba(0,0,0,0.32); }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0px; }
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical { background: none; }
        """)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        inner = QWidget(); inner.setStyleSheet("background:transparent;")
        ilo = QVBoxLayout(inner)
        ilo.setContentsMargins(0, 0, 4, 0); ilo.setSpacing(0)
        self.rows = []
        for hhmm, label, _, kind in SCHEDULE:
            row = RowWidget(hhmm, label, kind)
            ilo.addWidget(row); self.rows.append(row)
        ilo.addStretch()
        scroll.setWidget(inner)
        lo.addWidget(scroll)
        lo.addSpacing(12)

        # 사운드 선택
        sound_row = QHBoxLayout()
        self.sound_lbl_w = QLabel("알람 소리")
        self.sound_lbl_w.setStyleSheet("color:#8A87A8;font-size:12px;")
        self.sound_box = QComboBox()
        self.sound_box.addItems([
            "Glass","Ping","Funk","Tink","Hero",
            "Basso","Blow","Bottle","Frog","Morse",
            "Pop","Purr","Sosumi","Submarine","Whimper"
        ])
        self.sound_box.setStyleSheet(self._combo_style(1.0))
        
        self.test_sound_btn = QPushButton("미리듣기")
        self.test_sound_btn.setStyleSheet(
            "QPushButton{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
            "border-radius:6px;padding:4px 10px;font-size:11px;font-weight:bold;}"
            "QPushButton:hover{background:#E8E2FF;border-color:#9B87F5;}"
        )
        self.test_sound_btn.clicked.connect(self._test_sound)

        sound_row.addWidget(self.sound_lbl_w)
        sound_row.addStretch()
        sound_row.addWidget(self.sound_box)
        sound_row.addSpacing(6)
        sound_row.addWidget(self.test_sound_btn)
        lo.addLayout(sound_row)
        lo.addSpacing(8)

        # 볼륨 슬라이더
        vol_row = QHBoxLayout()
        self.vol_lbl_w = QLabel("볼륨")
        self.vol_lbl_w.setStyleSheet("color:#8A87A8;font-size:12px;")
        self.vol_slider = QSlider(Qt.Orientation.Horizontal)
        self.vol_slider.setRange(0, 100)
        self.vol_slider.setValue(80)
        self.vol_slider.setFixedHeight(20)
        self.vol_slider.setStyleSheet(self._slider_style(1.0))
        self.vol_pct = QLabel("80%")
        self.vol_pct.setStyleSheet("color:#5B45E0;font-size:12px;font-weight:bold;min-width:34px;")
        self.vol_slider.valueChanged.connect(
            lambda v: self.vol_pct.setText(f"{v}%")
        )
        vol_row.addWidget(self.vol_lbl_w)
        vol_row.addSpacing(8)
        vol_row.addWidget(self.vol_slider)
        vol_row.addSpacing(6)
        vol_row.addWidget(self.vol_pct)
        vol_row.addSpacing(12)
        
        self.sound_toggle_lbl = QLabel("소리 켬")
        self.sound_toggle_lbl.setStyleSheet("color:#8A87A8;font-size:11px;font-weight:bold;")
        vol_row.addWidget(self.sound_toggle_lbl)
        vol_row.addSpacing(6)

        self.sound_toggle = ToggleSwitch()
        self.sound_toggle.setChecked(True)
        vol_row.addWidget(self.sound_toggle)

        lo.addLayout(vol_row)
        lo.addSpacing(10)

        # 버튼
        self.btn = QPushButton("알람 시작")
        self.btn.setFixedHeight(46)
        self._style_btn(start=True)
        self.btn.clicked.connect(self._toggle)
        lo.addWidget(self.btn)

        self.test_delay_btn = QPushButton("5초 뒤 팝업/소리 테스트")
        self.test_delay_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.test_delay_btn.setStyleSheet(
            "QPushButton{background:transparent;color:#8A87A8;font-size:11px;"
            "text-decoration:underline;border:none;margin-top:4px;}"
            "QPushButton:hover{color:#5B45E0;}"
        )
        self.test_delay_btn.clicked.connect(self._start_delay_test)
        lo.addWidget(self.test_delay_btn)

        self.status_lbl = QLabel("⏸  알람 비활성")
        self.status_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_lbl.setStyleSheet("color:#B0AEC8;font-size:10px;")
        lo.addWidget(self.status_lbl)

    def _style_btn(self, start: bool):
        s = self.scale
        bg, hov = ("#5B45E0","#4835C0") if start else ("#D94F4F","#B83B3B")
        self.btn.setStyleSheet(
            f"QPushButton{{background:{bg};color:white;font-size:{int(15*s)}px;"
            "font-weight:bold;border-radius:8px;border:none;}"
            f"QPushButton:hover{{background:{hov};}}"
        )

    def _toggle(self):
        self.running = not self.running
        if self.running:
            now = datetime.now()
            self.fired = {i for i,(h,*_) in enumerate(SCHEDULE) if parse_dt(h) <= now}
            self.btn.setText("알람 중지"); self._style_btn(start=False)
            self.status_lbl.setText("🔔  알람 활성 중")
            self.status_lbl.setStyleSheet(
                f"color:#5B45E0;font-size:{int(10*self.scale)}px;")
        else:
            self.btn.setText("알람 시작"); self._style_btn(start=True)
            self.status_lbl.setText("⏸  알람 비활성")
            self.status_lbl.setStyleSheet(
                f"color:#B0AEC8;font-size:{int(10*self.scale)}px;")

    def _next_event(self):
        now = datetime.now()
        for i,(hhmm,label,msg,kind) in enumerate(SCHEDULE):
            if parse_dt(hhmm) > now:
                return i, parse_dt(hhmm), label, msg
        return None, None, None, None

    def _current_idx(self):
        now = datetime.now(); last = -1
        for i,(hhmm,*_) in enumerate(SCHEDULE):
            if parse_dt(hhmm) <= now: last = i
        return last

    def _tick(self):
        now = datetime.now()
        self.clock.setText(now.strftime("%H:%M:%S"))
        if self.running:
            for i,(hhmm,label,msg,kind) in enumerate(SCHEDULE):
                if i not in self.fired and parse_dt(hhmm) <= now:
                    self.fired.add(i)
                    threading.Thread(target=self._popup,
                                     args=(label,msg,kind), daemon=True).start()
        idx,ndt,nlabel,_ = self._next_event()
        if idx is not None:
            diff = int((ndt-now).total_seconds())
            mm,ss = divmod(diff,60); hh,mm = divmod(mm,60)
            txt = f"{hh:02d}:{mm:02d}:{ss:02d}" if hh else f"{mm:02d}:{ss:02d}"
            self.cd_timer.setText(txt)
            self.cd_next.setText(f"다음 → {nlabel}  ({SCHEDULE[idx][0]})")
        else:
            self.cd_timer.setText("--"); self.cd_next.setText("오늘 스케줄 완료!")
        cur = self._current_idx()
        if 0 <= cur < len(SCHEDULE):
            _,label_c,_,kind_c = SCHEDULE[cur]
            self.session_lbl.setText(f"● 현재 세션:  {SCHEDULE[cur][0]}  {label_c}")
            self.session_lbl.setStyleSheet(
                f"color:{KIND_COLOR[kind_c]};"
                f"font-size:{int(11*self.scale)}px;font-weight:bold;"
            )
        else:
            self.session_lbl.setText("")
        for i,row in enumerate(self.rows):
            row.set_active(i == cur)

    def _popup(self, title, msg, kind):
        icon = KIND_ICON.get(kind, "🔔")
        t = f"{icon}  {title}".replace('"',"'")
        m = msg.replace('"',"'").replace("\n","\\n")
        m_flat = msg.replace('"',"'").replace("\n"," ")
        sound = self.sound_box.currentText()
        volume = self.vol_slider.value()
        
        play_sound = hasattr(self, 'sound_toggle') and self.sound_toggle.isChecked()

        if play_sound:
            subprocess.run(["osascript", "-e", f'set volume alert volume {volume}'], capture_output=True)
            v = volume / 100.0
            subprocess.Popen(["afplay", "-v", str(v), f"/System/Library/Sounds/{sound}.aiff"])

        # system notification + dialog (removed sound name from notification to prevent double playing)
        script = f'display notification "{m_flat}" with title "{t}"\n'
        script += f'display dialog "{m}" buttons {{"확인"}} default button 1 with title "{t}"'
        subprocess.run(["osascript", "-e", script], capture_output=True)

    def _start_delay_test(self):
        self.test_delay_btn.setText("5초 뒤에 팝업이 나타납니다...")
        self.test_delay_btn.setEnabled(False)
        QTimer.singleShot(5000, self._do_delay_test)

    def _do_delay_test(self):
        self.test_delay_btn.setText("5초 뒤 팝업/소리 테스트")
        self.test_delay_btn.setEnabled(True)
        threading.Thread(target=self._popup, args=("테스트", "5초 대기 팝업 테스트입니다!", "done"), daemon=True).start()

    def _test_sound(self):
        sound = self.sound_box.currentText()
        volume = self.vol_slider.value()
        threading.Thread(target=self._play_sound_only, args=(sound, volume), daemon=True).start()

    def _play_sound_only(self, sound, volume):
        subprocess.run(
            ["osascript", "-e", f'set volume alert volume {volume}'],
            capture_output=True
        )
        v = volume / 100.0
        subprocess.run(
            ["afplay", "-v", str(v), f"/System/Library/Sounds/{sound}.aiff"],
            capture_output=True
        )


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("공부 알람")
    w = MainWindow(); w.show()
    sys.exit(app.exec())
