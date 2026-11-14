import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "dark" | "outline" | "ghost" | "light";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-[#15171a] hover:bg-accent-hover shadow-[0_1px_0_rgb(0_0_0/0.08)]",
  dark: "bg-ink text-paper hover:opacity-90",
  outline: "border border-line-2 bg-card text-ink hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  light: "bg-steel-ink text-steel hover:bg-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-11 gap-2 rounded-xl px-4 text-[15px]",
  lg: "h-13 gap-2 rounded-xl px-6 text-base",
};

/** Utility groups where a class passed by the caller replaces the default (e.g. "px-0" beats "px-6"). */
const GROUPS = [/^px-/, /^h-/, /^w-/, /^rounded(-|$)/, /^(hidden|flex|inline-flex|block|grid|contents)$/, /^text-(xs|sm|base|lg|xl|\[\d+px\])$/];

function mergeClasses(base: string, extra: string): string {
  const overrides = extra.split(/\s+/).filter((c) => c && !c.includes(":"));
  const kept = base
    .split(/\s+/)
    .filter((c) => c.includes(":") || !GROUPS.some((g) => g.test(c) && overrides.some((o) => g.test(o))));
  return [...kept, extra].join(" ").trim();
}

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return mergeClasses(
    `inline-flex shrink-0 select-none items-center justify-center font-semibold transition-[background,opacity,border-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]}`,
    extra,
  );
}

export function ButtonLink({
  variant,
  size,
  className = "",
  icon,
  iconRight,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: IconName; iconRight?: IconName }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon && <Icon name={icon} className="size-[1.1em]" />}
      {children}
      {iconRight && <Icon name={iconRight} className="size-[1.1em]" />}
    </Link>
  );
}

export function Button({
  variant,
  size,
  className = "",
  icon,
  iconRight,
  children,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: IconName; iconRight?: IconName }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...props}>
      {icon && <Icon name={icon} className="size-[1.1em]" />}
      {children}
      {iconRight && <Icon name={iconRight} className="size-[1.1em]" />}
    </button>
  );
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink ${className}`}>{children}</p>;
}

/** Green "meets standard" badge. */
export function StandardBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
      <Icon name="check" className="size-3" strokeWidth={3} />
      {children}
    </span>
  );
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-ink-2 ${className}`}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "warn" | "ok" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-line bg-sunken text-ink-2",
    warn: "border-warn/25 bg-warn-soft text-warn",
    ok: "border-ok/25 bg-ok-soft text-ok",
    danger: "border-danger/25 bg-danger-soft text-danger",
  }[tone];
  const icon: IconName = { info: "info", warn: "alert", ok: "checkCircle", danger: "alert" }[tone] as IconName;
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex gap-2.5 rounded-xl border p-3 text-sm ${styles} ${className}`}>
      <Icon name={icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Square tile with a gear icon, used on kit and catalog rows. */
export function IconTile({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunken text-ink ${className}`} aria-hidden>
      <Icon name={name} className="size-6" strokeWidth={1.7} />
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-lg bg-accent text-[#15171a]">
        <Icon name="hardhat" className="size-5" strokeWidth={2.2} />
      </span>
      <span className="font-display text-[22px] font-bold leading-none tracking-tight">GearFit</span>
    </span>
  );
}
