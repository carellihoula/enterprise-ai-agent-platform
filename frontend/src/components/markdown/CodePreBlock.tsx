import React, { useState, useRef, useMemo, useEffect } from "react";
import { Check, Copy, Loader2, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodePreBlockProps {
  children?: React.ReactNode;
  node?: any;
}

/**
 * Pre block container with language header, real-time streaming spinner,
 * dark / light (GPT grey) theme toggle, and neutral copy button.
 */
export const CodePreBlock: React.FC<CodePreBlockProps> = ({ children, node }) => {
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const preRef = useRef<HTMLPreElement>(null);

  // [Theme Sync] Read initial code theme from localStorage and sync across all code blocks
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("code_block_theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
      }
    }
  }, []);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<"dark" | "light">;
      if (customEvent.detail && customEvent.detail !== theme) {
        setTheme(customEvent.detail);
      }
    };
    window.addEventListener("code-theme-change", handleThemeChange);
    return () => window.removeEventListener("code-theme-change", handleThemeChange);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("code_block_theme", nextTheme);
      window.dispatchEvent(
        new CustomEvent("code-theme-change", { detail: nextTheme }),
      );
    }
  };

  // Extract language tag and verify whether this code block is actively receiving streamed tokens
  const { isStreaming, detectedLang } = useMemo(() => {
    const codeNode = (node as any)?.children?.[0];
    const isCodeStreaming = Boolean(
      codeNode?.data?.meta && String(codeNode.data.meta).includes("is-streaming"),
    );

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
    return { isStreaming: isCodeStreaming, detectedLang: lang };
  }, [children, node]);

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

  const isDark = theme === "dark";

  return (
    <div
      className={cn(
        "relative my-4 rounded-xl overflow-hidden border transition-colors shadow-2xs group",
        isDark
          ? "border-zinc-800 bg-[#0d1117] text-zinc-100"
          : "border-zinc-300/80 bg-[#f4f4f5] text-zinc-900",
      )}
    >
      {/* Code Header Bar */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-1.5 border-b text-xs select-none transition-colors",
          isDark
            ? "bg-[#161b22] border-zinc-800 text-zinc-400"
            : "bg-[#e4e4e7] border-zinc-300/80 text-zinc-700",
        )}
      >
        {/* Left: Language Tag & Simple Animated Streaming Spinner */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[11px] uppercase tracking-wider font-semibold",
              isDark ? "text-zinc-400" : "text-zinc-700",
            )}
          >
            {detectedLang}
          </span>
          {isStreaming && (
            <Loader2
              className={cn(
                "w-3.5 h-3.5 animate-spin",
                isDark ? "text-zinc-400" : "text-zinc-600",
              )}
            />
          )}
        </div>

        {/* Right Action Buttons: Theme Toggle (Dark / Light) & Copy Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            type="button"
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className={cn(
              "flex items-center justify-center transition-colors h-7 w-7 rounded-lg",
              isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-300/70",
            )}
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={handleCopy}
            type="button"
            title={copied ? "Copied" : "Copy code"}
            className={cn(
              "flex items-center justify-center transition-colors h-7 w-7 rounded-lg",
              isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-300/70",
            )}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Highlighted Code Container */}
      <pre
        ref={preRef}
        className={cn(
          "p-4 overflow-x-auto text-[13px] font-mono leading-relaxed transition-colors",
          isDark
            ? "bg-[#0d1117] text-zinc-100 hljs [&_code]:!bg-transparent [&_.hljs]:!bg-transparent"
            : "!bg-[#f4f4f5] !text-zinc-900 border-t border-zinc-200/80 [&_code]:!bg-transparent [&_.hljs]:!bg-transparent [&_.hljs]:!text-zinc-900 [&_.hljs-keyword]:!text-rose-600 [&_.hljs-keyword]:!font-semibold [&_.hljs-string]:!text-blue-700 [&_.hljs-comment]:!text-zinc-500 [&_.hljs-comment]:!italic [&_.hljs-title]:!text-purple-600 [&_.hljs-number]:!text-blue-600 [&_.hljs-built_in]:!text-amber-700",
        )}
      >
        {children}
      </pre>
    </div>
  );
};
