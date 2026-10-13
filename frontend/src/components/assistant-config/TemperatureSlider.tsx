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
    <div className="p-5 bg-white border border-zinc-200/90 rounded-xl space-y-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <Label className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <span>4. Sampling Temperature</span>
            <Badge
              variant="secondary"
              className="font-mono text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200/80 px-2 py-0.5"
            >
              {temperature.toFixed(2)}
            </Badge>
          </Label>
        </div>
        <span className="text-[11px] font-mono text-zinc-400">Range: [0.0 - 1.0]</span>
      </div>

      <div className="space-y-2.5 pt-1">
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
