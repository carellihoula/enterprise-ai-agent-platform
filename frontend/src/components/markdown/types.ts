/**
 * Type definitions and constants for the Markdown rendering subsystem.
 */

export interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export const STREAMING_PLACEHOLDER = "__STREAMING_CODE_BLOCK_ACTIVE__";
