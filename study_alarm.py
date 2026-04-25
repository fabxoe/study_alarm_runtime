#!/usr/bin/env python3
"""study_alarm.py — 공부 알람 GUI (macOS, PyQt6)"""

import sys, subprocess, threading, os
from datetime import datetime, timedelta
from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QScrollArea, QFrame, QComboBox, QSlider, QCheckBox, QDialog, QMessageBox
)
from PyQt6.QtCore import Qt, QTimer, QPropertyAnimation, pyqtProperty, pyqtSignal, QEasingCurve, QAbstractAnimation
from PyQt6.QtGui import QPainter, QColor, QBrush, QPixmap

SCHEDULE = [
    ("10:00", "공부 시작",  "10:00 ~ 10:50",       "lecture"),
    ("10:50", "휴식",       "10:50 ~ 11:00",       "break"),
    ("11:00", "공부 시작",  "11:00 ~ 11:50",       "lecture"),
    ("11:50", "점심 시간",  "11:50 ~ 12:50",       "lunch"),
    ("12:50", "공부 시작",  "12:50 ~ 13:40",       "lecture"),
    ("13:40", "휴식",       "13:40 ~ 13:50",       "break"),
    ("13:50", "공부 시작",  "13:50 ~ 14:40",       "lecture"),
    ("14:40", "휴식",       "14:40 ~ 14:50",       "break"),
    ("14:50", "공부 시작",  "14:50 ~ 15:40",       "lecture"),
    ("15:40", "휴식 (20분간)",       "15:40 ~ 16:00",       "break"),
    ("16:00", "공부 시작",  "16:00 ~ 16:50",       "study"),
    ("16:50", "휴식",       "16:50 ~ 17:00",       "break"),
    ("17:00", "공부 시작",  "17:00 ~ 17:50",       "study"),
    ("17:50", "휴식",       "17:50 ~ 18:00",       "break"),
    ("18:00", "공부 시작 (40분간)",  "18:00 ~ 18:40", "study"),
    ("18:40", "완료",      "수고했습니다. 오늘 공부 종료",  "done"),
]

KIND_COLOR = {"lecture":"#4B6CB7","study":"#2A9D6E","break":"#7A7A9A","lunch":"#C47A00","done":"#5B45E0"}
KIND_BG    = {"lecture":"#F0F4FF","study":"#F0FBF7","break":"#F6F6FA","lunch":"#FFF8EC","done":"#F0EEFF"}
KIND_LABEL = {"lecture":"강의","study":"공부","break":"휴식","lunch":"점심","done":"완료"}

SCALE_MIN, SCALE_MAX, SCALE_STEP = 0.7, 2.0, 0.1

class ToggleSwitch(QCheckBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self._position = 1.0
        self.animation = QPropertyAnimation(self, b"position")
        self.animation.setDuration(150)
        self.toggled.connect(self._on_state_change)
        self.setFixedSize(32, 18)

    @pyqtProperty(float)
    def position(self):
        return self._position

    @position.setter
    def position(self, pos):
        self._position = pos
        self.update()

    def _on_state_change(self, value):
        self.animation.stop()
        self.animation.setStartValue(self._position)
        self.animation.setEndValue(1.0 if value else 0.0)
        self.animation.start()

    def hitButton(self, pos):
        return self.rect().contains(pos)

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
        self._is_active = False

        self._glow = 0.0
        self.anim = QPropertyAnimation(self, b"glow")
        self.anim.setEasingCurve(QEasingCurve.Type.Linear)
        self.anim.setDuration(5000)
        self.anim.setLoopCount(-1)
        self.anim.setKeyValueAt(0.0, 0.0)
        self.anim.setKeyValueAt(0.5, 1.0)
        self.anim.setKeyValueAt(1.0, 0.0)

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

    @pyqtProperty(float)
    def glow(self):
        return self._glow

    @glow.setter
    def glow(self, val):
        self._glow = val
        if self._is_active:
            r = int(91 + (170 - 91) * val)
            g = int(69 + (150 - 69) * val)
            b = int(224 + (255 - 224) * val)
            bg_r = int(237 + (220 - 237) * val)
            bg_g = int(234 + (210 - 234) * val)
            bg_b = 255
            self.setStyleSheet(
                f"QFrame{{background:rgb({bg_r},{bg_g},{bg_b});"
                f"border:2px solid rgb({r},{g},{b});"
                "border-radius:6px;margin:2px 0;}}"
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
                f"border:none; border-left:5px solid {self.color};"
                "border-radius:6px;margin:2px 0;}}"
            )

    def set_active(self, active):
        if hasattr(self, '_is_active') and self._is_active == active: return
        self._is_active = active
        self._apply_style(active)
        self._style_child(self.time_lbl, bold=True, size=self._cur_size, color=self.color)
        self._style_child(self.label_lbl, size=self._cur_size, color="#1A1830")
        if active:
            if self.anim.state() != QAbstractAnimation.State.Running:
                self.anim.start()
        else:
            self.anim.stop()

    _cur_size = 13

    def rescale(self, s):
        self._cur_size = int(13 * s)
        self.time_lbl.setFixedWidth(int(52 * s))
        self._style_child(self.time_lbl, bold=True, size=self._cur_size, color=self.color)
        self._style_child(self.label_lbl, size=self._cur_size, color="#1A1830")
        self._style_badge(int(11 * s))



class MainWindow(QWidget):
    popup_requested = pyqtSignal(str, str, str)

    def __init__(self):
        super().__init__()
        self.popup_requested.connect(self._show_qt_popup)
        self.setWindowTitle("Bootcamp Scheduler")
        self.scale = 1.0
        self.running = False
        self.fired: set = set()
        self.active_popup = None
        self._loop_stop_event = threading.Event()
        self.flow_mode = False
        self.flow_state = 'study'   # 'study' | 'break'
        self.flow_end_time = None
        self._build()
        self.setFixedWidth(480)
        self.setMinimumHeight(300)
        self.resize(480, 680)
        QTimer.singleShot(0, self._update_max_height)
        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(1000)

    def keyPressEvent(self, event):
        mod = event.modifiers()
        key = event.key()
        if mod == Qt.KeyboardModifier.ControlModifier:
            old_scale = self.scale
            if key in (Qt.Key.Key_Plus, Qt.Key.Key_Equal):
                self.scale = min(SCALE_MAX, round(self.scale + SCALE_STEP, 1))
            elif key == Qt.Key.Key_Minus:
                self.scale = max(SCALE_MIN, round(self.scale - SCALE_STEP, 1))
            elif key == Qt.Key.Key_0:
                self.scale = 1.0
            if self.scale != old_scale:
                h = int(self.height() * (self.scale / old_scale))
                self.setFixedWidth(int(480 * self.scale))
                self.setMinimumHeight(int(300 * self.scale))
                self.resize(int(480 * self.scale), h)
                self._rescale()
        super().keyPressEvent(event)

    def _rescale(self):
        s = self.scale
        self.title_lbl.setStyleSheet(
            f"font-family:Georgia;font-size:{int(22*s)}px;font-weight:bold;color:#1A1830;")
        if hasattr(self, 'always_on_top_toggle'):
            self.always_on_top_lbl.setStyleSheet(f"color:#8A87A8;font-size:{int(11*s)}px;font-weight:bold;")
            self.always_on_top_toggle.setFixedSize(int(32*s), int(18*s))
        self.clock.setStyleSheet(f"font-size:{int(13*s)}px;color:#8A87A8;")
        self.cd_top_lbl.setStyleSheet(
            f"color:#8A87A8;font-size:{int(11*s)}px;background:transparent;border:none;")
        self.cd_timer.setStyleSheet(
            f"color:#5B45E0;font-family:Georgia;font-size:{int(44*s)}px;"
            "font-weight:bold;background:transparent;border:none;")
        self.cd_next.setStyleSheet(
            f"color:#8A87A8;font-size:{int(12*s)}px;background:transparent;border:none;")
        self.session_lbl.setStyleSheet(f"font-size:{int(11*s)}px;font-weight:bold;")
        self.schedule_hdr.setStyleSheet(f"color:#8A87A8;font-size:{int(10*s)}px;")
        self.sound_lbl_w.setStyleSheet(f"color:#8A87A8;font-size:{int(12*s)}px;")
        self.sound_box.setStyleSheet(self._combo_style(s))
        self.test_sound_btn.setStyleSheet(
            f"QPushButton{{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
            f"border-radius:6px;padding:{int(5*s)}px {int(10*s)}px;font-size:{int(12*s)}px;font-weight:bold;}}"
            f"QPushButton:hover{{background:#E8E2FF;border-color:#9B87F5;}}"
        )
        self.vol_lbl_w.setStyleSheet(f"color:#8A87A8;font-size:{int(12*s)}px;")
        self.vol_slider.setStyleSheet(self._slider_style(s))
        self.vol_slider.setFixedHeight(max(20, int(20*s)))
        self.vol_pct.setStyleSheet(
            f"color:#5B45E0;font-size:{int(12*s)}px;font-weight:bold;min-width:34px;")
        if hasattr(self, 'sound_toggle'):
            self.sound_toggle_lbl.setStyleSheet(f"color:#8A87A8;font-size:{int(11*s)}px;font-weight:bold;")
            self.sound_toggle.setFixedSize(int(32*s), int(18*s))
        if hasattr(self, 'sound_loop_toggle'):
            self.sound_loop_lbl.setStyleSheet(f"color:#8A87A8;font-size:{int(11*s)}px;font-weight:bold;")
            self.sound_loop_toggle.setFixedSize(int(32*s), int(18*s))
        self.btn.setFixedHeight(int(46 * s))
        self._style_btn(not self.running)
        if hasattr(self, 'test_delay_btn'):
            self.test_delay_btn.setStyleSheet(
                f"QPushButton{{background:transparent;color:#8A87A8;font-size:{int(11*s)}px;"
                f"text-decoration:underline;border:none;margin-top:{int(10*s)}px;}}"
                f"QPushButton:hover{{color:#5B45E0;}}"
            )
        self.status_lbl.setStyleSheet(f"color:#B0AEC8;font-size:{int(10*s)}px;")
        for row in self.rows:
            row.rescale(s)
        if hasattr(self, 'mode_btn'):
            self._style_mode_btn()
        QTimer.singleShot(0, self._update_max_height)

    def _style_mode_btn(self):
        s = self.scale
        fs   = int(15 * s)
        pad  = f"{int(7*s)}px {int(20*s)}px"
        mb   = int(8 * s)
        br   = int(7 * s)
        if self.flow_mode:
            self.mode_btn.setStyleSheet(
                f"QPushButton{{background:#E8E2FF;color:#5B45E0;border:1.5px solid #9B87F5;"
                f"border-radius:{br}px;padding:{pad};font-size:{fs}px;font-weight:bold;margin-bottom:{mb}px;}}"
                f"QPushButton:hover{{background:#DDD5FF;border-color:#7B6AE0;}}"
            )
        else:
            self.mode_btn.setStyleSheet(
                f"QPushButton{{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
                f"border-radius:{br}px;padding:{pad};font-size:{fs}px;font-weight:bold;margin-bottom:{mb}px;}}"
                f"QPushButton:hover{{background:#E8E2FF;border-color:#9B87F5;}}"
            )

    def _update_max_height(self):
        ih = self.scroll_inner.sizeHint().height()
        self.scroll_area.setMinimumHeight(ih)
        self.scroll_area.setMaximumHeight(ih)
        self.layout().activate()
        max_h = self.sizeHint().height()
        self.scroll_area.setMinimumHeight(0)
        self.scroll_area.setMaximumHeight(16777215)
        self.setMaximumHeight(max_h)

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
                border:1.5px solid #C8BEFF;
                border-radius:10px;
                padding:6px 4px;outline:none;
                selection-background-color:#F0EEFF;selection-color:#5B45E0;
            }}
            QComboBox QAbstractItemView::item {{
                padding:6px 12px;border-radius:6px;
                margin:1px 4px;
            }}
            QComboBox QAbstractItemView::item:hover {{
                background:#F0EEFF;color:#5B45E0;
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
        self.always_on_top_lbl = QLabel("항상 위")
        self.always_on_top_lbl.setStyleSheet("color:#8A87A8;font-size:11px;font-weight:bold;")
        self.always_on_top_toggle = ToggleSwitch()
        self.always_on_top_toggle.setChecked(False)
        self.always_on_top_toggle.toggled.connect(self._toggle_always_on_top)
        self.clock = QLabel()
        self.clock.setStyleSheet("font-size:13px;color:#8A87A8;")
        hdr.addWidget(self.title_lbl)
        hdr.addStretch()
        hdr.addWidget(self.always_on_top_lbl)
        hdr.addSpacing(10)
        hdr.addWidget(self.always_on_top_toggle)
        hdr.addSpacing(16)
        hdr.addWidget(self.clock)
        lo.addLayout(hdr)
        lo.addSpacing(12)

        self.status_lbl = QLabel("⏸  알람 비활성")
        self.status_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_lbl.setStyleSheet("color:#B0AEC8;font-size:10px;")
        lo.addWidget(self.status_lbl)
        lo.addSpacing(6)

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

        # 현재 세션 + 모드 전환 버튼 (좌측: session_lbl + schedule_hdr 두 줄 / 우측: mode_btn 스팬)
        sess_row = QHBoxLayout()
        sess_row.setSpacing(0)

        left_col = QVBoxLayout()
        left_col.setSpacing(4)
        left_col.setContentsMargins(0, 0, 0, 0)
        self.session_lbl = QLabel("")
        self.session_lbl.setStyleSheet("color:#5B45E0;font-size:11px;font-weight:bold;")
        self.schedule_hdr = QLabel("오늘 스케줄")
        self.schedule_hdr.setStyleSheet("color:#8A87A8;font-size:10px;")
        left_col.addWidget(self.session_lbl)
        left_col.addWidget(self.schedule_hdr)

        self.mode_btn = QPushButton("플로우 모드")
        self.mode_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.mode_btn.setStyleSheet(
            "QPushButton{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
            "border-radius:7px;padding:7px 20px;font-size:20px;font-weight:bold;margin-bottom:8px;}"
            "QPushButton:hover{background:#E8E2FF;border-color:#9B87F5;}"
        )
        self.mode_btn.clicked.connect(self._toggle_mode)

        sess_row.addLayout(left_col)
        sess_row.addStretch()
        sess_row.addWidget(self.mode_btn, alignment=Qt.AlignmentFlag.AlignVCenter)
        lo.addLayout(sess_row)
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
        self.scroll_area = scroll
        self.scroll_inner = inner
        lo.addWidget(scroll)

        # 플로우 모드 위젯 (기본 숨김)
        self.flow_widget = QFrame()
        self.flow_widget.setStyleSheet(
            "QFrame{background:#F4F2FF;border-radius:10px;border:1px solid #DDD8F5;}"
        )
        flow_lo = QVBoxLayout(self.flow_widget)
        flow_lo.setContentsMargins(18, 16, 18, 16)
        flow_lo.setSpacing(10)

        flow_hdr = QLabel("플로우 모드")
        flow_hdr.setStyleSheet(
            "color:#5B45E0;font-size:13px;font-weight:bold;"
            "background:transparent;border:none;"
        )
        flow_lo.addWidget(flow_hdr)

        # 공부 시간
        study_row = QHBoxLayout()
        study_lbl = QLabel("📖 공부 시간")
        study_lbl.setStyleSheet("color:#4B6CB7;font-size:16px;font-weight:bold;background:transparent;border:none;")
        self.flow_study_box = QComboBox()
        self.flow_study_box.addItems(["10분","20분","30분","40분","50분","60분"])
        self.flow_study_box.setCurrentIndex(4)  # 기본 50분
        self.flow_study_box.setStyleSheet(self._combo_style(1.0))
        self._setup_combo_view(self.flow_study_box)
        study_row.addWidget(study_lbl)
        study_row.addStretch()
        study_row.addWidget(self.flow_study_box)
        flow_lo.addLayout(study_row)

        # 쉬는 시간
        break_row = QHBoxLayout()
        break_lbl = QLabel("☕ 쉬는 시간")
        break_lbl.setStyleSheet("color:#7A7A9A;font-size:16px;font-weight:bold;background:transparent;border:none;")
        self.flow_break_box = QComboBox()
        self.flow_break_box.addItems(["10분","20분","30분","40분","50분","60분"])
        self.flow_break_box.setCurrentIndex(0)  # 기본 10분
        self.flow_break_box.setStyleSheet(self._combo_style(1.0))
        self._setup_combo_view(self.flow_break_box)
        break_row.addWidget(break_lbl)
        break_row.addStretch()
        break_row.addWidget(self.flow_break_box)
        flow_lo.addLayout(break_row)

        # 현재 단계 표시
        self.flow_phase_lbl = QLabel("")
        self.flow_phase_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.flow_phase_lbl.setStyleSheet(
            "color:#8A87A8;font-size:11px;background:transparent;border:none;"
        )
        flow_lo.addWidget(self.flow_phase_lbl)

        lo.addWidget(self.flow_widget)
        self.flow_widget.setVisible(False)
        lo.addSpacing(12)

        # 사운드 선택
        sound_row = QHBoxLayout()
        self.sound_lbl_w = QLabel("알람 소리")
        self.sound_lbl_w.setStyleSheet("color:#8A87A8;font-size:12px;")
        self.sound_box = QComboBox()
        self.sound_box.addItems([
            "Glass","Ping","Funk","Tink","Hero",
            "Basso","Blow","Bottle","Frog","Morse",
            "Pop","Purr","Sosumi","Submarine"
        ])
        self.sound_box.setStyleSheet(self._combo_style(1.0))
        self._setup_combo_view(self.sound_box)
        self.test_sound_btn = QPushButton("미리듣기")
        self.test_sound_btn.setStyleSheet(
            "QPushButton{background:#F0EEFF;color:#5B45E0;border:1.5px solid #C8BEFF;"
            "border-radius:6px;padding:5px 10px;font-size:12px;font-weight:bold;}"
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
        self.vol_slider.valueChanged.connect(lambda v: self.vol_pct.setText(f"{v}%"))
        vol_row.addWidget(self.vol_lbl_w)
        vol_row.addSpacing(8)
        vol_row.addWidget(self.vol_slider)
        vol_row.addSpacing(6)
        vol_row.addWidget(self.vol_pct)
        vol_row.addSpacing(12)
        self.sound_toggle_lbl = QLabel("소리 켬")
        self.sound_toggle_lbl.setStyleSheet("color:#8A87A8;font-size:11px;font-weight:bold;")
        vol_row.addWidget(self.sound_toggle_lbl)
        vol_row.addSpacing(10)
        self.sound_toggle = ToggleSwitch()
        self.sound_toggle.setChecked(True)
        self.sound_toggle.toggled.connect(self._on_sound_toggle_changed)
        vol_row.addWidget(self.sound_toggle)
        vol_row.addSpacing(18)
        self.sound_loop_lbl = QLabel("소리 루프")
        self.sound_loop_lbl.setStyleSheet("color:#8A87A8;font-size:11px;font-weight:bold;")
        vol_row.addWidget(self.sound_loop_lbl)
        vol_row.addSpacing(10)
        self.sound_loop_toggle = ToggleSwitch()
        self.sound_loop_toggle.setChecked(False)
        vol_row.addWidget(self.sound_loop_toggle)
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
            "text-decoration:underline;border:none;margin-top:10px;}"
            "QPushButton:hover{color:#5B45E0;}"
        )
        self.test_delay_btn.clicked.connect(self._start_delay_test)
        lo.addWidget(self.test_delay_btn)

    def _style_btn(self, start: bool):
        s = self.scale
        bg, hov = ("#5B45E0","#4835C0") if start else ("#D94F4F","#B83B3B")
        self.btn.setStyleSheet(
            f"QPushButton{{background:{bg};color:white;font-size:{int(16*s)}px;"
            "font-weight:bold;border-radius:8px;border:none;}"
            f"QPushButton:hover{{background:{hov};}}"
        )

    def _toggle(self):
        self.running = not self.running
        if self.running:
            self.btn.setText("알람 중지"); self._style_btn(start=False)
            self.status_lbl.setText("🔔  알람 활성 중")
            self.status_lbl.setStyleSheet(f"color:#5B45E0;font-size:{int(10*self.scale)}px;")
            if self.flow_mode:
                self._start_flow_phase('study')
            else:
                now = datetime.now()
                self.fired = {i for i,(h,*_) in enumerate(SCHEDULE) if parse_dt(h) <= now}
        else:
            self.flow_end_time = None
            self.btn.setText("알람 시작"); self._style_btn(start=True)
            self.status_lbl.setText("⏸  알람 비활성")
            self.status_lbl.setStyleSheet(f"color:#B0AEC8;font-size:{int(10*self.scale)}px;")
            self.flow_phase_lbl.setText("")
            self.cd_timer.setText("--:--")
            self.cd_next.setText("시작 버튼을 눌러주세요")

    def _next_event(self):
        now = datetime.now()
        for i,(hhmm,label,msg,kind) in enumerate(SCHEDULE):
            if parse_dt(hhmm) > now:
                return i, parse_dt(hhmm), label, msg
        return None, None, None, None

    def _current_idx(self):
        now = datetime.now()
        # 10시 이전이면 0번(10:00) 세션, 18:40 이후면 마지막 세션 활성화 유지
        last = 0
        for i, (hhmm, *_) in enumerate(SCHEDULE):
            if parse_dt(hhmm) <= now:
                last = i
        return last

    def _tick(self):
        now = datetime.now()
        self.clock.setText(now.strftime("%H:%M:%S"))
        if self.flow_mode:
            self._tick_flow(now)
            return
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

    def _tick_flow(self, now):
        if not self.running or self.flow_end_time is None:
            return
        diff = int((self.flow_end_time - now).total_seconds())
        if diff <= 0:
            # 페이즈 종료 → 다음 페이즈 시작
            next_state = 'break' if self.flow_state == 'study' else 'study'
            self._start_flow_phase(next_state)
            return
        mm, ss = divmod(diff, 60); hh, mm = divmod(mm, 60)
        txt = f"{hh:02d}:{mm:02d}:{ss:02d}" if hh else f"{mm:02d}:{ss:02d}"
        self.cd_timer.setText(txt)

    def _start_flow_phase(self, state):
        self.flow_state = state
        if state == 'study':
            mins_str = self.flow_study_box.currentText().replace('분','')
            mins = int(mins_str)
            title = "공부 시작"
            msg = f"{mins}분 공부 시작!"
            kind = 'lecture'
            phase_txt = f"📖 공부 중... → {mins}분 후 휴식"
            color = "#4B6CB7"
        else:
            mins_str = self.flow_break_box.currentText().replace('분','')
            mins = int(mins_str)
            title = "휴식 시작"
            msg = f"{mins}분 휴식!"
            kind = 'break'
            phase_txt = f"☕ 휴식 중... → {mins}분 후 공부"
            color = "#7A7A9A"
        self.flow_end_time = datetime.now() + timedelta(minutes=mins)
        self.flow_phase_lbl.setText(phase_txt)
        self.flow_phase_lbl.setStyleSheet(
            f"color:{color};font-size:11px;background:transparent;border:none;"
        )
        self.session_lbl.setText(f"● {phase_txt}")
        self.session_lbl.setStyleSheet(
            f"color:{color};font-size:{int(11*self.scale)}px;font-weight:bold;"
        )
        self.cd_next.setText(phase_txt)
        threading.Thread(target=self._popup, args=(title, msg, kind), daemon=True).start()

    def _toggle_mode(self):
        if self.running:
            # 실행 중에는 모드 전환 불가
            return
        self.flow_mode = not self.flow_mode
        is_flow = self.flow_mode
        # UI 전환
        self.session_lbl.setVisible(not is_flow)
        self.schedule_hdr.setVisible(not is_flow)
        self.scroll_area.setVisible(not is_flow)
        self.flow_widget.setVisible(is_flow)
        if is_flow:
            self.mode_btn.setText("스케줄 모드")
            self._style_mode_btn()
            self.cd_top_lbl.setText("다음 알람까지")
            self.cd_next.setText("시작 버튼을 눌러주세요")
            self.cd_timer.setText("--:--")
            self.flow_phase_lbl.setText("")
            QTimer.singleShot(0, self._update_max_height)
        else:
            self.mode_btn.setText("플로우 모드")
            self._style_mode_btn()
            self.cd_top_lbl.setText("다음 알람까지")
            self.cd_next.setText("시작 버튼을 눌러주세요")
            self.cd_timer.setText("--:--")
            # 시작 시와 동일하게: 높이 제약 해제 → 창 크기 복원 → _update_max_height
            self.setMaximumHeight(16777215)
            self.setMinimumHeight(int(300 * self.scale))
            self.resize(int(480 * self.scale), int(680 * self.scale))
            QTimer.singleShot(0, self._update_max_height)

    def _popup(self, title, msg, kind):
        t = title.replace('"',"'")
        m_flat = msg.replace('"',"'").replace("\n"," ")
        sound = self.sound_box.currentText()
        volume = self.vol_slider.value()
        play_sound = hasattr(self, 'sound_toggle') and self.sound_toggle.isChecked()
        loop_on = hasattr(self, 'sound_loop_toggle') and self.sound_loop_toggle.isChecked()
        if play_sound and not loop_on:
            subprocess.run(["osascript", "-e", f'set volume alert volume {volume}'], capture_output=True)
            v = volume / 100.0
            subprocess.Popen(["afplay", "-v", str(v), f"/System/Library/Sounds/{sound}.aiff"])
        script = f'display notification "{m_flat}" with title "{t}"\n'
        subprocess.run(["osascript", "-e", script], capture_output=True)
        self.popup_requested.emit(t, msg, kind)

    def _show_qt_popup(self, title, msg, kind):
        if self.isMinimized():
            self.showNormal()
        self.raise_()
        self.activateWindow()

        old_pos = None
        if self.active_popup:
            try:
                if self.active_popup.isVisible():
                    old_pos = self.active_popup.pos()
                    self.active_popup.close()
            except:
                pass

        msg_box = QMessageBox(self)
        self.active_popup = msg_box
        msg_box.setWindowTitle("알람")
        msg_box.setText(title)
        msg_box.setInformativeText(msg)
        pixmap = QPixmap(400, 400)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        font = painter.font()
        font.setPixelSize(400)
        painter.setFont(font)
        icons = {"study": "📚", "break": "☕", "lunch": "🍱", "done": "🤝🏻", "test": "🧪"}
        icon_str = icons.get(kind, "⏰")
        painter.drawText(pixmap.rect(), Qt.AlignmentFlag.AlignCenter, icon_str)
        painter.end()
        msg_box.setIconPixmap(pixmap)
        msg_box.setStandardButtons(QMessageBox.StandardButton.Ok)
        
        # 스타일 시트 적용 해제 (macOS 레이아웃 붕괴 방지)
        msg_box.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, True)
        if old_pos:
            msg_box.move(old_pos)

        if sys.platform == 'darwin':
            try:
                pid = os.getpid()
                script = f'tell application "System Events" to set frontmost of every process whose unix id is {pid} to true'
                subprocess.Popen(["osascript", "-e", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except:
                pass

        msg_box.show()
        msg_box.raise_()
        msg_box.activateWindow()

        loop_enabled = hasattr(self, 'sound_loop_toggle') and self.sound_loop_toggle.isChecked()
        play_sound = hasattr(self, 'sound_toggle') and self.sound_toggle.isChecked()
        if loop_enabled and play_sound:
            self._loop_stop_event.clear()
            sound = self.sound_box.currentText()
            volume = self.vol_slider.value()
            stop_evt = self._loop_stop_event

            def _loop_play():
                v = volume / 100.0
                while not stop_evt.is_set():
                    proc = subprocess.Popen(
                        ["afplay", "-v", str(v), f"/System/Library/Sounds/{sound}.aiff"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                    )
                    while proc.poll() is None:
                        if stop_evt.is_set():
                            proc.terminate()
                            return
                        stop_evt.wait(0.1)

            threading.Thread(target=_loop_play, daemon=True).start()

        msg_box.exec()
        self._loop_stop_event.set()
        if self.active_popup == msg_box:
            self.active_popup = None


    def _start_delay_test(self):
        self.test_delay_btn.setText("5초 뒤에 팝업이 나타납니다...")
        self.test_delay_btn.setEnabled(False)
        QTimer.singleShot(5000, self._do_delay_test)

    def _do_delay_test(self):
        self.test_delay_btn.setText("5초 뒤 팝업/소리 테스트")
        self.test_delay_btn.setEnabled(True)
        threading.Thread(target=self._popup, args=("테스트", "5초 대기 팝업 테스트입니다", "test"), daemon=True).start()

    def _toggle_always_on_top(self, checked):
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, checked)
        self.show()

    def _on_sound_toggle_changed(self, checked):
        self.sound_loop_toggle.setEnabled(checked)
        color = "#8A87A8" if checked else "#C8C6D8"
        self.sound_loop_lbl.setStyleSheet(
            f"color:{color};font-size:{int(11*self.scale)}px;font-weight:bold;"
        )

    def _setup_combo_view(self, combo):
        """QComboBox 드롭다운을 네이티브 프레임 없이 커스텀 Qt 스타일로 변환"""
        view = combo.view()
        view.setFrameShape(QFrame.Shape.NoFrame)
        popup = view.window()
        popup.setWindowFlags(
            Qt.WindowType.Popup |
            Qt.WindowType.FramelessWindowHint |
            Qt.WindowType.NoDropShadowWindowHint
        )
        popup.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

    def _test_sound(self):
        sound = self.sound_box.currentText()
        volume = self.vol_slider.value()
        threading.Thread(target=self._play_sound_only, args=(sound, volume), daemon=True).start()

    def _play_sound_only(self, sound, volume):
        subprocess.run(["osascript", "-e", f'set volume alert volume {volume}'], capture_output=True)
        v = volume / 100.0
        subprocess.run(["afplay", "-v", str(v), f"/System/Library/Sounds/{sound}.aiff"], capture_output=True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setApplicationName("Bootcamp Scheduler")
    w = MainWindow(); w.show()
    sys.exit(app.exec())