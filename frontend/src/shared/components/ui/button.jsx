import { cn } from "@/shared/lib/utils";

const variants = {
  default:
    "bg-neutral-950 text-white shadow-sm hover:bg-neutral-800 active:bg-neutral-950",
  primary:
    "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-brand-600",
  destructive:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600",
  outline:
    "border border-neutral-200 bg-white text-neutral-900 shadow-sm hover:border-neutral-300 hover:bg-neutral-50",
  ghost: "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950",
};

const sizes = {
  default: "h-10 px-4 py-2",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
};

export function Button({
  as: Component = "button",
  className = "",
  variant = "default",
  size = "default",
  type = "button",
  ...props
}) {
  const buttonProps = Component === "button" ? { type } : {};

  return (
    <Component
      {...buttonProps}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold tracking-normal transition duration-150 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900",
        variants[variant] ?? variants.default,
        sizes[size] ?? sizes.default,
        className
      )}
      {...props}
    />
  );
}