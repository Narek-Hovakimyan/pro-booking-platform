import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const getMenuGroups = (
  canShowManageHiring,
  canManageSalon,
  isPlatformAdmin,
  showBusinessGroups
) => {
  const groups = [];

  if (isPlatformAdmin) {
    groups.push({
      key: "platform",
      label: "Platform",
      children: [
        { label: "Platform Billing", to: "/admin/platform/billing" },
      ],
    });
  }

  if (showBusinessGroups) {
    groups.push({
      key: "account",
      label: "Account",
      children: [
        { label: "Profile", to: "/admin/profile" },
        { label: "Settings Hub", to: "/admin/settings" },
        { label: "Default Schedule", to: "/admin/settings/default-schedule" },
        { label: "Deposit", to: "/admin/settings/deposit" },
        { label: "Certifications", to: "/admin/settings/certifications" },
        { label: "Billing", to: "/admin/billing" },
      ],
    });
  }

  if (canManageSalon) {
    groups.push({
      key: "salon",
      label: "Salon",
      children: [
        { label: "Salon Dashboard", to: "/admin/salon/dashboard" },
        { label: "Salon Calendar", to: "/admin/salon/calendar" },
        { label: "Salon Reports", to: "/admin/salon/reports" },
        { label: "Salon Billing", to: "/admin/salon/billing" },
        { label: "Salon Settings", to: "/admin/settings/salon" },
      ],
    });
  }

  if (showBusinessGroups) {
    const marketingLinks = [
      ...(canManageSalon
        ? [
            { label: "Salon Promotions", to: "/admin/salon/promotions" },
            { label: "Revenue", to: "/admin/revenue" },
          ]
        : []),
      { label: "Promo Codes", to: "/admin/vouchers" },
    ];

    groups.push(
      {
        key: "marketing",
        label: "Marketing",
        children: marketingLinks,
      },
      {
        key: "hiring",
        label: "Hiring / Jobs",
        children: [
          { label: "Find Jobs", to: "/jobs" },
          ...(canShowManageHiring
            ? [{ label: "Manage Hiring", to: "/admin/jobs" }]
            : []),
          { label: "My Applications", to: "/jobs/applications" },
        ],
      },
      {
        key: "work",
        label: "Work",
        children: [
          { label: "Portfolio", to: "/admin/portfolio" },
          { label: "Events", to: "/events" },
          { label: "Waitlist", to: "/admin/waitlist" },
        ],
      }
    );
  }

  return groups;
};

const linkClass = (isActive) =>
  `block w-full rounded-lg px-3 py-2 text-sm font-medium text-left transition ${
    isActive
      ? "bg-white/15 text-white"
      : "text-neutral-400 hover:bg-white/10 hover:text-white"
  }`;

/**
 * NestedHeaderMenu
 * variant="desktop" — absolutely positioned popup with hover/click submenus
 * variant="mobile"  — inline expandable groups inside a drawer
 */
export default function NestedHeaderMenu({
  variant,
  isOpen,
  onClose,
  onLinkClick,
  currentUser,
  onLogout,
  canShowManageHiring = false,
  canManageSalon = false,
  isPlatformAdmin = false,
  showBusinessGroups = true,
}) {
  const { pathname } = useLocation();
  const [activeGroup, setActiveGroup] = useState(null);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const menuRef = useRef(null);
  const closeTimer = useRef(null);

  /* ── Desktop: close on Escape / click outside ── */
  useEffect(() => {
    if (variant !== "desktop" || !isOpen) return;

    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    const timer = setTimeout(() => window.addEventListener("mousedown", handleClick), 0);

    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [variant, isOpen, onClose]);

  const handleNavigate = (to) => {
    onLinkClick?.(to);
    onClose?.();
  };

  const handleLogout = () => {
    onLinkClick?.();
    onClose?.();
    onLogout?.();
  };

  /* ── Desktop hover helpers ── */
  const handleGroupEnter = (key) => {
    if (variant !== "desktop") return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveGroup(key);
  };

  const handleMenuLeave = () => {
    if (variant !== "desktop") return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveGroup(null), 120);
  };

  const handleSubmenuEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const handleSubmenuLeave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveGroup(null), 120);
  };

  /* ── Desktop render ── */
  if (variant === "desktop") {
    if (!isOpen) return null;

    return (
      <div
        ref={menuRef}
        className="absolute right-0 top-10 z-50 min-w-[200px] rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl shadow-black/50"
        role="menu"
      >
        <div onMouseLeave={handleMenuLeave}>
          {getMenuGroups(
            canShowManageHiring,
            canManageSalon,
            isPlatformAdmin,
            showBusinessGroups
          ).map((group) => (
            <div key={group.key} className="relative">
              {/* Group header (trigger for submenu) */}
              <button
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 transition hover:bg-white/5"
                onMouseEnter={() => handleGroupEnter(group.key)}
                onClick={() => handleGroupEnter(group.key)}
                type="button"
              >
                {group.label}
                <ChevronRight className="h-3 w-3 text-neutral-600" />
              </button>

              {/* Desktop submenu */}
              {activeGroup === group.key && (
                <div
                  className="absolute left-full top-0 ml-1 min-w-[180px] rounded-xl border border-neutral-800 bg-neutral-950 p-1.5 shadow-xl shadow-black/50"
                  onMouseEnter={handleSubmenuEnter}
                  onMouseLeave={handleSubmenuLeave}
                >
                  {group.children.map((child) => (
                    <button
                      key={child.to}
                      className={linkClass(pathname === child.to)}
                      onClick={() => handleNavigate(child.to)}
                      role="menuitem"
                      type="button"
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Divider + Account */}
        <div className="my-1.5 border-t border-neutral-800" />
        <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
          {currentUser?.name || currentUser?.email || "User"}
        </div>
        <button
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
          onClick={handleLogout}
          role="menuitem"
          type="button"
        >
          Logout
        </button>
      </div>
    );
  }

  /* ── Mobile render ── */
  return (
    <div className="flex flex-col gap-0.5">
      {getMenuGroups(
        canShowManageHiring,
        canManageSalon,
        isPlatformAdmin,
        showBusinessGroups
      ).map((group) => {
        const isExpanded = expandedGroup === group.key;

        return (
          <div key={group.key}>
            <button
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 transition hover:bg-white/5"
              onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
              type="button"
            >
              {group.label}
              <ChevronRight
                className={`h-3 w-3 text-neutral-600 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            </button>

            {isExpanded && (
              <div className="ml-3 flex flex-col gap-0.5 border-l border-neutral-800 pl-2">
                {group.children.map((child) => (
                  <button
                    key={child.to}
                    className={linkClass(pathname === child.to)}
                    onClick={() => handleNavigate(child.to)}
                    type="button"
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Account section */}
      <div className="my-1.5 border-t border-neutral-800" />
      <div className="px-3 py-1.5 text-xs font-medium text-neutral-500">
        {currentUser?.name || currentUser?.email || "User"}
      </div>
      <button
        className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-neutral-400 transition hover:bg-white/10 hover:text-white"
        onClick={handleLogout}
        type="button"
      >
        Logout
      </button>
    </div>
  );
}
