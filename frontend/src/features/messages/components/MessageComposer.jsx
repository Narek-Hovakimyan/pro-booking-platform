import { Send } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

export default function MessageComposer({
  text = "",
  isSending = false,
  onTextChange,
  onMessageKeyDown,
  onSendMessage,
}) {
  return (
    <form className="flex items-end gap-2" onSubmit={onSendMessage}>
      <textarea
        className="min-h-11 flex-1 resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSending}
        placeholder="Type a message..."
        rows={1}
        value={text}
        onKeyDown={onMessageKeyDown}
        onChange={(event) => onTextChange?.(event.target.value)}
      />
      <Button
        className="rounded-2xl bg-brand-600 px-5 text-white hover:bg-brand-700 disabled:opacity-60"
        disabled={isSending || !text.trim()}
        type="submit"
      >
        <Send className="h-4 w-4 sm:mr-2" />
        <span className="hidden sm:inline">
          {isSending ? "Sending..." : "Send"}
        </span>
      </Button>
    </form>
  );
}
