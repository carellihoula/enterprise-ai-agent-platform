import React, { useState, useRef } from "react";
import { Check, Copy } from "lucide-react";

interface TableBlockProps {
  children?: React.ReactNode;
}

/**
 * Table container component with header bar, copy table button, and responsive scroll.
 */
export const TableBlock: React.FC<TableBlockProps> = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleCopyTable = async () => {
    if (tableRef.current) {
      try {
        const rows = Array.from(tableRef.current.querySelectorAll("tr"));
        if (rows.length === 0) return;

        // Generate Markdown table representation
        const getRowCells = (row: Element) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) =>
            (cell.textContent || "")
              .replace(/<br\s*\/?>/gi, " ")
              .trim()
              .replace(/\|/g, "\\|"),
          );

        const headers = getRowCells(rows[0]);
        const separator = headers.map(() => "---");
        const bodyRows = rows.slice(1).map((row) => getRowCells(row));

        const markdownContent = [
          `| ${headers.join(" | ")} |`,
          `| ${separator.join(" | ")} |`,
          ...bodyRows.map((cells) => `| ${cells.join(" | ")} |`),
        ].join("\n");

        // Extract HTML table representation
        const htmlContent = tableRef.current.outerHTML;

        // Write both text/html and text/plain (Markdown) to clipboard
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          const item = new ClipboardItem({
            "text/html": new Blob([htmlContent], { type: "text/html" }),
            "text/plain": new Blob([markdownContent], { type: "text/plain" }),
          });
          await navigator.clipboard.write([item]);
        } else {
          await navigator.clipboard.writeText(markdownContent);
        }

        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        // Fallback to text copy if rich mime clipboard writing fails
        try {
          const rows = Array.from(tableRef.current.querySelectorAll("tr"));
          const text = rows
            .map((row) =>
              Array.from(row.querySelectorAll("th, td"))
                .map((cell) =>
                  (cell.textContent || "").replace(/<br\s*\/?>/gi, " ").trim(),
                )
                .join("\t"),
            )
            .join("\n");
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (fallbackErr) {
          console.error("Failed to copy table data", fallbackErr);
        }
      }
    }
  };

  return (
    <div className="my-4 w-full flex flex-col items-end">
      {/* Copy Button (Outside table, top right, always visible, icon only, neutral) */}
      <div className="flex justify-end mb-1">
        <button
          onClick={handleCopyTable}
          type="button"
          title={copied ? "Copied" : "Copy table"}
          className="flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md h-6 w-6 transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-zinc-700" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 shadow-2xs">
        <table
          ref={tableRef}
          className="w-full text-left text-[13px] border-collapse"
        >
          {children}
        </table>
      </div>
    </div>
  );
};
