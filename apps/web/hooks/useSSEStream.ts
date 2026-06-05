"use client";

import { useEffect } from "react";

export function useSSEStream(conversationId: string | null) {
  useEffect(() => {
    if (!conversationId) return;
    return () => {};
  }, [conversationId]);
}
