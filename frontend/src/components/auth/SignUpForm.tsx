"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, Check, Circle, Eye, EyeOff, Info } from "lucide-react";

interface SignUpFormProps {
  needsSetup: boolean;
  allowPublicSignup: boolean;
  onRegister: (params: {
    email: string;
    password: string;
    fullName?: string;
    workspaceName?: string;
    invitationToken?: string;
  }) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_PASSWORDS = new Set([
  "password",
  "motdepasse",
  "12345678",
  "123456789",
  "1234567890",
  "azerty123",
  "azertyuiop",
  "qwerty123",
  "password123",
  "motdepasse123",
]);

const SOCIAL_PROVIDERS = [
  { name: "Google", chip: "G" },
  { name: "GitHub", chip: "GH" },
  { name: "Microsoft", chip: "M" },
] as const;

function computeStrength(pw: string): { score: number; label: string; isCommon: boolean } {
  const lower = pw.toLowerCase();
  const isCommon = COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(pw);
  if (!pw) return { score: 0, label: "Au moins 12 caractères", isCommon: false };
  if (isCommon) return { score: 1, label: "Trop faible", isCommon: true };
  if (pw.length >= 16) return { score: 4, label: "Très solide", isCommon: false };
  if (pw.length >= 12) return { score: 3, label: "Solide", isCommon: false };
  if (pw.length >= 8) return { score: 2, label: "Moyen, ajoutez des caractères", isCommon: false };
  return { score: 1, label: "Trop faible", isCommon: false };
}

export const SignUpForm: React.FC<SignUpFormProps> = ({
  needsSetup,
  allowPublicSignup,
  onRegister,
}) => {
  const [usage, setUsage] = useState<"me" | "team">("me");
  const [workspaceName, setWorkspaceName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [invitationToken, setInvitationToken] = useState("");
  const [showInviteField, setShowInviteField] = useState(!allowPublicSignup && !needsSetup);
  const [showPw, setShowPw] = useState(false);
  const [alertState, setAlertState] = useState<{ type: "err" | "info"; msg: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = useMemo(() => computeStrength(password), [password]);
  const barColors = ["bg-[#eaeef2]", "bg-[#cf222e]", "bg-[#9a6700]", "bg-[#1a7f37]", "bg-[#1a7f37]"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (usage === "team" && !workspaceName.trim()) {
      errs.org = "Indiquez le nom de votre organisation.";
    }
    if (!fullName.trim()) {
      errs.name = "Indiquez votre nom.";
    }
    if (!EMAIL_RE.test(email.trim())) {
      errs.email = "Saisissez une adresse e-mail valide.";
    }
    if (password.length < 8 || strength.isCommon) {
      errs.pw =
        password.length < 8
          ? "Le mot de passe doit contenir au moins 8 caractères."
          : "Ce mot de passe est trop courant.";
    }
    if (!termsAccepted) {
      errs.terms = "Vous devez accepter les conditions pour continuer.";
    }
    if (!needsSetup && !allowPublicSignup && !invitationToken.trim()) {
      errs.inv = "Un jeton d'invitation est requis.";
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setAlertState(null);
    setIsSubmitting(true);
    try {
      await onRegister({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        workspaceName: workspaceName.trim() || undefined,
        invitationToken: invitationToken.trim() || undefined,
      });
    } catch (err) {
      setAlertState({
        type: "err",
        msg: err instanceof Error ? err.message : "La création du compte a échoué.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          {needsSetup ? "Initialiser l’instance" : "Créer votre compte"}
        </h1>
        <p className="mt-1 text-[#59636e]">
          {needsSetup
            ? "Créez le premier compte administrateur."
            : "Quelques secondes suffisent."}
        </p>
      </div>

      {needsSetup && (
        <div className="flex gap-[10px] items-start px-3 py-[10px] border border-[#0550ae] rounded-[8px] bg-[#ddf4ff] text-[13px]">
          <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
          <span className="text-[#1f2328]">
            Ce premier compte devient automatiquement Propriétaire et Super-Administrateur.
          </span>
        </div>
      )}

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

      {!needsSetup && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {SOCIAL_PROVIDERS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() =>
                  setAlertState({
                    type: "info",
                    msg: `L'inscription via ${s.name} nécessite OIDC/OAuth (Phase 2). Inscrivez-vous avec votre e-mail ci-dessous.`,
                  })
                }
                aria-label={`Continuer avec ${s.name}`}
                className="h-[36px] px-2 inline-flex items-center justify-center gap-[6px] border border-[#d1d9e0] rounded-[6px] bg-white text-[13px] font-medium hover:bg-[#f6f8fa] cursor-pointer"
              >
                <span className="grid place-items-center w-[18px] h-[18px] rounded-[4px] bg-[#eaeef2] font-mono text-[9px] font-semibold text-[#59636e]">
                  {s.chip}
                </span>
                <span className="max-[440px]:hidden">{s.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[12px] text-[#59636e] before:content-[''] before:flex-1 before:h-px before:bg-[#d1d9e0] after:content-[''] after:flex-1 after:h-px after:bg-[#d1d9e0]">
            <span>ou avec votre e-mail</span>
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 m-0">
        <fieldset className="grid grid-cols-2 gap-2 border-0 m-0 p-0" aria-label="Type d’usage">
          <label
            className={`relative flex flex-col gap-[2px] px-3 py-[10px] border rounded-[8px] cursor-pointer ${
              usage === "me"
                ? "border-[#1f2328] shadow-[0_0_0_1px_#1f2328] bg-[#f6f8fa]"
                : "border-[#d1d9e0] bg-white"
            }`}
          >
            <input
              type="radio"
              name="usage"
              checked={usage === "me"}
              onChange={() => setUsage("me")}
              className="sr-only"
            />
            <b className="text-[13px] font-semibold text-[#1f2328]">Personnel</b>
            <span className="text-[12px] text-[#59636e]">Un espace pour vous seul</span>
          </label>

          <label
            className={`relative flex flex-col gap-[2px] px-3 py-[10px] border rounded-[8px] cursor-pointer ${
              usage === "team"
                ? "border-[#1f2328] shadow-[0_0_0_1px_#1f2328] bg-[#f6f8fa]"
                : "border-[#d1d9e0] bg-white"
            }`}
          >
            <input
              type="radio"
              name="usage"
              checked={usage === "team"}
              onChange={() => setUsage("team")}
              className="sr-only"
            />
            <b className="text-[13px] font-semibold text-[#1f2328]">Équipe</b>
            <span className="text-[12px] text-[#59636e]">Invitez vos collègues</span>
          </label>
        </fieldset>

        {usage === "team" && (
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="signup-org" className="text-[13px] font-medium text-[#1f2328]">
              Nom de l’organisation
            </label>
            <input
              id="signup-org"
              type="text"
              autoComplete="organization"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Acme Support"
              aria-invalid={Boolean(fieldErrors.org)}
              className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] placeholder:text-[#59636e]/70 focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
            />
            {fieldErrors.org && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.org}</p>}
          </div>
        )}

        <div className="flex flex-col gap-[6px]">
          <label htmlFor="signup-name" className="text-[13px] font-medium text-[#1f2328]">
            Nom complet
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
          />
          {fieldErrors.name && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.name}</p>}
        </div>

        <div className="flex flex-col gap-[6px]">
          <label htmlFor="signup-email" className="text-[13px] font-medium text-[#1f2328]">
            Adresse e-mail
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
          />
          {usage === "team" && (
            <p className="m-0 text-[12px] text-[#59636e]">
              Utilisez votre adresse professionnelle : votre domaine pourra être rattaché à l’organisation.
            </p>
          )}
          {fieldErrors.email && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.email}</p>}
        </div>

        <div className="flex flex-col gap-[6px]">
          <label htmlFor="signup-pw" className="text-[13px] font-medium text-[#1f2328]">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="signup-pw"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.pw)}
              className="w-full h-[36px] pl-3 pr-10 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => !p)}
              aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              className="absolute right-[3px] top-[3px] grid place-items-center w-[30px] h-[30px] rounded-[5px] text-[#59636e] hover:bg-[#eaeef2] hover:text-[#1f2328] cursor-pointer"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((idx) => (
              <i
                key={idx}
                className={`h-1 rounded-[2px] ${strength.score >= idx ? barColors[strength.score] : "bg-[#eaeef2]"}`}
              />
            ))}
          </div>
          <div className="text-[12px] text-[#59636e]">{strength.label}</div>
          <ul className="flex flex-col gap-[2px] m-0 p-0 list-none text-[12px] text-[#59636e]">
            <li className={`flex items-center gap-[6px] ${password.length >= 12 ? "text-[#1a7f37]" : ""}`}>
              {password.length >= 12 ? <Check className="w-3 h-3" /> : <Circle className="w-2.5 h-2.5" />}
              <span>12 caractères recommandés (8 minimum)</span>
            </li>
            <li
              className={`flex items-center gap-[6px] ${password && !strength.isCommon ? "text-[#1a7f37]" : ""}`}
            >
              {password && !strength.isCommon ? (
                <Check className="w-3 h-3" />
              ) : (
                <Circle className="w-2.5 h-2.5" />
              )}
              <span>Absent des mots de passe courants</span>
            </li>
          </ul>
          {fieldErrors.pw && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.pw}</p>}
        </div>

        {(showInviteField || (!allowPublicSignup && !needsSetup)) ? (
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="signup-inv" className="text-[13px] font-medium text-[#1f2328]">
              Jeton d’invitation {allowPublicSignup || needsSetup ? "(optionnel)" : "(requis)"}
            </label>
            <input
              id="signup-inv"
              type="text"
              value={invitationToken}
              onChange={(e) => setInvitationToken(e.target.value)}
              placeholder="inv_..."
              aria-invalid={Boolean(fieldErrors.inv)}
              className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white font-mono text-[13px] text-[#1f2328] focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)] aria-[invalid=true]:border-[#cf222e]"
            />
            {fieldErrors.inv && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.inv}</p>}
          </div>
        ) : !needsSetup ? (
          <button
            type="button"
            onClick={() => setShowInviteField(true)}
            className="self-start text-[12px] font-medium text-[#0969da] hover:underline cursor-pointer"
          >
            Vous avez un jeton d’invitation ?
          </button>
        ) : null}

        <div className="flex flex-col gap-[6px]">
          <label className="flex items-start gap-[10px] text-[13px] font-normal cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-4 h-4 mt-[2px] accent-[#1f2328]"
            />
            <span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span>
          </label>
          {fieldErrors.terms && <p className="m-0 text-[12px] text-[#cf222e]">{fieldErrors.terms}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-[36px] inline-flex items-center justify-center gap-2 px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting && (
            <span className="inline-block w-[14px] h-[14px] border-2 border-current border-t-transparent rounded-full animate-spin" />
          )}
          <span>{needsSetup ? "Créer le compte administrateur" : "Créer mon compte"}</span>
        </button>
      </form>
    </>
  );
};
