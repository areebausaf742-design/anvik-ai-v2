import { redirect } from "next/navigation";

/**
 * Authentication is intentionally invisible in guest-only ANVIK.
 * Legacy links to /login now enter the workspace instead of rendering an
 * email/password or Google sign-in form.
 */
export default function LoginPage() {
  redirect("/chat");
}
