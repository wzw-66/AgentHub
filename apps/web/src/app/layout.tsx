import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentHub — AI Agent Command Center",
  description: "Multi-Agent collaboration platform powered by AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${firaCode.variable}`}
      data-theme="green"
    >
      <body className="font-mono noise-overlay">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
