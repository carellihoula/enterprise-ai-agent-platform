"use client";

import React, { useMemo } from "react";
import hljs from "highlight.js";
import { cn } from "@/lib/utils";
import { extractTextFromNode } from "./markdownUtils";

// [Configuration] Whitelist of known programming language identifiers for prefix stripping
const KNOWN_LANGUAGES = new Set([
  "python", "py", "javascript", "js", "typescript", "ts", "jsx", "tsx",
  "bash", "sh", "shell", "zsh", "json", "yaml", "yml", "toml",
  "html", "css", "scss", "sass", "sql", "rust", "rs", "go", "golang",
  "cpp", "c", "csharp", "cs", "java", "kotlin", "swift", "php", "ruby", "rb",
  "dockerfile", "graphql", "markdown", "md", "xml"
]);

interface InlineCodeBlockProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/**
 * Handles inline code elements, with automated detection and normalization of multi-line
 * code blocks generated with synthetic <br> tags (frequently produced by LLMs inside Markdown tables).
 */
export const InlineCodeBlock: React.FC<InlineCodeBlockProps> = ({
  children,
  className,
  ...props
}) => {
  const parsed = useMemo(() => {
    const rawText = extractTextFromNode(children);
    if (!/<br\s*\/?>/i.test(rawText)) {
      return null;
    }

    let text = rawText;
    let detectedLang: string | undefined;

    // [Extraction] Strip language prefix attached to first <br> tag (e.g. python<br>...)
    const langMatch = text.match(/^([a-zA-Z0-9_+#.-]+)<br\s*\/?>/i);
    if (langMatch) {
      const candidate = langMatch[1].toLowerCase();
      if (KNOWN_LANGUAGES.has(candidate)) {
        detectedLang = candidate;
        text = text.slice(langMatch[0].length);
      }
    }

    // [Formatting] Replace <br> tags with standard newlines and trim excess vertical boundaries
    const cleanCode = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");

    // [Syntax Highlighting] Highlight code tokens using highlight.js
    let highlightedHtml: string;
    try {
      if (detectedLang && hljs.getLanguage(detectedLang)) {
        highlightedHtml = hljs.highlight(cleanCode, { language: detectedLang }).value;
      } else {
        highlightedHtml = hljs.highlightAuto(cleanCode).value;
      }
    } catch {
      // [Fallback] HTML-escape raw characters if syntax highlighting encounters an error
      highlightedHtml = cleanCode
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    return {
      lang: detectedLang,
      cleanCode,
      highlightedHtml,
    };
  }, [children]);

  // Standard inline badge rendering when no multi-line <br> tags are present
  if (!parsed) {
    return (
      <code
        className={cn(
          "px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-800 font-mono text-[12px] border border-zinc-200/60",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  }

  // [Rendering] Multi-line styled code block with syntax highlighting for table cells & structured text
  return (
    <div
      className={cn(
        "my-1.5 text-left rounded-lg overflow-hidden border border-zinc-800 bg-[#0d1117] text-zinc-100 font-mono text-[12px] shadow-2xs",
        className
      )}
      {...props}
    >
      {parsed.lang && (
        <div className="px-2.5 py-0.5 bg-[#161b22] border-b border-zinc-800 text-[10px] uppercase font-semibold text-zinc-400 select-none">
          {parsed.lang}
        </div>
      )}
      <pre className="p-2.5 overflow-x-auto whitespace-pre leading-relaxed font-mono">
        <code
          className={parsed.lang ? `hljs language-${parsed.lang}` : "hljs"}
          dangerouslySetInnerHTML={{ __html: parsed.highlightedHtml }}
        />
      </pre>
    </div>
  );
};
