import { Bell, ChevronDown, Menu, Scissors, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { connectSocket, getSocket } from "@/shared/lib/socket";
import { logoutUser } from "@/store/slices/authSlice";
import { addNotification } from "@/store/slices/notificationsSlice";
import NestedHeaderMenu from "@/shared/components/NestedHeaderMenu";

const getUserId = (user) => user?.id || user?._id;

const getIdString = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  if (value.id) return String(value.id);
  return String(value);
};

const getSalonList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.salons)) return data.salons;
  return [];
};

const isSalonOwnerOrAdmin = (salon, userId) => {
  const currentUserId = getIdString(userId);

  if (!salon || !currentUserId) return false;
  if (getIdString(salon.ownerId) === currentUserId) return true;

  return Array.isArray(salon.admins) &&
    salon.admins.some((adminId) => getIdString(adminId) === currentUserId);
};

const getUserInitials = (name) => {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const linkClass = (isActive) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive
      ? "bg-white/15 text-white"
      : "text-neutral-400 hover:bg-white/10 hover:text-white"
  }`;

export default function Header() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentUser, isAuthenticated, token } = useSelector((state) => state.auth);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [canManageSalon, setCanManageSalon] = useState(false);
  const moreMenuRef = useRef(null);
  const isClient = currentUser?.role === "client";
  const isBarber = currentUser?.role === "barber";
  const isPlatformAdmin = Boolean(currentUser?.platformRole === "admin");
  const currentUserId = currentUser?.id || currentUser?._id;
  const canShowManageHiring =
    isAuthenticated && isBarber && Boolean(currentUserId) && Boolean(token) && canManageSalon;

  useEffect(() => {
    if (!isAuthenticated || !isBarber || !currentUserId || !token) {
      let isMounted = true;

      queueMicrotask(() => {
        if (isMounted) setCanManageSalon(false);
      });

      return () => {
        isMounted = false;
      };
    }

    let isMounted = true;

    api
      .get("/salons/mine/manageable")
      .then(({ data }) => {
        if (isMounted) {
          const salons = getSalonList(data);
          setCanManageSalon(
            salons.some((salon) => isSalonOwnerOrAdmin(salon, currentUserId))
          );
        }
      })
      .catch(() => {
        if (isMounted) setCanManageSalon(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser?._id, currentUser?.id, currentUserId, isAuthenticated, isBarber, token]);

  // Primary barber nav items (visible in top bar)
  const barberNavItems = [
    { label: "Services", to: "/admin/services" },
    { label: "Schedule", to: "/admin/schedule" },
    { label: "Bookings", to: "/admin/bookings" },
    { label: "Clients", to: "/admin/clients" },
    { label: "Calendar", to: "/admin/calendar" },
  ];

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    let isMounted = true;

    async function loadUnreadCount() {
      try {
        const { data } = await api.get("/messages");
        const nextUnreadCount = data.filter(
          (message) =>
            String(getUserId(message.receiverId) || message.receiverId) ===
              String(currentUser.id) && !message.isRead
        ).length;

        if (isMounted) {
          setUnreadCount(nextUnreadCount);
        }
      } catch {
        if (isMounted) {
          setUnreadCount(0);
        }
      }
    }

    loadUnreadCount();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      return undefined;
    }

    let isMounted = true;
    let intervalId = null;

    async function loadNotificationCount() {
      try {
        const { data } = await api.get("/notifications");
        const nextCount = data.filter((notification) => !notification.isRead).length;

        if (isMounted) {
          setNotificationCount(nextCount);
        }
      } catch {
        if (isMounted) {
          setNotificationCount(0);
        }
      }
    }

    const handleNotificationsUpdated = () => {
      loadNotificationCount();
    };

    loadNotificationCount();
    intervalId = setInterval(loadNotificationCount, 15000);
    window.addEventListener("notifications:updated", handleNotificationsUpdated);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener("notifications:updated", handleNotificationsUpdated);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || !token) return undefined;

    const socket = getSocket() || connectSocket(currentUser.id, token);
    const handleNewMessage = (message) => {
      const receiverId = getUserId(message.receiverId) || message.receiverId;

      if (String(receiverId) === String(currentUser.id) && !message.isRead) {
        setUnreadCount((currentCount) => currentCount + 1);
      }
    };
    const handleNotification = (notification) => {
      setNotificationCount((currentCount) => currentCount + 1);
      dispatch(
        addNotification({
          message: notification.message,
          type: "info",
        })
      );
      window.dispatchEvent(new Event("notifications:updated"));
    };
    const handleMessagesRead = (event) => {
      const count = event.detail?.count || 0;

      setUnreadCount((currentCount) => Math.max(0, currentCount - count));
    };

    socket?.on("newMessage", handleNewMessage);
    socket?.on("notification", handleNotification);
    window.addEventListener("messages:read", handleMessagesRead);

    return () => {
      socket?.off("newMessage", handleNewMessage);
      socket?.off("notification", handleNotification);
      window.removeEventListener("messages:read", handleMessagesRead);
    };
  }, [currentUser?.id, dispatch, token]);

  const logout = () => {
    setUnreadCount(0);
    setNotificationCount(0);
    dispatch(logoutUser());
    navigate("/login");
  };

  const handleMoreLink = (to) => {
    if (to) navigate(to);
    setIsMoreOpen(false);
  };

  const handleMobileLink = (to) => {
    if (to) navigate(to);
    setIsMobileMenuOpen(false);
  };

  const renderAlertIcon = () => (
    <Link
      to="/notifications"
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
      aria-label="Notifications"
    >
      <Bell className="h-4 w-4" />
      {notificationCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {notificationCount > 9 ? "9+" : notificationCount}
        </span>
      )}
    </Link>
  );

  const renderMessageIcon = () => (
    <Link
      to="/messages"
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
      aria-label="Messages"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );

  const userInitials = getUserInitials(currentUser?.name);

  return (
    <header className="rounded-2xl bg-neutral-950 px-4 py-2.5 shadow-lg shadow-black/20 print:hidden sm:rounded-3xl sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        {/* ─── Left: Logo ─── */}
        <Link to="/" className="flex shrink-0 items-center gap-2 font-bold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-neutral-950 sm:h-8 sm:w-8">
            <Scissors className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
          <span className="text-sm sm:text-base">HairBook</span>
        </Link>

        {/* ─── Center: Nav (Desktop) ─── */}
        {isAuthenticated && isBarber && (
          <nav className="hidden items-center gap-0.5 lg:flex">
            {barberNavItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={linkClass(pathname === item.to)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {isAuthenticated && isClient && (
          <nav className="hidden items-center gap-0.5 lg:flex">
            <Link
              to="/specialists"
              className={linkClass(pathname === "/specialists" || pathname === "/barbers")}
            >
              Specialists
            </Link>
            <Link
              to="/salons"
              className={linkClass(pathname === "/salons")}
            >
              Salons
            </Link>
            <Link
              to="/favorites"
              className={linkClass(pathname === "/favorites")}
            >
              Favorites
            </Link>
            <Link
              to="/my-bookings"
              className={linkClass(pathname === "/my-bookings")}
            >
              Bookings
            </Link>
            <Link
              to="/my-waitlist"
              className={linkClass(pathname === "/my-waitlist")}
            >
              Waitlist
            </Link>
            <Link
              to="/profile"
              className={linkClass(pathname === "/profile")}
            >
              Profile
            </Link>
          </nav>
        )}

        {/* ─── Spacer when nav is hidden ─── */}
        {!isAuthenticated && <div className="hidden lg:block lg:flex-1" />}

        {/* ─── Right: Actions ─── */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {isAuthenticated && (
            <>
              {renderAlertIcon()}
              {renderMessageIcon()}

              {/* User initials */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-700 text-[11px] font-bold text-white sm:h-8 sm:w-8 sm:text-xs">
                {userInitials}
              </div>

              {/* More menu (desktop) — barber or platform admin */}
              {(isBarber || isPlatformAdmin) && (
                <div className="relative" ref={moreMenuRef}>
                  <button
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setIsMoreOpen((v) => !v)}
                    aria-expanded={isMoreOpen}
                    aria-haspopup="menu"
                    type="button"
                  >
                    More
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>

                  <NestedHeaderMenu
                    variant="desktop"
                    isOpen={isMoreOpen}
                    onClose={() => setIsMoreOpen(false)}
                    onLinkClick={handleMoreLink}
                    currentUser={currentUser}
                    onLogout={logout}
                    canShowManageHiring={canShowManageHiring}
                    canManageSalon={canManageSalon}
                    isPlatformAdmin={isPlatformAdmin}
                    showBusinessGroups={isBarber}
                  />
                </div>
              )}

              {/* Client simple dropdown */}
              {isClient && !isPlatformAdmin && (
                <div className="relative">
                  <button
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setIsMoreOpen((v) => !v)}
                    type="button"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {isMoreOpen && (
                    <div
                      className="absolute right-0 top-10 z-50 w-40 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl shadow-black/50"
                      ref={moreMenuRef}
                    >
                      <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
                        {currentUser?.name || "User"}
                      </div>
                      <button
                        className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                        onClick={logout}
                        type="button"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isAuthenticated && (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
              >
                Մուտք
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200"
              >
                Գրանցում
              </Link>
            </>
          )}

          {/* Mobile menu toggle */}
          {isAuthenticated && (
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setIsMobileMenuOpen((v) => !v)}
              type="button"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* ─── Mobile Navigation Drawer ─── */}
      {isAuthenticated && isMobileMenuOpen && (
        <div className="mt-3 border-t border-neutral-800 pt-3 lg:hidden">
          <nav className="flex flex-col gap-0.5">
            {/* Primary barber nav items first */}
            {isBarber &&
              barberNavItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    pathname === item.to
                      ? "bg-white/15 text-white"
                      : "text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}

            {/* Nested admin/account menu */}
            {(isBarber || isPlatformAdmin) && (
              <NestedHeaderMenu
                variant="mobile"
                isOpen
                onClose={() => setIsMobileMenuOpen(false)}
                onLinkClick={handleMobileLink}
                currentUser={currentUser}
                onLogout={logout}
                canShowManageHiring={canShowManageHiring}
                canManageSalon={canManageSalon}
                isPlatformAdmin={isPlatformAdmin}
                showBusinessGroups={isBarber}
              />
            )}

            {/* Client mobile nav */}
            {isClient &&
              [
                { label: "Specialists", to: "/specialists" },
                { label: "Salons", to: "/salons" },
                { label: "Favorites", to: "/favorites" },
                { label: "Bookings", to: "/my-bookings" },
                { label: "Waitlist", to: "/my-waitlist" },
                { label: "Notifications", to: "/notifications" },
                { label: "Messages", to: "/messages" },
                { label: "Profile", to: "/profile" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    pathname === item.to
                      ? "bg-white/15 text-white"
                      : "text-neutral-400 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            {isClient && (
              <>
                <div className="my-1.5 border-t border-neutral-800" />
                <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
                  {currentUser?.name || currentUser?.email || "User"}
                </div>
                <button
                  className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    logout();
                  }}
                  type="button"
                >
                  Logout
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
