import { MessageCircle } from "lucide-react";

export default function NoConversationSelected() {
  return (
    <div className="flex h-full flex-1 items-center justify-center text-center text-neutral-500">
      <div>
        <MessageCircle className="mx-auto h-10 w-10 text-neutral-300" />
        <p className="mt-3 font-medium">Select a conversation</p>
        <p className="mt-1 text-sm">Your chat will appear here.</p>
      </div>
    </div>
  );
}
