import { createTrustpilotClient, type TrustpilotRequest } from "../shared/trustpilot.js";

// Callback storage works in both Chrome and the userscript's GM storage shim.
export function createStoredTrustpilotClient(request?: TrustpilotRequest) {
  return createTrustpilotClient({
    read: (key) => new Promise((resolve) => chrome.storage.local.get(key, (values) => resolve(values[key]))),
    write: (key, value) => new Promise<void>((resolve) => chrome.storage.local.set({ [key]: value }, resolve)),
    ...(request ? { request } : {}),
  });
}
