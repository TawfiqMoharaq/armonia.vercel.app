// src/data/exercises.ts

export type Exercise = {
  id: string;
  name: string;                 // مثال: "Bodyweight Squat"
  aliases?: string[];           // أمثلة: ["سكوات", "Squat", "Bodyweight Squat"]
  muscleGroup: string[];        // أمثلة: ["thighs","quads","glutes"]
  tips: string[];
  gif: string;                  // مسار جذري من public مثل "/gifs/squat.gif"
  demoGif?: string;             // (اختياري) مسار بديل/احتياطي
  coachType?: "squat" | "none"; // نوع المصحّح (إن وُجد)
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat_bw",
    name: "Bodyweight Squat",
    aliases: ["سكوات", "Squat", "Bodyweight Squat"],
    muscleGroup: ["thighs", "quads", "glutes"],
    tips: ["ثبّت الكعبين", "ادفع الوركين للخلف", "حافظ على الظهر محايد", "انزل ببطء واصعد بتحكم"],
    gif: "/gifs/squat.gif",
    demoGif: "/gifs/squat.gif",
    coachType: "squat",
  },
  // TODO: أضف باقي التمارين مثل Lunge, Glute Bridge, Plank...
];

/* ------------------------ تطبيع النص (عربي/إنجليزي) ------------------------ */
// يزيل التشكيل والمسافات ويوحّد الهَمَزات وبعض الحروف العربية
const AR_DIACRITICS = /[\u064B-\u0652\u0670]/g; // فتحة ضمة كسرة تشديد... إلخ
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(AR_DIACRITICS, "")
    .replace(/\s+/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى|ي/g, "ي")
    .replace(/ة/g, "ه");

/* ----------------------- البحث بالاسم/المرادفات ----------------------- */
export function findExerciseByName(name?: string | null): Exercise | null {
  if (!name || typeof name !== "string") return null;
  const key = norm(name);

  // 1) تطابق تام (أقوى)
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    if (names.some((n) => norm(n) === key)) return ex;
  }

  // 2) يبدأ بـ (start match) — يعطي نتائج طبيعية لمدخلات مختصرة
  let bestStart: Exercise | null = null;
  let bestStartLen = Infinity;
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    for (const n of names) {
      const nn = norm(n);
      if (nn.startsWith(key) || key.startsWith(nn)) {
        if (nn.length < bestStartLen) {
          bestStart = ex;
          bestStartLen = nn.length;
        }
      }
    }
  }
  if (bestStart) return bestStart;

  // 3) contains (أضعف) — نستخدمه كملاذ أخير
  let bestContain: Exercise | null = null;
  let bestContainLen = Infinity;
  for (const ex of EXERCISES) {
    const names = [ex.name, ...(ex.aliases ?? [])];
    for (const n of names) {
      const nn = norm(n);
      if (key.includes(nn) || nn.includes(key)) {
        if (nn.length < bestContainLen) {
          bestContain = ex;
          bestContainLen = nn.length;
        }
      }
    }
  }
  return bestContain ?? null;
}

/* -------------------- جلب التمارين بحسب المجموعة العضلية ------------------- */
// دعم مرادفات شائعة بدون تغيير بنية بياناتك
const MUSCLE_SYNONYMS: Record<string, string[]> = {
  thighs: ["thighs", "quads", "quadriceps", "hamstrings", "adductors"],
  quads: ["quads", "quadriceps", "thighs"],
  hamstrings: ["hamstrings", "thighs"],
  glutes: ["glutes", "hips", "butt"],
  // أضف ما تحتاجه
};

export function getExercisesByMuscle(muscle: string): Exercise[] {
  const m = muscle.toLowerCase().trim();
  const set = new Set((MUSCLE_SYNONYMS[m] ?? [m]).map((x) => x.toLowerCase()));
  return EXERCISES.filter((e) =>
    e.muscleGroup.some((g) => set.has(g.toLowerCase()))
  );
}
