import { useState, useEffect, useRef } from "react";
import "./App.css";

const SCHEDULE = [
  { time: "10:00", title: "공부 시작", type: "lecture", label: "강의" },
  { time: "10:50", title: "휴식", type: "break", label: "휴식" },
  { time: "11:00", title: "공부 시작", type: "lecture", label: "강의" },
  { time: "11:50", title: "점심 시간", type: "lunch", label: "점심" },
  { time: "12:50", title: "공부 시작", type: "lecture", label: "강의" },
  { time: "13:40", title: "휴식", type: "break", label: "휴식" },
  { time: "13:50", title: "공부 시작", type: "lecture", label: "강의" },
  { time: "14:40", title: "휴식", type: "break", label: "휴식" },
  { time: "14:50", title: "공부 시작", type: "lecture", label: "강의" },
  { time: "15:40", title: "휴식 (20분간)", type: "break", label: "휴식" },
  { time: "16:00", title: "공부 시작", type: "study", label: "공부" },
  { time: "16:50", title: "휴식", type: "break", label: "휴식" },
  { time: "17:00", title: "공부 시작", type: "study", label: "공부" },
  { time: "17:50", title: "휴식", type: "break", label: "휴식" },
  { time: "18:00", title: "공부 시작 (40분간)", type: "study", label: "공부" },
  { time: "18:40", title: "완료", type: "done", label: "완료" },
];

function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  now.setHours(h, m, 0, 0);
  return now;
}

function formatTimeDiff(diffSeconds: number) {
  if (diffSeconds < 0) return "00:00:00";
  const h = Math.floor(diffSeconds / 3600);
  const m = Math.floor((diffSeconds % 3600) / 60);
  const s = Math.floor(diffSeconds % 60);
  if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const CustomSelect = ({ value, options, onChange, disabled = false, dropUp = false }: { value: string|number, options: (string|number)[], onChange: (val: any) => void, disabled?: boolean, dropUp?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`custom-select ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      <div className="select-trigger" onClick={() => !disabled && setIsOpen(!isOpen)}>
        {value}
        <span className="arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && !disabled && (
        <div className={`select-dropdown ${dropUp ? 'drop-up' : ''}`}>
          {options.map(opt => (
            <div 
              key={opt} 
              className={`select-option ${opt === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [currentTime, setCurrentTime] = useState("");
  const [isFlowMode, setIsFlowMode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  
  const [countdownStr, setCountdownStr] = useState("--:--");
  const [nextLabel, setNextLabel] = useState("시작 버튼을 눌러주세요");
  const [activeIdx, setActiveIdx] = useState(-1);
  const firedAlarms = useRef<Set<number>>(new Set());

  const [flowStudyMins, setFlowStudyMins] = useState(50);
  const [flowBreakMins, setFlowBreakMins] = useState(10);
  const [flowState, setFlowState] = useState<"study" | "break">("study");
  const [flowEndTime, setFlowEndTime] = useState<Date | null>(null);

  // Settings
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [playSound, setPlaySound] = useState(true);
  const [soundLoop, setSoundLoop] = useState(false);
  const [soundFile, setSoundFile] = useState("Bottle");
  const [volume, setVolume] = useState(80);
  const [statusMsg, setStatusMsg] = useState("⏸ 알람 비활성");
  const [zoomLevel, setZoomLevel] = useState(1.0);
  
  // 수학적 일관성을 위한 기준 높이 정의 (줌 1.0일 때의 논리적 높이)
  const MIN_BASE_HEIGHT = 550; // 하단 그룹 전체가 잘림 없이 완벽히 보존되는 최소 높이 (패딩 보정 반영)
  const BASE_HEIGHTS = {
    flow: 620,      // 플로우 설정이 다 보이는 편안한 높이
    schedule: 720   // 스케줄이 적당히 보이는 높이
  };



  const applyZoom = async (zoom: number) => {
    try {
      // 1. DOM에 줌 적용
      (document.body.style as any).zoom = zoom.toString();
      
      const { emit } = await import("@tauri-apps/api/event");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const factor = await win.scaleFactor();
      const size = await win.innerSize();
      const logicalHeight = size.height / factor;
      
      const prevZoom = Number(document.body.style.zoom || 1);
      const baseHBefore = isFlowMode ? BASE_HEIGHTS.flow : BASE_HEIGHTS.schedule;
      const extraH = Math.max(0, (logicalHeight / prevZoom) - baseHBefore);

      // 2. 동적 측정 (Dynamic Measurement)
      // 상단 고정 영역들과 하단 그룹의 실제 높이를 측정하여 합산합니다.
      const statusEl = document.querySelector('.status') as HTMLElement;
      const timerEl = document.querySelector('.timer-card') as HTMLElement;
      const modeEl = document.querySelector('.mode-row') as HTMLElement;
      const bottomEl = document.querySelector('.bottom-group') as HTMLElement;
      const headerEl = document.querySelector('.header') as HTMLElement;
      const flowWidgetEl = document.querySelector('.flow-widget') as HTMLElement; // 플로우 설정창 추가

      let measuredMinH = 550; // 기본 안전값
      let measuredMaxH = 2000; // 기본 안전값

      if (statusEl && timerEl && modeEl && bottomEl && headerEl) {
        const topH = headerEl.offsetHeight + statusEl.offsetHeight + timerEl.offsetHeight + modeEl.offsetHeight;
        const bottomH = bottomEl.offsetHeight;
        
        // 1. 최소 높이 계산 (플로우 모드 고려)
        const flowH = flowWidgetEl ? flowWidgetEl.offsetHeight : 0;
        measuredMinH = topH + flowH + bottomH + 20;

        // 2. 최대 높이 계산 (메인 콘텐츠 고려)
        const mainContentEl = document.querySelector('.main-content') as HTMLElement;
        if (mainContentEl) {
          const contentH = mainContentEl.scrollHeight;
          measuredMaxH = topH + contentH + bottomH + 20;
        }
      }

      const currentBaseH = isFlowMode ? BASE_HEIGHTS.flow : BASE_HEIGHTS.schedule;

      await emit("setzoom-event", { 
        zoom, 
        extraHeight: extraH,
        minHeight: measuredMinH,
        maxHeight: measuredMaxH,
        baseHeight: currentBaseH
      });
    } catch (e) {
      console.log("Zoom API failed", e);
    }
  };

  useEffect(() => {
    applyZoom(zoomLevel);
  }, [zoomLevel, isFlowMode]); // 모드 전환 시에도 높이 제약 조건 즉시 갱신

  // 초기 렌더링 시에도 즉시 적용되도록 보장
  useEffect(() => {
    const timer = setTimeout(() => {
      applyZoom(zoomLevel);
    }, 500); 
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoomLevel(z => Math.min(z + 0.1, 2.0));
        } else if (e.key === '-') {
          e.preventDefault();
          setZoomLevel(z => Math.max(z - 0.1, 0.5));
        } else if (e.key === '0') {
          e.preventDefault();
          setZoomLevel(1.0);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { hour12: false }));
      if (!isFlowMode) tickSchedule(now);
      else tickFlow(now);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, isFlowMode, flowEndTime, flowState]);

  // Handle Always on Top
  useEffect(() => {
    async function updateWindow() {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
      } catch (e) {
        console.log("Window API not available", e);
      }
    }
    updateWindow();
  }, [alwaysOnTop]);

  const tickSchedule = (now: Date) => {
    let current = -1;
    for (let i = 0; i < SCHEDULE.length; i++) {
      if (parseTime(SCHEDULE[i].time) <= now) current = i;
    }
    setActiveIdx(current);

    let nextIdx = -1;
    for (let i = 0; i < SCHEDULE.length; i++) {
      if (parseTime(SCHEDULE[i].time) > now) {
        nextIdx = i;
        break;
      }
    }

    if (isRunning) {
      SCHEDULE.forEach((item, idx) => {
        if (!firedAlarms.current.has(idx) && parseTime(item.time) <= now) {
          firedAlarms.current.add(idx);
          triggerAlarm(item.title, `현재 시간: ${item.time}`, item.type);
        }
      });
    }

    if (nextIdx !== -1) {
      const diff = (parseTime(SCHEDULE[nextIdx].time).getTime() - now.getTime()) / 1000;
      setCountdownStr(formatTimeDiff(diff));
      setNextLabel(`다음 → ${SCHEDULE[nextIdx].title} (${SCHEDULE[nextIdx].time})`);
    } else {
      setCountdownStr("--:--");
      setNextLabel("오늘 스케줄 완료!");
    }
  };

  const tickFlow = (now: Date) => {
    if (!isRunning || !flowEndTime) return;
    const diff = (flowEndTime.getTime() - now.getTime()) / 1000;
    if (diff <= 0) {
      const nextState = flowState === "study" ? "break" : "study";
      startFlowPhase(nextState);
    } else {
      setCountdownStr(formatTimeDiff(diff));
    }
  };

  const startFlowPhase = (state: "study" | "break") => {
    const mins = state === "study" ? flowStudyMins : flowBreakMins;
    const end = new Date();
    end.setMinutes(end.getMinutes() + mins);
    setFlowState(state);
    setFlowEndTime(end);
    triggerAlarm(`${state === "study" ? "공부" : "휴식"} 시작`, `${mins}분간 ${state === "study" ? "집중" : "휴식"}하세요!`, state);
    
    const phaseTxt = `${state === "study" ? "📖 공부 중..." : "☕ 휴식 중..."} → ${mins}분 후 ${state === "study" ? "휴식" : "공부"}`;
    setNextLabel(phaseTxt);
  };

  const toggleRun = () => {
    if (!isRunning) {
      if (!isFlowMode) {
        const now = new Date();
        SCHEDULE.forEach((item, idx) => {
          if (parseTime(item.time) <= now) firedAlarms.current.add(idx);
        });
      } else {
        startFlowPhase("study");
      }
      setIsRunning(true);
      setStatusMsg("🔔 알람 활성 중");
    } else {
      setIsRunning(false);
      setFlowEndTime(null);
      setCountdownStr("--:--");
      setNextLabel("시작 버튼을 눌러주세요");
      setStatusMsg("⏸ 알람 비활성");
    }
  };

  const toggleMode = () => {
    if (isRunning) return;
    const nextMode = !isFlowMode;
    setIsFlowMode(nextMode);
    animateWindowSize(nextMode);
  };

  const animateWindowSize = async (toFlowMode: boolean) => {
    try {
      const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      const size = await win.innerSize();
      const factor = await win.scaleFactor();
      const logical = size.toLogical(factor);
      
      const currentHeight = logical.height;
      const baseH = toFlowMode ? BASE_HEIGHTS.flow : BASE_HEIGHTS.schedule;
      const targetHeight = baseH * zoomLevel;
      const diff = targetHeight - currentHeight;
      
      const steps = 25;
      let step = 0;
      
      const animate = async () => {
        step++;
        const t = step / steps;
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const newHeight = currentHeight + diff * ease;
        
        await win.setSize(new LogicalSize(logical.width, newHeight));
        
        if (step < steps) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    } catch (e) {
      console.log("Resize animation failed", e);
    }
  };

  const triggerAlarm = async (title: string, msg: string, kind?: string) => {
    try {
      if (playSound) {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("playsound", soundFile);
      }
      
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `popup_${Date.now()}`;
      new WebviewWindow(label, {
        url: `popup.html?title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}&kind=${kind || (title === '테스트' ? 'test' : 'info')}`,
        title: "알람",
        width: 280,
        height: 320, // 260에서 320으로 늘려 잘림 방지 및 예시 이미지 비율 구현
        alwaysOnTop: true,
        center: true,
        resizable: false,
        decorations: false,
        skipTaskbar: true,
      });
    } catch (e) {
      console.log("Alarm trigger failed", e);
    }
  };

  const testDelayAlarm = () => {
    setNextLabel("5초 뒤 팝업/소리 테스트...");
    setTimeout(() => {
      triggerAlarm("테스트", "5초 대기 팝업 테스트입니다");
      setNextLabel("테스트 완료");
    }, 5000);
  };

  // Get current session text
  let sessionText = "";
  if (!isFlowMode && activeIdx >= 0) {
    sessionText = `● 현재 세션: ${SCHEDULE[activeIdx].time} ${SCHEDULE[activeIdx].title}`;
  } else if (isFlowMode && isRunning) {
    sessionText = `● 현재 상태: ${flowState === 'study' ? '공부' : '휴식'} 중`;
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <div className="zoom-controls">
            <button 
              className="zoom-btn" 
              onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.5))}
              title="축소 (Cmd -)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 20v-6h6M10 4v6H4" />
              </svg>
            </button>
            <div className="zoom-divider"></div>
            <button 
              className="zoom-btn" 
              onClick={() => setZoomLevel(z => Math.min(z + 0.1, 2.0))}
              title="확대 (Cmd +)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="header-right">
          <div className="on-top-wrap">
            <span>항상 위</span>
            <input type="checkbox" className="toggle" checked={alwaysOnTop} onChange={e => setAlwaysOnTop(e.target.checked)} />
          </div>
          <span className="clock-text">{currentTime || "00:00:00"}</span>
        </div>
      </div>

      <div className={`status ${isRunning ? 'active' : ''}`}>{statusMsg}</div>

      <div className="timer-card">
        <div className="label">다음 알람까지</div>
        <div className="time">{countdownStr}</div>
        <div className="next">{nextLabel}</div>
      </div>

      <div className="mode-row">
        <div>
          <div className="session-info">{sessionText}</div>
          {!isFlowMode && <div className="schedule-header">오늘 스케줄</div>}
        </div>
        <button 
          className="mode-btn" 
          onClick={toggleMode}
          style={{ opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}
        >
          {isFlowMode ? "스케줄 모드" : "플로우 모드"}
        </button>
      </div>
      <div className="main-content">
        {!isFlowMode ? (
          <div className="list-container">
            {SCHEDULE.map((item, idx) => (
              <div key={idx} className={`schedule-item ${item.type} ${idx === activeIdx ? 'active' : ''}`}>
                <div className="item-time">{item.time}</div>
                <div className="item-title">{item.title}</div>
                <div className="badge">{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flow-widget">
            <div className="flow-title">플로우 모드</div>
            <div className="flow-row">
              <div className="flow-label study">📖 공부 시간</div>
              <CustomSelect 
                value={flowStudyMins} 
                options={[10,20,30,40,50,60]} 
                onChange={(val) => setFlowStudyMins(Number(val))} 
                disabled={isRunning} 
              />
              <span>분</span>
            </div>
            <div className="flow-row">
              <div className="flow-label break">☕ 쉬는 시간</div>
              <CustomSelect 
                value={flowBreakMins} 
                options={[10,20,30,40,50,60]} 
                onChange={(val) => setFlowBreakMins(Number(val))} 
                disabled={isRunning} 
              />
              <span>분</span>
            </div>
            <div className="flow-phase">
              {isRunning && (flowState === 'study' ? '📖 공부 중... → 휴식' : '☕ 휴식 중... → 공부')}
            </div>
          </div>
        )}
      </div> {/* main-content 끝 */}

      <div className="bottom-group">
        <div className="settings-panel">
          <div className="settings-row">
            <span>알람 소리</span>
            <CustomSelect 
              value={soundFile} 
              options={["Bottle","Glass","Ping","Funk","Tink","Hero","Basso","Blow","Frog","Morse","Pop","Purr","Sosumi","Submarine"]} 
              onChange={(val) => setSoundFile(String(val))} 
              dropUp={true} 
            />
            <button className="test-btn" onClick={() => triggerAlarm("미리듣기", "소리 테스트 중입니다")}>미리듣기</button>
          </div>
          <div className="settings-row">
            <div className="vol-group">
              <span>볼륨</span>
              <input type="range" className="slider" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} />
            </div>
            <div className="toggle-group">
              <span className="vol-text">{volume}%</span>
              <span className="setting-label">소리 켬</span>
              <input type="checkbox" className="toggle" checked={playSound} onChange={e => setPlaySound(e.target.checked)} />
              <span className="setting-label">소리 루프</span>
              <input type="checkbox" className="toggle" checked={soundLoop} onChange={e => setSoundLoop(e.target.checked)} disabled={!playSound} />
            </div>
          </div>
        </div>

        <button className={`run-btn ${isRunning ? 'running' : ''}`} onClick={toggleRun}>
          {isRunning ? "알람 중지" : "알람 시작"}
        </button>

        <div className="test-link" onClick={testDelayAlarm}>
          5초 뒤 팝업/소리 테스트
        </div>
      </div>
    </div>
  );
}
