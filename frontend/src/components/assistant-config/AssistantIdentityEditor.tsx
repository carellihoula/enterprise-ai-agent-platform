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
  { id: "bot", label: "Bot", icon: Bot },
  { id: "code", label: "Code", icon: Code2 },
  { id: "sparkles", label: "Sparkles", icon: Sparkles },
  { id: "zap", label: "Zap", icon: Zap },
  { id: "brain", label: "Brain", icon: Brain },
  { id: "terminal", label: "Terminal", icon: Terminal },
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
    <div className="space-y-4 pb-6 border-b border-zinc-200">
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
            Assistant Name <span className="text-zinc-900">*</span>
          </Label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Code Reviewer, Data Analyst"
            className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-md focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
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
            className="w-full mt-1 px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-md focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                  isSelected
                    ? "border-zinc-900 ring-1 ring-zinc-900 bg-white text-zinc-900 font-medium"
                    : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-zinc-900" : "text-zinc-600"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefaultAssistant"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 h-4 w-4 accent-zinc-900"
        />
        <label htmlFor="isDefaultAssistant" className="text-xs text-zinc-700 cursor-pointer select-none">
          Set as default assistant for new conversations
        </label>
      </div>
    </div>
  );
};
