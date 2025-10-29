import React, { useState } from "react";
import { getExercisesByMuscle } from "../data/exercises";
import ExerciseCard from "../components/ExerciseCard";
import ChatBox from "../components/ChatBox";

export default function DiagnosisPage() {
  const [muscle, setMuscle] = useState("");

  const show = muscle.toLowerCase() === "thighs";
  const exercises = show ? getExercisesByMuscle("thighs") : [];

  return (
    <div className="p-6 space-y-6">
      <ChatBox />

      <div className="space-y-2">
        <label>حدد العضلة</label>
        <select
          value={muscle}
          onChange={(event) => setMuscle(event.target.value)}
          className="border px-3 py-2 rounded-xl bg-transparent"
        >
          <option value="">— اختر —</option>
          <option value="thighs">الفخذ</option>
        </select>
      </div>

      {show && (
        <>
          <div className="p-4 border rounded-3xl bg-white/5">
            <h2 className="text-xl font-bold mb-2">نصائح للفخذ</h2>
            <ul className="list-disc ms-5">
              <li>ابدأ بإحماء خفيف</li>
              <li>لا تتجاهل الألم الحاد</li>
              <li>حافظ على استقامة الظهر</li>
            </ul>
          </div>

          <div className="space-y-4">
            {exercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
