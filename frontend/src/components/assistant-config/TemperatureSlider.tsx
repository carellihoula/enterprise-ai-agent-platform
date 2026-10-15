import React from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Gauge } from "lucide-react";

interface TemperatureSliderProps {
  temperature: number;
  onTemperatureChange: (val: number) => void;
}

/**
 * Supabase-styled temperature hyperparameter controller bounded to [0.0, 1.0].
 */
export const TemperatureSlider: React.FC<TemperatureSliderProps> = ({
  temperature,
  onTemperatureChange,
}) => {
  return (
    <div className="space-y-4 pb-6 border-b border-zinc-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <span>4. Sampling Temperature</span>
            <span className="font-mono text-[11px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-2 py-0.5 rounded-md font-medium">
              {temperature.toFixed(2)}
            </span>
          </Label>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">Range: [0.0 - 1.0]</span>
      </div>

      <div className="space-y-2 pt-1">
        <Slider
          min={0.0}
          max={1.0}
          step={0.05}
          value={[temperature]}
          onValueChange={([val]) => onTemperatureChange(val)}
          className="py-1"
        />
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400">
          <span>0.0 (Deterministic)</span>
          <span>0.5 (Balanced)</span>
          <span>1.0 (Creative)</span>
        </div>
      </div>
    </div>
  );
};
