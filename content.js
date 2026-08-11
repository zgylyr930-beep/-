const BLOCK_SELECTOR = [
  "p", "li", "blockquote", "h1", "h2", "h3", "h4",
  "figcaption", "td", "th", "dd", "dt", "button", "[role='paragraph']",
  "article div", "main div", "[role='main'] div", "[role='article'] div"
].join(",");
const TEXT_EXCLUDE_SELECTOR = "script, style, textarea, input, select, option, pre, code, [contenteditable='true'], [aria-hidden='true']";
const translationCache = new Map();
const originalTextValues = new Map();
const translatedElements = new Set();
let running = false;
let floatButton;
let autoObserver;
let autoTimer;

createFloatButton();
setTimeout(initializeAutoTranslate, 1400);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRANSLATE_PAGE") {
    translatePage(message.targetLanguage).then(sendResponse);
    return true;
  }
  if (message.type === "RESTORE_PAGE") {
    restorePage();
    sendResponse({ message: "已恢复原文" });
  }
  if (message.type === "TRANSLATE_SELECTION") translateSelection(message.text);
});

async function translatePage(targetLanguage = "zh-CN") {
  if (running) return { message: "翻译正在进行中" };
  running = true;
  setFloatState("busy");
  const nodes = collectTranslatableNodes();
  let completed = 0;
  let failed = 0;
  const queue = [...nodes];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const element = queue.shift();
      if (!element) continue;
      const textNodes = collectEnglishTextNodes(element);
      let elementTranslated = false;
      for (const textNode of textNodes) {
        const original = textNode.nodeValue;
        const text = original.trim();
        const cacheKey = `${targetLanguage}:${text}`;
        let translated = translationCache.get(cacheKey);
        if (!translated) {
          try {
            const result = await requestTranslation(text, targetLanguage);
            if (result.ok) {
              translated = result.text;
              translationCache.set(cacheKey, translated);
            } else failed++;
          } catch {
            failed++;
          }
        }
        if (!translated || !textNode.isConnected) continue;
        if (!originalTextValues.has(textNode)) originalTextValues.set(textNode, original);
        textNode.nodeValue = preserveWhitespace(original, translated);
        elementTranslated = true;
      }
      if (elementTranslated) {
        element.classList.add("ipt-translated-node");
        element.setAttribute("lang", "zh-CN");
        translatedElements.add(element);
        completed++;
      }
    }
  });

  try {
    await Promise.all(workers);
    if (!nodes.length) return { message: "未识别到新的英文正文" };
    if (!completed) return { message: failed ? `翻译失败 ${failed} 处，请检查网络或 API` : "未识别到新的英文正文" };
    return {
      message: failed
        ? `已翻译 ${completed} 个段落，${failed} 处失败`
        : `已翻译 ${completed} 个段落`
    };
  } catch (error) {
    return { message: `翻译中断：${error.message || "未知错误"}` };
  } finally {
    running = false;
    setFloatState(translatedElements.size ? "translated" : "idle");
  }
}

function collectTranslatableNodes() {
  const primary = [...document.querySelectorAll(BLOCK_SELECTOR)].filter(isTranslatable);
  const candidates = primary.length ? primary : [...document.querySelectorAll("body div")].filter(isTranslatable);
  return candidates.filter(node => !node.classList.contains("ipt-translated-node")).slice(0, 300);
}

function collectEnglishTextNodes(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(TEXT_EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return isEnglishText(node.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function preserveWhitespace(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || "";
  const trailing = original.match(/\s*$/)?.[0] || "";
  return `${leading}${translated}${trailing}`;
}

function restorePage() {
  for (const [textNode, value] of originalTextValues) {
    if (textNode.isConnected) textNode.nodeValue = value;
  }
  for (const element of translatedElements) {
    if (!element.isConnected) continue;
    element.classList.remove("ipt-translated-node");
    element.removeAttribute("lang");
  }
  originalTextValues.clear();
  translatedElements.clear();
  document.querySelectorAll(".ipt-translation").forEach(node => node.remove());
  document.querySelectorAll(".ipt-original-hidden").forEach(node => node.classList.remove("ipt-original-hidden"));
  setFloatState("idle");
}

function createFloatButton() {
  const existing = document.querySelector(".ipt-float-button");
  if (existing) {
    floatButton = existing;
    return;
  }
  floatButton = document.createElement("button");
  floatButton.type = "button";
  floatButton.className = "ipt-float-button";
  floatButton.textContent = "译";
  floatButton.title = "翻译英文网页";
  floatButton.setAttribute("aria-label", "翻译英文网页");
  floatButton.addEventListener("click", async () => {
    if (running) return;
    if (translatedElements.size || document.querySelector(".ipt-original-hidden")) {
      restorePage();
      return;
    }
    const result = await translatePage("zh-CN");
    floatButton.title = result.message;
  });
  document.documentElement.append(floatButton);
}

function setFloatState(state) {
  if (!floatButton?.isConnected) createFloatButton();
  floatButton.classList.toggle("ipt-busy", state === "busy");
  floatButton.textContent = state === "busy" ? "…" : state === "translated" ? "原" : "译";
  floatButton.title = state === "translated" ? "恢复英文原文" : state === "busy" ? "正在翻译" : "翻译英文网页";
}

async function initializeAutoTranslate() {
  const { autoTranslate } = await chrome.storage.local.get({ autoTranslate: false });
  if (!autoTranslate) return;
  if (isEnglishPage()) await translatePage("zh-CN");
  if (!document.body) return;
  autoObserver = new MutationObserver(mutations => {
    const hasNewEnglish = mutations.some(mutation => [...mutation.addedNodes].some(node => isEnglishAddedNode(node)));
    if (!hasNewEnglish) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (!running) translatePage("zh-CN");
    }, 900);
  });
  autoObserver.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => {
    autoObserver?.disconnect();
    autoObserver = null;
  }, 60000);
}

function isEnglishAddedNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return isEnglishText(node.nodeValue || "");
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches?.(".ipt-float-button, .ipt-selection")) return false;
  return isEnglishText((node.innerText || node.textContent || "").slice(0, 2000));
}

function isEnglishPage() {
  const sample = (document.body?.innerText || "").slice(0, 16000);
  const latinLetters = (sample.match(/[A-Za-z]/g) || []).length;
  const chineseChars = (sample.match(/[\u3400-\u9fff]/g) || []).length;
  return latinLetters >= 200 && latinLetters > chineseChars * 2;
}

function isTranslatable(node) {
  const text = node.innerText?.trim();
  if (!text || text.length < 2 || text.length > 4000 || !isEnglishText(text)) return false;
  if (node.closest("nav, footer, header, aside, script, style, textarea, pre, code, [contenteditable='true'], [aria-hidden='true']")) return false;
  if (node.querySelector(":scope > p, :scope > div, :scope > li, :scope > blockquote, :scope > article, :scope > section")) return false;
  const style = getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && node.children.length < 20 && node.getClientRects().length > 0;
}

function isEnglishText(text) {
  const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
  const chineseChars = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return latinLetters >= 3 && latinLetters > chineseChars;
}

function requestTranslation(text, targetLanguage) {
  return chrome.runtime.sendMessage({ type: "TRANSLATE_TEXT", text, targetLanguage });
}

async function translateSelection(text) {
  if (!text?.trim()) return;
  document.querySelector(".ipt-selection")?.remove();
  const panel = document.createElement("div");
  panel.className = "ipt-selection";
  document.body.append(panel);
  if (!isEnglishText(text)) {
    panel.textContent = "未检测到需要翻译的英文";
    setTimeout(() => panel.remove(), 3000);
    return;
  }
  panel.textContent = "翻译中…";
  try {
    const result = await requestTranslation(text.trim(), "zh-CN");
    panel.textContent = result.ok ? result.text : `翻译失败：${result.error}`;
  } catch (error) {
    panel.textContent = `翻译失败：${error.message || "扩展通信错误"}`;
  }
  setTimeout(() => panel.remove(), 12000);
}
