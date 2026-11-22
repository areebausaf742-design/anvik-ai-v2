import type { Metadata } from "next";
import RecoveryFlow from "@/components/anvik/recovery-flow";

export const metadata: Metadata = { title: "Reset password", description: "Reset your ANVIK AI password." };

export default function ResetPage() {
  return <RecoveryFlow />;
}
