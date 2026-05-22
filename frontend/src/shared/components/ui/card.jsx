import { cn } from "@/shared/lib/utils";

export function Card({ className = "", ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-neutral-200 bg-white text-neutral-950 shadow-sm shadow-neutral-200/70",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}
