import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import GoogleAuthButton from "@/shared/components/GoogleAuthButton";
import { Card, CardContent } from "@/shared/components/ui/card";
import { registerUser } from "@/store/slices/authSlice";
import { CalendarCheck, Scissors, ShieldCheck } from "lucide-react";

const googleAvailable = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
const getPostRegistrationPath = (userRole, redirectPath) => {
  if (redirectPath) return redirectPath;
  return userRole === "barber" ? "/admin/settings/salon" : "/";
};

export default function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);
  const redirectPath = searchParams.get("redirect") || "";
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "client",
  });

  if (isAuthenticated) {
    return (
      <Navigate
        to={redirectPath || (currentUser?.role === "barber" ? "/admin" : "/")}
        replace
      />
    );
  }

  const updateField = (field, value) => {
    setError("");
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const normalizedEmail = form.email.trim().toLowerCase();

    if (!form.name || !normalizedEmail || !form.phone || !form.password || !form.role) {
      setError(t("auth.register.missingFields"));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("auth.register.invalidEmail"));
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/auth/register", {
        name: form.name,
        email: normalizedEmail,
        phone: form.phone,
        password: form.password,
        role: form.role,
      });

      dispatch(registerUser(data));
      navigate(getPostRegistrationPath(data.user.role, redirectPath));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || t("auth.register.failed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-neutral-200 p-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-surface-subtle px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-center">
        {/* Left column — benefits */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              {t("auth.register.title")}
            </h1>
            <p className="mt-2 text-neutral-500">{t("auth.register.description")}</p>
          </div>

          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-sm text-neutral-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
                <CalendarCheck className="h-4 w-4 text-brand-600" />
              </div>
              <span>{t("auth.benefits.bookings")}</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-neutral-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
                <Scissors className="h-4 w-4 text-brand-600" />
              </div>
              <span>{t("auth.benefits.salon")}</span>
            </li>
            <li className="flex items-center gap-3 text-sm text-neutral-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
              </div>
              <span>{t("auth.benefits.secure")}</span>
            </li>
          </ul>
        </div>

        {/* Right column — register card */}
        <Card className="w-full max-w-md rounded-3xl border-0 bg-white shadow-lg">
          <div className="h-1.5 rounded-t-3xl bg-gradient-to-r from-brand-400 to-brand-500" />
          <CardContent className="space-y-5 p-6 sm:p-7">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reg-name">
                  {t("auth.fields.name")}
                </label>
                <input
                  id="reg-name"
                  className={inputClass}
                  placeholder={t("auth.fields.name")}
                  disabled={isLoading}
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reg-email">
                  {t("auth.fields.email")}
                </label>
                <input
                  id="reg-email"
                  className={inputClass}
                  placeholder={t("auth.fields.email")}
                  type="email"
                  disabled={isLoading}
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reg-phone">
                  {t("auth.fields.phone")}
                </label>
                <input
                  id="reg-phone"
                  className={inputClass}
                  placeholder={t("auth.fields.phone")}
                  disabled={isLoading}
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reg-password">
                  {t("auth.fields.password")}
                </label>
                <input
                  id="reg-password"
                  className={inputClass}
                  placeholder={t("auth.fields.password")}
                  type="password"
                  disabled={isLoading}
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold" htmlFor="reg-role">
                  {t("auth.fields.accountType")}
                </label>
                <select
                  id="reg-role"
                  className={inputClass + " bg-white"}
                  disabled={isLoading}
                  value={form.role}
                  onChange={(event) => updateField("role", event.target.value)}
                >
                  <option value="client">{t("auth.roles.client")}</option>
                  <option value="barber">{t("auth.roles.barber")}</option>
                </select>
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button
                className="w-full bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md hover:from-brand-600 hover:to-brand-700"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? t("auth.register.submitting") : t("auth.register.submit")}
              </Button>
            </form>

            {googleAvailable && <GoogleAuthButton />}

            <p className="text-center text-sm text-neutral-500">
              {t("auth.register.hasAccount")}{" "}
              <Link
                className="font-semibold text-neutral-900 hover:text-brand-700"
                to={redirectPath ? `/login?redirect=${encodeURIComponent(redirectPath)}` : "/login"}
              >
                {t("auth.register.loginLink")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}