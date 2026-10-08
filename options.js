const apiKey = document.querySelector("#apiKey");
const model = document.querySelector("#model");
const status = document.querySelector("#status");
const floatImage = document.querySelector("#floatImage");
const floatPreview = document.querySelector("#floatPreview");
const imageStatus = document.querySelector("#imageStatus");

chrome.storage.local.get({ deepseekApiKey: "", deepseekModel: "deepseek-v4-flash" }, settings => {
  apiKey.value = settings.deepseekApiKey;
  model.value = settings.deepseekModel;
});

chrome.storage.local.get({ customFloatImage: "" }, ({ customFloatImage }) => {
  floatPreview.src = customFloatImage || chrome.runtime.getURL("icons/bear-float.webp");
});

document.querySelector("#chooseImage").addEventListener("click", () => floatImage.click());
floatImage.addEventListener("change", () => {
  const file = floatImage.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    imageStatus.textContent = "请选择图片文件";
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    imageStatus.textContent = "图片不能超过 3 MB";
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = String(reader.result || "");
    await chrome.storage.local.set({ customFloatImage: dataUrl });
    floatPreview.src = dataUrl;
    imageStatus.textContent = "自定义浮球图片已保存，刷新网页即可看到";
  };
  reader.onerror = () => { imageStatus.textContent = "图片读取失败，请重试"; };
  reader.readAsDataURL(file);
});

document.querySelector("#resetImage").addEventListener("click", async () => {
  await chrome.storage.local.remove("customFloatImage");
  floatPreview.src = chrome.runtime.getURL("icons/bear-float.webp");
  floatImage.value = "";
  imageStatus.textContent = "已恢复默认自嘲熊";
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
