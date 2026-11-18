"use client";

import React, { useState } from "react";
import { AlertCircle, Building2, Eye, EyeOff, Info, KeyRound } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { SocialAuthButtons } from "./SocialAuthButtons";

interface SignInFormProps {
  authMode: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onNavigate: (view: "forgot" | "sso") => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SignInForm: React.FC<SignInFormProps> = ({ authMode, onLogin, onNavigate }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [breakGlass, setBreakGlass] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{ type: "err" | "info"; msg: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    let valid = true;

    if (!EMAIL_RE.test(cleanEmail)) {
      setEmailErr("Please enter a valid email address.");
      valid = false;
    } else {
      setEmailErr(null);
    }

    if (!password) {
      setPwErr("Please enter your password.");
      valid = false;
    } else {
      setPwErr(null);
    }

    if (!valid) return;

    setAlertState(null);
    setIsSubmitting(true);
    try {
      await onLogin(cleanEmail, password);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Invalid email or password.";
      const friendlyMsg =
        rawMsg.toLowerCase().includes("invalid email or password")
          ? "Invalid email or password."
          : rawMsg;
      toast.add({
        title: "Sign-in failed",
        description: friendlyMsg,
        variant: "destructive",
      });
      setAlertState({ type: "err", msg: friendlyMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  function renderPasswordForm(showForgotLink: boolean) {
    return (
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 m-0">
        <div className="flex flex-col gap-[6px] min-w-0">
          <div className="flex justify-between items-baseline gap-2">
            <label htmlFor="signin-email" className="text-[13px] font-medium text-[#1f2328]">
              Email address
            </label>
          </div>
          <input
            id="signin-email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailErr(null);
            }}
            placeholder={authMode === "oidc" ? "admin@company.com" : undefined}
            aria-invalid={Boolean(emailErr)}
            className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] placeholder:text-[#59636e]/70 focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
          />
          {emailErr && <p className="m-0 text-[12px] text-[#cf222e]">{emailErr}</p>}
        </div>

        <div className="flex flex-col gap-[6px] min-w-0">
          <div className="flex justify-between items-baseline gap-2">
            <label htmlFor="signin-pw" className="text-[13px] font-medium text-[#1f2328]">
              Password
            </label>
            {showForgotLink && (
              <button
                type="button"
                onClick={() => onNavigate("forgot")}
                className="text-[13px] font-medium text-[#0969da] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="signin-pw"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              spellCheck={false}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPwErr(null);
              }}
              onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
              onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
              aria-invalid={Boolean(pwErr)}
              className="w-full h-[36px] pl-3 pr-10 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
            />
            <button
              type="button"
              onClick={() => setShowPw((prev) => !prev)}
              aria-label={showPw ? "Hide password" : "Show password"}
              className="absolute right-[3px] top-[3px] grid place-items-center w-[30px] h-[30px] rounded-[5px] text-[#59636e] hover:bg-[#eaeef2] hover:text-[#1f2328] cursor-pointer"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {capsLock && (
            <p className="m-0 text-[12px] text-[#9a6700] flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Caps Lock is on</span>
            </p>
          )}
          {pwErr && <p className="m-0 text-[12px] text-[#cf222e]">{pwErr}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-[36px] inline-flex items-center justify-center gap-2 px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting && (
            <span className="inline-block w-[14px] h-[14px] border-2 border-current border-t-transparent rounded-full animate-spin" />
          )}
          <span>{isSubmitting ? "Signing in…" : "Sign in"}</span>
        </button>
      </form>
    );
  }

  if (authMode === "oidc") {
    return (
      <>
        <div className="flex flex-col">
          <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
            Sign in
          </h1>
          <p className="mt-1 text-[#59636e]">
            Your organization enforces Single Sign-On (SSO).
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("sso")}
          className="w-full h-[36px] inline-flex items-center justify-center gap-2 px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 cursor-pointer"
        >
          <Building2 className="w-[15px] h-[15px]" />
          <span>Continue with SSO</span>
        </button>

        <div className="flex gap-[10px] items-start px-3 py-[10px] border border-[#0550ae] rounded-[8px] bg-[#ddf4ff] text-[13px]">
          <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
          <span className="text-[#1f2328]">
            Local accounts are disabled by your administrator.
          </span>
        </div>

        {!breakGlass ? (
          <p className="m-0 text-center text-[13px]">
            <button
              type="button"
              onClick={() => setBreakGlass(true)}
              className="text-[#59636e] font-medium hover:underline cursor-pointer"
            >
              Administrator emergency access
            </button>
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {alertState && (
              <div
                role="alert"
                className="flex gap-[10px] items-start px-3 py-[10px] border border-[#cf222e] rounded-[8px] bg-[#ffebe9] text-[13px]"
              >
                <AlertCircle className="w-4 h-4 text-[#cf222e] shrink-0 mt-0.5" />
                <span className="text-[#1f2328]">{alertState.msg}</span>
              </div>
            )}
            <div className="flex gap-[10px] items-start px-3 py-[10px] border border-[#9a6700] rounded-[8px] bg-[#fff8c5] text-[13px]">
              <AlertCircle className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" />
              <span className="text-[#1f2328]">
                Emergency access reserved for administrators. Every sign-in is logged.
              </span>
            </div>
            {renderPasswordForm(false)}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          Sign in
        </h1>
        <p className="mt-1 text-[#59636e]">Access your workspace.</p>
      </div>

      {alertState && (
        <div
          role={alertState.type === "err" ? "alert" : "status"}
          className={`flex gap-[10px] items-start px-3 py-[10px] border rounded-[8px] text-[13px] ${
            alertState.type === "err"
              ? "border-[#cf222e] bg-[#ffebe9]"
              : "border-[#0550ae] bg-[#ddf4ff]"
          }`}
        >
          {alertState.type === "err" ? (
            <AlertCircle className="w-4 h-4 text-[#cf222e] shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
          )}
          <span className="text-[#1f2328]">{alertState.msg}</span>
        </div>
      )}

      <SocialAuthButtons onInfoMessage={(msg) => setAlertState({ type: "info", msg })} />

      <button
        type="button"
        onClick={() =>
          setAlertState({
            type: "info",
            msg: "Passkeys (WebAuthn) will be enabled soon. Please sign in with your email below.",
          })
        }
        className="w-full h-[36px] px-[14px] inline-flex items-center justify-center gap-2 border border-[#d1d9e0] rounded-[6px] bg-white text-[13px] font-medium hover:bg-[#f6f8fa] cursor-pointer"
      >
        <KeyRound className="w-[15px] h-[15px]" />
        <span>Sign in with a passkey</span>
      </button>

      <div className="flex items-center gap-3 text-[12px] text-[#59636e] before:content-[''] before:flex-1 before:h-px before:bg-[#d1d9e0] after:content-[''] after:flex-1 after:h-px after:bg-[#d1d9e0]">
        <span>or with your email</span>
      </div>

      {renderPasswordForm(true)}

      <p className="m-0 text-center text-[13px] text-[#59636e]">
        Does your organization use SSO?{" "}
        <button
          type="button"
          onClick={() => onNavigate("sso")}
          className="font-medium text-[#0969da] hover:underline cursor-pointer"
        >
          SSO sign in
        </button>
      </p>
    </>
  );
};
