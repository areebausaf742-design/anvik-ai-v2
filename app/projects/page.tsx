import type { Metadata } from "next";
import ProjectsPage from "@/components/anvik/projects-page";

export const metadata: Metadata = {
  title: "Projects",
  description: "Every ANVIK conversation, as a searchable project you can reopen, rename or remove.",
};

export default function ProjectsPageRoute() {
  return <ProjectsPage />;
}
