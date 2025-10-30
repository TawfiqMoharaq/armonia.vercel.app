import React, { useState, useRef } from "react";

const MotionCorrection: React.FC = () => {
  const [injury, setInjury] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleStart = async () => {
    setShowCamera(true);
    if (videoRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    }
  };

  const totalReps = sets * reps;

  return (
    <div className="min-h-screen bg-[#F7FAFC] text-gray-800 flex flex-col items-center py-12" dir="rtl">
      <h1 className="text-3xl font-bold text-[#0A6D8B] mb-6">تصحيح الحركة بالذكاء الاصطناعي</h1>

      {!showCamera && (
        <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-lg space-y-4">
          <label className="font-semibold text-[#0A6D8B]">📍 اختر المنطقة المصابة:</label>
          <select
            value={injury}
            onChange={(e) => setInjury(e.target.value)}
            className="w-full border rounded-lg p-3"
          >
            <option value="">اختر المنطقة</option>
            <option value="lower_back">أسفل الظهر</option>
            <option value="knee">الركبة</option>
          </select>

          {injury && (
            <>
              <img
                src={
                  injury === "lower_back"
                    ? "https://upload.wikimedia.org/wikipedia/commons/d/d3/Human_back_muscles_labeled.jpg"
                    : "https://upload.wikimedia.org/wikipedia/commons/4/4d/Knee_joint_anatomy.jpg"
                }
                alt="العضلة المصابة"
                className="rounded-lg shadow-md w-full h-64 object-cover"
              />
              <label className="font-semibold text-[#0A6D8B]">🏋️ اختر التمرين:</label>
              <select
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
                className="w-full border rounded-lg p-3"
              >
                <option value="">اختر التمرين</option>
                <option value="squat">Squat</option>
                <option value="pushup">Push Up</option>
              </select>

              <div className="flex gap-4 mt-3">
                <div className="flex-1">
                  <label>عدد المجموعات:</label>
                  <input
                    type="number"
                    value={sets}
                    onChange={(e) => setSets(Number(e.target.value))}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
                <div className="flex-1">
                  <label>عدد التكرارات:</label>
                  <input
                    type="number"
                    value={reps}
                    onChange={(e) => setReps(Number(e.target.value))}
                    className="w-full border rounded-lg p-2"
                  />
                </div>
              </div>

              <p className="text-[#4A5568] mt-2 text-sm">
                🧮 إجمالي التكرارات الكلي: <strong>{totalReps}</strong>
              </p>

              <button
                onClick={handleStart}
                className="bg-gradient-to-r from-[#0A6D8B] to-[#18A4B8] text-white px-8 py-3 rounded-lg hover:opacity-90 w-full mt-4 font-semibold"
              >
                ابدأ التحليل
              </button>
            </>
          )}
        </div>
      )}

      {showCamera && (
        <div className="mt-6 text-center">
          <div className="text-[#0A6D8B] mb-2">
            <strong>المجموعات:</strong> {sets} &nbsp; | &nbsp; 
            <strong>التكرارات:</strong> {reps} &nbsp; | &nbsp;
            <strong>الإجمالي:</strong> {totalReps}
          </div>

          <video ref={videoRef} className="w-[90vw] max-w-lg rounded-lg shadow-lg border-2 border-[#0A6D8B]" />

          <p className="mt-4 text-[#4A5568] text-lg">
            💡 التعليمات: تأكد من الوقوف باستقامة، وراقب الشاشة لمعرفة دقة أدائك.
          </p>
        </div>
      )}

      {/* الدعم الفني */}
      <footer className="mt-10 text-sm text-[#4A5568]">
        الدعم الفني: <a href="mailto:ai.armonia.sa@gmail.com" className="text-[#0A6D8B] font-medium">ai.armonia.sa@gmail.com</a>
      </footer>
    </div>
  );
};

export default MotionCorrection;
