"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { ChatProvider } from "@/lib/chat-context";
import { WSProvider } from "@/lib/ws-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WSProvider>
        <ChatProvider>{children}</ChatProvider>
      </WSProvider>
    </AuthProvider>
  );
}
