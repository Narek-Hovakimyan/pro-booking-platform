import { Button } from "@/shared/components/ui/button";

export default function EmptyState({
  action = null,
  actionLabel = "",
  children,
  className = "",
  description = "",
  onAction,
  title = "",
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500 ${className}`}
    >
      {title && <p className="font-semibold text-neutral-700">{title}</p>}
      {description && <p className={title ? "mt-1" : ""}>{description}</p>}
      {children}
      {(action || actionLabel) && (
        <div className="mt-3">
          {action || (
            <Button
              className="w-full sm:w-auto"
              onClick={onAction}
              type="button"
              variant="outline"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
