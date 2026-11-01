import React from "react";
import { STREAMING_PLACEHOLDER } from "./types";

/**
 * Detects if the markdown string has an unclosed code block during active streaming.
 * If so, replaces the in-flight unclosed code with a stable placeholder to eliminate screen jitter.
 *
 * @param rawContent The incoming raw markdown content.
 * @param isStreaming Whether streaming completion is currently in flight.
 * @returns Sanitized and stabilized markdown string.
 */
export function processStreamingCodeBlocks(
  rawContent: string,
  isStreaming: boolean,
): string {
  if (!isStreaming) return rawContent;

  // Split by triple backticks
  const parts = rawContent.split("```");
  // If parts.length is even, there is an odd number of delimiters -> last code block is unclosed
  if (parts.length % 2 === 0) {
    const unclosedPart = parts[parts.length - 1];
    const firstNewlineIndex = unclosedPart.indexOf("\n");
    let lang = "code";
    let body = "";
    if (firstNewlineIndex !== -1) {
      lang = unclosedPart.slice(0, firstNewlineIndex).trim() || "code";
      body = unclosedPart.slice(firstNewlineIndex + 1);
    } else {
      lang = unclosedPart.trim() || "code";
      body = "";
    }

    const closedParts = parts.slice(0, parts.length - 1);
    const fence = "```";
    return (
      closedParts.join(fence) +
      fence +
      lang +
      " is-streaming\n" +
      body +
      "\n" +
      fence
    );
  }

  return rawContent;
}

/**
 * Normalizes various LaTeX math formats emitted by LLMs into canonical Markdown math syntax ($ and $$).
 * Handles brackets like `\[...\]`, `\(...\)`, environments like `\begin{aligned}...\end{aligned}`,
 * and parenthesized inline equations while preserving code blocks.
 *
 * @param content The incoming raw or cleaned markdown string.
 * @returns Normalized markdown string with standard $ and $$ math delimiters.
 */
export function normalizeLatexMath(content: string): string {
  if (!content) return "";

  // [Preservation] Split by fenced and inline code blocks to protect code contents
  const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const segments = content.split(codeBlockRegex);

  for (let i = 0; i < segments.length; i += 2) {
    let s = segments[i];

    // [Standard] Convert explicit LaTeX display delimiters: \[ ... \] -> $$ ... $$
    s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`);

    // [Standard] Convert explicit LaTeX inline delimiters: \( ... \) -> $ ... $
    s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);

    // [Compatibility] Convert unescaped bracketed display blocks like [ \theta ... ] or [ \begin{...} ... ]
    s = s.replace(/(?:^|\n)\[\s*(\\[a-zA-Z]+[\s\S]*?)\]\s*(?:\n|$)/g, (_, math) => {
      return `\n\n$$\n${math.trim()}\n$$\n\n`;
    });

    // [Compatibility] Wrap standalone LaTeX environments (\begin{aligned}...) in $$ if not wrapped
    s = s.replace(
      /(?:^|[^\$])(\\begin\{(?:aligned|align\*?|equation\*?|gather\*?|matrix|pmatrix|bmatrix|vmatrix|cases)\}[\s\S]*?\\end\{(?:aligned|align\*?|equation\*?|gather\*?|matrix|pmatrix|bmatrix|vmatrix|cases)\})/g,
      (match, env) => {
        const idx = s.indexOf(match);
        const before = s.slice(Math.max(0, idx - 5), idx);
        if (before.includes("$$")) return match;
        return `\n\n$$\n${env.trim()}\n$$\n\n`;
      }
    );

    // [Segmentation] Process math blocks and non-math text separately
    const mathParts = s.split(/(\$\$[\s\S]*?\$\$)/g);
    for (let j = 0; j < mathParts.length; j++) {
      if (mathParts[j].startsWith("$$")) {
        // [LineBreak] Fix single backslash linebreaks in aligned environments (e.g. "g_t\ v_t &=" -> "g_t \\ v_t &=")
        mathParts[j] = mathParts[j].replace(/([^\\])\\\s*([a-zA-Z0-9_\^\\{}]+|\\[a-zA-Z]+(?:\{[^}]*\})?)\s*&=/g, "$1 \\\\\n$2 &=");
      } else {
        // [Inline] Convert parenthesized LaTeX formulas like (g_t = \nabla...) to ($g_t = \nabla...$)
        mathParts[j] = mathParts[j].replace(/\(([^()\n]*?\\[a-zA-Z]+[^()\n]*?)\)/g, (m, inner) => {
          if (inner.includes("$")) return m;
          return `($${inner.trim()}$)`;
        });
      }
    }

    segments[i] = mathParts.join("");
  }

  return segments.join("");
}

/**
 * Recursively extracts plain text from React nodes.
 *
 * @param node ReactNode to inspect.
 * @returns Plain text representation.
 */
export function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractTextFromNode).join("");
  if (React.isValidElement(node) && node.props && (node.props as any).children) {
    return extractTextFromNode((node.props as any).children);
  }
  return "";
}
