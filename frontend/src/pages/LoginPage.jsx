import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { loginUser } from "@/store/slices/authSlice";

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);
  const redirectPath = searchParams.get("redirect") || "";
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    phone: "",
    password: "",
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

    if (!form.phone || !form.password) {
      setError(t("auth.login.missingFields"));
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/auth/login", {
        phone: form.phone,
        password: form.password,
      });

      dispatch(loginUser(data));
      navigate(redirectPath || (data.user.role === "barber" ? "/admin" : "/"));
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          t("auth.login.failed")
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-xl rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("auth.login.title")}
          </h1>
          <p className="mt-2 text-neutral-500">
            {t("auth.login.description")}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold">
            {t("auth.fields.phone")}
            <input
              className="w-full rounded-2xl border p-3 font-normal"
              placeholder={t("auth.fields.phone")}
              disabled={isLoading}
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            {t("auth.fields.password")}
            <input
              className="w-full rounded-2xl border p-3 font-normal"
              placeholder={t("auth.fields.password")}
              type="password"
              disabled={isLoading}
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </form>

        <p className="text-sm text-neutral-500">
          {t("auth.login.noAccount")}{" "}
          <Link
            className="font-medium text-neutral-900"
            to={redirectPath ? `/register?redirect=${encodeURIComponent(redirectPath)}` : "/register"}
          >
            {t("auth.login.registerLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
