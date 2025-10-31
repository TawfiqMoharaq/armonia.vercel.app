// CirclePicker.tsx
import * as React from "react";

type Props = {
  side: "front" | "back";
  imgSrc: string;
  onResults?: (data: any) => void;
  apiUrl?: string;
  /** امسح أي اختيار محفوظ محليًا عند فتح الصفحة (افتراضي true) */
  clearPersistedOnMount?: boolean;
};

type Circle = { cx: number; cy: number; r: number };

export default function CirclePicker({
  side,
  imgSrc,
  onResults,
  apiUrl = "/api/analyze",
  clearPersistedOnMount = true,
}: Props) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);

  const [circle, setCircle] = React.useState<Circle | null>(null);
  const [dragMode, setDragMode] = React.useState<null | "move" | "resize">(null);
  const [userInteracted, setUserInteracted] = React.useState(false);

  // امنع أي اختيار تلقائي أو استرجاع قديم
  React.useEffect(() => {
    setCircle(null);
    setUserInteracted(false);
    if (clearPersistedOnMount) {
      try {
        localStorage.removeItem("circle_pick");
      } catch {}
    }
  }, [side, imgSrc, clearPersistedOnMount]);

  const getOverlayRect = () => overlayRef.current?.getBoundingClientRect();

  const toLocal = (e: React.MouseEvent) => {
    const rect = getOverlayRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setUserInteracted(true); // ← مفتاح الإرسال
    const { x, y } = toLocal(e);
    const rect = getOverlayRect()!;
    const r0 = Math.min(rect.width, rect.height) * 0.08;

    if (!circle) {
      setCircle({ cx: x, cy: y, r: Math.max(6, r0) });
      setDragMode("resize");
      return;
    }

    const d = Math.hypot(x - circle.cx, y - circle.cy);
    if (Math.abs(d - circle.r) < 12) setDragMode("resize");
    else if (d < circle.r) setDragMode("move");
    else {
      setCircle({ cx: x, cy: y, r: Math.max(6, r0) });
      setDragMode("resize");
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragMode || !circle) return;
    const rect = getOverlayRect()!;
    const { x, y } = toLocal(e);

    if (dragMode === "resize") {
      const r = Math.hypot(x - circle.cx, y - circle.cy);
      setCircle((c) =>
        c ? { ...c, r: Math.max(6, Math.min(r, Math.min(rect.width, rect.height) * 0.5)) } : c
      );
    } else if (dragMode === "move") {
      const r = circle.r;
      const cx = Math.max(r, Math.min(x, rect.width - r));
      const cy = Math.max(r, Math.min(y, rect.height - r));
      setCircle((c) => (c ? { ...c, cx, cy } : c));
    }
  };

  const handleMouseUp = () => setDragMode(null);

  const confirmPick = async () => {
    // حماية: لا ترسل بدون تفاعل المستخدم ودائرة مرسومة
    if (!userInteracted || !circle || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const renderW = rect.width, renderH = rect.height;
    const cx_norm = circle.cx / renderW;
    const cy_norm = circle.cy / renderH;
    const radius_norm = circle.r / Math.min(renderW, renderH);

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, cx_norm, cy_norm, radius_norm, k: 5 }),
      });
      const data = await res.json();
      onResults?.(data);
    } catch (e) {
      console.error(e);
      onResults?.({ error: "network_error" });
    }
  };

  return (
    <div className="inline-block">
      <div className="relative">
        <img
          ref={imgRef}
          src={imgSrc}
          alt={side}
          className="select-none pointer-events-none block"
          style={{ width: "400px", height: "600px", objectFit: "cover" }}
        />

        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{ cursor: circle ? "move" : "crosshair" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <svg className="w-full h-full">
            {circle && (
              <>
                <circle
                  cx={circle.cx}
                  cy={circle.cy}
                  r={circle.r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                />
                <circle cx={circle.cx} cy={circle.cy} r={4} />
              </>
            )}
          </svg>

          {!circle && (
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-sm text-white">
              اضغط على المكان المصاب لرسم دائرة التحديد
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-8">
        <button
          onClick={confirmPick}
          disabled={!userInteracted || !circle}
          className={`px-3 py-1 rounded ${userInteracted && circle ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-600 cursor-not-allowed"}`}
        >
          تأكيد التحديد
        </button>
        <button
          onClick={() => {
            setCircle(null);
            setUserInteracted(false);
          }}
          className="px-3 py-1 rounded bg-gray-100"
        >
          مسح
        </button>
      </div>
    </div>
  );
}
