import React from "react";
import { Bot, Code2, Sparkles, Zap, Brain, Terminal, Compass } from "lucide-react";
import { Label } from "@/components/ui/label";

interface AssistantIdentityEditorProps {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  isDefault: boolean;
  setIsDefault: (val: boolean) => void;
}

const AVATAR_OPTIONS = [
  { id: "bot", label: "Bot", icon: Bot, color: "text-indigo-600 bg-indigo-50" },
  { id: "code", label: "Code", icon: Code2, color: "text-blue-600 bg-blue-50" },
  { id: "sparkles", label: "Sparkles", icon: Sparkles, color: "text-amber-500 bg-amber-50" },
  { id: "zap", label: "Zap", icon: Zap, color: "text-yellow-600 bg-yellow-50" },
  { id: "brain", label: "Brain", icon: Brain, color: "text-rose-500 bg-rose-50" },
  { id: "terminal", label: "Terminal", icon: Terminal, color: "text-cyan-600 bg-cyan-50" },
];

/**
 * Section for configuring assistant identity (Name, Description, Avatar icon, Default flag).
 */
export const AssistantIdentityEditor: React.FC<AssistantIdentityEditorProps> = ({
  name,
  setName,
  description,
  setDescription,
  avatar,
  setAvatar,
  isDefault,
  setIsDefault,
}) => {
  return (
    <div className="p-5 rounded-2xl border border-zinc-200/80 bg-white shadow-2xs space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">
          Assistant Identity
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Give your assistant a clear name, role description, and visual icon.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-medium text-zinc-700">
            Assistant Name <span className="text-rose-500">*</span>
          </Label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Code Reviewer, Data Analyst"
            className="w-full mt-1 px-3 py-2 text-xs bg-zinc-50/80 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div>
          <Label className="text-xs font-medium text-zinc-700">
            Short Description
          </Label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Specializes in Python backend architectures and unit testing"
            className="w-full mt-1 px-3 py-2 text-xs bg-zinc-50/80 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-zinc-700 mb-2 block">
          Avatar Icon
        </Label>
        <div className="flex flex-wrap gap-2">
          {AVATAR_OPTIONS.map((item) => {
            const Icon = item.icon;
            const isSelected = avatar === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAvatar(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600/30"
                    : "border-zinc-200 hover:bg-zinc-50 text-zinc-600"
                }`}
              >
                <div className={`p-1 rounded-lg ${item.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-100 flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefaultAssistant"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
        />
        <label htmlFor="isDefaultAssistant" className="text-xs text-zinc-700 cursor-pointer select-none">
          Set as default assistant for new conversations
        </label>
      </div>
    </div>
  );
};
