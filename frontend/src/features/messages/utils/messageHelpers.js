export const getUserId = (user) => user?.id || user?._id;
export const getMessageId = (message) => message?.id || message?._id;

export function normalizeContact(user) {
  return {
    ...user,
    id: getUserId(user),
    avatarUrl: user?.avatarUrl || user?.imageUrl || user?.image || user?.avatar || "",
  };
}

export function normalizeMessage(message) {
  const sender = typeof message.senderId === "object"
    ? normalizeContact(message.senderId)
    : null;
  const receiver = typeof message.receiverId === "object"
    ? normalizeContact(message.receiverId)
    : null;

  return {
    ...message,
    id: getMessageId(message),
    sender,
    receiver,
    senderId: getUserId(message.senderId) || message.senderId,
    receiverId: getUserId(message.receiverId) || message.receiverId,
  };
}

export const contactsCacheByUserId = new Map();
export const messagesCacheByConversationKey = new Map();

export function getConversationKey(currentUserId, otherUserId) {
  return [String(currentUserId), String(otherUserId)].sort().join(":");
}

const getMessageTime = (message) => new Date(message?.createdAt || 0).getTime();

export const getLastMessage = (messages = []) =>
  [...messages].sort((a, b) => getMessageTime(b) - getMessageTime(a))[0] || null;

export function getConversationContacts(messages, currentUserId) {
  const contactsById = new Map();

  messages.forEach((message) => {
    const isSender = String(message.senderId) === String(currentUserId);
    const otherUserId = isSender ? message.receiverId : message.senderId;
    const otherUser = isSender ? message.receiver : message.sender;
    const contactKey = String(otherUserId);

    if (!otherUserId) return;

    const existing = contactsById.get(contactKey) || {};
    const nextMessages = [...(existing.messages || []), message];
    const lastMessage = getLastMessage(nextMessages);
    const unreadCount =
      !isSender && !message.isRead ? (existing?.unreadCount || 0) + 1 : existing?.unreadCount || 0;

    contactsById.set(contactKey, {
      id: otherUserId,
      name: otherUser?.name || existing?.name || "User",
      phone: otherUser?.phone || existing?.phone || "",
      role: otherUser?.role || existing?.role || "",
      avatarUrl: otherUser?.avatarUrl || existing?.avatarUrl || "",
      messages: nextMessages,
      lastMessage,
      lastMessageAt: lastMessage?.createdAt || "",
      unreadCount,
    });
  });

  return Array.from(contactsById.values()).sort(
    (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
  );
}

export function countUnreadFrom(messages, currentUserId, otherUserId) {
  return messages.filter(
    (message) =>
      String(message.senderId) === String(otherUserId) &&
      String(message.receiverId) === String(currentUserId) &&
      !message.isRead
  ).length;
}

export function mergeMessages(currentMessages, incomingMessages) {
  const messagesById = new Map(
    currentMessages
      .filter(Boolean)
      .map((message) => [String(getMessageId(message)), message])
  );

  incomingMessages.forEach((message) => {
    const messageId = getMessageId(message);

    if (messageId) {
      messagesById.set(String(messageId), message);
    }
  });

  return Array.from(messagesById.values()).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
}

export function getDirectContact(userId, stateUser) {
  if (stateUser) {
    return normalizeContact(stateUser);
  }

  return {
    id: userId,
    name: "User",
    phone: "",
    role: "",
  };
}
