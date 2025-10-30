// src/data/exercises.ts
export type Exercise = {
  id: string;
  name: string;             // "Bodyweight Squat"
  aliases?: string[];       // ["سكوات", "Squat"]
  muscleGroup: string[];    // ["thighs","quads","glutes"]
  tips: string[];           // تُعرض كبنود
  gif: string;              // "/gifs/squat.gif" ← من public
  coachType?: "squat" | "none";
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat_bw",
    name: "Bodyweight Squat",
    aliases: ["سكوات","Squat","Bodyweight Squat"],
    muscleGroup: ["thighs","quads","glutes"],
    tips: [
      "ثبّت الكعبين واترك المسافة بعرض الكتفين",
      "ادفع الوركين للخلف وابقي الظهر محايد",
      "انزل ببطء واصعد بتحكم، والتنفس ثابت",
    ],
    gif: "/gifs/squat.gif",
    coachType: "squat",
  },
  {
    id: "lunge_fw",
    name: "Forward Lunge",
    aliases: ["لونجز","Lunges","Forward Lunge"],
    muscleGroup: ["thighs","quads","glutes"],
    tips: [
      "خطوة للأمام مع ثبات الجذع",
      "الركبة الأمامية تقريبًا بزاوية 90°",
      "ارجع لوضع البداية، وبدّل الرجلين",
    ],
    gif: "/gifs/lunge.gif",
    coachType: "none", // لاحقًا نضيف له Coach خاص لو تبغى
  },
];

// Helpers اختيار حسب العضلة أو الاسم
const norm = (s:string) => s.toLowerCase().replace(/\s+/g,"").replace(/ى|ي/g,"ي").replace(/ة/g,"ه");
export function findExerciseByName(name: string): Exercise | null {
  const key = norm(name);
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    if (names.some(n => norm(n) === key)) return ex;
  }
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])].map(norm);
    if (names.some(n => key.includes(n) || n.includes(key))) return ex;
  }
  return null;
}
export function getExercisesByMuscle(muscle: string) {
  const m = muscle.toLowerCase();
  return EXERCISES.filter(e => e.muscleGroup.includes(m));
}
