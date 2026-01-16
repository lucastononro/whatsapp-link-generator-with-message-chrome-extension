const STORAGE_KEYS = {
  currentUrl: "currentUrl",
  ddi: "ddi",
  nationalNumber: "nationalNumber",
  messageTemplate: "messageTemplate",
  lastGeneratedUrl: "lastGeneratedUrl"
};

const DEFAULT_MESSAGE_TEMPLATE = "Olá!\n\nGostaria de falar sobre:\n{{url}}";
const URL_TOKEN = "{{url}}";

const COUNTRIES = [
  { name: "Brazil", ddi: "55" },
  { name: "United States", ddi: "1" },
  { name: "Portugal", ddi: "351" },
  { name: "United Kingdom", ddi: "44" },
  { name: "Argentina", ddi: "54" },
  { name: "Chile", ddi: "56" },
  { name: "Uruguay", ddi: "598" }
];

const elements = {
  ddiSelect: document.getElementById("ddiSelect"),
  phoneInput: document.getElementById("phoneInput"),
  phoneHint: document.getElementById("phoneHint"),
  websiteInput: document.getElementById("websiteInput"),
  messageInput: document.getElementById("messageInput"),
  generateBtn: document.getElementById("generateBtn"),
  copyBtn: document.getElementById("copyBtn"),
  openBtn: document.getElementById("openBtn"),
  outputInput: document.getElementById("outputInput"),
  status: document.getElementById("status")
};

const state = {
  currentUrl: "",
  ddi: "55",
  nationalNumber: "",
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  lastGeneratedUrl: "",
  messageDirty: false
};

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function formatBrazilNationalNumber(digits) {
  const cleaned = onlyDigits(digits).slice(0, 11);
  if (cleaned.length <= 2) return cleaned;

  const area = cleaned.slice(0, 2);
  const rest = cleaned.slice(2);
  if (!rest) return `(${area})`;
  if (rest.length <= 4) return `(${area}) ${rest}`;

  const left = rest.slice(0, rest.length - 4);
  const right = rest.slice(-4);
  return `(${area}) ${left}-${right}`;
}

function formatNationalNumberForDisplay(ddi, digits) {
  if (ddi === "55") return formatBrazilNationalNumber(digits);
  return onlyDigits(digits);
}

function ensureTemplateHasUrlToken(template) {
  const current = String(template ?? "");
  if (current.includes(URL_TOKEN)) return current;
  const trimmed = current.trimEnd();
  return trimmed.length === 0 ? URL_TOKEN : `${trimmed}\n${URL_TOKEN}`;
}

function renderMessage(template, url) {
  const safeTemplate = ensureTemplateHasUrlToken(template);
  return safeTemplate.replaceAll(URL_TOKEN, url || "");
}

function replaceUrlInMessage(currentMessage, oldUrl, newUrl) {
  const message = String(currentMessage ?? "");
  if (oldUrl && message.includes(oldUrl)) return message.split(oldUrl).join(newUrl);

  const urlRegex = /https?:\/\/[^\s]+/;
  if (urlRegex.test(message)) return message.replace(urlRegex, newUrl);

  const trimmed = message.trimEnd();
  return trimmed.length ? `${trimmed}\n${newUrl}` : newUrl;
}

function templateFromEditedMessage(editedMessage, currentUrl) {
  const text = String(editedMessage ?? "");
  if (!text.trim()) return DEFAULT_MESSAGE_TEMPLATE;

  if (currentUrl && text.includes(currentUrl)) {
    return ensureTemplateHasUrlToken(text.split(currentUrl).join(URL_TOKEN));
  }

  const urlRegex = /https?:\/\/[^\s]+/;
  if (urlRegex.test(text)) return ensureTemplateHasUrlToken(text.replace(urlRegex, URL_TOKEN));

  return ensureTemplateHasUrlToken(text);
}

function buildWhatsAppUrl(ddi, nationalNumber, message) {
  const ddiDigits = onlyDigits(ddi);
  const numberDigits = onlyDigits(nationalNumber);
  const fullNumber = `${ddiDigits}${numberDigits}`.replace(/^0+/, "");
  if (!fullNumber) throw new Error("Please enter a WhatsApp number.");
  const encoded = encodeURIComponent(String(message ?? ""));
  return `https://wa.me/${fullNumber}?text=${encoded}`;
}

let saveMessageDebounce = null;
function scheduleSaveMessageTemplate(template) {
  clearTimeout(saveMessageDebounce);
  saveMessageDebounce = setTimeout(() => {
    chrome.storage.local.set({ [STORAGE_KEYS.messageTemplate]: template }).catch(() => {});
  }, 250);
}

function setStatus(text, kind = "info") {
  elements.status.textContent = text || "";
  elements.status.style.color = kind === "error" ? "var(--danger)" : "";
}

function updatePhoneHint() {
  if (state.ddi === "55") {
    elements.phoneHint.textContent = "Brazil: include DDD + number (10–11 digits).";
  } else {
    elements.phoneHint.textContent = "Enter numbers only (without country code).";
  }
}

function setOutput(url) {
  elements.outputInput.value = url || "";
  const enabled = Boolean(url);
  elements.copyBtn.disabled = !enabled;
  elements.openBtn.disabled = !enabled;
}

let regenerateDebounce = null;
function scheduleRegenerateIfPreviouslyGenerated() {
  if (!state.lastGeneratedUrl) return;

  clearTimeout(regenerateDebounce);
  regenerateDebounce = setTimeout(async () => {
    try {
      const message = renderMessage(state.messageTemplate, state.currentUrl);
      const url = buildWhatsAppUrl(state.ddi, state.nationalNumber, message);
      state.lastGeneratedUrl = url;
      setOutput(url);
      await chrome.storage.local.set({ [STORAGE_KEYS.lastGeneratedUrl]: url }).catch(() => {});
    } catch {
      // Keep the previous generated URL if inputs are temporarily invalid while editing.
    }
  }, 150);
}

function updateRenderedMessageOnUrlChange(oldUrl, newUrl) {
  const active = document.activeElement === elements.messageInput;
  if (!active && !state.messageDirty) {
    elements.messageInput.value = renderMessage(state.messageTemplate, newUrl);
    return;
  }

  elements.messageInput.value = replaceUrlInMessage(elements.messageInput.value, oldUrl, newUrl);
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

async function bootstrap() {
  for (const country of COUNTRIES) {
    const option = document.createElement("option");
    option.value = country.ddi;
    option.textContent = `+${country.ddi} — ${country.name}`;
    elements.ddiSelect.appendChild(option);
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.currentUrl,
    STORAGE_KEYS.ddi,
    STORAGE_KEYS.nationalNumber,
    STORAGE_KEYS.messageTemplate,
    STORAGE_KEYS.lastGeneratedUrl
  ]);

  state.currentUrl = String(stored[STORAGE_KEYS.currentUrl] ?? "");
  state.ddi = String(stored[STORAGE_KEYS.ddi] ?? "55");
  state.nationalNumber = String(stored[STORAGE_KEYS.nationalNumber] ?? "");
  state.messageTemplate = String(stored[STORAGE_KEYS.messageTemplate] ?? DEFAULT_MESSAGE_TEMPLATE);
  state.lastGeneratedUrl = String(stored[STORAGE_KEYS.lastGeneratedUrl] ?? "");

  const activeUrl = await getActiveTabUrl().catch(() => "");
  if (activeUrl && activeUrl !== state.currentUrl) {
    const oldUrl = state.currentUrl;
    state.currentUrl = activeUrl;
    await chrome.storage.local.set({ [STORAGE_KEYS.currentUrl]: activeUrl }).catch(() => {});
    updateRenderedMessageOnUrlChange(oldUrl, activeUrl);
  }

  elements.ddiSelect.value = state.ddi;
  elements.phoneInput.value = formatNationalNumberForDisplay(state.ddi, state.nationalNumber);
  updatePhoneHint();

  elements.websiteInput.value = state.currentUrl;
  elements.messageInput.value = renderMessage(state.messageTemplate, state.currentUrl);
  setOutput(state.lastGeneratedUrl);
  scheduleRegenerateIfPreviouslyGenerated();

  wireEvents();
}

function wireEvents() {
  elements.ddiSelect.addEventListener("change", () => {
    state.ddi = elements.ddiSelect.value;
    chrome.storage.local.set({ [STORAGE_KEYS.ddi]: state.ddi }).catch(() => {});
    elements.phoneInput.value = formatNationalNumberForDisplay(state.ddi, state.nationalNumber);
    updatePhoneHint();
    scheduleRegenerateIfPreviouslyGenerated();
  });

  elements.phoneInput.addEventListener("input", () => {
    const rawDigits = onlyDigits(elements.phoneInput.value);
    const maxDigits = state.ddi === "55" ? 11 : 15;
    const digits = rawDigits.slice(0, maxDigits);
    state.nationalNumber = digits;
    chrome.storage.local.set({ [STORAGE_KEYS.nationalNumber]: digits }).catch(() => {});
    elements.phoneInput.value = formatNationalNumberForDisplay(state.ddi, digits);
    scheduleRegenerateIfPreviouslyGenerated();
  });

  elements.messageInput.addEventListener("input", () => {
    state.messageDirty = true;
    const template = templateFromEditedMessage(elements.messageInput.value, state.currentUrl);
    state.messageTemplate = template;
    scheduleSaveMessageTemplate(template);
    scheduleRegenerateIfPreviouslyGenerated();
  });

  elements.messageInput.addEventListener("blur", () => {
    state.messageDirty = false;
    elements.messageInput.value = renderMessage(state.messageTemplate, state.currentUrl);
    scheduleRegenerateIfPreviouslyGenerated();
  });

  elements.generateBtn.addEventListener("click", async () => {
    setStatus("");
    try {
      const message = renderMessage(state.messageTemplate, state.currentUrl);
      const url = buildWhatsAppUrl(state.ddi, state.nationalNumber, message);
      state.lastGeneratedUrl = url;
      setOutput(url);
      await chrome.storage.local.set({ [STORAGE_KEYS.lastGeneratedUrl]: url }).catch(() => {});
      setStatus("Generated.");
    } catch (error) {
      setStatus(error?.message || "Failed to generate.", "error");
    }
  });

  elements.copyBtn.addEventListener("click", async () => {
    const url = elements.outputInput.value;
    if (!url) return;
    setStatus("");

    try {
      await navigator.clipboard.writeText(url);
      setStatus("Copied to clipboard.");
    } catch {
      elements.outputInput.focus();
      elements.outputInput.select();
      const ok = document.execCommand("copy");
      setStatus(ok ? "Copied to clipboard." : "Copy failed.", ok ? "info" : "error");
    }
  });

  elements.openBtn.addEventListener("click", () => {
    const url = elements.outputInput.value;
    if (!url) return;
    chrome.tabs.create({ url }).catch(() => {});
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes[STORAGE_KEYS.currentUrl]) {
      const oldUrl = state.currentUrl;
      const newUrl = String(changes[STORAGE_KEYS.currentUrl].newValue ?? "");
      state.currentUrl = newUrl;
      elements.websiteInput.value = newUrl;
      updateRenderedMessageOnUrlChange(oldUrl, newUrl);
      scheduleRegenerateIfPreviouslyGenerated();
    }
  });
}

bootstrap().catch((error) => {
  setStatus(error?.message || "Failed to load.", "error");
});
