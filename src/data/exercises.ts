// src/data/exercises.ts

export type Exercise = {
  id: string;
  name: string;                 // مثال: "Bodyweight Squat"
  aliases?: string[];           // أمثلة: ["سكوات", "Squat", "Bodyweight Squat"]
  muscleGroup: string[];        // أمثلة: ["thighs","quads","glutes"]
  tips: string[];
  gif: string;                  // استخدم مسار جذري من public، مثل: "/gifs/squat.gif"
  demoGif?: string;             // (اختياري) مسار بديل/احتياطي للعرض
  coachType?: "squat" | "none"; // نوع المصحّح المطلوب
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat_bw",
    name: "Bodyweight Squat",
    aliases: ["سكوات", "Squat", "Bodyweight Squat"],
    muscleGroup: ["thighs", "quads", "glutes"],
    tips: ["ثبّت الكعبين", "ادفع الوركين للخلف", "ظهر محايد", "انزل ببطء واصعد بتحكم"],
    gif: "/gifs/squat.gif",      // ✅ من public
    demoGif: "/gifs/squat.gif",  // ✅ احتياطي
    coachType: "squat",
  },
  // يمكنك إضافة تمارين أخرى هنا (Lunge, Glute Bridge, …)
];

// تبسيط وملاءمة للبحث بالعربي/الإنجليزي
const norm = (s: string) =>
  s.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/ى|ي/g, "ي")
    .replace(/ة/g, "ه");

export function findExerciseByName(name: string): Exercise | null {
  const key = norm(name);
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    if (names.some((n) => norm(n) === key)) return ex;
  }
  // تطابق جزئي (وجود كلمة سكوات داخل الجملة مثلاً)
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])].map(norm);
    if (names.some((n) => key.includes(n) || n.includes(key))) return ex;
  }
  return null;
}

export function getExercisesByMuscle(muscle: string): Exercise[] {
  const m = muscle.toLowerCase();
  return EXERCISES.filter((e) => e.muscleGroup.map((x) => x.toLowerCase()).includes(m));
}
