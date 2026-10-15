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
