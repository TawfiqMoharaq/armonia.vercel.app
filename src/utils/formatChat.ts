// أدوات تنسيق وتنظيف ردود الشات

// يحذف أي أسوار كود (بما فيها ```json ... ``` )
export const stripCodeFences = (t: string) =>
  (t ?? "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "");

// يحاول إزالة كتل JSON غير المُسوّرة (احتياط)
export const stripInlineJson = (t: string) => {
  if (!t) return "";
  // يمسح كلمة "json" المنفصلة التي تزعج العرض
  let out = t.replace(/\bjson\b/gi, "");

  // يمسح كتل تشبه JSON كبيرة (بين أقواس معقوفة متعددة الأسطر)
  out = out.replace(/\{[\s\S]{20,}\}/g, "");

  // يمسح الأسطر التي تبدو كمفاتيح JSON مثل: "exercise": "Push-Ups"
  out = out.replace(/^\s*"?[a-zA-Z0-9_]+"?\s*:\s*.+$/gm, "");

  return out;
};

// تنظيف شامل: أزل أسوار الكود + أي JSON طائش + فرّغ المسافات
export const cleanModelText = (t: string) => {
  const noFences = stripCodeFences(t);
  const noJson = stripInlineJson(noFences);
  return noJson.replace(/\n{3,}/g, "\n\n").trim();
};

// استخرج نص العرض من استجابة الـ API (توافق خلفي)
export const pickUiText = (data: any): string => {
  if (!data) return "";
  if (typeof data.ui_text === "string" && data.ui_text.trim()) return data.ui_text;
  if (typeof data.reply === "string" && data.reply.trim()) return data.reply;
  // أحيانًا المودل يرجّع JSON كنص؛ نحاول تنظيفه
  return cleanModelText(String(data));
};
