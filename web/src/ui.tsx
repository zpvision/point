import { createContext, useContext } from "react";
import type { User } from "./types";
export const AppContext = createContext<{
  user: User | null;
  mapsKey: string;
  refresh: () => Promise<void>;
}>({ user: null, mapsKey: "", refresh: async () => {} });
export const useApp = () => useContext(AppContext);
export function initials(first = "", last = "") {
  return (
    ((first.trim()[0] || "") + (last.trim()[0] || "")).toUpperCase() || "P"
  );
}
export function Logo() {
  return (
    <a className="logo" href="/points">
      <span className="brand-mark">
        P<span />
      </span>
      Point
    </a>
  );
}
export function AssistantIcon() {
  return (
    <span className="assistant-icon" aria-hidden="true">
      P<span />
    </span>
  );
}
export function ErrorNotice({
  text,
  items,
}: {
  text: string;
  items?: string[];
}) {
  return text ? (
    <div role="alert" className="error">
      <span className="error-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      <div>
        {text}
        {items?.length ? (
          <ul className="error-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  ) : null;
}
export function Spinner() {
  return <span className="spinner" aria-label="Загрузка" />;
}
export function Header({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const { user } = useApp();
  return (
    <header className="header">
      <Logo />
      <span className="divider" />
      <span className="header-title">{title}</span>
      <div className="header-right">
        {children}
        {user && (
          <details className="user-menu">
            <summary aria-label="Меню пользователя">
              <span className="avatar">
                {initials(user.first_name, user.last_name)}
              </span>
            </summary>
            <div className="menu">
              <strong>
                {user.first_name} {user.last_name}
              </strong>
              <a href="/points">Мои Point</a>
              {user.role === "admin" && (
                <a href="/admin/scenarios">Администрирование</a>
              )}
              <a href="/account">Подтверждение контактов</a>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  location.href = "/login";
                }}
              >
                Выйти
              </button>
            </div>
          </details>
        )}
      </div>
    </header>
  );
}
