import { MessageBubbleSkeleton } from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Card, CardContent } from "@/shared/components/ui/card";
import ChatHeader from "@/features/messages/components/ChatHeader";
import MessageBubble from "@/features/messages/components/MessageBubble";
import MessageComposer from "@/features/messages/components/MessageComposer";
import NoConversationSelected from "@/features/messages/components/NoConversationSelected";

const getMessageId = (message) => message?.id || message?._id;

export default function MessageChatPanel({
  selectedUser = null,
  messages = [],
  currentUser = null,
  currentUserId = "",
  text = "",
  isSending = false,
  isMessagesLoading = false,
  isMessagesRefreshing = false,
  showChatOnMobile = false,
  onBackToList,
  onTextChange,
  onMessageKeyDown,
  onSendMessage,
  messagesEndRef,
}) {
  return (
    <Card
      className={`rounded-2xl border-neutral-100 bg-white shadow-card sm:rounded-3xl ${
        showChatOnMobile && selectedUser ? "block" : "hidden lg:block"
      }`}
    >
      <CardContent className="flex h-[min(620px,calc(100vh-12rem))] min-h-[520px] flex-col gap-4 p-3 sm:p-5">
        {selectedUser ? (
          <>
            <ChatHeader selectedUser={selectedUser} onBackToList={onBackToList} />

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-neutral-100 bg-neutral-50 p-3 sm:p-4">
              {isMessagesLoading && messages.length === 0 ? (
                <>
                  <MessageBubbleSkeleton />
                  <MessageBubbleSkeleton align="right" />
                  <MessageBubbleSkeleton />
                </>
              ) : messages.length === 0 ? (
                <EmptyState
                  className="flex h-full flex-col items-center justify-center border-brand-100 bg-white text-center"
                  description="Send the first message when you are ready."
                  title="No messages"
                />
              ) : (
                <>
                  {(isMessagesLoading || isMessagesRefreshing) && (
                    <p className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                      Refreshing messages...
                    </p>
                  )}
                  {messages.map((message, index) => {
                    const isMine =
                      String(message.senderId) === String(currentUserId);
                    const previousMessage = messages[index - 1];

                    return (
                      <MessageBubble
                        key={getMessageId(message)}
                        message={message}
                        isMine={isMine}
                        currentUser={currentUser}
                        previousMessage={previousMessage}
                      />
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <MessageComposer
              text={text}
              isSending={isSending}
              onTextChange={onTextChange}
              onMessageKeyDown={onMessageKeyDown}
              onSendMessage={onSendMessage}
            />
          </>
        ) : (
          <NoConversationSelected />
        )}
      </CardContent>
    </Card>
  );
}
