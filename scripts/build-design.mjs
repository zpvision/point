import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import ts from "typescript";
const root = fileURLToPath(new URL("../", import.meta.url));
const from = root + "web/src/design/cabinet.css";
const to = root + "web/public/cabinet.css";
await mkdir(root + "web/public", { recursive: true });
const result = await postcss([tailwind()]).process(
  await readFile(from, "utf8"),
  { from, to },
);
await writeFile(to, result.css);
// The same versioned legal copy feeds the browser and Go. No runtime dependency on app/.
const documentSource = await readFile(
  root + "web/src/lib/point-consent-document.ts",
  "utf8",
);
const documentModule = ts.transpileModule(documentSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { consentDocument, privacySections } = await import(
  "data:text/javascript;base64," +
    Buffer.from(documentModule).toString("base64")
);
await mkdir(root + "internal/app/design-documents", { recursive: true });
await writeFile(
  root + "internal/app/design-documents/consent.json",
  JSON.stringify(consentDocument()),
);
await writeFile(
  root + "internal/app/design-documents/privacy.json",
  JSON.stringify(privacySections()),
);
await writeFile(
  root + "internal/app/design-documents/offer.json",
  await readFile(root + "web/src/lib/point-offer-document.json"),
);

const marketFrom = root + "web/src/design/market.css";
await writeFile(
  root + "web/public/market.css",
  (
    await postcss([tailwind()]).process(await readFile(marketFrom, "utf8"), {
      from: marketFrom,
      to: root + "web/public/market.css",
    })
  ).css,
);
