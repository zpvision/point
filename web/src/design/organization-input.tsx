import { useEffect, useRef, useState } from "react";
import { innLengthIssue, type PointData } from "@/lib/cabinet-point";
import { organizationFields } from "./organization";
import {
  applyOrganizationResult,
  lookupOrganization,
  validOrganizationINN,
} from "./organization-lookup";

export default function OrganizationInput({
  data,
  onChange,
}: {
  data: PointData;
  onChange: (patch: Partial<PointData>) => void;
}) {
  const fields = organizationFields(data.legal);
  const [result, setResult] = useState<{
    state: "idle" | "loading" | "success" | "error";
    message: string;
  }>({ state: "idle", message: "" });
  const [retry, setRetry] = useState(0);
  const latest = useRef({ data, onChange });
  latest.current = { data, onChange };
  const valid = validOrganizationINN(data.inn, data.legal);
  useEffect(() => {
    if (!valid) {
      setResult({ state: "idle", message: "" });
      return;
    }
    if (
      retry === 0 &&
      latest.current.data.backend?.organization?.inn === data.inn
    ) {
      setResult({
        state: "success",
        message: "Реквизиты сохранены. Проверьте их перед отправкой заявки.",
      });
      return;
    }
    const requested = {
        inn: data.inn,
        legal: data.legal,
        company: data.company,
      },
      controller = new AbortController();
    setResult({ state: "loading", message: "Ищем организацию по ИНН…" });
    const timer = setTimeout(async () => {
      try {
        const organization = await lookupOrganization(
          requested.inn,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const patch = applyOrganizationResult(
          latest.current.data,
          requested,
          organization,
        );
        if (!patch) return;
        latest.current.onChange(patch);
        setResult({
          state: "success",
          message: "Реквизиты загружены. Проверьте их перед отправкой заявки.",
        });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Не удалось загрузить реквизиты. Заполните их вручную.",
          });
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [data.inn, data.legal, valid, retry]);
  const complete =
    data.legal === "Другое юридическое лицо"
      ? [10, 12].includes(data.inn.length)
      : data.inn.length === fields.innLength;
  const lengthError = [10, 12].includes(data.inn.length)
    ? innLengthIssue(data)
    : "";
  return (
    <>
      <label className="field">
        <span>ИНН</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={fields.innLength}
          value={data.inn}
          placeholder={fields.innPlaceholder}
          onChange={(e) => {
            const inn = e.target.value
              .replace(/\D/g, "")
              .slice(0, fields.innLength);
            if (inn === data.inn) return;
            const old = data.backend?.organization;
            onChange({
              inn,
              company:
                old && data.company === old.short_name ? "" : data.company,
              backend: { ...data.backend, organization: undefined },
            });
          }}
        />
      </label>
      <label className="field">
        <span>{fields.companyLabel}</span>
        <input
          type="text"
          maxLength={250}
          value={data.company}
          placeholder={fields.companyPlaceholder}
          aria-busy={result.state === "loading"}
          onChange={(e) => {
            const company = e.target.value;
            onChange({
              company,
              backend: {
                ...data.backend,
                organization: data.backend?.organization
                  ? {
                      ...data.backend.organization,
                      short_name: company,
                      confirmed: false,
                    }
                  : undefined,
              },
            });
          }}
        />
      </label>
      {lengthError ? (
        <p className="form-error" role="alert">
          {lengthError}
        </p>
      ) : complete && !valid ? (
        <p className="form-error" role="alert">
          Проверьте ИНН: неверные контрольные цифры.
        </p>
      ) : result.message ? (
        <p
          className={result.state === "error" ? "form-error" : "hint"}
          role={result.state === "error" ? "alert" : "status"}
        >
          {result.message}
        </p>
      ) : (
        <p className="hint">
          После ввода корректного ИНН название и реквизиты подгрузятся
          автоматически. При необходимости их можно заполнить вручную.
        </p>
      )}
      {valid && result.state !== "loading" && (
        <button
          type="button"
          className="text-button"
          onClick={() => setRetry((v) => v + 1)}
        >
          {result.state === "error"
            ? "Повторить поиск по ИНН"
            : "Обновить реквизиты по ИНН"}
        </button>
      )}
    </>
  );
}
