import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Star, X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

const FIELD_SELECTOR =
  "textarea:not([disabled]), button:not([disabled]), input:not([disabled]), select:not([disabled])";

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

export default function ReviewModal({
  booking,
  error = "",
  isSubmitting = false,
  title = "Leave Review",
  subtitle = "",
  commentRequired = false,
  commentPlaceholder = "Write your review",
  maxCommentLength,
  onClose,
  onSubmit,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const latestOnCloseRef = useRef(onClose);
  const isSubmittingRef = useRef(isSubmitting);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => {
    latestOnCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useLayoutEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector(FIELD_SELECTOR)?.focus();

    return () => {
      queueMicrotask(() => {
        if (canRestoreFocus(triggerRef.current)) {
          triggerRef.current.focus();
        }
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmittingRef.current) {
        latestOnCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const submitReview = (event) => {
    event.preventDefault();

    if (commentRequired && !comment.trim()) return;
    if (maxCommentLength && comment.length > maxCommentLength) return;

    onSubmit({ rating, comment });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(event) => {
        if (!isSubmittingRef.current && event.target === event.currentTarget) {
          latestOnCloseRef.current?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-t-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {subtitle || booking?.serviceName || "Completed booking"}
            </p>
          </div>

          <Button
            aria-label="Close review modal"
            disabled={isSubmitting}
            onClick={() => latestOnCloseRef.current?.()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form className="space-y-4" onSubmit={submitReview}>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                aria-label={`${value} star rating`}
                className="text-amber-500"
                disabled={isSubmitting}
                key={value}
                onClick={() => setRating(value)}
                type="button"
              >
                <Star
                  className={`h-7 w-7 ${
                    value <= rating ? "fill-amber-400" : ""
                  }`}
                />
              </button>
            ))}
          </div>

          <label className="grid gap-2 text-sm font-semibold">
            Review
            <textarea
              className="min-h-28 w-full rounded-2xl border bg-white p-3 font-normal"
              disabled={isSubmitting}
              maxLength={maxCommentLength}
              placeholder={commentPlaceholder}
              required={commentRequired}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            {maxCommentLength && (
              <span className="text-xs font-normal text-neutral-500">
                {comment.length}/{maxCommentLength}
              </span>
            )}
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button className="w-full sm:w-auto" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : "Submit review"}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={() => latestOnCloseRef.current?.()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
