import { MessageCircle } from "lucide-react";

export default function NoConversationSelected() {
  return (
    <div className="flex h-full flex-1 items-center justify-center text-center text-neutral-500">
      <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
          <MessageCircle className="h-6 w-6" />
        </span>
        <p className="mt-3 font-semibold text-neutral-800">Select a conversation</p>
        <p className="mt-1 text-sm">Your chat will appear here.</p>
      </div>
    </div>
  );
}
