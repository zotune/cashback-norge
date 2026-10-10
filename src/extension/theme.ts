import { createThemeStore, THEME_STORAGE_KEY } from "../shared/theme";

export const extensionTheme = createThemeStore({
  load: () => new Promise((resolve) => chrome.storage.local.get(THEME_STORAGE_KEY, (values) => resolve(values[THEME_STORAGE_KEY]))),
  save: (preference) => chrome.storage.local.set({ [THEME_STORAGE_KEY]: preference }),
  watch: (receive) => {
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && THEME_STORAGE_KEY in changes) receive(changes[THEME_STORAGE_KEY]?.newValue);
    };
    // Userscript storage has no Chrome change event; its saved preference is read
    // on each page. Chrome panels and the popup synchronize immediately.
    chrome.storage.onChanged?.addListener(onStorage);
    return () => chrome.storage.onChanged?.removeListener(onStorage);
  },
});
