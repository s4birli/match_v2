import { cookies } from "next/headers";

/**
 * Three-state theme. "system" means follow `prefers-color-scheme`. The
 * resolution to a concrete dark/light class happens client-side via the
 * inline `<script>` injected from RootLayout — see `themeBootstrapScript`.
 *
 * We persist the *user choice* (`light | dark | system`), not the resolved
 * value, so that switching the OS theme keeps the "system" mode reactive
 * after the user picked it.
 */
export type ThemeChoice = "light" | "dark" | "system";

const THEME_COOKIE = "theme";

export async function resolveThemeChoice(): Promise<ThemeChoice> {
  const cookieStore = await cookies();
  const v = cookieStore.get(THEME_COOKIE)?.value;
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

/**
 * Inline `<script>` that runs *before* React hydrates so we never flash
 * the wrong theme. Reads the `theme` cookie OR falls back to
 * matchMedia('(prefers-color-scheme: dark)') and stamps the `dark` class
 * on `<html>`. Tiny on purpose.
 */
export const themeBootstrapScript = `
(function(){
  try {
    var m = document.cookie.match(/(?:^|; )theme=(light|dark|system)/);
    var choice = m ? m[1] : "system";
    var dark =
      choice === "dark" ||
      (choice === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    var html = document.documentElement;
    if (dark) html.classList.add("dark");
    else html.classList.remove("dark");
  } catch(e) {}
})();
`;
