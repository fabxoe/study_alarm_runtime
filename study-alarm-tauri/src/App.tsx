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

  useEffect(() => {
    async function applyZoom() {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_zoom", { zoom: zoomLevel });
      } catch (e) {
        console.log("Zoom API failed", e);
      }
    }
    applyZoom();
  }, [zoomLevel]);

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
          triggerAlarm(item.title, `현재 시간: ${item.time}`);
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
    triggerAlarm(`${state === "study" ? "공부" : "휴식"} 시작`, `${mins}분간 집중하세요!`);
    
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
      const targetHeight = toFlowMode ? 730 * zoomLevel : 1170 * zoomLevel;
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

  const triggerAlarm = async (title: string, msg: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("trigger_alarm", { 
        title, 
        msg,
        playSound,
        soundName: soundFile,
        volume,
        loopSound: soundLoop
      });
    } catch (e) {
      console.log("Not running in Tauri", e);
      alert(`[알람] ${title}\n${msg}`);
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
        <h1>공부 알람</h1>
        <div className="header-right">
          <span>항상 위</span>
          <input type="checkbox" className="toggle" checked={alwaysOnTop} onChange={e => setAlwaysOnTop(e.target.checked)} />
          <span>{currentTime || "00:00:00"}</span>
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
            <select className="settings-input" value={flowStudyMins} onChange={e => setFlowStudyMins(Number(e.target.value))} disabled={isRunning}>
              {[10,20,30,40,50,60].map(m => <option key={m} value={m}>{m}분</option>)}
            </select>
          </div>
          <div className="flow-row">
            <div className="flow-label break">☕ 쉬는 시간</div>
            <select className="settings-input" value={flowBreakMins} onChange={e => setFlowBreakMins(Number(e.target.value))} disabled={isRunning}>
              {[10,20,30,40,50,60].map(m => <option key={m} value={m}>{m}분</option>)}
            </select>
          </div>
          <div className="flow-phase">
            {isRunning ? (flowState === 'study' ? '📖 공부 중... → 휴식' : '☕ 휴식 중... → 공부') : '시작 버튼을 눌러주세요'}
          </div>
        </div>
      )}

      <div className="settings-panel">
        <div className="settings-row">
          <span>알람 소리</span>
          <select value={soundFile} onChange={e => setSoundFile(e.target.value)}>
            {["Bottle","Glass","Ping","Funk","Tink","Hero","Basso","Blow","Frog","Morse","Pop","Purr","Sosumi","Submarine"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="test-btn" onClick={() => triggerAlarm("미리듣기", "소리 테스트 중입니다")}>미리듣기</button>
        </div>
        <div className="settings-row">
          <span>볼륨</span>
          <input type="range" className="slider" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} />
          <span className="vol-text">{volume}%</span>
          <span style={{marginRight: '8px'}}>소리 켬</span>
          <input type="checkbox" className="toggle" checked={playSound} onChange={e => setPlaySound(e.target.checked)} style={{marginRight: '12px'}}/>
          <span style={{marginRight: '8px'}}>소리 루프</span>
          <input type="checkbox" className="toggle" checked={soundLoop} onChange={e => setSoundLoop(e.target.checked)} disabled={!playSound} style={{opacity: playSound ? 1 : 0.5}}/>
        </div>
      </div>

      <button className={`run-btn ${isRunning ? 'running' : ''}`} onClick={toggleRun}>
        {isRunning ? "알람 중지" : "알람 시작"}
      </button>

      <div className="test-link" onClick={testDelayAlarm}>
        5초 뒤 팝업/소리 테스트
      </div>
    </div>
  );
}
