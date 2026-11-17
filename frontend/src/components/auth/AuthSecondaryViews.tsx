"use client";

import React, { useState } from "react";
import { AlertCircle, Check, ChevronLeft, Eye, EyeOff, Info } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  confirmPasswordReset,
  discoverOidc,
  getBackendOrigin,
  requestPasswordReset,
} from "@/lib/api";

interface SecondaryViewProps {
  onBack: () => void;
  initialResetToken?: string | null;
}

export const ForgotPasswordView: React.FC<SecondaryViewProps> = ({ onBack, initialResetToken }) => {
  const [email, setEmail] = useState("");
  const token = initialResetToken || "";
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [step, setStep] = useState<"request" | "sent" | "reset" | "done">(
    initialResetToken ? "reset" : "request",
  );
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setBusy(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setInfoMsg(res.message);
      setStep("sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reset request.";
      setErrMsg(msg);
      toast.add({ title: "Reset failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    if (!token.trim()) {
      setErrMsg("Invalid or missing reset link.");
      return;
    }
    if (newPassword.length < 8) {
      setErrMsg("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(token.trim(), newPassword);
      // [Security] Strip the one-time reset token from the browser URL once consumed
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
      toast.add({
        title: "Password updated",
        description: "You can now sign in with your new password.",
        variant: "success",
      });
      setStep("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid or expired reset link.";
      setErrMsg(msg);
      toast.add({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[13px] text-[#59636e] hover:text-[#1f2328] cursor-pointer"
      >
        <ChevronLeft className="w-[14px] h-[14px]" />
        <span>Back to sign in</span>
      </button>

      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          Forgot password
        </h1>
        <p className="mt-1 text-[#59636e]">
          {step === "request"
            ? "Enter your email address to receive a password reset link."
            : step === "sent"
              ? "Check your inbox to continue."
              : step === "reset"
                ? "Choose a new password for your account."
                : "Your password has been reset successfully."}
        </p>
      </div>

      {errMsg && (
        <div
          role="alert"
          className="flex gap-[10px] items-start px-3 py-[10px] border border-[#cf222e] rounded-[8px] bg-[#ffebe9] text-[13px]"
        >
          <AlertCircle className="w-4 h-4 text-[#cf222e] shrink-0 mt-0.5" />
          <span className="text-[#1f2328]">{errMsg}</span>
        </div>
      )}

      {step === "request" && (
        <form onSubmit={handleRequest} className="flex flex-col gap-4 m-0">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="forgot-email" className="text-[13px] font-medium text-[#1f2328]">
              Email address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)]"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-[36px] px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      {step === "sent" && (
        <>
          <div
            role="status"
            className="flex gap-[10px] items-start px-3 py-[10px] border border-[#0550ae] rounded-[8px] bg-[#ddf4ff] text-[13px]"
          >
            <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
            <span className="text-[#1f2328]">
              {infoMsg ||
                "If an account matches that address, a password reset email has been sent."}
            </span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full h-[36px] px-[14px] border border-[#d1d9e0] rounded-[6px] bg-white text-[13px] font-medium hover:bg-[#f6f8fa] cursor-pointer"
          >
            Back to sign in
          </button>
        </>
      )}

      {step === "reset" && (
        <form onSubmit={handleConfirm} className="flex flex-col gap-4 m-0">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="reset-pw" className="text-[13px] font-medium text-[#1f2328]">
              New password
            </label>
            <div className="relative">
              <input
                id="reset-pw"
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-[36px] pl-3 pr-10 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)]"
              />
              <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                aria-label={showPw ? "Hide" : "Show"}
                className="absolute right-[3px] top-[3px] grid place-items-center w-[30px] h-[30px] rounded-[5px] text-[#59636e] hover:bg-[#eaeef2] cursor-pointer"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-[36px] px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Updating…" : "Reset password"}
          </button>
        </form>
      )}

      {step === "done" && (
        <>
          <div
            role="status"
            className="flex gap-[10px] items-start px-3 py-[10px] border border-[#1a7f37] rounded-[8px] bg-[#dafbe1] text-[13px]"
          >
            <Check className="w-4 h-4 text-[#1a7f37] shrink-0 mt-0.5" />
            <span className="text-[#1f2328]">Password updated successfully.</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full h-[36px] px-[14px] border border-[#d1d9e0] rounded-[6px] bg-white text-[13px] font-medium hover:bg-[#f6f8fa] cursor-pointer"
          >
            Back to sign in
          </button>
        </>
      )}
    </>
  );
};

export const SsoLookupView: React.FC<SecondaryViewProps> = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSso = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfoMsg(null);
    setBusy(true);
    try {
      const res = await discoverOidc({ email: email.trim() });
      if (res.configured && res.authorize_url) {
        window.location.href = `${getBackendOrigin()}${res.authorize_url}`;
        return;
      }
      setInfoMsg(res.message || "SSO/OIDC is not configured on this instance.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OIDC discovery error.";
      toast.add({ title: "SSO unavailable", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[13px] text-[#59636e] hover:text-[#1f2328] cursor-pointer"
      >
        <ChevronLeft className="w-[14px] h-[14px]" />
        <span>Back to sign in</span>
      </button>

      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          SSO Sign In
        </h1>
        <p className="mt-1 text-[#59636e]">
          We detect your organization’s identity provider from your email address.
        </p>
      </div>

      {infoMsg && (
        <div className="flex gap-[10px] items-start px-3 py-[10px] border border-[#0550ae] rounded-[8px] bg-[#ddf4ff] text-[13px]">
          <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
          <span className="text-[#1f2328]">{infoMsg}</span>
        </div>
      )}

      <form onSubmit={handleSso} className="flex flex-col gap-4 m-0">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="sso-email" className="text-[13px] font-medium text-[#1f2328]">
            Work email address
          </label>
          <input
            id="sso-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setInfoMsg(null);
            }}
            placeholder="name@company.com"
            className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] placeholder:text-[#59636e]/70 focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)]"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full h-[36px] px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Redirecting…" : "Continue with SSO"}
        </button>
      </form>
    </>
  );
};
