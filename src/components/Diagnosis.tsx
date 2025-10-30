import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import frontImg from "../assets/muscle-front.jpg";
import backImg from "../assets/muscle-back.jpg";

const AREAS = {
  back: { key: "back", label: "ألم أسفل الظهر", color: "#7C3AED" },
  neck: { key: "neck", label: "ألم الرقبة", color: "#0EA5E9" },
  jaw: { key: "jaw", label: "ألم الفك", color: "#F59E0B" },
};

export default function Diagnosis() {
  const nav = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);

  const goNext = () => {
    if (picked) nav(`/exercise-setup?area=${picked}`);
  };

  return (
    <div className="bg-[#F7FAFC] min-h-screen flex flex-col justify-between">
      <Navbar />

      <section className="max-w-5xl mx-auto p-6 space-y-6" dir="rtl">
        <h1 className="text-2xl font-semibold text-[#0A6D8B] text-center">تشخيص الحالة</h1>
        <p className="text-gray-600 text-center mb-4">
          اختر منطقة الألم لاقتراح تمرين مناسب.
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
        <div className="flex justify-center gap-4 mt-6 flex-wrap">
          {Object.values(AREAS).map(a => (
            <button
              key={a.key}
              onClick={() => setPicked(a.key)}
              className={`px-5 py-2 rounded-full border font-medium transition ${
                picked === a.key ? "bg-[#0A6D8B] text-white" : "bg-white text-gray-700"
              }`}
              style={{ borderColor: a.color }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* زر متابعة */}
        {picked && (
          <div className="text-center mt-6">
            <button
              onClick={goNext}
              className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-8 py-3 rounded-lg hover:opacity-90 transition"
            >
              متابعة
            </button>
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}
