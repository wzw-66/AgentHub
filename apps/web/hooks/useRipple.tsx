"use client";

import { useCallback, useRef, useState, type ReactElement } from "react";

interface RippleState {
  id: number;
  x: number;
  y: number;
}

export function useRipple() {
  const [ripples, setRipples] = useState<RippleState[]>([]);
  const nextId = useRef(0);

  const addRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextId.current++;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 800);
  }, []);

  const renderRipples = useCallback((): ReactElement => {
    return (
      <>
        {ripples.map((r) => (
          <span key={r.id} className="ripple-effect" style={{ left: r.x, top: r.y }} />
        ))}
      </>
    );
  }, [ripples]);

  return { addRipple, renderRipples };
}
