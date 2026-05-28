"use client";

import { useTheme } from "@/lib/theme-context";

export function BackgroundEffects() {
  const { theme } = useTheme();

  const orbColors = {
    green: [
      { color: "rgba(0,255,65,0.05)", size: 500, x: -120, y: -120, delay: 0, reverse: false, duration: 22 },
      { color: "rgba(10,255,153,0.035)", size: 650, x: -80, y: -80, delay: -3, reverse: true, duration: 28 },
      { color: "rgba(57,255,20,0.025)", size: 900, x: -450, y: -450, delay: -5, reverse: false, duration: 32 },
    ],
    blue: [
      { color: "rgba(0,180,216,0.05)", size: 500, x: -120, y: -120, delay: 0, reverse: false, duration: 22 },
      { color: "rgba(0,150,199,0.035)", size: 650, x: -80, y: -80, delay: -3, reverse: true, duration: 28 },
      { color: "rgba(72,202,228,0.025)", size: 900, x: -450, y: -450, delay: -5, reverse: false, duration: 32 },
    ],
    purple: [
      { color: "rgba(187,134,252,0.05)", size: 500, x: -120, y: -120, delay: 0, reverse: false, duration: 22 },
      { color: "rgba(224,64,251,0.035)", size: 650, x: -80, y: -80, delay: -3, reverse: true, duration: 28 },
      { color: "rgba(206,147,216,0.025)", size: 900, x: -450, y: -450, delay: -5, reverse: false, duration: 32 },
    ],
    red: [
      { color: "rgba(255,51,51,0.05)", size: 500, x: -120, y: -120, delay: 0, reverse: false, duration: 22 },
      { color: "rgba(255,107,53,0.035)", size: 650, x: -80, y: -80, delay: -3, reverse: true, duration: 28 },
      { color: "rgba(255,85,85,0.025)", size: 900, x: -450, y: -450, delay: -5, reverse: false, duration: 32 },
    ],
  };

  const orbs = orbColors[theme];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute inset-0" style={{ backgroundColor: "var(--theme-bg-primary)" }} />

      {orbs.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            top: "50%",
            left: "50%",
            marginTop: orb.y,
            marginLeft: orb.x,
            background: `radial-gradient(circle at center, ${orb.color} 0%, transparent 70%)`,
            animation: `orb-float ${orb.duration}s ease-in-out ${orb.reverse ? "reverse" : "normal"} infinite`,
            animationDelay: `${orb.delay}s`,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}

      {/* Grid overlay */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.015 }}
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
