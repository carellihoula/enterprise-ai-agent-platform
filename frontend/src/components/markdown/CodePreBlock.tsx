import React, { useState, useRef, useMemo } from "react";
import { Check, Copy, Loader2, Code2 } from "lucide-react";
import { STREAMING_PLACEHOLDER } from "./types";
import { extractTextFromNode } from "./markdownUtils";

interface CodePreBlockProps {
  children?: React.ReactNode;
}

/**
 * Pre block container with language header, code copy button, and syntax highlighted body.
 */
export const CodePreBlock: React.FC<CodePreBlockProps> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  // Extract raw text and language tag to verify if this is an in-flight streaming placeholder
  const { isStreamingPlaceholder, detectedLang } = useMemo(() => {
    const rawText = extractTextFromNode(children);
    const isPlaceholder = rawText.includes(STREAMING_PLACEHOLDER);
    let lang = "Code";
    try {
      const childArray = React.Children.toArray(children);
      const codeElement = childArray[0] as React.ReactElement<{
        className?: string;
      }>;
      const match = /language-(\w+)/.exec(codeElement?.props?.className || "");
      if (match) {
        lang = match[1];
      }
    } catch {
      // [Fallback] Default to generic 'Code' label
    }
    return { isStreamingPlaceholder: isPlaceholder, detectedLang: lang };
  }, [children]);

  const handleCopy = async () => {
    if (preRef.current) {
      try {
        const text = preRef.current.innerText || "";
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy code snippet", err);
      }
    }
  };

  // If currently streaming, display an animated spinner and loading indicator inside the code container
  if (isStreamingPlaceholder) {
    return (
      <div className="relative my-4 rounded-xl overflow-hidden border border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-zinc-800 text-xs text-zinc-400 select-none">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-zinc-300">
              {detectedLang}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300 bg-zinc-800/90 px-2.5 py-0.5 rounded-full border border-zinc-700/60 shadow-xs">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Generating code...</span>
            </span>
          </div>
        </div>
        <div className="py-8 px-4 flex flex-col items-center justify-center gap-3 bg-[#0d1117] text-zinc-400 select-none">
          <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
            <Code2 className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>
              Streaming {detectedLang !== "Code" ? detectedLang : "code"} in
              real-time...
            </span>
          </div>
          <div className="w-44 h-1.5 bg-zinc-800/80 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-indigo-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-zinc-800 bg-[#0d1117] text-zinc-100 shadow-sm group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#161b22] border-b border-zinc-800 text-xs text-zinc-400 select-none">
        <span className="font-mono text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
          {detectedLang}
        </span>
        {/* Copy Button (icon only, neutral styling, no text) */}
        <button
          onClick={handleCopy}
          type="button"
          title={copied ? "Copied" : "Copy code"}
          className="flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors h-7 w-7 rounded-lg hover:bg-zinc-800"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-zinc-200" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </button>
      </div>

      {/* Highlighted Code Container */}
      <pre
        ref={preRef}
        className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed bg-[#0d1117] text-zinc-100 hljs"
      >
        {children}
      </pre>
    </div>
  );
};
