const status = document.querySelector("#status");
const autoTranslate = document.querySelector("#autoTranslate");

chrome.storage.local.get({ autoTranslate: false }, settings => {
  autoTranslate.checked = settings.autoTranslate;
});
autoTranslate.addEventListener("change", () => {
  chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
});

document.querySelector("#translate").addEventListener("click", () => send("TRANSLATE_PAGE"));
document.querySelector("#restore").addEventListener("click", () => send("RESTORE_PAGE"));
document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.local.get({ deepseekApiKey: "" }, ({ deepseekApiKey }) => {
  if (!deepseekApiKey) status.textContent = "首次使用请先设置 API Key";
});

async function send(type) {
  status.textContent = type === "TRANSLATE_PAGE" ? "正在翻译…" : "正在恢复…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || /^(chrome|edge|about):/.test(tab.url || "")) {
    status.textContent = "此页面不允许扩展运行";
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type, targetLanguage: "zh-CN" });
    status.textContent = response?.message || "完成";
  } catch {
    status.textContent = "请刷新网页后重试";
  }
}
