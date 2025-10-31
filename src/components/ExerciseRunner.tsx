// +++ فقط الجزء العلوي والـwrapper +++
type RunnerProps = {
  title: string;
  gif?: string | null;
  onClose?: () => void;
  // NEW
  variant?: "card" | "flat"; // flat = بدون حدود/ظل (فل-بليد)
};

export default function ExerciseRunner({
  title,
  gif,
  onClose,
  variant = "card",
}: RunnerProps) {

  // ... بقية الهُوكس كما هي ...

  const wrapperClass =
    variant === "flat"
      ? // فل-بليد: لا حدود، لا ظل، حواف خفيفة فقط
        "grid gap-6 md:grid-cols-[minmax(720px,1fr)_320px] w-full"
      : // الوضع القديم (كارد)
        "grid gap-6 md:grid-cols-[minmax(720px,1fr)_320px] rounded-3xl border border-white/15 bg-black/80 p-3 shadow-lg";

  return (
    <div className={wrapperClass}>
      {/* الكاميرا (كما هي تماماً) */}
      <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-black">
        {/* زر التشغيل/الإيقاف … الخ */}
        {/* ... بقية الكود بدون تغيير ... */}
      </div>

      {/* عمود الـGIF والعنوان */}
      <aside className="space-y-3">
        <h2 className="text-2xl font-bold text-[#0A6D8B]">{title}</h2>
        {gif && (
          <div className="rounded-3xl bg-white/80 p-2">
            <img src={gif} alt={title} className="w-full rounded-2xl object-contain" />
          </div>
        )}
        {/* النصائح الجانبية كما كانت */}
        {/* ... */}
      </aside>
    </div>
  );
}
