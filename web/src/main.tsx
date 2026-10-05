import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, errorText } from "./api";
import type { User } from "./types";
import { AppContext, ErrorNotice, Header } from "./ui";
import { RegistrationChat } from "./chat";
import { ScenarioEditor, ScenarioList } from "./admin";
import {
  Account,
  ApplicationDetail,
  Applications,
  Login,
  MyPoints,
} from "./pages";
import "./styles.css";
function App() {
  const initialUser = useRef<User | null | undefined>(undefined);
  const [user, setUser] = useState<User | null>(null);
  const [mapsKey, setMapsKey] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const me = await api<{ user: User | null; maps_key: string }>("/me");
    if (initialUser.current === undefined) initialUser.current = me.user;
    setUser(me.user);
    setMapsKey(me.maps_key);
  }
  useEffect(() => {
    refresh()
      .then(() => setReady(true))
      .catch((e) => setError(errorText(e)));
  }, []);
  if (error)
    return (
      <main className="page">
        <ErrorNotice text={error} />
        <button onClick={() => location.reload()}>Повторить</button>
      </main>
    );
  if (!ready) return <main className="loading-page">Point · Загрузка…</main>;
  const path = location.pathname;
  let page;
  if (path === "/login") page = <Login />;
  else if (path === "/register")
    page = initialUser.current ? (
      <MyPoints />
    ) : (
      <RegistrationChat code="USER_REGISTRATION" />
    );
  else if (!user) page = <Login />;
  else if (path.startsWith("/admin") && user.role !== "admin")
    page = (
      <>
        <Header title="Доступ ограничен" />
        <main className="page">
          <h1>Недостаточно прав</h1>
          <a href="/points">К моим Point</a>
        </main>
      </>
    );
  else if (path === "/points/new")
    page = <RegistrationChat code="POINT_REGISTRATION" />;
  else if (path === "/admin/scenarios") page = <ScenarioList />;
  else if (path.startsWith("/admin/scenarios/"))
    page = <ScenarioEditor id={path.split("/")[3]} />;
  else if (path === "/admin/applications") page = <Applications />;
  else if (path.startsWith("/applications/"))
    page = <ApplicationDetail id={path.split("/")[2]} />;
  else if (path === "/account") page = <Account />;
  else page = <MyPoints />;
  return (
    <AppContext.Provider value={{ user, mapsKey, refresh }}>
      {page}
    </AppContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
