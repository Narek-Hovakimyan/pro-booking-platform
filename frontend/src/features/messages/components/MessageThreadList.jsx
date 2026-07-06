import { Search, MessageCircle } from "lucide-react";

import {
  ListRowSkeleton,
} from "@/shared/components/LoadingSkeletons";
import EmptyState from "@/shared/components/common/EmptyState";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import ConnectionStatus from "@/features/messages/components/ConnectionStatus";
import ConversationListItem from "@/features/messages/components/ConversationListItem";

export default function MessageThreadList({
  conversations = [],
  selectedConversationId = null,
  onSelectConversation,
  searchQuery = "",
  onSearchChange,
  isLoading = false,
  isRefreshing = false,
  socketConnected = false,
  userRole = "",
  onFindBarber,
  onCheckBookings,
  isCollapsed = false,
}) {
  return (
    <Card
      className={`rounded-2xl border-neutral-100 shadow-card sm:rounded-3xl ${
        isCollapsed ? "hidden lg:block" : "block"
      }`}
    >
      <CardContent className="flex h-full min-h-[520px] flex-col gap-4 p-4 sm:min-h-[620px] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-bold text-neutral-950">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <MessageCircle className="h-4 w-4" />
            </span>
            Conversations
          </h2>
        </div>
        <ConnectionStatus socketConnected={socketConnected} isRefreshing={isRefreshing} />
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </label>

        {isLoading && conversations.length === 0 ? (
          <div className="space-y-2 rounded-2xl border border-neutral-100 bg-neutral-50 p-3">
            {[0, 1, 2].map((item) => (
              <ListRowSkeleton key={item} />
            ))}
          </div>
        ) : searchQuery && conversations.length === 0 ? (
          <EmptyState
            className="border-brand-100 bg-brand-50/40 text-center"
            description="Try a different name or phone number."
            title="No conversations found"
          />
        ) : conversations.length === 0 ? (
          <EmptyState
            className="flex flex-1 flex-col items-center justify-center border-brand-100 bg-brand-50/40 text-center"
            title="No messages yet"
            description="Start from a specialist profile or an existing booking."
            action={
              userRole === "client" && onFindBarber ? (
                <Button
                  className="w-full"
                  onClick={onFindBarber}
                  variant="outline"
                >
                  Find a specialist
                </Button>
              ) : userRole === "barber" && onCheckBookings ? (
                <Button
                  className="w-full"
                  onClick={onCheckBookings}
                  variant="outline"
                >
                  Check bookings
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {isLoading && (
              <p className="rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                Refreshing conversations...
              </p>
            )}
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.id}
                onSelect={onSelectConversation}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
