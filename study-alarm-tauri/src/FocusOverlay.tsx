import { useEffect, useRef } from "react";

type Props = {
  remainingSec: number;
  totalSec: number;
  onExit: () => void;
};

// 천천히 떠다니는 색 덩어리들. 값은 [r, g, b], 주파수(fx, fy), 위상(px, py), 반지름 비율(r)입니다.
const BLOBS = [
  { color: [140, 123, 255], fx: 0.13, fy: 0.17, px: 0.0, py: 1.3, r: 0.55 },
  { color: [91, 140, 255], fx: 0.19, fy: 0.11, px: 2.1, py: 0.4, r: 0.5 },
  { color: [200, 140, 255], fx: 0.09, fy: 0.21, px: 4.0, py: 2.2, r: 0.6 },
  { color: [90, 200, 230], fx: 0.15, fy: 0.14, px: 1.2, py: 3.5, r: 0.45 },
];

// 낮은 해상도로 그린 뒤 CSS로 늘려서 부드럽게 보이게 하고 부하를 줄입니다.
const CANVAS_SIZE = 160;
// 시작 클릭이 곧바로 종료로 처리되지 않도록 마운트 직후의 클릭은 무시합니다.
const CLICK_GUARD_MS = 600;

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function FocusOverlay({ remainingSec, totalSec, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedAt = useRef(Date.now());
  const intensityRef = useRef(0);

  // 남은 시간이 줄수록 0에서 1로 짙어집니다.
  intensityRef.current = Math.min(1, Math.max(0, 1 - remainingSec / totalSec));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    let last = performance.now();
    let phase = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const intensity = intensityRef.current;
      // 속도가 바뀌어도 위치가 튀지 않도록 위상을 누적합니다.
      phase += dt * (0.6 + 0.8 * intensity);

      const w = CANVAS_SIZE;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#0D0C16";
      ctx.fillRect(0, 0, w, w);
      ctx.globalCompositeOperation = "lighter";

      for (const b of BLOBS) {
        const cx = w * (0.5 + 0.32 * Math.sin(phase * b.fx * Math.PI * 2 + b.px));
        const cy = w * (0.5 + 0.32 * Math.cos(phase * b.fy * Math.PI * 2 + b.py));
        const radius = w * b.r * (0.85 + 0.2 * Math.sin(phase * 0.5 + b.px));
        const alpha = 0.08 + 0.5 * intensity;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(${b.color[0]}, ${b.color[1]}, ${b.color[2]}, ${alpha})`);
        g.addColorStop(1, `rgba(${b.color[0]}, ${b.color[1]}, ${b.color[2]}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClick = () => {
    if (Date.now() - mountedAt.current < CLICK_GUARD_MS) return;
    onExit();
  };

  return (
    <div className={`focus-overlay ${remainingSec <= 0 ? "done" : ""}`} onClick={handleClick}>
      <canvas ref={canvasRef} className="focus-canvas" width={CANVAS_SIZE} height={CANVAS_SIZE} />
      <div className="focus-time">{formatMmSs(Math.max(0, remainingSec))}</div>
    </div>
  );
}
