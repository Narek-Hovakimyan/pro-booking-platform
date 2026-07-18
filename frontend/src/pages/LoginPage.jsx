import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import GoogleAuthButton from "@/shared/components/GoogleAuthButton";
import { Card, CardContent } from "@/shared/components/ui/card";
import { resolvePostAuthDestination } from "@/shared/api/barberOnboarding";
import { loginUser } from "@/store/slices/authSlice";
import { CalendarCheck, Scissors, ShieldCheck } from "lucide-react";

const googleAvailable = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);
  const redirectPath = searchParams.get("redirect") || "";
  const authRequestRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    phone: "",
    password: "",
  });

  useEffect(() => {
    return () => {
      authRequestRef.current += 1;
    };
  }, []);

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

    if (!form.phone || !form.password) {
      setError(t("auth.login.missingFields"));
      return;
    }

    setIsLoading(true);
    const requestId = authRequestRef.current + 1;
    authRequestRef.current = requestId;

    try {
      const { data } = await api.post("/auth/login", {
        phone: form.phone,
        password: form.password,
      });

      if (authRequestRef.current !== requestId) return;
      const destination = await resolvePostAuthDestination(
        data.user,
        redirectPath || (data.user.role === "barber" ? "/admin" : "/"),
        data.token
      );

      if (authRequestRef.current !== requestId) return;
      dispatch(loginUser(data));
      navigate(destination);
    } catch (requestError) {
      if (authRequestRef.current !== requestId) return;
      setError(
        requestError.response?.data?.message || t("auth.login.failed")
      );
    } finally {
      if (authRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-surface-subtle px-4 py-10">
      <div className="flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-center">
        {/* Left column — benefits */}
        <div className="flex-1 space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
              {t("auth.login.title")}
            </h1>
            <p className="mt-2 text-neutral-500">{t("auth.login.description")}</p>
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

        {/* Right column — login card */}
        <Card className="w-full max-w-md rounded-3xl border-0 bg-white shadow-lg">
          <div className="h-1.5 rounded-t-3xl bg-gradient-to-r from-brand-400 to-brand-500" />
          <CardContent className="space-y-5 p-6 sm:p-7">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-neutral-900" htmlFor="login-phone">
                  {t("auth.fields.phone")}
                </label>
                <input
                  id="login-phone"
                  className="w-full rounded-2xl border border-neutral-200 p-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder={t("auth.fields.phone")}
                  disabled={isLoading}
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold text-neutral-900" htmlFor="login-password">
                  {t("auth.fields.password")}
                </label>
                <input
                  id="login-password"
                  className="w-full rounded-2xl border border-neutral-200 p-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  placeholder={t("auth.fields.password")}
                  type="password"
                  disabled={isLoading}
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                />
              </div>

              <div className="text-right text-sm">
                <Link
                  className="font-medium text-brand-600 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
                  to="/forgot-password"
                >
                  Forgot password?
                </Link>
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
                {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
              </Button>
            </form>

            {googleAvailable && <GoogleAuthButton />}

            <p className="text-center text-sm text-neutral-500">
              {t("auth.login.noAccount")}{" "}
              <Link
                className="font-semibold text-neutral-900 hover:text-brand-700"
                to={redirectPath ? `/register?redirect=${encodeURIComponent(redirectPath)}` : "/register"}
              >
                {t("auth.login.registerLink")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
