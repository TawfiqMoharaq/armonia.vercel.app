export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string[];
  tips: string[];
  gif: string;
  coachType?: "squat" | "none";
};

export const EXERCISES: Exercise[] = [
  {
    id: "squat_bw",
    name: "Bodyweight Squat",
    muscleGroup: ["thighs"],
    tips: [
      "ثبّت الكعبين على الأرض",
      "ادفع الوركين للخلف أولًا",
      "حافظ على ظهر محايد وصدر مفتوح",
      "انزل ببطء واصعد بتحكم",
    ],
    gif: "/src/assets/squat.gif",
    coachType: "squat",
  },
];

export function getExercisesByMuscle(muscle: string) {
  return EXERCISES.filter((exercise) => exercise.muscleGroup.includes(muscle.toLowerCase()));
}
