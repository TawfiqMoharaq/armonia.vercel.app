export const stripCodeFences = (t: string) =>
  (t ?? "")
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "");

export const stripInlineJson = (t: string) => {
  if (!t) return "";
  let out = t.replace(/\bjson\b/gi, "");
  out = out.replace(/\{[\s\S]{20,}\}/g, "");
  out = out.replace(/^\s*"?[a-zA-Z0-9_]+"?\s*:\s*.+$/gm, "");
  return out;
};

export const cleanModelText = (t: string) => {
  const noFences = stripCodeFences(t);
  const noJson = stripInlineJson(noFences);
  return noJson.replace(/\n{3,}/g, "\n\n").trim();
};

export const pickUiText = (data: any): string => {
  if (!data) return "";
  if (typeof data.ui_text === "string" && data.ui_text.trim()) return data.ui_text;
  if (typeof data.reply === "string" && data.reply.trim()) return data.reply;
  return cleanModelText(String(data));
};
