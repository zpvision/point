"use client";
import { useEffect, useRef, useState } from "react";
type Offer = {
  document: { version: string; title: string; html: string };
  review: null | { reviewed_at: string };
};
export default function Offer({
  pointId,
  onReviewed,
}: {
  pointId: string;
  onReviewed?: (value: boolean) => void;
}) {
  const [data, setData] = useState<Offer | null>(null),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [end, setEnd] = useState(false),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const copy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gone = false;
    setData(null);
    setOpen(false);
    setEnd(false);
    setChecked(false);
    setError("");
    onReviewed?.(false);
    fetch("/api/cabinet/offer?pointId=" + encodeURIComponent(pointId))
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "Не удалось загрузить проект оферты. Сохраните заявку и повторите попытку.",
          );
        return (await r.json()) as Offer;
      })
      .then((d) => {
        if (!gone) {
          setData(d);
          onReviewed?.(!!d.review);
        }
      })
      .catch((e) => {
        if (!gone) setError(e.message);
      });
    return () => {
      gone = true;
    };
  }, [pointId, reload]);
  function checkEnd() {
    const n = copy.current;
    if (n && n.scrollHeight - n.clientHeight - n.scrollTop <= 4) setEnd(true);
  }
  useEffect(() => {
    if (!open) return;
    checkEnd();
    const n = copy.current;
    if (!n) return;
    const o = new ResizeObserver(checkEnd);
    o.observe(n);
    return () => o.disconnect();
  }, [open]);
  async function confirm() {
    if (!data || !end || !checked || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cabinet/offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointId,
          version: data.document.version,
          reviewed: true,
          readToEnd: true,
        }),
      });
      const result: any = await r.json();
      if (!r.ok)
        throw Error(result.error || "Не удалось сохранить ознакомление");
      setData(result);
      onReviewed?.(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="point-offer">
      <span className="draft-badge">ОБЯЗАТЕЛЬНО ПЕРЕД НАЧАЛОМ РАБОТЫ</span>
      <h2>Оферта для начала работы</h2>
      <p>
        Сейчас доступен проект. Ознакомление с ним обязательно для завершения
        заявки. Начать работу можно только после согласования тарифов,
        подписания окончательной оферты и подтверждения подключения.
      </p>
      {!data && !error && <p role="status">Загружаем документ…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setReload((v) => v + 1)} type="button">
            Повторить
          </button>
        </p>
      )}
      {data && (
        <>
          <p>
            <strong>
              {data.review
                ? "С проектом ознакомлен · договор ещё не подписан"
                : "Проект оферты · требуется ознакомление"}
            </strong>
          </p>
          <button type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "Свернуть документ" : "Прочитать проект оферты"}
          </button>{" "}
          <a href="/legal/point-offer" target="_blank" rel="noopener">
            Открыть отдельно / сохранить
          </a>
          {open && (
            <>
              <p className="point-legal-note">
                Юридические документы представлены на русском языке.
                Ознакомьтесь с полным оригиналом перед подтверждением.
              </p>
              <div
                ref={copy}
                className="offer-copy"
                tabIndex={0}
                onScroll={checkEnd}
                translate="no"
                dangerouslySetInnerHTML={{ __html: data.document.html }}
              />
              {!data.review && (
                <>
                  <p role="status">
                    {end
                      ? "Документ просмотрен. Подтвердите ознакомление."
                      : "Прокрутите проект до конца, чтобы продолжить."}
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!end || busy}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    <span>
                      Я ознакомился с проектом оферты. Понимаю, что это не
                      подписание договора и не разрешение на начало работы.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!end || !checked || busy}
                    onClick={confirm}
                  >
                    {busy
                      ? "Сохраняем…"
                      : "Подтвердить ознакомление с проектом"}
                  </button>
                </>
              )}
            </>
          )}
          {data.review && (
            <p>
              Версия: <span translate="no">{data.document.version}</span> ·{" "}
              <time dateTime={data.review.reviewed_at}>
                {new Date(data.review.reviewed_at).toLocaleDateString("ru-RU")}
              </time>
            </p>
          )}
          <p>
            <button type="button" disabled>
              Подписать окончательную оферту — после согласования
            </button>
          </p>
        </>
      )}
    </section>
  );
}
