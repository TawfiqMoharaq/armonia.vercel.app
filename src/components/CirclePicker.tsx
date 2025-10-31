// CirclePicker.tsx
import * as React from "react";

type Props = {
  side: "front" | "back";
  imgSrc: string;               // مسار صورة الجسم المطابقة لـ BODY_MAP
  onResults?: (data: any) => void; // تستقبل ناتج الـ API
  apiUrl?: string;              // افتراضي /api/analyze
};

type Circle = { cx: number; cy: number; r: number };

export default function CirclePicker({ side, imgSrc, onResults, apiUrl = "/api/analyze" }: Props) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const [circle, setCircle] = React.useState<Circle | null>(null);
  const [dragMode, setDragMode] = React.useState<null | "move" | "resize">(null);

  const getOverlayRect = () => overlayRef.current?.getBoundingClientRect();

  const toLocal = (e: React.MouseEvent) => {
    const rect = getOverlayRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // ملاحظة: جعلنا الـ overlay يطابق أبعاد الصورة بالـ CSS
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { x, y } = toLocal(e);
    if (!circle) {
      // أول نقرة: دائرة ابتدائية
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
      setCircle((c) => (c ? { ...c, r: Math.max(6, Math.min(r, Math.min(rect.width, rect.height) * 0.5)) } : c));
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
    if (!circle || !imgRef.current || !overlayRef.current) return;

    // نطبّع باستخدام أبعاد overlay (المفروض مساوية للصورة تمامًا)
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
          style={{ width: "400px", height: "600px", objectFit: "cover" }} // 2:3 مثل خريطة الباك
        />
        {/* طبقة الدائرة (overlay) تطابق أبعاد الصورة */}
        <div
          ref={overlayRef}
          className="absolute inset-0 cursor-crosshair"
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
        </div>
      </div>

      <div className="mt-2 flex gap-8">
        <button onClick={confirmPick}>تأكيد التحديد</button>
        <button onClick={() => setCircle(null)}>مسح</button>
      </div>
    </div>
  );
}
