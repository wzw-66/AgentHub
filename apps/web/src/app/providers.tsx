"use client";

import { type ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-context";
import { ChatProvider } from "@/lib/chat-context";
import { WSProvider } from "@/lib/ws-context";
import { I18nProvider } from "@/lib/i18n";
import { BackgroundEffects } from "@/components/BackgroundEffects";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <WSProvider>
            <ChatProvider>
              <BackgroundEffects />
              {children}
            </ChatProvider>
          </WSProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
