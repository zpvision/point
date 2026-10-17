import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
const Cabinet = lazy(() => import("./design/cabinet"));
const Market = lazy(() => import("./design/market"));
import PointInterface from "./design/point-interface";
import { Auth, returnTo } from "./design/auth";
import { api } from "./api";
import type { User } from "./types";
import { AppContext } from "./ui";
const LegacyApp = lazy(() => import("./legacy-app"));
import "./design/integration.css";
const path = location.pathname;
const legacy =
  path.startsWith("/admin") ||
  path.startsWith("/applications/") ||
  path === "/verification";
const baseline = document.createElement("link");
baseline.rel = "stylesheet";
baseline.href = "/market.css";
if (!legacy) document.head.append(baseline);
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = legacy
  ? "/legacy.css"
  : path.startsWith("/market")
    ? "/market.css"
    : path === "/registration-consent"
      ? "/point-consent.css"
      : "/cabinet.css";
document.head.append(stylesheet);
const globalStyle = document.createElement("link");
globalStyle.rel = "stylesheet";
globalStyle.href = "/point-global.css?v=16";
document.head.append(globalStyle);
if (path === "/points") location.replace("/account");
if (path === "/points/new") {
  const id = new URLSearchParams(location.search).get("session");
  location.replace("/account/points/" + (id || "new"));
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [mapsKey, setMapsKey] = useState(""),
    [ready, setReady] = useState(false),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    const me = await api<{ user: User | null; maps_key: string }>("/me");
    setUser(me.user);
    setMapsKey(me.maps_key);
    setConsent(
      (await api<{ accepted: boolean }>("/point-consent/status")).accepted,
    );
  }
  useEffect(() => {
    refresh()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (path === "/logout") {
      api("/auth/logout", "POST", {})
        .then(() => location.assign("/login"))
        .catch((e) => setError(e.message));
      return;
    }
    if (path === "/registration-consent") {
      document.body.className = "point-legal";
      document.body.setAttribute("data-point-consent-auto", "");
      const script = document.createElement("script");
      script.src = "/point-consent.js?v=16";
      document.body.append(script);
      return () => {
        script.remove();
        document.body.className = "";
        document.body.removeAttribute("data-point-consent-auto");
      };
    }
    if (
      !consent &&
      !legacy &&
      !path.startsWith("/market") &&
      !["/login", "/register", "/registration-consent", "/logout"].includes(
        path,
      )
    ) {
      location.replace(
        "/registration-consent?returnTo=" +
          encodeURIComponent(path === "/" ? "/account" : path),
      );
      return;
    }
    if (
      !user &&
      !path.startsWith("/market") &&
      !["/login", "/register", "/registration-consent"].includes(path) &&
      !legacy
    )
      location.replace(
        "/login?returnTo=" +
          encodeURIComponent(path === "/" ? "/account" : path),
      );
  }, [ready, user, consent]);
  if (error)
    return (
      <main className="main">
        <h1>Не удалось открыть Point</h1>
        <p role="alert">{error}</p>
        <button onClick={() => location.reload()}>Повторить</button>
      </main>
    );
  if (!ready)
    return (
      <main className="main">
        <p role="status">Загружаем кабинет…</p>
      </main>
    );
  const name = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ")
    : "";
  return (
    <AppContext.Provider value={{ user, mapsKey, refresh }}>
      <Suspense
        fallback={
          <main className="main">
            <p role="status">Загружаем кабинет…</p>
          </main>
        }
      >
        {legacy ? (
          <LegacyApp />
        ) : path === "/registration-consent" ? (
          <ConsentPage />
        ) : path === "/login" || path === "/register" ? (
          <Auth register={path === "/register"} />
        ) : path.startsWith("/market") ? (
          <Market
            user={user ? { email: user.email, name } : null}
            signIn="/login?returnTo=%2Fmarket"
          />
        ) : user && consent ? (
          <div className="cabinet-root">
            <Cabinet user={{ name, email: user.email, role: user.role }} />
          </div>
        ) : null}
      </Suspense>
      <PointInterface />
    </AppContext.Provider>
  );
}
function ConsentPage() {
  return (
    <main>
      <a className="pc-brand" href="/">
        point<span className="point-dot">.</span>
      </a>
      <h1>Начнём со знакомства.</h1>
      <p>
        Перед заполнением заявки прочитайте отдельное согласие на обработку
        персональных данных.
      </p>
      <a className="pc-primary" href={returnTo()}>
        Открыть согласие
      </a>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
