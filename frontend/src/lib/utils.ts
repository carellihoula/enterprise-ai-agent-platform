import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes raw serialized LLM content blocks (such as LangChain Google GenAI list blocks)
 * into pure human-readable text.
 *
 * @param raw - The input string that may contain serialized content block arrays.
 * @returns The sanitized, human-readable text string.
 */
export function cleanSerializedContentBlocks(raw: string): string {
  // [Performance] Short-circuit if string does not contain serialized block signatures
  if (!raw || (!raw.includes("[{'type'") && !raw.includes('[{"type"'))) {
    return raw;
  }

  // [Extraction] Extract 'text' payload from JSON/Python-serialized blocks and strip empty arrays
  return raw.replace(
    /\[\s*\{\s*['"]type['"]\s*:\s*['"]text['"]\s*,\s*['"]text['"]\s*:\s*['"]([\s\S]*?)['"][\s\S]*?\}\s*\]|\[\]/g,
    (_, p1) => p1 || ''
  );
}
