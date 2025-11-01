// src/lib/chatFormat.ts
import type { ReactNode } from "react";

export const stripBoldMarkers = (text: string) =>
  text.replace(/\*\*(.+?)\*\*/g, "$1").trim();

export const toYoutubeSearchLink = (keywords?: string) => {
  const base = (keywords?.trim() && keywords.trim()) || "family sensory routine tips";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(base)}`;
};

export const normalizeYoutubeLink = (url: string, fallbackKeywords?: string) => {
  const lower = url.toLowerCase();
  const isYoutube = lower.includes("youtube.com") || lower.includes("youtu.be");
  if (!isYoutube) return url;
  if (
    lower.includes("example") ||
    lower.endsWith("watch?v=") ||
    lower.includes("watch?v=example") ||
    lower.endsWith("results?search_query=")
  ) {
    return toYoutubeSearchLink(fallbackKeywords);
  }
  return url;
};

export const renderInline = (text: string, fallbackKeywords?: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  let remaining = text;

  const pushPlain = (segment: string) => {
    if (!segment) return;
    const urlPattern = /(https?:\/\/[^\s\)]+)/g;
    let lastIndex = 0;
    segment.replace(urlPattern, (match, _p1, offset) => {
      const url = normalizeYoutubeLink(match, fallbackKeywords);
      if (offset > lastIndex) nodes.push(segment.slice(lastIndex, offset));
      nodes.push(
        <a
          key={`url-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4"
        >
          {url}
        </a>,
      );
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < segment.length) nodes.push(segment.slice(lastIndex));
  };

  while (remaining.length) {
    const markdownMatch = /\[([^\]]+)\]\s*\((https?:\/\/[^\s)]+)\)/.exec(remaining);
    const boldMatch = /\*\*(.+?)\*\*/.exec(remaining);
    const urlMatch = /(https?:\/\/[^\s\)]+)/.exec(remaining);

    const matches = [
      markdownMatch ? { type: "markdown" as const, match: markdownMatch } : null,
      boldMatch ? { type: "bold" as const, match: boldMatch } : null,
      urlMatch ? { type: "url" as const, match: urlMatch } : null,
    ].filter(Boolean) as Array<{ type: "markdown" | "bold" | "url"; match: RegExpExecArray }>;

    if (!matches.length) {
      pushPlain(remaining);
      break;
    }

    const earliest = matches.reduce((prev, current) =>
      current!.match.index < prev!.match.index ? current! : prev!,
    )!;

    if (earliest.match.index > 0) pushPlain(remaining.slice(0, earliest.match.index));

    const [full, first, second] = earliest.match;

    if (earliest.type === "markdown") {
      const url = normalizeYoutubeLink(second, fallbackKeywords);
      nodes.push(
        <a
          key={`markdown-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4 font-medium"
        >
          {first}
        </a>,
      );
    } else if (earliest.type === "bold") {
      nodes.push(
        <span key={`bold-${nodes.length}`} className="font-semibold text-[#0A6D8B]">
          {stripBoldMarkers(first)}
        </span>,
      );
    } else {
      const url = normalizeYoutubeLink(full, fallbackKeywords);
      nodes.push(
        <a
          key={`raw-${nodes.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0A6D8B] underline decoration-dotted underline-offset-4"
        >
          {url}
        </a>,
      );
    }
    remaining = remaining.slice(earliest.match.index + full.length);
  }

  return nodes.filter((node) => !(typeof node === "string" && node.length === 0));
};

// ====== Parser مرن لا يعتمد على البرمبت ======
export type ParsedSection = { title: string; paras: string[]; items: string[] };

const bulletRegex = /^([•\-–—]|\d+[.)\-،]|[\u0660-\u0669]+[.)\-،])\s*/; // يدعم أرقام عربية

const isHeading = (s: string) => {
  const clean = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
  return (
    /^صباح/.test(clean) || /^مساء/.test(clean) || /^تهدئة/.test(clean) ||
    /^في المواقف/.test(clean) || /^المواقف/.test(clean) ||
    /^إذا/.test(clean) || /^نصائح/.test(clean) || /^روابط/.test(clean) ||
    /^(Power\s*Up|Cooldown|Routine)/i.test(clean) ||
    /^\*\*(.+)\*\*$/.test(s)
  );
};

const normalizeTitle = (s: string) => {
  const t = stripBoldMarkers(s.replace(/^#+\s*/, "")).replace(/[.:：]+$/, "").trim();
  if (/Power\s*Up/i.test(t)) return "صباحًا (Power Up)";
  if (/Cooldown/i.test(t) || /^تهدئة/.test(t) || /^مساء/.test(t)) return "مساءً (تهدئة)";
  if (/^المواقف/.test(t)) return "في المواقف الصعبة";
  return t;
};

export function parseReply(text: string): ParsedSection[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  const push = () => { if (current) sections.push(current); current = null; };

  lines.forEach((line) => {
    if (isHeading(line)) {
      push();
      current = { title: normalizeTitle(line), paras: [], items: [] };
      return;
    }
    if (bulletRegex.test(line)) {
      current ??= { title: "توصيات", paras: [], items: [] };
      current.items.push(stripBoldMarkers(line.replace(bulletRegex, "")));
      return;
    }
    current ??= { title: "توصيات", paras: [], items: [] };
    current.paras.push(stripBoldMarkers(line));
  });

  push();
  return sections.length ? sections : [{ title: "توصيات", paras: lines, items: [] }];
}

export const iconAndClass = (title: string) => {
  if (/^صباح/.test(title)) return { icon: "🚀", cls: "text-blue-600" };
  if (/^مساء/.test(title) || /^تهدئة/.test(title)) return { icon: "🌙", cls: "text-purple-600" };
  if (/^في المواقف/.test(title) || /^إذا/.test(title)) return { icon: "😣", cls: "text-orange-600" };
  return { icon: "✨", cls: "text-[#0A6D8B]" };
};
