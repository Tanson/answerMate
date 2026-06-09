# AI 答题插件（Chrome 扩展 MV3）

这是一个基于 Chrome Extension Manifest V3 的网页答题助手。插件在页面中通过划词和快捷键触发 AI 查询，支持多模型并行、答案投票、自动选中、答案边框标记、语音朗读、考试宝题库检索和配置导入导出。

项目无需构建，直接以"已解压扩展"的方式加载即可使用。

---

## 💰 支持作者

<div align="center">

**🔫 感谢使用！如觉有用，欢迎扫码支持 —— 作者想给《三角洲行动》凑个 2×3 安全箱！**

<img src="images/qrcode-donate.jpg" alt="赞赏码" width="260" />

> 每一份支援都是我熬夜更新的动力，好人一生平安 🙏

</div>

---

## 功能概览

- 多模型接入：OpenAI Chat Completions、OpenAI Responses、阿里云千问兼容模式、Ollama、Cloudflare Workers AI、Dify、AnythingLLM、Ragflow、Gemini、考试宝。
- 多模型投票：同时启用多个模型时，会汇总结构化答案并按多数结果执行自动选中和高亮。
- 自动选中答案：识别单选、多选、判断题，自动点击页面上的 `radio`、`checkbox` 或相关自定义控件。
- 答案边框标记：在识别到的正确答案区域上叠加边框覆盖层，支持颜色、粗细和透明度配置。
- 浮层显示：在页面上展示各模型返回内容，支持鼠标跟随浮层。
- 两种查询模式：快速答案模式只返回答案；解释模式返回答案和理由。
- 自动复制：可将浮层答案自动复制到剪贴板。
- 语音朗读：可朗读模型名和答案内容，优先使用系统中文语音。
- 解除限制：对禁止复制、禁止选择、禁止鼠标右键的网页，可注入脚本解除页面限制。
- 配置管理：支持配置新增、编辑、删除、导入、导出；导出文件使用 SM4-ECB 加密。

## 目录结构

- `manifest.json`：扩展清单、权限、后台脚本和内容脚本声明。
- `pages/popup.html` / `js/popup.js`：弹窗页，用于选择启用模型和调整运行开关。
- `pages/options.html` / `js/options.js`：配置管理页，用于维护模型配置。
- `js/background.js`：后台 `service_worker`，负责接口请求、考试宝 Cookie 同步和脚本注入。
- `js/content.js`：内容脚本，负责页面选区、快捷键、浮层、答案解析、投票、自动选中和标记。
- `js/enable.js` / `js/enableA.js`：解除页面选择/复制限制的注入脚本。
- `js/sm4.js`：配置导入导出的 SM4 加解密实现。
- `css/`、`images/`：页面样式和扩展图标。

## 安装

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展”。
4. 选择本项目根目录。

加载后，浏览器工具栏会出现插件图标。点击图标进入模型选择弹窗，点击右下角齿轮进入配置管理页。

## 解锁复制和右键限制

遇到网页禁止选中文字、禁止复制内容或禁止鼠标右键时，先把鼠标放在题目或答案选项区域，按住 `Ctrl`（macOS 为 `⌘`）双击左键，插件会注入解除限制脚本。

部分考试页面只禁止复制答案选项，而题干仍可正常选择。这种情况下不用选中整段内容，直接把鼠标放在答案选项上，按住 `Ctrl/⌘` 双击左键，解锁后再复制或划选题目内容。

## 基本使用

1. 在设置页添加至少一个模型配置。
2. 在弹窗页勾选要启用的模型。
3. 打开题目页面，用鼠标选中题干和选项。
4. 按住 `Ctrl`（macOS 为 `⌘`）并松开鼠标，触发快速答案。
5. 按住 `Alt`（macOS 为 `⌥`）并松开鼠标，触发解释模式。

其他操作：

- 按住 `Ctrl/⌘` 双击左键：注入解除限制脚本，用于无法选中文字、无法复制或无法打开右键菜单的页面。
- 部分页面只禁止复制答案选项时，可把鼠标放在答案选项上，按住 `Ctrl/⌘` 双击左键进行解锁。
- 不按 `Ctrl/Alt/⌘` 双击左键：关闭答案浮层并停止语音朗读。

## 弹窗配置

弹窗页用于选择模型和调整页面行为，配置会保存到 `chrome.storage.local`。

| 配置项 | 存储键 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 模型勾选 | `selectedConfigs` | 空数组 | 记录当前启用的配置名称。 |
| 自动复制答案到剪贴板 | `copyClipboard` | `false` | 开启后，每次更新浮层答案时自动复制纯文本内容。 |
| 启用答案边框标记 | `enableAnswerHighlight` | `true` | 开启后，在识别到的答案元素上叠加边框标记。 |
| 启用自动选中答案 | `enableAutoSelect` | `true` | 开启后，投票结果确定后自动点击答案控件。 |
| 启用语音朗读答案 | `enableTTS` | `false` | 开启后朗读模型名称和返回结果。 |
| 启用鼠标跟随浮层 | `enableMouseFollow` | `true` | 开启后，答案浮层会跟随鼠标位置移动。 |
| 透明度 | `mousepadOpacity` | `50` | 控制浮层和答案边框透明度，范围 `0-100`。 |
| 边框颜色 | `answerHighlightColor` | `#dcdcdc` | 答案标记边框颜色。 |
| 边框粗细 | `answerHighlightWidth` | `1` | 答案标记边框宽度，范围 `0.5-6`。 |

## 模型配置字段

设置页中的每条模型配置会写入 `configs` 数组，单条配置结构如下：

```json
{
  "name": "显示名称",
  "url": "接口地址",
  "key": "API Key 或 Token",
  "model": "模型名或工作区 ID",
  "other": "预留参数",
  "type": "OpenaiAPI",
  "thinkingMode": "omit",
  "enableThinking": false
}
```

字段说明：

- `name`：配置名称，显示在弹窗模型列表中；勾选状态按名称保存，建议保持唯一。
- `url`：接口基础地址或完整接口地址。保存时会自动移除末尾 `/`。
- `key`：API Key、Bearer Token 或考试宝 token。Ollama 通常留空。
- `model`：模型名称。AnythingLLM 中填写 workspace id；Ragflow 可留空。
- `other`：预留参数。Ragflow 必填 `shared_id`、`chat_id` 或聊天分享链接；考试宝中可作为“只输出 AI 整理结果”的开关使用。
- `type`：处理类型，决定后台使用哪个接口适配器。
- `thinkingMode`：思考输出参数，仅 `OpenaiAPI`、`OpenAIResponses`、`Aliyun` 显示。
- `enableThinking`：兼容旧配置的布尔字段，当前由 `thinkingMode` 同步维护。

### 思考输出

`thinkingMode` 有三个取值：

- `omit`：不传 `enable_thinking` 参数，适合严格 OpenAI 兼容端点。
- `off`：请求体中发送 `"enable_thinking": false`。
- `on`：请求体中发送 `"enable_thinking": true`。

该参数目前会应用到 `OpenaiAPI`、`OpenAIResponses` 和 `Aliyun` 的请求体。后台也会移除模型返回中的 `</think>` 之前内容，以及 `<|begin_of_box|>`、`<|end_of_box|>` 标记。

## 各类型配置说明

| 类型 | URL 填写 | Model 填写 | Key 填写 | 说明 |
| --- | --- | --- | --- | --- |
| `OpenaiAPI` | `https://api.openai.com/v1` 或完整 `/chat/completions` | 如 `gpt-4o-mini` | `sk-...` | 后台会自动拼接 `/chat/completions`，如果 URL 已以该路径结尾则不重复拼接。 |
| `OpenAIResponses` | `https://api.openai.com/v1` 或完整 `/responses` | 如 `gpt-4.1-mini` | `sk-...` | 使用 Responses API，后台会自动拼接 `/responses`。 |
| `Aliyun` | `https://dashscope.aliyuncs.com/compatible-mode/v1` 或完整 `/chat/completions` | 如 `qwen-plus`、`qwen3` 系列 | `sk-...` | 使用 OpenAI 兼容请求格式，超时时间为 120 秒。 |
| `Ollama` | `http://localhost:11434` 或完整 `/api/generate` | 如 `llama3.1:8b` | 留空 | 后台会自动拼接 `/api/generate`。若本地返回 403，需要设置 `OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*,safari-web-extension://*` 后重启 Ollama。 |
| `CloudFlare` | 完整 Workers AI run 地址 | 可填但当前请求不使用 | `CF_API_TOKEN` | URL 形如 `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}`。 |
| `Dify` | `https://api.dify.ai` 或自建 Dify 根地址 | 可留空 | Dify App API Key | 后台固定请求 `${url}/v1/chat-messages`，使用 blocking 模式。 |
| `AnythingLLM` | `https://your-anythingllm` | workspace id | API Token | 后台请求 `${url}/api/v1/workspace/{model}/chat`，`model` 必须是工作区标识。 |
| `Ragflow` | 站点根地址，或完整 OpenAI 兼容聊天地址 | 可留空；新版可填真实模型名 | Ragflow API Key | `other` 必填 `shared_id`/`chat_id`/分享链接。插件兼容 `/api/v1/openai/{chat_id}/chat/completions` 和 `/api/v1/chats_openai/{chat_id}/chat/completions`。 |
| `Gemini` | `https://generativelanguage.googleapis.com/v1beta/models` | 如 `gemini-2.0-flash:generateContent` | `AIza...` | 后台请求 `${url}/${model}`，通过 `X-goog-api-key` 传 Key。 |
| `KaoShiBao` | `https://www.kaoshibao.com/api` | 可留空 | 可留空 | 插件会从当前浏览器已登录考试宝的 Cookie 中读取 `token` 并同步到配置；不要填写 `token=` 前缀。 |

## Ragflow 配置重点

Ragflow 的 `other` 必填，支持以下写法：

- 直接填写 `shared_id`。
- 直接填写 `chat_id`。
- 粘贴包含 `shared_id=...` 或 `chat_id=...` 的分享链接。

Ragflow 的 `url` 支持以下写法：

- 站点根地址：`https://your-ragflow`。
- 模板地址：`https://your-ragflow/api/v1/openai/{chat_id}/chat/completions`。
- 模板地址：`https://your-ragflow/api/v1/chats_openai/{chat_id}/chat/completions`。
- 已带具体 ID 的完整地址。

当使用根地址时，插件会依次尝试新旧两种路径。如果其中一种路径返回 404、405 或路由不匹配错误，会自动尝试另一种路径。

## 考试宝配置重点

考试宝配置用于查询 `https://www.kaoshibao.com/api/search/questions`。

使用方式：

1. 在当前 Chrome 用户配置文件中打开考试宝并登录。
2. 在插件设置页新增 `KaoShiBao` 类型配置，`Key` 可留空。
3. 切换到考试宝标签页或等待 Cookie 变化后，插件会自动读取 Cookie 中的 `token` 并写入该配置。
4. 回到弹窗页勾选考试宝配置。

注意事项：

- `Key` 只能填写 token 的值，不能包含 `token=`。
- 如果未采集到登录态，弹窗勾选考试宝时会提示先登录。
- 考试宝返回题库结果后，插件会优先寻找已有阿里云配置做二次整理；没有阿里云时会回退到第一个 `OpenaiAPI` 配置。
- 如果考试宝配置的 `other` 非空，最终只返回 AI 整理后的答案；如果 `other` 为空，会同时展示原始题库结果和 AI 整理结果。

## 多模型投票机制

当启用多个模型时，插件会尽量解析模型返回的 JSON 结构：

```json
{
  "type": "single|multiple|judge|unknown",
  "answers": ["A"],
  "answer_texts": ["选项内容"],
  "summary": "简短答案"
}
```

投票规则：

| 场景 | 行为 |
| --- | --- |
| 只启用 1 个模型 | 直接执行该模型结果。 |
| 启用 2 个模型且答案一致 | 执行共识答案。 |
| 启用 2 个模型但答案不一致 | 使用先返回的答案。 |
| 启用 3 个及以上模型且出现多数一致 | 达到多数后立即执行。 |
| 启用 3 个及以上模型但无多数 | 使用先返回的可用答案。 |
| 投票等待超时 | 使用已有答案中的最佳决策。 |
| 某个模型请求失败 | 降低预期响应数量并重新评估。 |

内容脚本会在模型输出不是标准 JSON 时尝试从文本中提取 `A/B/C/D`、多选、判断题等答案，但稳定性取决于模型输出格式。建议模型按提示只返回 JSON。

## 网络超时

- 默认接口超时：45 秒。
- 阿里云接口超时：120 秒。
- Ragflow 超时：45 秒。
- 考试宝二次 AI 整理超时：45 秒。
- 内容脚本多模型投票等待：约 12 秒。

如果页面显示“请求超时”，通常需要检查网络、接口 URL、API Key、模型名或服务端跨域/来源限制。

## 配置导入导出

设置页支持导出和导入全部 `configs`。

- 导出：将 `configs` 序列化为 JSON 后加密，下载为 `configs.json`。
- 导入：读取 `configs.json`，输入密码解密后覆盖当前 `configs`。
- 加密：SM4-ECB。
- 密码处理：密码会先经 MD5 处理，并截断为 16 位作为 SM4 密钥。

导入会覆盖当前配置列表，导入前建议先导出现有配置备份。

## 权限说明

`manifest.json` 当前声明的权限：

- `storage`：保存模型配置、开关和样式设置。
- `scripting`：注入解除限制脚本。
- `tabs` / `activeTab`：获取当前标签页并执行脚本；监听考试宝标签页状态。
- `clipboardWrite`：自动复制答案。
- `cookies`：读取考试宝登录态中的 `token`。
- `declarativeNetRequest`：预留网络请求能力。
- `host_permissions: http://*/*, https://*/*`：允许内容脚本和后台请求访问网页及模型接口。

## 常见问题

**设置页提示 API 地址需以 http 或 https 开头**

所有类型的 `url` 都必须填写完整协议，例如 `https://api.openai.com/v1` 或 `http://localhost:11434`。

**OpenAI 风格接口 404**

如果你的配置类型是 `OpenaiAPI` 或 `Aliyun`，URL 可以填基础路径，也可以填完整 `/chat/completions`。不要填到其他路径。`OpenAIResponses` 则应使用基础路径或 `/responses`。

**Ollama 本地 403**

这是 Ollama 默认拒绝浏览器扩展来源导致的。设置环境变量 `OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*,safari-web-extension://*` 后重启 Ollama。

**Ragflow 报缺少 shared_id 或 chat_id**

在 `other` 中填写 `shared_id`、`chat_id` 或分享链接。只填站点根地址是不够的。

**考试宝无法勾选**

先在同一个 Chrome 用户配置文件中登录考试宝。插件只能读取浏览器已有 Cookie，不会替你登录。

**自动选中不生效**

确认弹窗中“启用自动选中答案”已打开。部分页面没有标准 `radio`/`checkbox`，或者选项文本被复杂组件拆分，可能只能显示边框标记。

**答案边框不显示**

确认“启用答案边框标记”已打开，并检查透明度是否被调到 `0`。

**没有朗读声音**

确认“启用语音朗读答案”已打开，并检查系统或浏览器是否有可用语音。插件使用浏览器内置 Web Speech API，不额外请求网络。

**无法选中文字、复制内容或使用鼠标右键**

按住 `Ctrl/⌘` 双击左键注入解除限制脚本，用于解除页面对选择、复制和鼠标右键的限制。部分页面可能需要先聚焦页面正文再操作。

如果页面只禁止复制答案选项，不一定需要选中整段题目。可以把鼠标放在答案选项上，按住 `Ctrl/⌘` 双击左键，先解除该区域的限制，再复制或划选题目内容。

## 许可证

本项目使用 Apache License 2.0，详见 `LICENSE`。
