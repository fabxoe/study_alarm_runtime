import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import FocusOverlay from "./FocusOverlay";

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

const FOCUS_TOTAL_SEC = 15 * 60;
// 집중 위젯 창의 한 변(논리 px)
const FOCUS_WIDGET_SIZE = 280;

type AlarmAudioSettings = {
  playSound: boolean;
  soundFile: string;
  soundLoop: boolean;
  volume: number;
};

const MAC_SOUND_OPTIONS = [
  "Bottle", "Glass", "Ping", "Funk", "Tink", "Hero", "Basso",
  "Blow", "Frog", "Morse", "Pop", "Purr", "Sosumi", "Submarine",
];

const WINDOWS_SOUND_OPTIONS = [
  "Alarm01",
  "Windows Notify Calendar",
  "Alarm08",
  "Windows Ding",
];

const IS_WINDOWS = typeof navigator !== "undefined"
  && navigator.userAgent.toLowerCase().includes("windows");
const SOUND_OPTIONS = IS_WINDOWS ? WINDOWS_SOUND_OPTIONS : MAC_SOUND_OPTIONS;
const DEFAULT_SOUND_FILE = SOUND_OPTIONS[0];

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
    <div className={`custom-select ${disabled ? 'disabled' : ''} ${isOpen ? 'is-open' : ''}`} ref={containerRef}>
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
  const lastTickDay = useRef<number>(new Date().getDate());

  const [flowStudyMins, setFlowStudyMins] = useState(50);
  const [flowBreakMins, setFlowBreakMins] = useState(10);
  const [flowState, setFlowState] = useState<"study" | "break">("study");
  const [flowEndTime, setFlowEndTime] = useState<Date | null>(null);

  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [playSound, setPlaySound] = useState(true);
  const [soundLoop, setSoundLoop] = useState(false);
  const [soundFile, setSoundFile] = useState(DEFAULT_SOUND_FILE);
  const [volume, setVolume] = useState(80);
  const [statusMsg, setStatusMsg] = useState("⏸ 알람 비활성");
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [focusActive, setFocusActive] = useState(false);
  const [focusRemaining, setFocusRemaining] = useState(FOCUS_TOTAL_SEC);

  // 타이머 콜백에서도 가장 최근 설정을 읽도록 별도 ref에 동기화합니다.
  // 각 입력 핸들러에서도 즉시 갱신하므로 상태 렌더 전에 알람이 발생해도
  // 플랫폼별 초기 기본값이 잘못 재생되지 않습니다.
  const alarmAudioSettingsRef = useRef<AlarmAudioSettings>({
    playSound,
    soundFile,
    soundLoop,
    volume,
  });

  const updateAlarmAudioSettings = (next: Partial<AlarmAudioSettings>) => {
    alarmAudioSettingsRef.current = {
      ...alarmAudioSettingsRef.current,
      ...next,
    };
  };

  useEffect(() => {
    alarmAudioSettingsRef.current = { playSound, soundFile, soundLoop, volume };
  }, [playSound, soundFile, soundLoop, volume]);

  const isFlowModeRef = useRef(isFlowMode);
  useEffect(() => { isFlowModeRef.current = isFlowMode; }, [isFlowMode]);

  const handleZoomIn = useCallback(() => setZoomLevel(z => Math.min(Math.round((z + 0.1) * 10) / 10, 1.5)), []);
  const handleZoomOut = useCallback(() => setZoomLevel(z => Math.max(Math.round((z - 0.1) * 10) / 10, 0.5)), []);
  const handleZoomReset = useCallback(() => setZoomLevel(1.0), []);

  // macOS 네이티브 메뉴가 Command 단축키를 먼저 처리하는 경우의 줌 이벤트입니다.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<string>('zoom-action', ({ payload }) => {
        if (payload === 'in') handleZoomIn();
        else if (payload === 'out') handleZoomOut();
        else if (payload === 'reset') handleZoomReset();
      })
    ).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch((error) => {
      console.log('Zoom shortcut listener failed', error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleZoomIn, handleZoomOut, handleZoomReset]);

  // 창 크기 조정은 호출을 직렬화하고, 직전과 같은 크기면 건너뛰며, 알아낸 타이틀 바 부족분을 기억합니다.
  // 모드 전환 때 여러 번 호출돼도 창 높이가 왔다갔다(들썩임)하지 않게 하기 위함입니다.
  const applyQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastAppliedRef = useRef("");
  const titleBarExtraRef = useRef(0);

  const applyZoom = (zoom: number) => {
    applyQueueRef.current = applyQueueRef.current.then(() => runApplyZoom(zoom));
    return applyQueueRef.current;
  };

  const runApplyZoom = async (zoom: number) => {
    try {
      const isFlow = isFlowModeRef.current;
      const appEl = document.querySelector('.app') as HTMLElement;
      if (!appEl) return;

      (document.body.style as any).zoom = zoom.toString();
      const mainContentEl = document.querySelector('.main-content') as HTMLElement;

      // 100vh/flex 제약을 잠시 풀고 스크롤 없이 펼쳐진 실제 컨텐츠 높이를 측정합니다.
      // CSS의 height: 100vh !important를 덮어쓰기 위해 인라인 !important가 필요합니다.
      appEl.style.setProperty('height', 'auto', 'important');
      if (mainContentEl) {
        mainContentEl.style.setProperty('height', 'auto');
        mainContentEl.style.setProperty('flex', 'none');
        mainContentEl.style.setProperty('overflow-y', 'visible');
      }

      // 스타일 변경을 레이아웃에 반영한 후 실제로 화면에 그려지는 높이를 측정합니다.
      // WebView2의 getBoundingClientRect()에는 CSS zoom이 이미 반영되므로 다시 zoom을
      // 곱하면 Windows에서 창이 과도하게 커지고 하단에 빈 공간이 생깁니다.
      void appEl.offsetHeight;
      // 플랫폼에 따라 getBoundingClientRect()가 zoom을 반영하는지 다르므로(WebView2는 반영,
      // macOS WKWebView는 미반영) 기준 요소로 실제 반영 비율을 측정해 보정합니다.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:100px;';
      document.body.appendChild(probe);
      const rectScale = probe.getBoundingClientRect().height / 100;
      probe.remove();
      // 100vh가 화면에 실제로 그려지는 높이도 플랫폼마다 달라서(zoom이 vh에 곱해지는지 여부) 같은 방식으로 측정합니다.
      const vhProbe = document.createElement('div');
      vhProbe.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:100vh;';
      document.body.appendChild(vhProbe);
      const renderedPer100vh = vhProbe.getBoundingClientRect().height * (zoom / rectScale);
      vhProbe.remove();
      const vhScale = renderedPer100vh / window.innerHeight;
      const naturalRenderedHeight = Math.ceil(appEl.getBoundingClientRect().height * (zoom / rectScale));

      // body의 CSS zoom은 100vh 자체도 함께 확대/축소합니다. 앱 높이에 역배율을
      // 적용해야 확대율과 관계없이 렌더링된 앱이 실제 웹뷰 높이를 정확히 채웁니다.
      appEl.style.setProperty('height', `${100 / vhScale}vh`, 'important');
      if (mainContentEl) {
        mainContentEl.style.removeProperty('height');
        mainContentEl.style.removeProperty('flex');
        mainContentEl.style.removeProperty('overflow-y');
      }

      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();

      // outer/inner 차이로 macOS 타이틀 바 높이를 정확히 포함합니다.
      const [outerSize, innerSize, scaleFactor] = await Promise.all([
        win.outerSize(),
        win.innerSize(),
        win.scaleFactor(),
      ]);
      const titleBarHeight = Math.max(0, (outerSize.height - innerSize.height) / scaleFactor);
      const naturalOuterHeight = Math.ceil(naturalRenderedHeight + titleBarHeight + titleBarExtraRef.current);

      // 현재 모니터의 메뉴 바/Dock을 제외한 영역을 최대 높이로 사용합니다.
      const availableHeight = Math.max(480, Math.floor(window.screen.availHeight - 12));
      const targetHeight = Math.min(naturalOuterHeight, availableHeight);
      const minHeight = isFlow
        ? targetHeight
        : Math.min(targetHeight, Math.max(480, Math.ceil(520 * zoom)));
      // 콘텐츠 높이(모니터 높이로 제한)를 최대값으로 두어 스크롤이 필요 없는 길이 이상으로 늘어나지 않게 합니다.
      const maxHeight = targetHeight;

      // 이미 같은 크기로 맞춰져 있으면 창을 건드리지 않습니다.
      const appliedKey = (min: number, max: number, target: number) =>
        JSON.stringify([zoom, isFlow, min, max, target]);
      if (lastAppliedRef.current === appliedKey(minHeight, maxHeight, targetHeight)) return;

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_window_config", {
        zoom,
        minH: minHeight,
        maxH: maxHeight,
        targetH: targetHeight,
        resizable: !isFlow,
      });
      lastAppliedRef.current = appliedKey(minHeight, maxHeight, targetHeight);

      // macOS에서 outerSize와 innerSize가 같게 보고되어 타이틀 바 높이가 0으로 계산되면
      // 웹뷰가 그만큼 짧아져 콘텐츠가 잘립니다. 실제 웹뷰 높이로 부족분을 보정합니다.
      if (targetHeight === naturalOuterHeight) {
        await new Promise(resolve => setTimeout(resolve, 60));
        const shortfall = Math.ceil(naturalRenderedHeight - window.innerHeight);
        if (shortfall > 0 && shortfall <= 80) {
          // 부족분을 기억해 두면 다음 계산부터 처음부터 올바른 높이로 맞춥니다.
          titleBarExtraRef.current += shortfall;
          // 다음 계산과 같은 공식으로 구해야 같은 크기로 인식해 건너뜁니다.
          const fixedTarget = targetHeight + shortfall;
          const fixedMin = isFlow
            ? fixedTarget
            : Math.min(fixedTarget, Math.max(480, Math.ceil(520 * zoom)));
          await invoke("update_window_config", {
            zoom,
            minH: fixedMin,
            maxH: fixedTarget,
            targetH: fixedTarget,
            resizable: !isFlow,
          });
          lastAppliedRef.current = appliedKey(fixedMin, fixedTarget, fixedTarget);
        }
      }
    } catch (e) {
      console.log("Zoom API failed", e);
    }
  };

  // 줌 또는 모드 변경 시 다단계로 크기 조정 (렌더링 시점 이슈 방지)
  // 집중 위젯 중에는 정사각형 창을 유지해야 하므로 크기 조정을 건너뛰고,
  // 끝나면(focusActive가 false로 바뀌면) 원래 크기로 되돌립니다.
  useEffect(() => {
    if (focusActive) return;
    // 확대/축소 직후 요소들이 트랜지션으로 천천히 크기가 바뀌면 측정값이 시점마다 달라지므로,
    // 크기를 맞추는 동안에는 트랜지션을 꺼서 처음부터 최종 크기로 측정합니다.
    document.documentElement.classList.add('resizing');
    applyZoom(zoomLevel);
    const t1 = setTimeout(() => applyZoom(zoomLevel), 100);
    const t2 = setTimeout(() => applyZoom(zoomLevel), 400);
    const t3 = setTimeout(() => document.documentElement.classList.remove('resizing'), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [zoomLevel, isFlowMode, focusActive]);

  // 15분 집중: 남은 시간을 갱신합니다. 소리는 내지 않습니다.
  useEffect(() => {
    if (!focusActive) return;
    const end = Date.now() + FOCUS_TOTAL_SEC * 1000;
    setFocusRemaining(FOCUS_TOTAL_SEC);
    const timer = setInterval(() => {
      setFocusRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [focusActive]);

  useEffect(() => {
    const timer = setTimeout(() => {
      applyZoom(zoomLevel);
    }, 500); 
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        let handled = false;
        if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.key === 'ArrowUp') {
          handleZoomIn();
          handled = true;
        }
        else if (e.key === '-' || e.code === 'Minus' || e.key === 'ArrowDown') {
          handleZoomOut();
          handled = true;
        }
        else if (e.key === '0' || e.code === 'Digit0') {
          handleZoomReset();
          handled = true;
        }

        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, handleZoomIn, handleZoomOut, handleZoomReset]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { hour12: false }));
      if (!isFlowMode) tickSchedule(now);
      else tickFlow(now);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning, isFlowMode, flowEndTime, flowState, playSound, soundFile, soundLoop, volume]);

  useEffect(() => {
    async function updateWindow() {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setAlwaysOnTop(alwaysOnTop || focusActive);
      } catch (e) {
        console.log("Window API not available", e);
      }
    }
    updateWindow();
  }, [alwaysOnTop, focusActive]);

  const tickSchedule = (now: Date) => {
    // 날짜가 바뀌면(자정) 알람 발송 기록 초기화
    if (now.getDate() !== lastTickDay.current) {
      firedAlarms.current.clear();
      lastTickDay.current = now.getDate();
    }

    let current = -1;
    for (let i = 0; i < SCHEDULE.length; i++) {
      if (parseTime(SCHEDULE[i].time) <= now) current = i;
    }

    // 자정 이후 첫 스케줄 전까지는 첫 번째 항목(10:00)을 가리키도록 설정
    if (current === -1 && SCHEDULE.length > 0) {
      current = 0;
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
    setCountdownStr(formatTimeDiff(mins * 60)); // 시작 즉시 시간 표시
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
      // 소리 중지 추가
      import("@tauri-apps/api/event").then(m => m.emit("stopsound"));
    }
  };

  // 창을 작은 정사각형으로 바꿉니다. 위치는 그대로 두고, 원래 크기는 focusActive가 꺼질 때 applyZoom이 복원합니다.
  const shrinkWindowForFocus = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();
      await win.setResizable(true);
      await win.setMinSize(null);
      await win.setMaxSize(null);
      // 이미 알아낸 타이틀 바 부족분을 처음부터 더해 두 번 크기가 바뀌지 않게 합니다.
      await win.setSize(new LogicalSize(FOCUS_WIDGET_SIZE, FOCUS_WIDGET_SIZE + titleBarExtraRef.current));

      // 플랫폼에 따라 set_size가 타이틀 바를 포함할 수 있어 웹뷰 영역이 정사각형이 되도록 보정합니다.
      await new Promise(resolve => setTimeout(resolve, 80));
      const dw = FOCUS_WIDGET_SIZE - window.innerWidth;
      const dh = FOCUS_WIDGET_SIZE - window.innerHeight;
      // 최소/최대 크기는 "280 + 보정값"이 아니라 실제 창(outer) 크기를 기준으로 고정합니다.
      const [outer, scale] = await Promise.all([win.outerSize(), win.scaleFactor()]);
      const fixed = new LogicalSize(outer.width / scale + dw, outer.height / scale + dh);
      if (dw !== 0 || dh !== 0) await win.setSize(fixed);
      await win.setMinSize(fixed);
      await win.setMaxSize(fixed);
      await win.setResizable(false);
    } catch (e) {
      console.log("Focus window resize failed", e);
    }
  };

  const startFocus = () => {
    if (isRunning || !isFlowMode || focusActive) return;
    (document.body.style as any).zoom = '1';
    // 위젯이 창 크기를 바꾸므로, 끝난 뒤 같은 크기라고 건너뛰지 않도록 기록을 지웁니다.
    lastAppliedRef.current = "";
    setFocusRemaining(FOCUS_TOTAL_SEC);
    setFocusActive(true);
    shrinkWindowForFocus();
  };

  const endFocus = () => {
    setFocusActive(false);
    setFocusRemaining(FOCUS_TOTAL_SEC);
  };

  const toggleMode = () => {
    if (isRunning) return;
    const nextMode = !isFlowMode;
    setIsFlowMode(nextMode);
    isFlowModeRef.current = nextMode; // 즉시 반영하여 리사이즈 리스너 등이 오판하지 않게 함
    if (nextMode) {
      setCountdownStr("--:--");
    } else {
      tickSchedule(new Date());
    }
  };

  const previewSound = async () => {
    try {
      const audioSettings = alarmAudioSettingsRef.current;
      if (audioSettings.playSound) {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("playsound", {
          name: audioSettings.soundFile,
          looping: false,
          volume: audioSettings.volume / 100,
        });
      }
    } catch (e) {
      console.log("Preview sound failed", e);
    }
  };

  const triggerAlarm = async (title: string, msg: string, kind?: string) => {
    try {
      // 팝업이 준비되는 동안 설정이 바뀌더라도 알람이 발생한 시점의 설정을 사용합니다.
      const audioSettings = { ...alarmAudioSettingsRef.current };
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { emit, once } = await import("@tauri-apps/api/event");
      const label = `popup_${Date.now()}`;
      const readyEvent = `popup-ready-${label}`;

      // 팝업 HTML이 실제 창을 표시하고 두 프레임을 그린 뒤 보내는 이벤트입니다.
      // 이 이벤트 이후에만 소리를 시작하므로 소리가 팝업보다 먼저 재생되지 않습니다.
      const stopWaitingForReady = await once(readyEvent, () => {
        if (!audioSettings.playSound) return;
        void emit("playsound", {
          name: audioSettings.soundFile,
          looping: audioSettings.soundLoop,
          volume: audioSettings.volume / 100,
        });
      });

      const popup = new WebviewWindow(label, {
        url: `popup.html?title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}&kind=${kind || (title === '테스트' ? 'test' : 'info')}&readyEvent=${encodeURIComponent(readyEvent)}`,
        title: "알람",
        width: 280,
        height: 320,
        alwaysOnTop: true,
        center: true,
        resizable: false,
        decorations: false,
        skipTaskbar: true,
        visible: false, // 처음에는 숨김
        shadow: true,
        backgroundColor: '#1A1926',
      });

      void popup.once('tauri://error', (event) => {
        stopWaitingForReady();
        console.log('Alarm popup creation failed', event.payload);
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

  let sessionText = "";
  if (!isFlowMode && activeIdx >= 0) {
    sessionText = `● 현재 세션: ${SCHEDULE[activeIdx].time} ${SCHEDULE[activeIdx].title}`;
  } else if (isFlowMode && isRunning) {
    sessionText = `● 현재 상태: ${flowState === 'study' ? '공부' : '휴식'} 중`;
  }

  return (
    <div className="app">
      {focusActive && (
        <FocusOverlay remainingSec={focusRemaining} totalSec={FOCUS_TOTAL_SEC} onExit={endFocus} />
      )}
      <div className="header">
        <div className="header-left">
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomOut} title="축소 (Cmd -)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 20v-6h6M10 4v6H4" /></svg>
            </button>
            <div className="zoom-value" onClick={handleZoomReset} title="초기화 (Cmd 0)">
              {Math.round(zoomLevel * 100)}%
            </div>
            <button className="zoom-btn" onClick={handleZoomIn} title="확대 (Cmd +)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6" /></svg>
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
        <div className="mode-row-left">
          {isFlowMode && (
            <button
              type="button"
              className="focus-btn"
              onClick={startFocus}
              disabled={isRunning}
              title={isRunning ? "알람 중에는 사용할 수 없습니다" : "소리 없이 15분 동안 집중합니다"}
            >
              ◎ 15분 집중
            </button>
          )}
          <div>
            <div className="session-info">{sessionText}</div>
            {!isFlowMode && <div className="schedule-header">오늘 스케줄</div>}
          </div>
        </div>
        <button className="mode-btn" onClick={toggleMode} style={{ opacity: isRunning ? 0.5 : 1, cursor: isRunning ? 'not-allowed' : 'pointer' }}>
          {isFlowMode ? "스케줄 모드" : "플로우 모드"}
        </button>
      </div>
      <div className={`main-content ${isFlowMode ? 'flow' : ''}`}>
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

          </div>
        )}
      </div> {/* main-content 끝 */}

      <div className="bottom-group">
        <div className="settings-panel">
          <div className="settings-row">
            <span>알람 소리</span>
            <CustomSelect 
              value={soundFile} 
              options={SOUND_OPTIONS}
              onChange={(val) => {
                const nextSoundFile = String(val);
                updateAlarmAudioSettings({ soundFile: nextSoundFile });
                setSoundFile(nextSoundFile);
              }}
              dropUp={true} 
            />
            <button className="test-btn" onClick={previewSound}>미리듣기</button>
          </div>
          <div className="settings-row">
            <div className="vol-group">
              <span>볼륨</span>
              <input type="range" className="slider" min="0" max="100" value={volume} onChange={e => {
                const nextVolume = Number(e.target.value);
                updateAlarmAudioSettings({ volume: nextVolume });
                setVolume(nextVolume);
              }} />
            </div>
            <div className="toggle-group">
              <span className="vol-text">{volume}%</span>
              <span className="setting-label">소리 켬</span>
              <input type="checkbox" className="toggle" checked={playSound} onChange={e => {
                const nextPlaySound = e.target.checked;
                updateAlarmAudioSettings({ playSound: nextPlaySound });
                setPlaySound(nextPlaySound);
              }} />
              <span className="setting-label">소리 루프</span>
              <input type="checkbox" className="toggle" checked={soundLoop} onChange={e => {
                const nextSoundLoop = e.target.checked;
                updateAlarmAudioSettings({ soundLoop: nextSoundLoop });
                setSoundLoop(nextSoundLoop);
              }} disabled={!playSound} />
            </div>
          </div>
        </div>

        <button className={`run-btn ${isRunning ? 'running' : ''}`} onClick={toggleRun}>
          {isRunning ? "알람 중지" : "알람 시작"}
        </button>

        <button type="button" className="test-link" onClick={testDelayAlarm}>
          5초 뒤 팝업/소리 테스트
        </button>
      </div>
    </div>
  );
}
