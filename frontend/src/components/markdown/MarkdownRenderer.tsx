"use client";

/**
 * Enterprise Markdown Renderer with Highlight.js syntax highlighting,
 * GitHub Flavored Markdown (tables, checklists), code streaming stabilization,
 * and neutral (non-green) copy feedback.
 */

import React, { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github-dark.css";
import { cn, cleanSerializedContentBlocks } from "@/lib/utils";
import { MarkdownRendererProps } from "./types";
import { processStreamingCodeBlocks } from "./markdownUtils";
import { CodePreBlock } from "./CodePreBlock";
import { TableBlock } from "./TableBlock";
import { InlineCodeBlock } from "./InlineCodeBlock";

const MarkdownRendererBase: React.FC<MarkdownRendererProps> = ({
  content,
  isStreaming = false,
  className,
}) => {
  // [Preprocessing] Clean synthetic serialized artifacts and stabilize streaming code blocks
  const processedContent = useMemo(() => {
    const cleaned = cleanSerializedContentBlocks(content || "");
    return processStreamingCodeBlocks(cleaned, isStreaming);
  }, [content, isStreaming]);

  return (
    <div
      className={cn(
        "prose prose-zinc max-w-none text-zinc-800 text-sm leading-relaxed break-words",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-bold text-zinc-900 mt-5 mb-2.5 pb-1 border-b border-zinc-200">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold text-zinc-900 mt-4 mb-2 pb-0.5 border-b border-zinc-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-zinc-800 mt-3.5 mb-1.5">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          hr: () => (
            // [UI/Visual] Render a subtle, muted horizontal divider line between sections
            <hr className="my-3.5 border-0 border-t border-zinc-200/60 dark:border-zinc-800/80" />
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 text-zinc-700">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 text-zinc-700">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            // [UI/Visual] Callout/blockquote container with indigo accent bar and matching text-sm font size
            <blockquote className="my-3 pl-3.5 border-l-2 border-indigo-500 bg-indigo-50/30 py-2 text-zinc-700 rounded-r-lg italic text-sm">
              {children}
            </blockquote>
          ),
          table: ({ children }) => <TableBlock>{children}</TableBlock>,
          thead: ({ children }) => (
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-semibold text-xs uppercase tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-200 bg-white">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-zinc-50/80 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-zinc-600">{children}</td>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2 font-medium"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return <InlineCodeBlock {...props}>{children}</InlineCodeBlock>;
            }
            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, node, ...props }) => (
            <CodePreBlock node={node} {...props}>
              {children}
            </CodePreBlock>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownRenderer = memo(MarkdownRendererBase);
export default MarkdownRenderer;
