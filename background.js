const MENU_ID = "immersive-translate-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "翻译选中的文字",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "TRANSLATE_SELECTION",
    text: info.selectionText
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "TRANSLATE_TEXT") return;
  translate(message.text, message.targetLanguage)
    .then(text => sendResponse({ ok: true, text }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function getSettings() {
  const settings = await chrome.storage.local.get({
    deepseekApiKey: "",
    deepseekModel: "deepseek-v4-flash"
  });
  if (!settings.deepseekApiKey) throw new Error("请先在插件设置中填写 DeepSeek API Key");
  return settings;
}

async function translate(text, targetLanguage = "zh-CN") {
  const settings = await getSettings();
  const response = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: settings.deepseekModel,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: "你是专业英译中网页翻译器。将英文准确、自然地翻译成简体中文。保留原有语气、专有名词、数字和格式；已有中文保持不变。只输出译文，不解释，不添加引号。"
        },
        { role: "user", content: text }
      ],
      temperature: 0.1,
      max_tokens: 4096,
      stream: false
    })
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error?.message || `DeepSeek 返回 ${response.status}`);
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error("DeepSeek 未返回译文");
  return result;
}

async function fetchWithTimeout(url, options, timeout = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("DeepSeek 请求超时，请稍后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
