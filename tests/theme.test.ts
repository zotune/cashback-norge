import assert from "node:assert/strict";
import { test } from "node:test";
import { createThemeStore } from "../src/shared/theme.js";

class SystemTheme extends EventTarget {
  matches = false;
  change(dark: boolean) { this.matches = dark; this.dispatchEvent(new Event("change")); }
}
const mediaQuery = (media: SystemTheme) => media as unknown as MediaQueryList;

test("system appearance follows changes, while a manual choice remains fixed", () => {
  const media = new SystemTheme();
  const saved: string[] = [];
  const theme = createThemeStore({ media: mediaQuery(media), save: (value) => saved.push(value) });
  assert.equal(theme.state().resolved, "light");
  media.change(true);
  assert.equal(theme.state().resolved, "dark");
  theme.set("light");
  media.change(false); media.change(true);
  assert.deepEqual(theme.state(), { preference: "light", resolved: "light" });
  theme.set("system");
  assert.equal(theme.state().resolved, "dark");
  assert.deepEqual(saved, ["light", "system"]);
  theme.dispose();
});

test("saved manual appearance overrides the system on startup", () => {
  const theme = createThemeStore({ media: mediaQuery(new SystemTheme()), initialPreference: "dark" });
  assert.deepEqual(theme.state(), { preference: "dark", resolved: "dark" });
  theme.dispose();
});

test("a delayed extension storage read cannot overwrite the user's latest choice", async () => {
  let finish!: (value: unknown) => void;
  const theme = createThemeStore({ media: mediaQuery(new SystemTheme()), load: () => new Promise((resolve) => { finish = resolve; }) });
  theme.set("dark");
  finish("light");
  await Promise.resolve();
  assert.equal(theme.state().preference, "dark");
  theme.dispose();
});

test("external storage changes update open views, and subscriptions are cleaned up", () => {
  const media = new SystemTheme();
  let receive!: (value: unknown) => void;
  let stopped = false;
  const theme = createThemeStore({ media: mediaQuery(media), watch: (listener) => { receive = listener; return () => { stopped = true; }; } });
  const seen: string[] = [];
  const unsubscribe = theme.subscribe(({ resolved }) => seen.push(resolved));
  receive("dark");
  receive(null); // Preference cleared in another tab: return to system.
  unsubscribe();
  media.change(true);
  assert.deepEqual(seen, ["light", "dark", "light"]);
  theme.dispose();
  assert.equal(stopped, true);
});

test("storage failures leave the theme usable", async () => {
  const theme = createThemeStore({ media: mediaQuery(new SystemTheme()), load: () => Promise.reject(new Error("unavailable")), save: () => { throw new Error("blocked"); } });
  theme.set("dark");
  await Promise.resolve();
  assert.equal(theme.state().resolved, "dark");
  theme.dispose();
});
