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
  const [view, setView] = useState<AuthViewMode>(needsSetup ? "signup" : "signin");

  const activeView: AuthViewMode = needsSetup ? "signup" : view;

  const instanceLabel =
    needsSetup
      ? "instance · configuration initiale"
      : authMode === "oidc"
        ? "instance · sso imposé"
        : null;

  const belowContent = (() => {
    if (needsSetup) return null;
    if (authMode === "oidc") {
      return "Pas d’accès ? Demandez une invitation à l’administrateur de votre organisation.";
    }
    if (activeView === "signin") {
      return (
        <>
          Nouveau ici ?{" "}
          <button
            type="button"
            onClick={() => setView("signup")}
            className="font-medium text-[#0969da] hover:underline cursor-pointer"
          >
            {allowPublicSignup ? "Créer un compte" : "S’inscrire avec invitation"}
          </button>
        </>
      );
    }
    if (activeView === "signup") {
      return (
        <>
          Déjà inscrit ?{" "}
          <button
            type="button"
            onClick={() => setView("signin")}
            className="font-medium text-[#0969da] hover:underline cursor-pointer"
          >
            Se connecter
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
          onRegister={register}
        />
      )}
      {activeView === "forgot" && <ForgotPasswordView onBack={() => setView("signin")} />}
      {activeView === "sso" && <SsoLookupView onBack={() => setView("signin")} />}
    </AuthShell>
  );
};
