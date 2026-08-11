# GitHub 备份说明

此目录是“流光翻译”Chrome 扩展的干净备份，可直接上传至私人 GitHub 仓库。

当前版本：`0.3.0`。译文只替换文字节点，保留链接、图片、按钮、输入框和网页事件；自动模式支持延迟加载正文，并显示失败数量。

## 安全说明

- DeepSeek API Key 不在源码中。
- API Key 由 Chrome 保存在 `chrome.storage.local`，不会随 Git 仓库上传。
- 不要将 Key 手动写入 JavaScript、JSON、`.env` 或说明文档。

## 从 GitHub 恢复

1. 下载或克隆本仓库。
2. 打开 `chrome://extensions/` 并开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择本目录。
4. 打开插件的 API 设置，重新填写 DeepSeek API Key。
