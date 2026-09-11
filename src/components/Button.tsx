import Link from "next/link";
import { ReactNode } from "react";
import { ArrowIcon } from "./icons";

export default function Button({
  href,
  children,
  variant = "solid",
  withArrow = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "solid" | "solid-light" | "outline" | "outline-light";
  withArrow?: boolean;
}) {
  const base =
    "group inline-flex items-center rounded-full font-mono text-xs uppercase tracking-[0.15em] transition-colors duration-200";

  const variants: Record<string, string> = {
    solid: "fill-btn fill-btn-clay border border-cocoa bg-cocoa text-cream hover:text-cocoa",
    "solid-light": "fill-btn fill-btn-clay border border-cream bg-cream text-cocoa",
    outline:
      "fill-btn fill-btn-olive border border-olive bg-transparent text-olive hover:text-cream",
    "outline-light":
      "fill-btn fill-btn-cream border border-cream/40 bg-transparent text-cream hover:text-cocoa",
  };

  const arrowTone: Record<string, string> = {
    solid: "bg-clay text-cocoa",
    "solid-light": "bg-clay text-cocoa",
    outline: "bg-olive/15 text-olive",
    "outline-light": "bg-cream/15 text-cream",
  };

  const className = `${base} ${variants[variant]} ${
    withArrow ? "py-1.5 pl-7 pr-1.5 gap-4" : "px-7 py-3.5"
  }`;

  const content = withArrow ? (
    <>
      {children}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-out group-hover:rotate-45 ${arrowTone[variant]}`}
      >
        <ArrowIcon className="h-4 w-4" />
      </span>
    </>
  ) : (
    children
  );

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {content}
    </a>
  );
}
