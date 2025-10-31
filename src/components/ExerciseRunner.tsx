// داخل ExerciseRunner.tsx (أو المكوّن الذي يعرض الكاميرا + GIF)

return (
  <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-4">
    {/* عنوان التمرين */}
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-2xl font-semibold text-sky-800">{title || "Bodyweight Squat"}</h3>
      <button
        onClick={onClose}
        className="px-3 py-1.5 rounded-xl bg-slate-900 text-white"
      >
        إغلاق
      </button>
    </div>

    {/* الشبكة: الكاميرا يسار (ثابتة العرض) و الـGIF يمين (تمتد) */}
    <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] gap-6 items-start">
      {/* الكاميرا (يسار) */}
      <div className="relative">
        {/* زر تشغيل */}
        <button
          onClick={running ? stopCamera : startCamera}
          className="absolute z-10 top-3 left-3 px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700"
        >
          {running ? "إيقاف الكاميرا" : "تشغيل الكاميرا 🎥"}
        </button>

        {/* كانفس بحجم ثابت — لا تخليه يتمدد */}
        <div className="rounded-2xl overflow-hidden border border-black/10 bg-black">
          <canvas
            ref={canvasRef}
            // حجم ثابت يُصغّر الإطار الأسود ويمنع التمدد
            style={{ display: "block", width: 420, height: 315 }}
          />
        </div>

        {/* رسائل الحالة */}
        {cameraError && (
          <div className="mt-2 text-sm text-white bg-red-600/90 rounded-xl px-3 py-2">
            {cameraError}
          </div>
        )}
      </div>

      {/* GIF (يمين) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        {gif ? (
          <img
            src={gif}
            alt={title}
            className="w-full h-auto object-contain rounded-xl"
          />
        ) : (
          <div className="text-slate-500">لا توجد معاينة متحركة لهذا التمرين.</div>
        )}
        {/* (اختياري) نقاط سريعة تحت الـGIF */}
        <ul className="list-disc ms-6 mt-3 text-sm leading-7">
          <li>ثبّت الكعبين.</li>
          <li>ادفع الوركين للخلف.</li>
          <li>انزل ببطء واصعد بتحكم.</li>
        </ul>
      </div>
    </div>
  </div>
);
