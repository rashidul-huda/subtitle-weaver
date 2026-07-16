"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paintbrush } from 'lucide-react';

interface ColorPickerCustomProps {
  value: string;
  onChange: (value: string) => void;
  title?: string;
}

const PRESET_COLORS = [
  "#ffffff", // White
  "#f3f4f6", // Off-White
  "#d1d5db", // Light Gray
  "#fbbf24", // Gold
  "#06b6d4", // Neon Cyan
  "#22c55e", // Neon Green
  "#ec4899", // Hot Pink
  "#000000", // Black
  "#1f2937", // Dark Gray
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#a855f7", // Purple
];

export function ColorPickerCustom({ value, onChange, title }: ColorPickerCustomProps) {
  const normalizedValue = value.startsWith('#') ? value : `#${value}`;

  return (
    <div className="space-y-1.5 w-full">
      {title && (
        <span className="text-xs font-semibold text-muted-foreground block">
          {title}
        </span>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full flex items-center justify-between px-3 py-2 h-10 border border-input rounded-md bg-transparent text-sm hover:bg-accent/50"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-4.5 h-4.5 rounded-full border border-border shadow-sm shrink-0"
                style={{ backgroundColor: normalizedValue }}
              />
              <span className="font-mono text-xs uppercase">{normalizedValue}</span>
            </div>
            <Paintbrush size={14} className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3 space-y-3" align="start">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
            Presets
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-8 h-8 rounded-full border border-border shadow-sm hover:scale-105 active:scale-95 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => onChange(c)}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Custom Color
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8 rounded border border-border overflow-hidden shrink-0">
                <input
                  type="color"
                  value={normalizedValue}
                  onChange={(e) => onChange(e.target.value)}
                  className="absolute inset-0 w-[200%] h-[200%] -translate-x-[25%] -translate-y-[25%] cursor-pointer border-none p-0 bg-transparent"
                />
              </div>
              <Input
                type="text"
                placeholder="#FFFFFF"
                value={normalizedValue}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs font-mono uppercase"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
