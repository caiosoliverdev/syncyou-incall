"use client";

import { useEffect, useRef, type ClipboardEvent } from "react";

export function emptyOtp6(): string[] {
  return ["", "", "", "", "", ""];
}

function normalizeDigits(d: string[]): string[] {
  const out = [...d];
  while (out.length < 6) out.push("");
  return out.slice(0, 6);
}

type Otp6InputProps = {
  digits: string[];
  onDigitsChange: (next: string[]) => void;
  isDark: boolean;
  disabled?: boolean;
  /** Foca o primeiro quadrado ao montar (ex.: abrir passo OTP). */
  autoFocus?: boolean;
  className?: string;
  groupAriaLabel?: string;
};

export function Otp6Input({
  digits,
  onDigitsChange,
  isDark,
  disabled,
  autoFocus,
  className,
  groupAriaLabel,
}: Otp6InputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const safe = normalizeDigits(digits);

  useEffect(() => {
    if (autoFocus) {
      refs.current[0]?.focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned && value !== "") return;
    const next = normalizeDigits(safe);
    next[index] = cleaned.slice(-1);
    onDigitsChange(next);
    if (cleaned && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, key: string) => {
    if (key === "Backspace" && !safe[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6)
      .split("");
    if (pasted.length === 0) return;
    const next = emptyOtp6();
    pasted.forEach((digit, idx) => {
      if (idx < 6) next[idx] = digit;
    });
    onDigitsChange(next);
    refs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const boxClass = `h-11 w-11 shrink-0 rounded-md border text-center text-lg font-semibold outline-none transition focus:ring-2 ${
    isDark
      ? "border-zinc-700 bg-zinc-800 focus:ring-emerald-500"
      : "border-emerald-300 bg-white focus:ring-emerald-400"
  } ${disabled ? "cursor-not-allowed opacity-50" : ""}`;

  return (
    <div
      className={className ?? "flex items-center justify-between gap-1.5 sm:gap-2"}
      role="group"
      aria-label={groupAriaLabel}
    >
      {safe.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e.key)}
          onPaste={handlePaste}
          className={boxClass}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`${groupAriaLabel ?? "Código"} dígito ${index + 1} de 6`}
        />
      ))}
    </div>
  );
}
