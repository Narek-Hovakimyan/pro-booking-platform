import ErrorBanner from "@/features/messages/components/ErrorBanner";
import MessageChatPanel from "@/features/messages/components/MessageChatPanel";
import MessageThreadList from "@/features/messages/components/MessageThreadList";
import MessagesPageHeader from "@/features/messages/components/MessagesPageHeader";

export default function MessagesPageLayout({
  chatPanelProps,
  conversationListProps,
  error,
}) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <MessagesPageHeader />

      <ErrorBanner error={error} />

      <div className="grid min-h-[min(620px,calc(100vh-12rem))] gap-4 sm:gap-5 lg:grid-cols-[320px_1fr]">
        <MessageThreadList {...conversationListProps} />

        <MessageChatPanel {...chatPanelProps} />
      </div>
    </div>
  );
}
