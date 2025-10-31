// CirclePicker.tsx
import * as React from "react";

type Props = {
  side: "front" | "back";
  imgSrc: string;                 // مسار صورة الجسم المطابقة لـ BODY_MAP
  onResults?: (data: any) => void; // تستقبل ناتج الـ API
  apiUrl?: string;                // افتراضي /api/analyze
  /** لو تبغى ترجع آخر اختيار تلقائيًا (افتراضي = false) */
  persistSelection?: boolean;
};

type Circle = { cx: number; cy: number; r: number };

export default function CirclePicker({
  side,
  imgSrc,
  onResults,
  apiUrl = "/api/analyze",
  persistSelection = false,
}: Props) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [circle, setCircle] = React.useState<Circle | null>(null);
  const [dragMode, setDragMode] = React.useState<null | "move" | "resize">(null);

  // ————————————————— ضبط البداية بدون أي اختيار —————————————————
  // نضمن عدم وجود اختيار تلقائي عند أول تحميل أو عند تغيير الصورة/الجهة
  React.useEffect(() => {
    if (!persistSelection) {
      setCircle(null);
    }
  }, [side, imgSrc, persistSelection]);

  const getOverlayRect = () => overlayRef.current?.getBoundingClientRect();

  const toLocal = (e: React.MouseEvent) => {
    const rect = getOverlayRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = toLocal(e);
    if (!circle) {
      // أول نقرة: ابدأ دائرة ابتدائية فقط إذا ضغط المستخدم
      const rect = getOverlayRect()!;
      const r0 = Math.min(rect.width, rect.height) * 0.08;
      setCircle({ cx: x, cy: y, r: Math.max(6, r0) });
      setDragMode("resize");
    } else {
      // تحديد وضع السحب: قرب الحافة → resize، داخل → move
      const d = Math.hypot(x - circle.cx, y - circle.cy);
      if (Math.abs(d - circle.r) < 12) setDragMode("resize");
      else if (d < circle.r) setDragMode("move");
      else {
        // نقرة خارج الدائرة: ابدأ دائرة جديدة
        const rect = getOverlayRect()!;
        const r0 = Math.min(rect.width, rect.height) * 0.08;
        setCircle({ cx: x, cy: y, r: Math.max(6, r0) });
        setDragMode("resize");
      }
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
      // قيّد الدائرة داخل الـ overlay قدر الإمكان
      const r = circle.r;
      const cx = Math.max(r, Math.min(x, rect.width - r));
      const cy = Math.max(r, Math.min(y, rect.height - r));
      setCircle((c) => (c ? { ...c, cx, cy } : c));
    }
  };

  const handleMouseUp = () => setDragMode(null);

  const confirmPick = async () => {
    if (!circle || !overlayRef.current) return;
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
        {/* الصورة */}
        <img
          ref={imgRef}
          src={imgSrc}
          alt={side}
          className="select-none pointer-events-none block"
          style={{ width: "400px", height: "600px", objectFit: "cover" }} // 2:3
        />

        {/* طبقة الدائرة (overlay) تطابق أبعاد الصورة */}
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

          {/* تلميح صغير عند عدم وجود اختيار */}
          {!circle && (
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-md bg-black/60 px-3 py-1 text-sm text-white">
              اضغط على المكان المصاب لرسم دائرة التحديد
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-8">
        <button onClick={confirmPick} disabled={!circle} className={`px-3 py-1 rounded ${circle ? "bg-blue-600 text-white" : "bg-gray-300 text-gray-600 cursor-not-allowed"}`}>
          تأكيد التحديد
        </button>
        <button onClick={() => setCircle(null)} className="px-3 py-1 rounded bg-gray-100">
          مسح
        </button>
      </div>
    </div>
  );
}
