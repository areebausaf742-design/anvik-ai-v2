"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "destructive" | "outline" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the button as its child element (e.g. an `<a>` for navigation). */
  asChild?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-[var(--theme-text)] text-[var(--theme-bg)] hover:bg-[var(--theme-text-secondary)] shadow-sm",
  destructive:
    "bg-[#b91c1c] text-[#ffffff] hover:bg-[#991b1b] shadow-sm",
  outline:
    "border-[var(--theme-border)] bg-[var(--theme-surface)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text)]",
  ghost: "hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-text)]",
  link: "text-[var(--theme-text-secondary)] underline-offset-4 hover:underline hover:text-[var(--theme-text)]",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8",
};

const baseClasses =
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(baseClasses, buttonVariants[variant], buttonSizes[size], className);

  if (asChild) {
    const child = children as React.ReactElement<any>;
    return React.cloneElement(child, {
      className: cn(classes, child.props?.className),
      ...props,
    });
  }

  return (
    <button type="button" className={cn(classes, className)} {...props}>
      {children}
    </button>
  );
}
