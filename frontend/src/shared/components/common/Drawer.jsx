import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

const FIELD_SELECTOR =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
const FALLBACK_SELECTOR = "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

function focusFirstControl(dialogRef) {
  const firstField =
    dialogRef.current?.querySelector(FIELD_SELECTOR) ||
    dialogRef.current?.querySelector(FALLBACK_SELECTOR);
  firstField?.focus();
}

function canRestoreFocus(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }

  if (element.matches(":disabled")) {
    return false;
  }

  if (element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export default function Drawer({
  children,
  closeLabel = "Close drawer",
  description = "",
  footer = null,
  isOpen,
  onClose,
  title,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const isOpenRef = useRef(false);
  const pendingRestoreRef = useRef(false);
  const latestOnCloseRef = useRef(onClose);

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    if (isOpen && !isOpenRef.current) {
      isOpenRef.current = true;
      pendingRestoreRef.current = false;
      triggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      focusFirstControl(dialogRef);
      return;
    }

    if (!isOpen && isOpenRef.current) {
      isOpenRef.current = false;
      if (canRestoreFocus(triggerRef.current)) {
        triggerRef.current.focus();
      }
      triggerRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => () => {
    if (!isOpenRef.current) return;

    pendingRestoreRef.current = true;
    queueMicrotask(() => {
      if (!pendingRestoreRef.current) return;
      if (canRestoreFocus(triggerRef.current)) {
        triggerRef.current.focus();
      }
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="fixed bottom-0 right-0 top-auto z-50 flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white p-4 shadow-xl sm:top-0 sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-2xl font-bold tracking-tight">{title}</h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-neutral-500">
                {description}
              </p>
            )}
          </div>
          <Button
            aria-label={closeLabel}
            onClick={() => latestOnCloseRef.current?.()}
            size="icon"
            type="button"
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
    </div>
  );
}
