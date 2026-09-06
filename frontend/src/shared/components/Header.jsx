import { Bell, ChevronDown, Menu, Scissors, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { performLogout } from "@/shared/auth/performLogout";
import { getSocket } from "@/shared/lib/socket";
import { canAccessPlatform } from "@/shared/utils/platformAccess";
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
  const { i18n, t } = useTranslation();
  const { currentUser, isAuthenticated, token } = useSelector((state) => state.auth);
  const [unreadState, setUnreadState] = useState({ userId: null, count: 0 });
  const [notificationState, setNotificationState] = useState({ userId: null, count: 0 });
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [salonCapabilityState, setSalonCapabilityState] = useState({
    userId: null,
    canManage: false,
  });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [clientMenuPathname, setClientMenuPathname] = useState(null);
  const moreMenuRef = useRef(null);
  const isMountedRef = useRef(true);
  const isClient = currentUser?.role === "client";
  const isBarber = currentUser?.role === "barber";
  const isBarberOnboarding = isAuthenticated && isBarber && pathname === "/onboarding";
  const showBarberChrome = isAuthenticated && isBarber && !isBarberOnboarding;
  const isPlatformAdmin = canAccessPlatform(currentUser);
  const currentUserId = currentUser?.id || currentUser?._id;
  const currentUserKey = currentUserId ? String(currentUserId) : null;
  const currentSessionKey =
    isAuthenticated && currentUserKey && token ? `${currentUserKey}:${token}` : null;
  const activeSessionKeyRef = useRef(null);
  const requestVersionsRef = useRef({ messages: 0, notifications: 0, salon: 0 });
  const unreadCount = unreadState.userId === currentSessionKey ? unreadState.count : 0;
  const notificationCount =
    notificationState.userId === currentSessionKey ? notificationState.count : 0;
  const canManageSalon =
    salonCapabilityState.userId === currentSessionKey && salonCapabilityState.canManage;
  const canShowManageHiring =
    showBarberChrome && Boolean(currentUserId) && Boolean(token) && canManageSalon;
  const isClientProfileMenu = isClient && !isPlatformAdmin;
  const clientProfileMenuId = "header-client-profile-menu";
  const isClientProfileOpen =
    isClientProfileMenu && isMoreOpen && clientMenuPathname === pathname;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeSessionKeyRef.current = currentSessionKey;

    return () => {
      if (activeSessionKeyRef.current === currentSessionKey) {
        activeSessionKeyRef.current = null;
      }
      requestVersionsRef.current.messages += 1;
      requestVersionsRef.current.notifications += 1;
      requestVersionsRef.current.salon += 1;
    };
  }, [currentSessionKey]);

  useEffect(() => {
    if (!showBarberChrome || !currentUserId || !token) {
      return undefined;
    }

    const requestVersion = ++requestVersionsRef.current.salon;
    const canApply = () =>
      activeSessionKeyRef.current === currentSessionKey &&
      requestVersionsRef.current.salon === requestVersion;

    api
      .get("/salons/mine/manageable")
      .then(({ data }) => {
        if (canApply()) {
          const salons = getSalonList(data);
          setSalonCapabilityState({
            userId: currentSessionKey,
            canManage: salons.some((salon) => isSalonOwnerOrAdmin(salon, currentUserId)),
          });
        }
      })
      .catch(() => {
        if (canApply()) {
          setSalonCapabilityState({ userId: currentSessionKey, canManage: false });
        }
      });

    return () => {
      requestVersionsRef.current.salon += 1;
    };
  }, [currentSessionKey, currentUserId, showBarberChrome, token]);

  // Primary barber nav items (visible in top bar)
  const barberNavItems = [
    { label: t("nav.services"), to: "/admin/services" },
    { label: t("nav.schedule"), to: "/admin/schedule" },
    { label: t("nav.bookings"), to: "/admin/bookings" },
    { label: t("nav.clients"), to: "/admin/clients" },
    { label: t("nav.calendar"), to: "/admin/calendar" },
  ];

  useEffect(() => {
    if (!currentSessionKey) {
      return undefined;
    }

    async function loadUnreadCount() {
      const requestVersion = ++requestVersionsRef.current.messages;
      const canApply = () =>
        activeSessionKeyRef.current === currentSessionKey &&
        requestVersionsRef.current.messages === requestVersion;

      try {
        const { data } = await api.get("/messages");
        const nextUnreadCount = data.filter(
          (message) =>
            String(getUserId(message.receiverId) || message.receiverId) ===
              currentUserKey && !message.isRead
        ).length;

        if (canApply()) {
          setUnreadState({ userId: currentSessionKey, count: nextUnreadCount });
        }
      } catch {
        if (canApply()) {
          setUnreadState({ userId: currentSessionKey, count: 0 });
        }
      }
    }

    loadUnreadCount();

    return () => {
      requestVersionsRef.current.messages += 1;
    };
  }, [currentSessionKey, currentUserKey]);

  useEffect(() => {
    if (!currentSessionKey) {
      return undefined;
    }

    async function loadNotificationCount() {
      const requestVersion = ++requestVersionsRef.current.notifications;
      const canApply = () =>
        activeSessionKeyRef.current === currentSessionKey &&
        requestVersionsRef.current.notifications === requestVersion;

      try {
        const { data } = await api.get("/notifications");
        const nextCount = data.filter((notification) => !notification.isRead).length;

        if (canApply()) {
          setNotificationState({ userId: currentSessionKey, count: nextCount });
        }
      } catch {
        if (canApply()) {
          setNotificationState({ userId: currentSessionKey, count: 0 });
        }
      }
    }

    const handleNotificationsUpdated = () => {
      loadNotificationCount();
    };

    loadNotificationCount();
    const intervalId = setInterval(loadNotificationCount, 15000);
    window.addEventListener("notifications:updated", handleNotificationsUpdated);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("notifications:updated", handleNotificationsUpdated);
      requestVersionsRef.current.notifications += 1;
    };
  }, [currentSessionKey]);

  useEffect(() => {
    if (!currentSessionKey) return undefined;

    const socket = getSocket();
    const handleNewMessage = (message) => {
      const receiverId = getUserId(message.receiverId) || message.receiverId;

      if (
        activeSessionKeyRef.current === currentSessionKey &&
        String(receiverId) === currentUserKey &&
        !message.isRead
      ) {
        requestVersionsRef.current.messages += 1;
        setUnreadState((currentState) => ({
          userId: currentSessionKey,
          count: (currentState.userId === currentSessionKey ? currentState.count : 0) + 1,
        }));
      }
    };
    const handleNotification = (notification) => {
      if (activeSessionKeyRef.current !== currentSessionKey) return;

      requestVersionsRef.current.notifications += 1;
      setNotificationState((currentState) => ({
        userId: currentSessionKey,
        count: (currentState.userId === currentSessionKey ? currentState.count : 0) + 1,
      }));
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

      if (activeSessionKeyRef.current !== currentSessionKey) return;

      requestVersionsRef.current.messages += 1;
      setUnreadState((currentState) => ({
        userId: currentSessionKey,
        count: Math.max(
          0,
          (currentState.userId === currentSessionKey ? currentState.count : 0) - count
        ),
      }));
    };

    socket?.on("newMessage", handleNewMessage);
    socket?.on("notification", handleNotification);
    window.addEventListener("messages:read", handleMessagesRead);

    return () => {
      socket?.off("newMessage", handleNewMessage);
      socket?.off("notification", handleNotification);
      window.removeEventListener("messages:read", handleMessagesRead);
    };
  }, [currentSessionKey, currentUserKey, dispatch]);

  useEffect(() => {
    if (!isClientProfileOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    };
    const handlePointerDown = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setIsMoreOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isClientProfileOpen]);

  const logout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    await performLogout({
      dispatch,
      navigate,
      onCleanup: () => {
        setUnreadState({ userId: null, count: 0 });
        setNotificationState({ userId: null, count: 0 });
        setIsMoreOpen(false);
        setIsMobileMenuOpen(false);
      },
    });

    if (isMountedRef.current) {
      setIsLoggingOut(false);
    }
  };

  const handleMoreLink = (to) => {
    if (to) navigate(to);
    setIsMoreOpen(false);
  };

  const handleMobileLink = (to) => {
    if (to) navigate(to);
    setIsMobileMenuOpen(false);
  };

  const handleClientProfileToggle = () => {
    if (isClientProfileOpen) {
      setIsMoreOpen(false);
      return;
    }

    setClientMenuPathname(pathname);
    setIsMoreOpen(true);
  };

  const currentLanguage = (i18n.resolvedLanguage || i18n.language || "hy").split("-")[0];

  const handleLanguageChange = (event) => {
    i18n.changeLanguage(event.target.value);
  };

  const renderLanguageSwitcher = () => (
    <label className="sr-only" htmlFor="app-language-switcher">
      {t("common.language")}
    </label>
  );

  const languageSwitcher = (
    <div className="relative shrink-0">
      {renderLanguageSwitcher()}
      <select
        id="app-language-switcher"
        className="h-8 max-w-[7rem] rounded-lg border border-white/10 bg-neutral-900 px-2 text-xs font-semibold text-white outline-none transition hover:bg-white/10 focus:border-white/40"
        aria-label={t("common.language")}
        value={currentLanguage}
        onChange={handleLanguageChange}
      >
        <option value="hy">{t("common.armenian")}</option>
        <option value="en">{t("common.english")}</option>
      </select>
    </div>
  );

  const renderAlertIcon = () => (
    <Link
      to="/notifications"
      className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
      aria-label={t("nav.notifications")}
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
      aria-label={t("nav.messages")}
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
          <span className="text-sm sm:text-base">{t("app.brand")}</span>
        </Link>

        {/* ─── Center: Nav (Desktop) ─── */}
        {showBarberChrome && (
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
              {t("nav.specialists")}
            </Link>
            <Link
              to="/salons"
              className={linkClass(pathname === "/salons")}
            >
              {t("nav.salons")}
            </Link>
            <Link
              to="/favorites"
              className={linkClass(pathname === "/favorites")}
            >
              {t("nav.favorites")}
            </Link>
            <Link
              to="/my-bookings"
              className={linkClass(pathname === "/my-bookings")}
            >
              {t("nav.bookings")}
            </Link>
            <Link
              to="/my-waitlist"
              className={linkClass(pathname === "/my-waitlist")}
            >
              {t("nav.waitlist")}
            </Link>
            <Link
              to="/profile"
              className={linkClass(pathname === "/profile")}
            >
              {t("nav.profile")}
            </Link>
          </nav>
        )}

        {/* ─── Spacer when nav is hidden ─── */}
        {!isAuthenticated && <div className="hidden lg:block lg:flex-1" />}

        {/* ─── Right: Actions ─── */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {languageSwitcher}

          {isAuthenticated && (
            <>
              {isBarberOnboarding ? (
                <button
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
                  onClick={logout}
                  type="button"
                  disabled={isLoggingOut}
                >
                  {t("nav.logout")}
                </button>
              ) : (
                <>
                  {renderAlertIcon()}
                  {renderMessageIcon()}

                  {/* User initials */}
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-700 text-[11px] font-bold text-white sm:h-8 sm:w-8 sm:text-xs">
                    {userInitials}
                  </div>

                  {/* More menu (desktop) — barber or platform admin */}
                  {(isBarber || isPlatformAdmin) && (
                    <div className="relative hidden lg:block" ref={moreMenuRef}>
                  <button
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                    onClick={() => setIsMoreOpen((v) => !v)}
                    aria-expanded={isMoreOpen}
                    aria-haspopup="menu"
                    type="button"
                  >
                    {t("nav.more")}
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
                    <div className="relative" ref={moreMenuRef}>
                      <button
                        className="flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                        onClick={handleClientProfileToggle}
                        aria-controls={clientProfileMenuId}
                        aria-expanded={isClientProfileOpen}
                        aria-haspopup="menu"
                        aria-label={t("nav.profile")}
                        type="button"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {isClientProfileOpen && (
                        <div
                          id={clientProfileMenuId}
                          className="absolute right-0 top-10 z-50 w-40 rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl shadow-black/50"
                          role="menu"
                        >
                          <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
                            {currentUser?.name || t("common.user")}
                          </div>
                          <button
                            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                            onClick={logout}
                            role="menuitem"
                            type="button"
                            disabled={isLoggingOut}
                          >
                            {t("nav.logout")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!isAuthenticated && (
            <div className="flex items-center gap-0.5 rounded-xl bg-neutral-800 p-0.5">
              <Link
                to="/login"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === "/login" || pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password")
                    ? "bg-white text-neutral-950 shadow-sm"
                    : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t("nav.signIn")}
              </Link>
              <Link
                to="/register"
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === "/register"
                    ? "bg-white text-neutral-950 shadow-sm"
                    : "text-neutral-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t("nav.join")}
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          {isAuthenticated && !isBarberOnboarding && (
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setIsMobileMenuOpen((v) => !v)}
              type="button"
              aria-label={t("nav.toggleMenu")}
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* ─── Mobile Navigation Drawer ─── */}
      {isAuthenticated && !isBarberOnboarding && isMobileMenuOpen && (
        <div className="mt-3 border-t border-neutral-800 pt-3 lg:hidden">
          <nav className="flex flex-col gap-0.5">
            {/* Primary barber nav items first */}
            {showBarberChrome &&
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
            {(showBarberChrome || isPlatformAdmin) && (
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
                { label: t("nav.specialists"), to: "/specialists" },
                { label: t("nav.salons"), to: "/salons" },
                { label: t("nav.favorites"), to: "/favorites" },
                { label: t("nav.bookings"), to: "/my-bookings" },
                { label: t("nav.waitlist"), to: "/my-waitlist" },
                { label: t("nav.notifications"), to: "/notifications" },
                { label: t("nav.messages"), to: "/messages" },
                { label: t("nav.profile"), to: "/profile" },
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
                  {currentUser?.name || currentUser?.email || t("common.user")}
                </div>
                <button
                  className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    logout();
                  }}
                  type="button"
                  disabled={isLoggingOut}
                >
                  {t("nav.logout")}
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
