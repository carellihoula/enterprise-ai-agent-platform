"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { fetchSystemHealth } from "@/lib/api";

interface AuthShellProps {
  instanceLabel?: string | null;
  below?: React.ReactNode;
  children: React.ReactNode;
}

type FooterTopic = "terms" | "privacy" | "security" | "status" | null;

const STATIC_INFO: Record<Exclude<FooterTopic, null | "status">, { title: string; body: string }> = {
  terms: {
    title: "Terms of Service",
    body: "Access to this platform is restricted to authorized users of your workspace. API keys and access tokens are personal and governed by your organization's RBAC policies.",
  },
  privacy: {
    title: "Privacy Policy",
    body: "Your conversations and uploaded files are isolated per workspace and per user. Attachments are stored in your private S3/MinIO bucket and automatically deleted with the session.",
  },
  security: {
    title: "Platform Security",
    body: "Passwords are hashed with Argon2id, sessions use HttpOnly cookies with token rotation and reuse detection, and tool calls are protected by DLP, prompt-injection scanning, and HITL approvals.",
  },
};

/**
 * GitHub-style centered authentication shell with interactive legal/status footer.
 */
export const AuthShell: React.FC<AuthShellProps> = ({ instanceLabel, below, children }) => {
  const [topic, setTopic] = useState<FooterTopic>(null);
  const [healthText, setHealthText] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const openStatus = async () => {
    setTopic("status");
    setLoadingHealth(true);
    setHealthText(null);
    try {
      const data = await fetchSystemHealth();
      setHealthText(
        `API operational (${data.status}) · ${data.app_name} · environment: ${data.environment}`,
      );
    } catch (err) {
      setHealthText(err instanceof Error ? err.message : "Backend service unavailable.");
    } finally {
      setLoadingHealth(false);
    }
  };

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
          <button type="button" onClick={() => setTopic("terms")} className="hover:underline cursor-pointer">
            Terms
          </button>
          <button type="button" onClick={() => setTopic("privacy")} className="hover:underline cursor-pointer">
            Privacy
          </button>
          <button type="button" onClick={() => setTopic("security")} className="hover:underline cursor-pointer">
            Security
          </button>
          <button type="button" onClick={openStatus} className="hover:underline cursor-pointer">
            Service status
          </button>
        </footer>
      </div>

      {topic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setTopic(null)}
        >
          <div
            className="w-full max-w-md rounded-[12px] border border-[#d1d9e0] bg-white p-5 shadow-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1f2328]">
                {topic === "status" ? "Service status" : STATIC_INFO[topic].title}
              </h2>
              <button
                type="button"
                onClick={() => setTopic(null)}
                className="p-1 rounded text-[#59636e] hover:bg-[#eaeef2] cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-[#59636e] leading-relaxed">
              {topic === "status"
                ? loadingHealth
                  ? "Checking API status…"
                  : healthText
                : STATIC_INFO[topic].body}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
