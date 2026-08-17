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
  const [messages, setMessages] = useState(() => (
    !currentUserId || !userId
      ? []
      : messagesCacheByConversationKey.get(getConversationKey(currentUserId, userId)) || []
  ));
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
  const currentUserIdRef = useRef(currentUserId);
  const accountGenerationRef = useRef(0);
  const contactsRequestIdRef = useRef(0);
  const conversationRequestRef = useRef({ contactId: null, requestId: 0 });

  const isCurrentAccount = useCallback((snapshot) => Boolean(snapshot)
    && snapshot.accountGeneration === accountGenerationRef.current
    && snapshot.accountId === currentUserIdRef.current, []);

  const beginContactsRequest = useCallback(() => {
    const snapshot = {
      accountId: currentUserIdRef.current,
      accountGeneration: accountGenerationRef.current,
      requestId: contactsRequestIdRef.current + 1,
    };
    contactsRequestIdRef.current = snapshot.requestId;
    return snapshot;
  }, []);

  const isCurrentContactsRequest = useCallback((snapshot) => (
    isCurrentAccount(snapshot) && snapshot.requestId === contactsRequestIdRef.current
  ), [isCurrentAccount]);

  const beginConversationRequest = useCallback((contactId) => {
    const snapshot = {
      accountId: currentUserIdRef.current,
      accountGeneration: accountGenerationRef.current,
      contactId: contactId == null ? null : String(contactId),
      requestId: conversationRequestRef.current.requestId + 1,
    };
    conversationRequestRef.current = {
      contactId: snapshot.contactId,
      requestId: snapshot.requestId,
    };
    return snapshot;
  }, []);

  const captureConversationRequest = useCallback((contactId) => {
    const normalizedContactId = contactId == null ? null : String(contactId);
    const activeRequest = conversationRequestRef.current;
    return { accountId: currentUserIdRef.current, accountGeneration: accountGenerationRef.current, contactId: normalizedContactId, requestId: activeRequest.contactId === normalizedContactId ? activeRequest.requestId : null };
  }, []);

  const isCurrentConversationRequest = useCallback((snapshot) => (
    isCurrentAccount(snapshot)
    && snapshot.requestId != null
    && snapshot.contactId === conversationRequestRef.current.contactId
    && snapshot.requestId === conversationRequestRef.current.requestId
  ), [isCurrentAccount]);

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
    accountGenerationRef.current += 1;
    contactsRequestIdRef.current = 0;
    conversationRequestRef.current = {
      contactId: null,
      requestId: conversationRequestRef.current.requestId + 1,
    };
  }, [currentUserId, userId]);

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, []);

  useEffect(() => { if (selectedUser) scrollToBottom(); }, [messages.length, scrollToBottom, selectedUser]);

  const fetchMessages = useCallback(async (
    contactId,
    { showLoading = false, showRefreshing = false, requestSnapshot = captureConversationRequest(contactId) } = {}
  ) => {
    if (!currentUserId || !isCurrentConversationRequest(requestSnapshot)) return [];

    const cacheKey = getConversationKey(currentUserId, contactId);
    const cachedMessages = messagesCacheByConversationKey.get(cacheKey);

    if (showLoading) {
      setMessages(cachedMessages || []);
      setIsMessagesLoading(true);
    }
    if (showRefreshing) setIsMessagesRefreshing(true);

    try {
      const { data } = await api.get(`/messages/${contactId}`);
      if (!isCurrentConversationRequest(requestSnapshot)) return [];
      const normalizedMessages = (data || []).map(normalizeMessage);
      // A response can be older than a socket event received while it was in
      // flight. Keep the latest cache entry as the tie-breaker for duplicate
      // IDs while still incorporating every message returned by the server.
      const nextMessages = mergeMessages(
        normalizedMessages,
        messagesCacheByConversationKey.get(cacheKey) || []
      );

      messagesCacheByConversationKey.set(cacheKey, nextMessages);
      setMessages(nextMessages);
      return nextMessages;
    } catch (requestError) {
      if (showLoading && isCurrentConversationRequest(requestSnapshot)) {
        setError(
          requestError.response?.data?.message ||
            "Could not load messages. Please try again."
        );
      }
      return [];
    } finally {
      if (showLoading && isCurrentConversationRequest(requestSnapshot)) {
        setIsMessagesLoading(false);
      }
      if (showRefreshing && isCurrentConversationRequest(requestSnapshot)) {
        setIsMessagesRefreshing(false);
      }
    }
  }, [captureConversationRequest, currentUserId, isCurrentConversationRequest]);

  const fetchConversations = useCallback(async ({
    showLoading = false,
    showRefreshing = false,
    clearError = true,
    conversationSnapshot = null,
    requestSnapshot = beginContactsRequest(),
    shouldUpdate = () => true,
  } = {}) => {
      const canUpdate = () => shouldUpdate()
        && isCurrentContactsRequest(requestSnapshot)
        && (!conversationSnapshot || isCurrentConversationRequest(conversationSnapshot));

      if (!currentUserId || !isCurrentAccount(requestSnapshot)) return [];

      const cachedContacts = contactsCacheByUserId.get(String(currentUserId));

      if (showLoading && canUpdate()) {
        if (cachedContacts) {
          setContacts(cachedContacts);
        }
        setIsContactsLoading(!cachedContacts);
      }
      if (showRefreshing && canUpdate()) {
        setIsContactsRefreshing(true);
      }
      if (clearError && canUpdate()) {
        setError("");
      }

      try {
        const { data } = await api.get("/messages");
        const normalizedMessages = (data || []).map(normalizeMessage);
        const nextContacts = getConversationContacts(normalizedMessages, currentUserId);

        if (!canUpdate()) return nextContacts;

        contactsCacheByUserId.set(String(currentUserId), nextContacts);
        setContacts(nextContacts);
        return nextContacts;
      } catch (requestError) {
        if (canUpdate() && clearError) {
          setError(
            requestError.response?.data?.message ||
              "Could not load conversations. Please try again."
          );
        }
        return cachedContacts || [];
      } finally {
        if (canUpdate()) {
          setIsContactsLoading(false);
          setIsContactsRefreshing(false);
        }
      }
    }, [beginContactsRequest, currentUserId, isCurrentAccount, isCurrentContactsRequest, isCurrentConversationRequest]);

  const markConversationRead = useCallback(
    async (contactId, sourceMessages = [], requestSnapshot = captureConversationRequest(contactId)) => {
      if (!currentUserId || !isCurrentConversationRequest(requestSnapshot)) return;

      const readCount = countUnreadFrom(sourceMessages, currentUserId, contactId);

      try {
        const { data } = await api.put(`/messages/read/${contactId}`);
        if (!isCurrentConversationRequest(requestSnapshot)) return;
        const changedCount = data.modifiedCount ?? readCount;

        setMessages((currentMessages) => {
          const nextMessages = currentMessages.map((message) => (
            String(message.senderId) === String(contactId)
            && String(message.receiverId) === String(currentUserId)
              ? { ...message, isRead: true }
              : message
          ));
          messagesCacheByConversationKey.set(getConversationKey(currentUserId, contactId), nextMessages);
          return nextMessages;
        });
        setContacts((currentContacts) => {
          const nextContacts = currentContacts.map((contact) => (
            String(contact.id) === String(contactId) ? { ...contact, unreadCount: 0 } : contact
          ));
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
    }, [captureConversationRequest, currentUserId, isCurrentConversationRequest]);

  const handleNewMessage = useCallback((rawMessage) => {
    const message = normalizeMessage(rawMessage);
    const otherUserId =
      String(message.senderId) === String(currentUserId)
        ? message.receiverId
        : message.senderId;
    const activeUser = selectedUserRef.current;
    const activeUserId = activeUser?.id || conversationRequestRef.current.contactId;

    if (
      activeUser &&
      String(activeUserId) === String(otherUserId) &&
      String(message.senderId) !== String(currentUserId)
    ) {
      message.isRead = true;
      markConversationRead(otherUserId, [message]);
    }

    const isForActiveConversation = activeUserId && (
      String(message.senderId) === String(activeUserId)
      || String(message.receiverId) === String(activeUserId)
    );
    if (isForActiveConversation && currentUserId) {
      const cacheKey = getConversationKey(currentUserId, activeUserId);
      const cachedMessages = messagesCacheByConversationKey.get(cacheKey) || [];
      messagesCacheByConversationKey.set(cacheKey, mergeMessages(cachedMessages, [message]));
    }

    // Update messages for the selected conversation
    setMessages((currentMessages) => {
      if (!activeUserId) return currentMessages;

      if (!isForActiveConversation) return currentMessages;

      if (
        currentMessages.some(
          (m) => String(getMessageId(m)) === String(getMessageId(message))
        )
      ) {
        return currentMessages;
      }

      const merged = mergeMessages(currentMessages, [message]);
      const cacheKey = getConversationKey(currentUserId, activeUserId);
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
        activeUserId && String(activeUserId) === String(otherUserId);
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
    let isMounted = true;
    const shouldUpdate = () => isMounted;

    async function loadInitialData() {
      selectedUserRef.current = null;
      setSelectedUser(null);
      setMessages([]);
      setContacts(contactsCacheByUserId.get(String(currentUserId)) || []);
      setText("");
      setError("");
      setIsContactsLoading(Boolean(currentUserId));
      setIsContactsRefreshing(false);
      setIsMessagesLoading(false);
      setIsMessagesRefreshing(false);
      setIsSending(false);
      setShowChatOnMobile(Boolean(userId));

      if (!currentUserId) return;
      if (!userId) {
        beginConversationRequest(null);
        setIsMessagesRefreshing(false);
        setIsSending(false);
      }

      const nextContacts = await fetchConversations({
        showLoading: true,
        requestSnapshot: beginContactsRequest(),
        shouldUpdate,
      });

      if (!shouldUpdate() || !userId) return;

      const directContact = nextContacts.find((contact) => String(contact.id) === String(userId));

      const requestSnapshot = beginConversationRequest(userId);
      setSelectedUser(directContact || getDirectContact(userId, location.state?.user));
      setShowChatOnMobile(true);
      const loadedMessages = await fetchMessages(userId, {
        showLoading: true,
        requestSnapshot,
      });
      await markConversationRead(userId, loadedMessages, requestSnapshot);
    }

    loadInitialData();

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
      clearInterval(socketStatusIntervalId);
      detachSocket(activeSocket);
    };
  }, [beginContactsRequest, beginConversationRequest, currentUserId, fetchConversations, fetchMessages, handleNewMessage, location.state, markConversationRead, userId]);

  useEffect(() => {
    if (!currentUserId || socketConnected) return undefined;

    let isMounted = true;
    const shouldUpdate = () => isMounted;

    const pollMessages = async () => {
      const activeSelectedUser = selectedUserRef.current;
      const conversationSnapshot = activeSelectedUser?.id
        ? captureConversationRequest(activeSelectedUser.id)
        : null;
      const nextContacts = await fetchConversations({
        showRefreshing: true,
        clearError: false,
        conversationSnapshot,
        requestSnapshot: beginContactsRequest(),
        shouldUpdate,
      });

      if (!shouldUpdate() || !activeSelectedUser?.id || !isCurrentConversationRequest(conversationSnapshot)) return;

      const refreshedSelectedUser = nextContacts.find((contact) => String(contact.id) === String(activeSelectedUser.id));

      if (refreshedSelectedUser) {
        setSelectedUser(refreshedSelectedUser);
      }

      const loadedMessages = await fetchMessages(activeSelectedUser.id, {
        showRefreshing: true,
        requestSnapshot: conversationSnapshot,
      });

      if (shouldUpdate() && isCurrentConversationRequest(conversationSnapshot)) {
        await markConversationRead(activeSelectedUser.id, loadedMessages, conversationSnapshot);
      }
    };

    const pollingIntervalId = setInterval(pollMessages, 10000);

    return () => {
      isMounted = false;
      clearInterval(pollingIntervalId);
    };
  }, [currentUserId, fetchConversations, fetchMessages, captureConversationRequest, beginContactsRequest, isCurrentConversationRequest, markConversationRead, socketConnected]);

  const selectUser = async (user) => {
    const requestSnapshot = beginConversationRequest(user.id);
    setSelectedUser(user);
    setShowChatOnMobile(true);
    setError("");
    setIsMessagesRefreshing(false);
    setIsSending(false);
    const loadedMessages = await fetchMessages(user.id, { showLoading: true, requestSnapshot });
    await markConversationRead(user.id, loadedMessages, requestSnapshot);
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    if (!selectedUser || !text.trim()) return;

    const requestSnapshot = captureConversationRequest(selectedUser.id);
    if (!isCurrentConversationRequest(requestSnapshot)) return;
    setIsSending(true);
    setError("");

    try {
      const { data } = await api.post("/messages", {
        receiverId: selectedUser.id,
        text: text.trim(),
      });
      if (!isCurrentConversationRequest(requestSnapshot)) return;
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
        fetchMessages(selectedUser.id, { showRefreshing: true, requestSnapshot }),
        fetchConversations({
          showRefreshing: true,
          clearError: false,
          conversationSnapshot: requestSnapshot,
          requestSnapshot: beginContactsRequest(),
        }),
      ]);
    } catch (requestError) {
      if (isCurrentConversationRequest(requestSnapshot)) {
        setError(
          requestError.response?.data?.message ||
            "Could not send message. Please try again."
        );
      }
    } finally {
      if (isCurrentConversationRequest(requestSnapshot)) {
        setIsSending(false);
      }
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
  const chatPanelProps = { selectedUser, messages: messages || [], currentUser, currentUserId, text, isSending, isMessagesLoading, isMessagesRefreshing, showChatOnMobile, onBackToList: () => setShowChatOnMobile(false), onTextChange: setText, onMessageKeyDown: handleMessageKeyDown, onSendMessage: sendMessage, messagesEndRef };

  return <MessagesPageLayout chatPanelProps={chatPanelProps} conversationListProps={conversationListProps} error={error} />;
}
