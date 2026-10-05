export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public question_key?: string,
    public errors: string[] = [],
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response
    .json()
    .catch(() => ({ message: "Не удалось получить ответ сервера" }));
  if (!response.ok)
    throw new ApiError(
      data.code || "NETWORK",
      data.message || "Не удалось выполнить запрос",
      data.question_key,
      Array.isArray(data.errors)
        ? data.errors.flatMap((issue: unknown) => {
            if (typeof issue === "string") return [issue];
            if (
              issue &&
              typeof issue === "object" &&
              "message" in issue &&
              typeof issue.message === "string"
            )
              return [issue.message];
            return [];
          })
        : [],
    );
  return data;
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Ошибка сети. Попробуйте ещё раз.";
export const errorMessages = (e: unknown): string[] =>
  e instanceof ApiError && e.errors.length
    ? [...new Set(e.errors)]
    : [errorText(e)];
export function uploadFile(
  session: string,
  key: string,
  category: string,
  file: File,
  progress: (n: number) => void,
): Promise<{ id: string; category: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/registration/sessions/${session}/attachments`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded * 100) / e.total));
    };
    xhr.onerror = () => reject(new Error("Ошибка сети. Повторите загрузку."));
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(result.message));
        else resolve(result);
      } catch {
        reject(new Error("Не удалось загрузить файл"));
      }
    };
    const data = new FormData();
    data.append("question_key", key);
    data.append("category", category);
    data.append("file", file);
    xhr.send(data);
  });
}
