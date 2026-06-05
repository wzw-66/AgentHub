"use client";

export function BackgroundEffects() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage:
          "radial-gradient(circle at 30% 50%, rgba(26,26,46,0.02) 0%, transparent 60%), radial-gradient(circle at 70% 80%, rgba(43,138,107,0.015) 0%, transparent 50%)",
      }}
      aria-hidden="true"
    />
  );
}
