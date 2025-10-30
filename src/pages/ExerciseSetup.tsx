import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function ExerciseSetup() {
  const [params] = useSearchParams();
  const nav = useNavigate();

  const area = params.get("area") ?? "back";

  // اختيار التمرين تلقائياً
  const exercise =
    area === "back"
      ? { key: "squat", label: "سكوات" }
      : { key: "pushup", label: "ضغط" };

  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(8);

  const start = () => {
    nav(`/motion-correction?area=${area}&exercise=${exercise.key}&sets=${sets}&reps=${reps}`);
  };

  return (
    <div className="bg-[#F7FAFC] min-h-screen flex flex-col justify-between" dir="rtl">
      <Navbar />

      <section className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold text-[#0A6D8B] text-center">
          إعداد التمرين
        </h1>

        <p className="text-gray-700 text-center">
          المنطقة المختارة:{" "}
          <span className="font-bold">
            {area === "back"
              ? "أسفل الظهر"
              : area === "neck"
              ? "الرقبة"
              : "الفك"}
          </span>
        </p>

        <div className="bg-white border rounded-xl p-4 shadow text-center">
          <p className="text-gray-600 text-sm mb-2">التمرين المقترح تلقائياً</p>
          <p className="text-xl font-bold text-[#0A6D8B]">{exercise.label}</p>
        </div>

        {/* خيارات المستخدم */}
        <div className="bg-white border rounded-xl p-4 shadow space-y-4">
          <div>
            <label className="text-gray-700">عدد المجموعات</label>
            <input
              type="number"
              min={1}
              max={10}
              value={sets}
              onChange={(e) => setSets(Number(e.target.value))}
              className="block w-full border rounded-lg p-2 mt-1 text-center"
            />
          </div>

          <div>
            <label className="text-gray-700">عدد التكرارات في كل مجموعة</label>
            <input
              type="number"
              min={1}
              max={30}
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className="block w-full border rounded-lg p-2 mt-1 text-center"
            />
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={start}
            className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-10 py-3 rounded-lg hover:opacity-90 transition font-semibold"
          >
            ابدأ التحليل
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
