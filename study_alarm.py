#!/usr/bin/env python3
import sys, subprocess, threading
from datetime import datetime
from PyQt6.QtWidgets import QApplication, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QScrollArea, QFrame, QComboBox, QSlider
from PyQt6.QtCore import Qt, QTimer

SCHEDULE = [
    ("10:00", "공부 시작", "공부 시작!\n10:00 ~ 10:50", "study"),
    ("10:50", "휴식", "10분 휴식!\n10:50 ~ 11:00", "break"),
    ("11:00", "공부 시작", "공부 시작!\n11:00 ~ 11:50", "study"),
    ("19:00", "완료!", "수고했습니다!\n오늘 공부 종료", "done"),
]

def parse_dt(hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)

class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("공부 알람")
        self.running = False
        self.scale = 1.0
        self._build()
        self.setFixedSize(420, 680)
        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(1000)

    def _build(self):
        lo = QVBoxLayout(self)
        self.title_lbl = QLabel("공부 알람")
        self.clock = QLabel("--:--:--")
        lo.addWidget(self.title_lbl)
        lo.addWidget(self.clock)
        
        self.cd_timer = QLabel("00:00:00")
        lo.addWidget(self.cd_timer)
        
        self.btn = QPushButton("알람 시작")
        self.btn.clicked.connect(self._toggle)
        lo.addWidget(self.btn)

    def _toggle(self):
        self.running = not self.running
        self.btn.setText("알람 중지" if self.running else "알람 시작")

    def _tick(self):
        self.clock.setText(datetime.now().strftime("%H:%M:%S"))

if __name__ == "__main__":
    app = QApplication(sys.argv)
    w = MainWindow()
    w.show()
    sys.exit(app.exec())
