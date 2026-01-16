const STORAGE_KEYS = {
  currentUrl: "currentUrl",
  ddi: "ddi",
  nationalNumber: "nationalNumber",
  messageTemplate: "messageTemplate",
  lastGeneratedUrl: "lastGeneratedUrl"
};

const DEFAULTS = {
  [STORAGE_KEYS.ddi]: "55",
  [STORAGE_KEYS.nationalNumber]: "",
  [STORAGE_KEYS.messageTemplate]: "Olá!\n\nGostaria de falar sobre:\n{{url}}",
  [STORAGE_KEYS.lastGeneratedUrl]: ""
};

async function setDefaultsIfMissing() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const toSet = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (stored[key] === undefined) toSet[key] = value;
  }
  if (Object.keys(toSet).length > 0) await chrome.storage.local.set(toSet);
}

async function updateCurrentUrlFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const url = tab.url;
  const { [STORAGE_KEYS.currentUrl]: existing } = await chrome.storage.local.get(
    STORAGE_KEYS.currentUrl
  );
  if (existing !== url) await chrome.storage.local.set({ [STORAGE_KEYS.currentUrl]: url });
}

chrome.runtime.onInstalled.addListener(() => {
  setDefaultsIfMissing().catch(() => {});
  updateCurrentUrlFromActiveTab().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  setDefaultsIfMissing().catch(() => {});
  updateCurrentUrlFromActiveTab().catch(() => {});
});

chrome.tabs.onActivated.addListener(() => {
  updateCurrentUrlFromActiveTab().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    if (tab.active) updateCurrentUrlFromActiveTab().catch(() => {});
  }
});

chrome.windows.onFocusChanged.addListener(() => {
  updateCurrentUrlFromActiveTab().catch(() => {});
});

