const apiKey = document.querySelector("#apiKey");
const model = document.querySelector("#model");
const status = document.querySelector("#status");

chrome.storage.local.get({ deepseekApiKey: "", deepseekModel: "deepseek-v4-flash" }, settings => {
  apiKey.value = settings.deepseekApiKey;
  model.value = settings.deepseekModel;
});

document.querySelector("#toggle").addEventListener("click", event => {
  const visible = apiKey.type === "text";
  apiKey.type = visible ? "password" : "text";
  event.currentTarget.textContent = visible ? "显示" : "隐藏";
});

document.querySelector("#save").addEventListener("click", save);
document.querySelector("#test").addEventListener("click", async () => {
  if (!await save()) return;
  status.textContent = "正在连接 DeepSeek…";
  const result = await chrome.runtime.sendMessage({
    type: "TRANSLATE_TEXT",
    text: "Hello, world!",
    targetLanguage: "zh-CN"
  });
  status.textContent = result.ok ? `连接成功：${result.text}` : `连接失败：${result.error}`;
});

async function save() {
  const key = apiKey.value.trim();
  if (!key) {
    status.textContent = "请输入 DeepSeek API Key";
    return false;
  }
  await chrome.storage.local.set({ deepseekApiKey: key, deepseekModel: model.value });
  status.textContent = "设置已保存";
  return true;
}
