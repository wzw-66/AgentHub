"use client";

import { useState, useCallback, type ReactNode } from "react";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const addRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 800);
  }, []);

  function renderRipples(): ReactNode {
    return ripples.map((r) => (
      <span
        key={r.id}
        className="ripple-effect"
        style={{
          left: r.x,
          top: r.y,
        }}
      />
    ));
  }

  return { addRipple, renderRipples };
}
