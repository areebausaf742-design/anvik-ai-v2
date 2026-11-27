/**
 * Utility to merge class names. Kept dependency-free so the design system
 * does not pull in clsx/tailwind-merge; we control class ordering ourselves.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
