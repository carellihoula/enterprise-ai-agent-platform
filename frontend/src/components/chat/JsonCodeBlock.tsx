"use client";

import React, { useMemo } from "react";

interface JsonCodeBlockProps {
  value: unknown;
}

const TOKEN_REGEX =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],:])/g;

function normalizeValue(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  try {
    return JSON.stringify(raw ?? {}, null, 2);
  } catch {
    return String(raw);
  }
}

export const JsonCodeBlock: React.FC<JsonCodeBlockProps> = ({ value }) => {
  const formatted = useMemo(() => normalizeValue(value), [value]);

  const nodes = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    TOKEN_REGEX.lastIndex = 0;

    while ((match = TOKEN_REGEX.exec(formatted)) !== null) {
      if (match.index > lastIndex) {
        parts.push(formatted.slice(lastIndex, match.index));
      }
      const [full, str, colon, boolVal, numVal] = match;
      if (str) {
        if (colon) {
          parts.push(
            <span key={match.index} className="text-sky-700 dark:text-sky-300">
              {str}
            </span>,
          );
          parts.push(
            <span key={`${match.index}-c`} className="text-zinc-500">
              {colon}
            </span>,
          );
        } else {
          parts.push(
            <span key={match.index} className="text-blue-900 dark:text-sky-200">
              {str}
            </span>,
          );
        }
      } else if (boolVal) {
        parts.push(
          <span key={match.index} className="text-red-600 dark:text-red-400">
            {full}
          </span>,
        );
      } else if (numVal) {
        parts.push(
          <span key={match.index} className="text-sky-700 dark:text-sky-300">
            {full}
          </span>,
        );
      } else {
        parts.push(
          <span key={match.index} className="text-zinc-500">
            {full}
          </span>,
        );
      }
      lastIndex = TOKEN_REGEX.lastIndex;
    }

    if (lastIndex < formatted.length) {
      parts.push(formatted.slice(lastIndex));
    }
    return parts;
  }, [formatted]);

  return (
    <pre className="m-0 px-3 py-2 overflow-auto max-h-56 text-[12px] leading-relaxed font-mono text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap break-words">
      {nodes}
    </pre>
  );
};
