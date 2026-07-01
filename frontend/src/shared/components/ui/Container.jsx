import { cn } from "@/shared/lib/utils";

export function Container({ children, className, size = "default" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "tight" && "max-w-3xl",
        size === "default" && "max-w-7xl",
        size === "wide" && "max-w-[86rem]",
        className
      )}
    >
      {children}
    </div>
  );
}