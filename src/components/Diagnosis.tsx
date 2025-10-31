// src/pages/Diagnosis.tsx
import { useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import frontImg from "../assets/muscle-front.jpg";
import backImg from "../assets/muscle-back.jpg";
import ChatBox, { Muscle } from "../components/ChatBox";

type AreaKey = "back" | "neck" | "jaw";

const AREAS: Record<AreaKey, { key: AreaKey; label: string; color: string }> = {
  back: { key: "back", label: "ألم أسفل الظهر", color: "#7C3AED" },
  neck: { key: "neck", label: "ألم الرقبة", color: "#0EA5E9" },
  jaw:  { key: "jaw",  label: "ألم الفك",    color: "#F59E0B" },
};

/** بذور عضلات مبدئية تُمرَّر لـ ChatBox ليفهم الموضع ويُرسل تلقائياً */
const AREA_MUSCLE_SEEDS: Record<AreaKey, Muscle[]> = {
  back: [
    { muscle_ar: "الناصبة للفقار (قطني)", muscle_en: "Erector Spinae (Lumbar)", region: "أسفل الظهر", prob: 0.92 },
    { muscle_ar: "الألوية الكبرى",         muscle_en: "Gluteus Maximus",          region: "الورك/الأرداف", prob: 0.55 },
    { muscle_ar: "أوتار المأبض",           muscle_en: "Hamstrings",               region: "خلف الفخذ", prob: 0.43 },
  ],
  neck: [
    { muscle_ar: "الرقبة العميقة المثنية", muscle_en: "Deep Cervical Flexors",    region: "العنق الأمامي", prob: 0.88 },
    { muscle_ar: "شبه المنحرف العلوي",     muscle_en: "Upper Trapezius",          region: "العنق/الكتف", prob: 0.52 },
  ],
  jaw: [
    { muscle_ar: "العضلة الماضغة",         muscle_en: "Masseter",                  region: "الفك الجانبي", prob: 0.86 },
    { muscle_ar: "الصدغية",                muscle_en: "Temporalis",                region: "الصدغ", prob: 0.58 },
  ],
};

export default function Diagnosis() {
  const [picked, setPicked] = useState<AreaKey | null>(null);

  // العضلات التي سنمرّرها إلى ChatBox (تتغيّر حسب الاختيار)
  const selectedMuscles = useMemo<Muscle[]>(
    () => (picked ? AREA_MUSCLE_SEEDS[picked] : []),
    [picked]
  );

  return (
    <div className="bg-[#F7FAFC] min-h-screen flex flex-col justify-between">
      <Navbar />

      <section className="max-w-6xl mx-auto p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#0A6D8B] text-center">تشخيص الحالة</h1>
        <p className="text-gray-600 text-center mb-4">
          اختر منطقة الألم ليتم اقتراح تشخيص أولي وتمارين مناسبة تلقائيًا.
        </p>

        {/* عرض الصور */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-xl p-4 text-center shadow">
            <img src={frontImg} alt="muscle front" className="mx-auto h-[450px] object-contain" />
            <p className="text-sm text-gray-500 mt-2">من الأمام</p>
          </div>

          <div className="bg-white border rounded-xl p-4 text-center shadow">
            <img src={backImg} alt="muscle back" className="mx-auto h-[450px] object-contain" />
            <p className="text-sm text-gray-500 mt-2">من الخلف</p>
          </div>
        </div>

        {/* خيارات مناطق الألم */}
        <div className="flex justify-center gap-3 mt-6 flex-wrap">
          {(Object.values(AREAS) as Array<(typeof AREAS)[AreaKey]>).map((a) => {
            const active = picked === a.key;
            return (
              <button
                key={a.key}
                onClick={() => setPicked(a.key)}
                className={[
                  "px-5 py-2 rounded-full border font-medium transition",
                  active ? "bg-[#0A6D8B] text-white" : "bg-white text-gray-700 hover:bg-slate-50",
                ].join(" ")}
                style={{ borderColor: a.color }}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {/* مربع الشات (يشتغل تلقائياً عند اختيار المنطقة) */}
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white border rounded-xl p-4 shadow">
            <h2 className="text-lg font-semibold text-[#0A6D8B] mb-2">محادثة الإرشاد</h2>
            {picked ? (
              <ChatBox muscles={selectedMuscles} />
            ) : (
              <div className="text-slate-500 text-center py-8">
                اختر منطقة الألم ليبدأ المساعد بإرسال الإرشادات تلقائيًا.
              </div>
            )}
          </div>

          {/* مربع نصائح عامة (اختياري) */}
          <div className="bg-white border rounded-xl p-4 shadow space-y-2">
            <h2 className="text-lg font-semibold text-[#0A6D8B]">نصائح عامة للسلامة</h2>
            <ul className="list-disc ms-5 text-gray-700 leading-8">
              <li>ابدأ بإحماء خفيف 5–10 دقائق.</li>
              <li>الحركة بمدى مريح بدون ألم حاد.</li>
              <li>توقف فورًا عند الدوار أو ازدياد الألم.</li>
              <li>تنفّس بهدوء وركّز على الجودة بدل السرعة.</li>
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
