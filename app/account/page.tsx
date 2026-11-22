import type { Metadata } from "next";
import AccountScreen from "@/components/anvik/account-screen";

export const metadata: Metadata = { title: "Account", description: "Your ANVIK AI account, credits and consent." };

export default function AccountPage() {
  return <AccountScreen />;
}
