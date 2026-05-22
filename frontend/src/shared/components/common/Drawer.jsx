import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export default function Drawer({
  children,
  closeLabel = "Close drawer",
  description = "",
  footer = null,
  isOpen,
  onClose,
  title,
}) {
  if (!isOpen) return null;

  return (
    <>
      <button
        aria-label={closeLabel}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        type="button"
      />
      <aside className="fixed bottom-0 right-0 top-auto z-50 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white p-4 shadow-xl sm:top-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            )}
          </div>
          <Button
            aria-label={closeLabel}
            onClick={onClose}
            size="icon"
            variant="outline"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {children}
        </div>

        {footer && (
          <div className="mt-5 grid gap-2 border-t border-neutral-100 pt-4 sm:grid-cols-2">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
