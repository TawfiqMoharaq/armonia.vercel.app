import React from "react";
import ReactMarkdown from "react-markdown";
import { cleanModelText } from "@/utils/formatChat";

type Props = {
  text: string;       // نص خام من الـAPI
  youtube?: string;   // رابط يوتيوب (اختياري)
};

export default function ChatMessageView({ text, youtube }: Props) {
  const pretty = cleanModelText(text);

  return (
    <div className="rounded-2xl px-4 py-3 bg-white/70 shadow-sm border border-slate-200">
      <ReactMarkdown
        // منع كتل الكود من الظهور — نعرض فقط نص عادي
        components={{
          code: ({ children, inline, ...props }) =>
            inline ? (
              <code className="px-1 py-0.5 rounded bg-slate-100" {...props}>
                {children}
              </code>
            ) : (
              <span className="font-normal" {...props} />
            ),
          h1: ({ children }) => <h3 className="text-lg font-bold mt-2 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-lg font-bold mt-2 mb-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-base font-semibold mt-2 mb-1">{children}</h4>,
          h4: ({ children }) => <h5 className="text-base font-semibold mt-2 mb-1">{children}</h5>,
          ul: ({ children }) => <ul className="list-disc ms-6 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal ms-6 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          p: ({ children }) => <p className="my-1 leading-7">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="opacity-90">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline text-[#0A6D8B] hover:text-[#075a70]"
            >
              {children}
            </a>
          ),
        }}
      >
        {pretty}
      </ReactMarkdown>

      {youtube && (
        <div className="mt-2">
          <a
            href={youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#0A6D8B] font-medium hover:text-[#075a70]"
          >
            🔗 فيديو مقترح على يوتيوب
          </a>
        </div>
      )}
    </div>
  );
}
