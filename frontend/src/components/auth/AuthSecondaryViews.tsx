"use client";

import React, { useState } from "react";
import { Check, ChevronLeft, Info } from "lucide-react";

interface SecondaryViewProps {
  onBack: () => void;
}

export const ForgotPasswordView: React.FC<SecondaryViewProps> = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[13px] text-[#59636e] hover:text-[#1f2328] cursor-pointer"
      >
        <ChevronLeft className="w-[14px] h-[14px]" />
        <span>Retour à la connexion</span>
      </button>

      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          Mot de passe oublié
        </h1>
        <p className="mt-1 text-[#59636e]">
          Saisissez votre adresse. En mode self-hosted, contactez votre administrateur pour réinitialiser l’accès.
        </p>
      </div>

      {submitted ? (
        <>
          <div
            role="status"
            className="flex gap-[10px] items-start px-3 py-[10px] border border-[#1a7f37] rounded-[8px] bg-[#dafbe1] text-[13px]"
          >
            <Check className="w-4 h-4 text-[#1a7f37] shrink-0 mt-0.5" />
            <span className="text-[#1f2328]">
              Demande prise en compte pour <strong className="font-medium">{email}</strong>. Contactez l’administrateur de votre workspace si nécessaire.
            </span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="w-full h-[36px] px-[14px] border border-[#d1d9e0] rounded-[6px] bg-white text-[13px] font-medium hover:bg-[#f6f8fa] cursor-pointer"
          >
            Retour à la connexion
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setSubmitted(true);
          }}
          className="flex flex-col gap-4 m-0"
        >
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="forgot-email" className="text-[13px] font-medium text-[#1f2328]">
              Adresse e-mail
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
            className="w-full h-[36px] px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 cursor-pointer"
          >
            Envoyer le lien
          </button>
        </form>
      )}
    </>
  );
};

export const SsoLookupView: React.FC<SecondaryViewProps> = ({ onBack }) => {
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[13px] text-[#59636e] hover:text-[#1f2328] cursor-pointer"
      >
        <ChevronLeft className="w-[14px] h-[14px]" />
        <span>Retour à la connexion</span>
      </button>

      <div className="flex flex-col">
        <h1 className="m-0 text-[22px] leading-[1.25] font-semibold tracking-[-0.02em] text-[#1f2328]">
          Connexion SSO
        </h1>
        <p className="mt-1 text-[#59636e]">
          Nous détectons le fournisseur d’identité de votre organisation à partir de votre adresse.
        </p>
      </div>

      {checked && (
        <div className="flex gap-[10px] items-start px-3 py-[10px] border border-[#0550ae] rounded-[8px] bg-[#ddf4ff] text-[13px]">
          <Info className="w-4 h-4 text-[#0550ae] shrink-0 mt-0.5" />
          <span className="text-[#1f2328]">
            Aucune fédération OIDC n’est encore configurée pour{" "}
            <strong className="font-medium">{email.split("@")[1] || "ce domaine"}</strong>. Utilisez la connexion par e-mail.
          </span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) setChecked(true);
        }}
        className="flex flex-col gap-4 m-0"
      >
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="sso-email" className="text-[13px] font-medium text-[#1f2328]">
            Adresse e-mail professionnelle
          </label>
          <input
            id="sso-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setChecked(false);
            }}
            placeholder="prenom@entreprise.com"
            className="w-full h-[36px] px-3 border border-[#d1d9e0] rounded-[6px] bg-white text-[#1f2328] placeholder:text-[#59636e]/70 focus:outline-none focus:border-[#0969da] focus:shadow-[0_0_0_3px_rgba(9,105,218,0.25)]"
          />
        </div>
        <button
          type="submit"
          className="w-full h-[36px] px-[14px] border border-[#1f2328] rounded-[6px] bg-[#1f2328] text-white text-[13px] font-medium hover:opacity-88 cursor-pointer"
        >
          Continuer avec le SSO
        </button>
      </form>
    </>
  );
};
