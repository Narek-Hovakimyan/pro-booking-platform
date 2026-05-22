import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, useNavigate } from "react-router-dom";

import api from "@/shared/api/axios";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { loginUser } from "@/store/slices/authSlice";

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated } = useSelector((state) => state.auth);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    phone: "",
    password: "",
  });

  if (isAuthenticated) {
    return (
      <Navigate
        to={currentUser?.role === "barber" ? "/admin" : "/"}
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
      setError("Լրացրու հեռախոսահամարը և գաղտնաբառը։");
      return;
    }

    setIsLoading(true);

    try {
      const { data } = await api.post("/auth/login", {
        phone: form.phone,
        password: form.password,
      });

      dispatch(loginUser(data));
      navigate(data.user.role === "barber" ? "/admin" : "/");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Մուտքը չհաջողվեց։ Փորձիր կրկին։"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-xl rounded-2xl sm:rounded-3xl">
      <CardContent className="space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Մուտք</h1>
          <p className="mt-2 text-neutral-500">
            Մուտք գործիր հեռախոսահամարով և գաղտնաբառով։
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold">
            Phone
            <input
              className="w-full rounded-2xl border p-3 font-normal"
              placeholder="Հեռախոսահամար"
              disabled={isLoading}
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold">
            Password
            <input
              className="w-full rounded-2xl border p-3 font-normal"
              placeholder="Գաղտնաբառ"
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
            {isLoading ? "Մուտք է կատարվում..." : "Մուտք գործել"}
          </Button>
        </form>

        <p className="text-sm text-neutral-500">
          Չունե՞ս հաշիվ։{" "}
          <Link className="font-medium text-neutral-900" to="/register">
            Գրանցվիր
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
