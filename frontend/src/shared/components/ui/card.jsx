import { cn } from "@/shared/lib/utils";

export function Card({ className = "", hoverable = false, ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-neutral-200 bg-white text-neutral-950 shadow-sm shadow-neutral-200/70",
        hoverable && "transition duration-150 hover:-translate-y-0.5 hover:border-neutral-300/80 hover:shadow-card-hover",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}