import type { Metadata } from "next";
import SettingsScreen from "@/components/anvik/settings-screen";
export const metadata: Metadata = { title: "Settings", description: "Personalize your ANVIK AI experience." };
export default function SettingsPage() { return <SettingsScreen/>; }
