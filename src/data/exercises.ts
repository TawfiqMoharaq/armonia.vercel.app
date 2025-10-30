// src/data/exercises.ts
export type Exercise = {
  id: string;
  name: string;            // "Bodyweight Squat"
  aliases?: string[];      // ["سكوات", "Squat", "Bodyweight Squat"]
  muscleGroup: string[];   // ["thighs","quads","glutes"]
  tips: string[];
  gif: string;             // "/src/assets/squat.gif"
  coachType?: "squat" | "none";
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat_bw",
    name: "Bodyweight Squat",
    aliases: ["سكوات","Squat","Bodyweight Squat"],
    muscleGroup: ["thighs","quads","glutes"],
    tips: ["ثبّت الكعبين","ادفع الوركين للخلف","ظهر محايد","انزل ببطء واصعد بتحكم"],
    gif: "/gifs/squat.gif", 
    coachType: "squat"
  },
  // ... تقدر تزيد لاحقًا Lunges, Glute Bridge, ...
];

const norm = (s:string) => s.toLowerCase().replace(/\s+/g,"").replace(/ى|ي/g,"ي").replace(/ة/g,"ه");

export function findExerciseByName(name: string): Exercise | null {
  const key = norm(name);
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    if (names.some(n => norm(n) === key)) return ex;
  }
  // تطابق جزئي (كلمة سكوات وسط الجملة)
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
