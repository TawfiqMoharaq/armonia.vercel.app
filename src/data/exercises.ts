type CoachType = "squat" | "none";

export const EXERCISE_MUSCLES = [
  "thighs",
  "hamstrings",
  "glutes",
  "hips",
  "lower_back",
  "upper_back",
  "core",
  "shoulders",
  "chest",
  "calves",
] as const;

export type ExerciseMuscle = (typeof EXERCISE_MUSCLES)[number];

export type ExerciseIntensity = "light" | "moderate" | "intense";

export type Exercise = {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  intensity: ExerciseIntensity;
  equipment?: string[];
  duration?: string;
  primaryMuscle: ExerciseMuscle;
  muscles: ExerciseMuscle[];
  gif: string;
  coachType?: CoachType;
  tips: string[];
};

const EXERCISES: Exercise[] = [
  {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    nameAr: "سكوات بوزن الجسم",
    description:
      "تمرين أساسي يقوّي عضلات الفخذين والأرداف مع تحسين التوازن العام للجسم.",
    intensity: "moderate",
    equipment: ["bodyweight"],
    primaryMuscle: "thighs",
    muscles: ["thighs", "glutes", "core"],
    gif: "/gifs/squat.gif",
    coachType: "squat",
    tips: [
      "حافظ على الكعبين ثابتين على الأرض طوال الحركة.",
      "ادفع الوركين إلى الخلف وكأنك تجلس على كرسي لتجنب تحميل الركبتين.",
      "ارفع صدرك ووجه نظرك للأمام للحفاظ على استقامة الظهر.",
    ],
  },
  {
    id: "glute-bridge",
    name: "Glute Bridge",
    nameAr: "رفع الوركين",
    description:
      "يساعد هذا التمرين على تنشيط عضلات الألوية وتقوية الجذع السفلي دون ضغط كبير على الركبتين.",
    intensity: "light",
    equipment: ["bodyweight"],
    primaryMuscle: "glutes",
    muscles: ["glutes", "hamstrings", "core"],
    gif: "https://media.musclewiki.com/media/uploads/movements/bodyweight/bodyweight_glute_bridge/Bodyweight-glute-bridge-front.gif",
    tips: [
      "شد عضلات البطن قبل رفع الوركين للحصول على استقرار أفضل.",
      "اضغط على الألوية في أعلى الحركة وتوقف لثانية قبل النزول.",
      "تجنب فرط تقويس أسفل الظهر أثناء الرفع.",
    ],
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    nameAr: "الرفعة الرومانية",
    description:
      "حركة مركزة على أوتار الركبة وأسفل الظهر مع استخدام أوزان خفيفة أو بدون أوزان.",
    intensity: "moderate",
    equipment: ["dumbbell", "kettlebell", "bodyweight"],
    primaryMuscle: "hamstrings",
    muscles: ["hamstrings", "glutes", "lower_back"],
    gif: "https://media.musclewiki.com/media/uploads/movements/dumbbell/Dumbbell_Romanian_Deadlift/Dumbbell-Romanian-Deadlift-front.gif",
    tips: [
      "حافظ على انحناءة طبيعية في أسفل الظهر ولا تدعه يستدير.",
      "ادفع الوركين للخلف بدلًا من الانحناء أسفلًا بالظهر.",
      "ابقي الدمبل أو الوزن قريبًا من الساقين طوال الحركة.",
    ],
  },
  {
    id: "side-lying-clamshell",
    name: "Side-Lying Clamshell",
    nameAr: "صدفة الورك الجانبية",
    description:
      "تمرين ممتاز لتفعيل عضلات الورك العميقة ودعم ثبات الركبة والحوض.",
    intensity: "light",
    equipment: ["bodyweight", "resistance_band"],
    primaryMuscle: "hips",
    muscles: ["hips", "glutes"],
    gif: "https://media.musclewiki.com/media/uploads/movements/bodyweight/Bodyweight_Clamshell/Bodyweight-Clamshell-front.gif",
    tips: [
      "حافظ على الوركين فوق بعضهما ولا تدعهما يتدوران للخلف.",
      "ارفع الركبة العليا فقط حتى تشعر بتقلص في جانب الورك.",
      "تحكم في النزول ببطء للحفاظ على التوتر في عضلات الألوية.",
    ],
  },
  {
    id: "front-plank",
    name: "Front Plank",
    nameAr: "بلانك أمامي",
    description:
      "يحسّن البلانك استقرار الجذع ويقلل الضغط على أسفل الظهر عند أدائه بصورة صحيحة.",
    intensity: "moderate",
    equipment: ["bodyweight"],
    duration: "3 × 30 ثانية",
    primaryMuscle: "core",
    muscles: ["core", "shoulders", "glutes"],
    gif: "https://media.musclewiki.com/media/uploads/movements/bodyweight/Bodyweight_Front_Plank/Bodyweight-Front-Plank-front.gif",
    tips: [
      "ارفع جسمك بخط مستقيم من الرأس حتى الكعبين دون تقوس في أسفل الظهر.",
      "شد عضلات البطن والألوية للحفاظ على الاستقرار.",
      "تجنب رفع الوركين للأعلى أو تركها تهبط للأسفل.",
    ],
  },
  {
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    nameAr: "رفع الساق واقفًا",
    description:
      "تمرين بسيط يطوّر قوة عضلات الساق الخلفية ويحسّن الاستقرار أثناء المشي.",
    intensity: "light",
    equipment: ["bodyweight", "dumbbell"],
    primaryMuscle: "calves",
    muscles: ["calves"],
    gif: "https://media.musclewiki.com/media/uploads/movements/bodyweight/Bodyweight_Calf_Raise/Bodyweight-Calf-Raise-front.gif",
    tips: [
      "قف على كامل القدم ثم ارفع الكعبين تدريجيًا حتى تلامس أصابع القدم الأرض فقط.",
      "توقف لحظة في أعلى الحركة مع الضغط على عضلات الساق.",
      "انزل ببطء للحفاظ على التحكم ومنع الارتداد السريع.",
    ],
  },
];

const MUSCLE_ALIAS_MAP: Record<string, ExerciseMuscle[]> = {
  legs: ["thighs", "hamstrings", "glutes", "calves"],
  leg: ["thighs", "hamstrings", "glutes", "calves"],
  quadriceps: ["thighs"],
  quads: ["thighs"],
  thigh: ["thighs"],
  thighs: ["thighs"],
  hip: ["hips", "glutes"],
  hips: ["hips", "glutes"],
  glute: ["glutes"],
  gluteals: ["glutes"],
  hamstring: ["hamstrings"],
  hamstrings: ["hamstrings"],
  knee: ["thighs", "hamstrings"],
  lumbar: ["lower_back"],
  "lower back": ["lower_back"],
  back: ["upper_back", "lower_back"],
  spine: ["lower_back"],
  core: ["core"],
  abs: ["core"],
  abdominal: ["core"],
  abdominals: ["core"],
  shoulder: ["shoulders"],
  shoulders: ["shoulders"],
  chest: ["chest"],
  calf: ["calves"],
  calves: ["calves"],
};

const MUSCLE_SET = new Set<ExerciseMuscle>(EXERCISE_MUSCLES);

const NAME_INDEX = new Map<string, Exercise>();

for (const exercise of EXERCISES) {
  registerName(exercise.name, exercise);
  registerName(exercise.nameAr, exercise);
  registerName(exercise.id, exercise);
}

function registerName(name: string | undefined, exercise: Exercise) {
  if (!name) return;
  const normalized = normalize(name);
  if (!normalized) return;
  if (!NAME_INDEX.has(normalized)) {
    NAME_INDEX.set(normalized, exercise);
  }
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveMuscleTargets(query: string): ExerciseMuscle[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const targets = new Set<ExerciseMuscle>();
  if (MUSCLE_SET.has(normalized as ExerciseMuscle)) {
    targets.add(normalized as ExerciseMuscle);
  }
  const aliases = MUSCLE_ALIAS_MAP[normalized] ?? [];
  aliases.forEach((alias) => targets.add(alias));
  return Array.from(targets);
}

export function listExercises(): Exercise[] {
  return EXERCISES.slice();
}

export function getExercisesByMuscle(muscle: string): Exercise[] {
  const targets = resolveMuscleTargets(muscle);
  if (!targets.length) return [];

  const targetSet = new Set<ExerciseMuscle>(targets);
  const priority = (muscleKey: ExerciseMuscle) => {
    const index = targets.indexOf(muscleKey);
    return index === -1 ? targets.length : index;
  };

  return EXERCISES.filter((exercise) => exercise.muscles.some((m) => targetSet.has(m))).sort(
    (a, b) => priority(a.primaryMuscle) - priority(b.primaryMuscle)
  );
}

export function findExerciseByName(name: string): Exercise | null {
  const normalized = normalize(name);
  if (!normalized) return null;
  return NAME_INDEX.get(normalized) ?? null;
}

export function getDefaultExercise(): Exercise | null {
  return EXERCISES[0] ?? null;
}
