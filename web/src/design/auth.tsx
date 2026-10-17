import { useState } from "react";
import { api, errorText } from "../api";
import type { Session } from "../types";
import { QuestionRenderer } from "../questions";
import { landingHref } from "@/lib/site-links";
export const returnTo = () => {
  const v = new URLSearchParams(location.search).get("returnTo") || "/account";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")
    ? v
    : "/account";
};
export function Auth({ register = false }: { register?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState<Session | null>(null),
    [value, setValue] = useState<unknown>();
  const q = session?.next;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!register) {
        await api("/auth/login", "POST", { email, password });
        location.assign(returnTo());
        return;
      }
      let s = session;
      if (!s) {
        s = (
          await api<{ session: Session }>("/registration/sessions", "POST", {
            code: "USER_REGISTRATION",
          })
        ).session;
        setSession(s);
        return;
      }
      if (q) {
        s = await api<Session>(
          `/registration/sessions/${s.id}/answers`,
          "POST",
          { key: q.key, value, version_id: s.version_id },
        );
        setSession(s);
        setValue(undefined);
      }
      if (!s.next) {
        await api(`/registration/sessions/${s.id}/complete`, "POST", {});
        location.assign(returnTo());
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="header">
        <a href={landingHref("/")} className="logo">
          point<span>.</span>
        </a>
        <span className="header-divider" />
        <span className="header-label">Партнёрский кабинет</span>
      </header>
      <main className="main auth-design">
        <form className="profile-card" onSubmit={submit}>
          <span className="eyebrow">POINT · ПАРТНЁРАМ</span>
          <h1>{register ? "Начнём со знакомства." : "С возвращением."}</h1>
          <p className="hint">
            {register
              ? "Создайте учётную запись для подключения вашей точки."
              : "Войдите, чтобы управлять своими Point."}
          </p>
          {register ? (
            q ? (
              <div className="native-details">
                <h3>{q.title}</h3>
                <QuestionRenderer
                  question={q}
                  sessionId={session!.id}
                  value={value}
                  onChange={setValue}
                />
              </div>
            ) : (
              <p>Регистрация займёт несколько минут.</p>
            )
          ) : (
            <>
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary lime-action" disabled={busy}>
            {busy
              ? "Подождите…"
              : register
                ? session
                  ? "Продолжить"
                  : "Создать аккаунт"
                : "Войти"}
          </button>
          <p className="hint">
            <a
              href={
                (register ? "/login" : "/register") +
                "?returnTo=" +
                encodeURIComponent(returnTo())
              }
            >
              {register
                ? "Уже есть аккаунт? Войти"
                : "Нет аккаунта? Зарегистрироваться"}
            </a>
          </p>
        </form>
      </main>
    </>
  );
}
