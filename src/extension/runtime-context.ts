// Gamle innholdsskript lever videre i åpne faner etter en extension-reload.
// Userscriptet har derimot aldri en Chrome runtime-id.
export function createContentScriptContextGuard(
  readRuntimeId: () => string | undefined,
  onInvalidated: () => void,
  isUserscript: boolean,
): () => boolean {
  let invalidated = false;
  return () => {
    if (isUserscript) return true;
    if (invalidated) return false;
    try {
      if (readRuntimeId() !== undefined) return true;
    } catch {
      // Også lesing av runtime kan feile når Chromium har fjernet konteksten.
    }
    invalidated = true;
    onInvalidated();
    return false;
  };
}
