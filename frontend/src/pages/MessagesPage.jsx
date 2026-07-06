import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";

import MessagesPageLayout from "@/features/messages/components/MessagesPageLayout";
import { getMessageId, normalizeMessage, contactsCacheByUserId, messagesCacheByConversationKey, getConversationKey, getConversationContacts, countUnreadFrom, mergeMessages, getDirectContact } from "@/features/messages/utils/messageHelpers";
import api from "@/shared/api/axios";
import { getSocket } from "@/shared/lib/socket";

export default function MessagesPage() {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.auth);
  const currentUserId = currentUser?.id;
  const [contacts, setContacts] = useState(
    () => contactsCacheByUserId.get(String(currentUserId)) || []
  );
  const [selectedUser, setSelectedUser] = useState(null);
  const selectedUserRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [messages, setMessages] = useState(() => {
    if (!currentUserId || !userId) return [];

    return messagesCacheByConversationKey.get(getConversationKey(currentUserId, userId)) || [];
  });
  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isContactsLoading, setIsContactsLoading] = useState(true);
  const [isContactsRefreshing, setIsContactsRefreshing] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isMessagesRefreshing, setIsMessagesRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(Boolean(userId));

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, []);

  useEffect(() => {
    if (selectedUser) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom, selectedUser]);

  const fetchMessages = useCallback(async (
    contactId,
    { showLoading = false, showRefreshing = false } = {}
  ) => {
    if (!currentUserId) return [];

    const cacheKey = getConversationKey(currentUserId, contactId);
    const cachedMessages = messagesCacheByConversationKey.get(cacheKey);

    if (showLoading) {
      if (cachedMessages) {
        setMessages(cachedMessages);
      } else {
        setMessages([]);
      }
      setIsMessagesLoading(true);
    }
    if (showRefreshing) {
      setIsMessagesRefreshing(true);
    }

    try {
      const { data } = await api.get(`/messages/${contactId}`);
      const normalizedMessages = (data || []).map(normalizeMessage);
      const nextMessages = showLoading
        ? normalizedMessages
        : mergeMessages(messagesCacheByConversationKey.get(cacheKey) || [], normalizedMessages);

      messagesCacheByConversationKey.set(cacheKey, nextMessages);
      setMessages(nextMessages);
      return nextMessages;
    } catch (requestError) {
      if (showLoading) {
        setError(
          requestError.response?.data?.message ||
            "Could not load messages. Please try again."
        );
      }
      return [];
    } finally {
      if (showLoading) {
        setIsMessagesLoading(false);
      }
      if (showRefreshing) {
        setIsMessagesRefreshing(false);
      }
    }
  }, [currentUserId]);

  const fetchConversations = useCallback(
    async ({
      showLoading = false,
      showRefreshing = false,
      clearError = true,
      shouldUpdate = () => true,
    } = {}) => {
      if (!currentUserId) return [];

      const cachedContacts = contactsCacheByUserId.get(String(currentUserId));

      if (showLoading && shouldUpdate()) {
        if (cachedContacts) {
          setContacts(cachedContacts);
        }
        setIsContactsLoading(!cachedContacts);
      }
      if (showRefreshing && shouldUpdate()) {
        setIsContactsRefreshing(true);
      }
      if (clearError && shouldUpdate()) {
        setError("");
      }

      try {
        const { data } = await api.get("/messages");
        const normalizedMessages = (data || []).map(normalizeMessage);
        const nextContacts = getConversationContacts(
          normalizedMessages,
          currentUserId
        );

        if (!shouldUpdate()) return nextContacts;

        contactsCacheByUserId.set(String(currentUserId), nextContacts);
        setContacts(nextContacts);
        return nextContacts;
      } catch (requestError) {
        if (shouldUpdate() && clearError) {
          setError(
            requestError.response?.data?.message ||
              "Could not load conversations. Please try again."
          );
        }
        return cachedContacts || [];
      } finally {
        if (shouldUpdate()) {
          setIsContactsLoading(false);
          setIsContactsRefreshing(false);
        }
      }
    },
    [currentUserId]
  );

  const markConversationRead = useCallback(
    async (contactId, sourceMessages = []) => {
      if (!currentUserId) return;

      const readCount = countUnreadFrom(sourceMessages, currentUserId, contactId);

      try {
        const { data } = await api.put(`/messages/read/${contactId}`);
        const changedCount = data.modifiedCount ?? readCount;

        setMessages((currentMessages) =>
          {
            const nextMessages = currentMessages.map((message) =>
              String(message.senderId) === String(contactId) &&
              String(message.receiverId) === String(currentUserId)
                ? { ...message, isRead: true }
                : message
            );

            messagesCacheByConversationKey.set(
              getConversationKey(currentUserId, contactId),
              nextMessages
            );

            return nextMessages;
          }
        );
        setContacts((currentContacts) => {
          const nextContacts = currentContacts.map((contact) =>
            String(contact.id) === String(contactId)
              ? { ...contact, unreadCount: 0 }
              : contact
          );

          contactsCacheByUserId.set(String(currentUserId), nextContacts);

          return nextContacts;
        });

        if (changedCount > 0) {
          window.dispatchEvent(
            new CustomEvent("messages:read", {
              detail: { count: changedCount },
            })
          );
        }
      } catch {
        // Keep chat usable even if the read marker fails.
      }
    },
    [currentUserId]
  );

  const handleNewMessage = useCallback((rawMessage) => {
    const message = normalizeMessage(rawMessage);
    const otherUserId =
      String(message.senderId) === String(currentUserId)
        ? message.receiverId
        : message.senderId;
    const activeUser = selectedUserRef.current;

    if (
      activeUser &&
      String(activeUser.id) === String(otherUserId) &&
      String(message.senderId) !== String(currentUserId)
    ) {
      message.isRead = true;
      markConversationRead(otherUserId, [message]);
    }

    // Update messages for the selected conversation
    setMessages((currentMessages) => {
      if (!activeUser) return currentMessages;

      const isForActiveConversation =
        String(message.senderId) === String(activeUser.id) ||
        String(message.receiverId) === String(activeUser.id);

      if (!isForActiveConversation) return currentMessages;

      if (
        currentMessages.some(
          (m) => String(getMessageId(m)) === String(getMessageId(message))
        )
      ) {
        return currentMessages;
      }

      const merged = mergeMessages(currentMessages, [message]);
      const cacheKey = getConversationKey(currentUserId, activeUser.id);
      messagesCacheByConversationKey.set(cacheKey, merged);
      return merged;
    });

    // Update conversations list
    setContacts((currentContacts) => {
      const existingContact = currentContacts.find(
        (c) => String(c.id) === String(otherUserId)
      );
      const existingMessages = existingContact?.messages || [];
      const nextMessages = existingMessages.some(
        (existingMessage) =>
          String(getMessageId(existingMessage)) === String(getMessageId(message))
      )
        ? existingMessages
        : [...existingMessages, message];
      const isActiveConversation =
        activeUser && String(activeUser.id) === String(otherUserId);
      const isIncoming = String(message.senderId) !== String(currentUserId);

      const updatedContact = {
        id: otherUserId,
        name:
          (isIncoming ? message.sender?.name : message.receiver?.name) ||
          existingContact?.name ||
          "User",
        phone:
          (isIncoming ? message.sender?.phone : message.receiver?.phone) ||
          existingContact?.phone ||
          "",
        role:
          (isIncoming ? message.sender?.role : message.receiver?.role) ||
          existingContact?.role ||
          "",
        avatarUrl:
          (isIncoming ? message.sender?.avatarUrl : message.receiver?.avatarUrl) ||
          existingContact?.avatarUrl ||
          "",
        messages: nextMessages,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        unreadCount:
          !isIncoming || isActiveConversation
            ? existingContact?.unreadCount || 0
            : (existingContact?.unreadCount || 0) + 1,
      };

      const otherContacts = currentContacts.filter(
        (c) => String(c.id) !== String(otherUserId)
      );
      const nextContacts = [updatedContact, ...otherContacts];

      contactsCacheByUserId.set(String(currentUserId), nextContacts);
      return nextContacts;
    });
  }, [currentUserId, markConversationRead]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    async function loadInitialData() {
      if (!userId) {
        setSelectedUser(null);
        setMessages([]);
      }

      const nextContacts = await fetchConversations({
        showLoading: true,
        shouldUpdate,
      });

      if (!shouldUpdate() || !userId) return;

      const directContact = nextContacts.find(
        (contact) => String(contact.id) === String(userId)
      );

      setSelectedUser(
        directContact || getDirectContact(userId, location.state?.user)
      );
      setShowChatOnMobile(true);
      const loadedMessages = await fetchMessages(userId, { showLoading: true });
      await markConversationRead(userId, loadedMessages);
    }

    const immediateFetchId = setTimeout(() => {
      loadInitialData();
    }, 0);

    let activeSocket = null;
    const updateSocketStatus = () => {
      const s = getSocket();
      setSocketConnected(s?.connected ?? false);
    };
    const detachSocket = (socket) => {
      if (!socket) return;

      socket.off("connect", updateSocketStatus);
      socket.off("disconnect", updateSocketStatus);
      socket.off("newMessage", handleNewMessage);
    };
    const attachSocket = (socket) => {
      if (!socket || socket === activeSocket) return;

      detachSocket(activeSocket);
      activeSocket = socket;
      socket.on("connect", updateSocketStatus);
      socket.on("disconnect", updateSocketStatus);
      socket.on("newMessage", handleNewMessage);
    };
    const syncSocket = () => {
      const socket = getSocket();

      attachSocket(socket);
      updateSocketStatus();
    };

    syncSocket();
    const socketStatusIntervalId = setInterval(syncSocket, 1000);

    return () => {
      isMounted = false;
      clearTimeout(immediateFetchId);
      clearInterval(socketStatusIntervalId);
      detachSocket(activeSocket);
    };
  }, [
    currentUserId,
    fetchConversations,
    fetchMessages,
    handleNewMessage,
    location.state,
    markConversationRead,
    userId,
  ]);

  useEffect(() => {
    if (!currentUserId || socketConnected) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    const pollMessages = async () => {
      const nextContacts = await fetchConversations({
        showRefreshing: true,
        clearError: false,
        shouldUpdate,
      });

      const activeSelectedUser = selectedUserRef.current;

      if (!shouldUpdate() || !activeSelectedUser?.id) return;

      const refreshedSelectedUser = nextContacts.find(
        (contact) => String(contact.id) === String(activeSelectedUser.id)
      );

      if (refreshedSelectedUser) {
        setSelectedUser(refreshedSelectedUser);
      }

      const loadedMessages = await fetchMessages(activeSelectedUser.id, {
        showRefreshing: true,
      });

      if (shouldUpdate()) {
        await markConversationRead(activeSelectedUser.id, loadedMessages);
      }
    };

    const pollingIntervalId = setInterval(pollMessages, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollingIntervalId);
    };
  }, [
    currentUserId,
    fetchConversations,
    fetchMessages,
    markConversationRead,
    socketConnected,
  ]);

  const selectUser = async (user) => {
    setSelectedUser(user);
    setShowChatOnMobile(true);
    setError("");
    const loadedMessages = await fetchMessages(user.id, { showLoading: true });
    await markConversationRead(user.id, loadedMessages);
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    if (!selectedUser || !text.trim()) return;

    setIsSending(true);
    setError("");

    try {
      const { data } = await api.post("/messages", {
        receiverId: selectedUser.id,
        text: text.trim(),
      });
      const normalizedMessage = normalizeMessage(data);

      setMessages((currentMessages) => {
        const merged = mergeMessages(currentMessages, [normalizedMessage]);

        messagesCacheByConversationKey.set(
          getConversationKey(currentUserId, selectedUser.id),
          merged
        );

        return merged;
      });
      setText("");
      await Promise.all([
        fetchMessages(selectedUser.id, { showRefreshing: true }),
        fetchConversations({ showRefreshing: true, clearError: false }),
      ]);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Could not send message. Please try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleMessageKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();

    if (!isSending && text.trim()) {
      sendMessage(event);
    }
  };

  const conversationListProps = { conversations: (contacts || []).filter((conversation) => (conversation?.name || "User").toLowerCase().includes(searchQuery.trim().toLowerCase())), selectedConversationId: selectedUser?.id, onSelectConversation: selectUser, searchQuery, onSearchChange: setSearchQuery, isLoading: isContactsLoading, isRefreshing: isContactsRefreshing, socketConnected, userRole: currentUser?.role, onFindBarber: () => navigate("/specialists"), onCheckBookings: () => navigate("/admin/bookings"), isCollapsed: showChatOnMobile && Boolean(selectedUser) };
  const chatPanelProps = { selectedUser, messages: messages || [], currentUser, currentUserId, text, isSending, isMessagesLoading, isMessagesRefreshing, showChatOnMobile, onBackToList: () => setShowChatOnMobile(false), onTextChange: (value) => setText(value), onMessageKeyDown: handleMessageKeyDown, onSendMessage: sendMessage, messagesEndRef };

  return <MessagesPageLayout chatPanelProps={chatPanelProps} conversationListProps={conversationListProps} error={error} />;
}
