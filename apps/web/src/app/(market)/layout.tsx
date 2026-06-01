import AuthGuard from "@/components/AuthGuard";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
