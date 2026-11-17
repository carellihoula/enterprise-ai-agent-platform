"use client";

import React from "react";

interface AuthShellProps {
  instanceLabel?: string | null;
  below?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * GitHub-style centered authentication shell faithfully matching the reference layout.
 */
export const AuthShell: React.FC<AuthShellProps> = ({ instanceLabel, below, children }) => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-4 bg-[#f6f8fa] text-[#1f2328] px-4 py-10 text-[14px] leading-[1.5] antialiased">
      <div className="w-full max-w-[400px] flex flex-col gap-4">
        <div
          className="mx-auto grid place-items-center w-[44px] h-[44px] rounded-[12px] bg-[#1f2328] text-white"
          aria-hidden="true"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 32 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 22 16 10l7 12" />
            <path d="M9 22h14" />
            <circle cx="16" cy="10" r="3" fill="currentColor" />
            <circle cx="9" cy="22" r="3" fill="currentColor" />
            <circle cx="23" cy="22" r="3" fill="currentColor" />
          </svg>
        </div>

        {instanceLabel && (
          <span className="self-center px-[10px] py-[2px] border border-[#d1d9e0] rounded-full bg-white font-mono text-[12px] leading-[20px] text-[#59636e]">
            {instanceLabel}
          </span>
        )}

        <main className="flex flex-col gap-[18px] p-6 border border-[#d1d9e0] rounded-[12px] bg-white shadow-[0_1px_2px_rgba(31,35,40,0.06),0_8px_24px_rgba(31,35,40,0.06)]">
          {children}
        </main>

        {below && (
          <div className="px-4 py-[14px] border border-[#d1d9e0] rounded-[12px] text-center text-[13px] text-[#59636e]">
            {below}
          </div>
        )}

        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-[#59636e]">
          <button type="button" className="hover:underline cursor-pointer">
            Conditions
          </button>
          <button type="button" className="hover:underline cursor-pointer">
            Confidentialité
          </button>
          <button type="button" className="hover:underline cursor-pointer">
            Sécurité
          </button>
          <button type="button" className="hover:underline cursor-pointer">
            État du service
          </button>
        </footer>
      </div>
    </div>
  );
};
