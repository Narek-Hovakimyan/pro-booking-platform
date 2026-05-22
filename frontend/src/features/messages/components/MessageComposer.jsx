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
        className="min-h-11 flex-1 resize-none rounded-full border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        disabled={isSending}
        placeholder="Type a message..."
        rows={1}
        value={text}
        onKeyDown={onMessageKeyDown}
        onChange={(event) => onTextChange?.(event.target.value)}
      />
      <Button
        className="rounded-full bg-blue-600 px-5 text-white hover:bg-blue-700"
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
