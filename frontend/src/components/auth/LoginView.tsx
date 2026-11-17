"use client";

import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell } from "./AuthShell";
import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { ForgotPasswordView, SsoLookupView } from "./AuthSecondaryViews";

type AuthViewMode = "signin" | "signup" | "forgot" | "sso";

export const LoginView: React.FC = () => {
  const { login, register, needsSetup, authMode, allowPublicSignup } = useAuth();
  const initialParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const resetTokenParam = initialParams?.get("reset_token");
  const inviteTokenParam = initialParams?.get("invite_token");

  const [view, setView] = useState<AuthViewMode>(
    resetTokenParam
      ? "forgot"
      : inviteTokenParam || needsSetup
        ? "signup"
        : "signin",
  );

  const activeView: AuthViewMode = needsSetup ? "signup" : view;

  const instanceLabel =
    needsSetup
      ? "instance · initial setup"
      : authMode === "oidc"
        ? "instance · sso enforced"
        : null;

  const belowContent = (() => {
    if (needsSetup) return null;
    if (authMode === "oidc") {
      return "Need access? Request an invitation from your organization administrator.";
    }
    if (activeView === "signin") {
      return (
        <>
          New here?{" "}
          <button
            type="button"
            onClick={() => setView("signup")}
            className="font-medium text-[#0969da] hover:underline cursor-pointer"
          >
            {allowPublicSignup ? "Create an account" : "Sign up with an invitation"}
          </button>
        </>
      );
    }
    if (activeView === "signup") {
      return (
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => setView("signin")}
            className="font-medium text-[#0969da] hover:underline cursor-pointer"
          >
            Sign in
          </button>
        </>
      );
    }
    return null;
  })();

  return (
    <AuthShell instanceLabel={instanceLabel} below={belowContent}>
      {activeView === "signin" && (
        <SignInForm authMode={authMode} onLogin={login} onNavigate={(v) => setView(v)} />
      )}
      {activeView === "signup" && (
        <SignUpForm
          needsSetup={needsSetup}
          allowPublicSignup={allowPublicSignup}
          initialInviteToken={inviteTokenParam}
          onRegister={register}
        />
      )}
      {activeView === "forgot" && (
        <ForgotPasswordView
          initialResetToken={resetTokenParam}
          onBack={() => setView("signin")}
        />
      )}
      {activeView === "sso" && <SsoLookupView onBack={() => setView("signin")} />}
    </AuthShell>
  );
};
