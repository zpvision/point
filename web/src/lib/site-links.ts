// Vite injects this public value for both client and server builds.
const landingOrigin = (
  import.meta.env.VITE_LANDING_URL || "http://localhost:5173"
).replace(/\/$/, "");

export function landingHref(path = "/") {
  return `${landingOrigin}${path}`;
}
