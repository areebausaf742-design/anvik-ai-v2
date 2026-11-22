import type { Metadata } from "next";
import ArtifactsPage from "@/components/anvik/artifacts-page";

export const metadata: Metadata = {
  title: "Artifacts",
  description: "Every generated image, kept on this device, ready to download or reuse.",
};

export default function ArtifactsPageRoute() {
  return <ArtifactsPage />;
}
