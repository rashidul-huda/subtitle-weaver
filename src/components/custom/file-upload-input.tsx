"use client";

import type React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from '@/lib/utils';

interface FileUploadInputProps {
  id: string;
  label: string;
  accept: string;
  icon: React.ReactNode;
  onFileChange: (file: File) => void;
  fileName?: string;
  className?: string;
  disabled?: boolean;
  errorMessage?: string;
}

export function FileUploadInput({ 
  id, 
  label, 
  accept, 
  icon, 
  onFileChange, 
  fileName, 
  className,
  disabled = false,
  errorMessage 
}: FileUploadInputProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className={cn("flex items-center gap-2 text-sm font-medium", disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer")}>
        {icon} {label}
      </Label>
      <Input
        id={id}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className={cn(
          "block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold",
          "file:bg-primary file:text-primary-foreground hover:file:bg-primary/90",
          "focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2",
          disabled && "cursor-not-allowed opacity-50 file:opacity-70 file:pointer-events-none"
        )}
        aria-describedby={`${id}-description ${errorMessage ? `${id}-error` : ''}`}
        disabled={disabled}
        aria-invalid={!!errorMessage}
      />
      {fileName ? (
        <p id={`${id}-description`} className="text-xs text-muted-foreground truncate" aria-live="polite">
          Selected: {fileName}
        </p>
      ) : (
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          No file selected.
        </p>
      )}
      {errorMessage && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
