"use client";

import { useRef } from "react";
import { useNebulaCanvas } from "@/hooks/useNebulaCanvas";

export function BackgroundEffects() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useNebulaCanvas(canvasRef);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--theme-bg-primary)" }} />

      {/* Canvas nebula layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Grid overlay (subtle) */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.008 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--theme-accent)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}
