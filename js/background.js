const DEFAULT_TIMEOUT = 45000;
const ALIYUN_TIMEOUT = 120000;
const RAGFLOW_TIMEOUT = 45000;
const LOCAL_OPENAI_COMPAT_TIMEOUT = 45000;
const KAOSHIBAO_REASONING_TIMEOUT = 45000;
const UNKNOWN_ANSWER = "未能获取到有效的AI回答";
const KNOWLEDGE_BASE_ANSWER = "未能获取到有效的知识库回答";

const actionHandlers = {
    executeScript: handleExecuteScript,
    checkKaoShiBaoAuth: (request) => checkKaoShiBaoAuth(request.config),
    OpenaiAPI: (request) => getOpenaiAPIResponse(request.text, request.config),
    OpenAIResponses: (request) => getOpenAIResponsesResponse(request.text, request.config),
    Aliyun: (request) => getAliyunQwenResponse(request.text, request.config),
    Ollama: (request) => getOllamaResponse(request.text, request.config),
    CloudFlare: (request) => getCloudFlareResponse(request.text, request.config),
    Dify: (request) => getDifyResponse(request.text, request.config),
    AnythingLLM: (request) => getAnythingLLMResponse(request.text, request.config),
    Ragflow: (request) => getRagflowResponse(request.text, request.config),
    Gemini: (request) => getGeminiResponse(request.text, request.config),
    KaoShiBao: (request, sender) => getKaoShiBaoResponse(request.selectText, request.config, sender),
};

const KAOSHIBAO_COOKIE_URLS = [
    "https://www.kaoshibao.com/",
    "https://kaoshibao.com/",
];
const KAOSHIBAO_TAB_PATTERNS = [
    "*://*.kaoshibao.com/*",
    "*://kaoshibao.com/*",
];
const KAOSHIBAO_COOKIE_DOMAIN = "kaoshibao.com";
const KAOSHIBAO_COOKIE_NAME = "token";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = actionHandlers[request.action];
    if (!handler) {
        sendResponse({ answer: `错误：不支持的操作 ${request.action || "unknown"}`, answerDivId: request.answerDivId });
        return false;
    }

    Promise.resolve(handler(request, sender))
        .then((result) => {
            sendResponse({
                answer: typeof result === "string" ? result : UNKNOWN_ANSWER,
                answerDivId: request.answerDivId,
            });
        })
        .catch((error) => {
            console.error("处理消息失败:", error);
            sendResponse({
                answer: error && error.message ? error.message : "请求失败，但未获取到可用错误详情",
                answerDivId: request.answerDivId,
            });
        });

    return true;
});

chrome.cookies.onChanged.addListener((changeInfo) => {
    if (!changeInfo || changeInfo.removed || !changeInfo.cookie) {
        return;
    }

    const { cookie } = changeInfo;
    if (cookie.name !== KAOSHIBAO_COOKIE_NAME) {
        return;
    }

    if (!cookie.domain || !cookie.domain.includes(KAOSHIBAO_COOKIE_DOMAIN) || !cookie.value) {
        return;
    }

    syncKaoShiBaoTokenToConfigs(cookie.value).catch((error) => {
        console.error("同步考试宝 token 失败:", error);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab || !isKaoShiBaoTabUrl(tab.url)) {
        return;
    }

    syncKaoShiBaoTokenFromBrowser().catch((error) => {
        console.error("考试宝标签页更新后同步 token 失败:", error);
    });
});

chrome.tabs.onActivated.addListener(() => {
    syncKaoShiBaoTokenFromMatchingTabs().catch((error) => {
        console.error("切换标签页后同步考试宝 token 失败:", error);
    });
});

syncKaoShiBaoTokenFromBrowser().catch((error) => {
    console.error("初始化同步考试宝 token 失败:", error);
});

syncKaoShiBaoTokenFromMatchingTabs().catch((error) => {
    console.error("初始化检查考试宝标签页失败:", error);
});

function handleExecuteScript(request) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
            const activeTab = tabs && tabs[0];
            if (!activeTab || typeof activeTab.id !== "number") {
                reject(new Error("未找到当前激活标签页"));
                return;
            }

            chrome.scripting.executeScript(
                {
                    target: { tabId: activeTab.id },
                    files: [request.file],
                },
                () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    resolve("脚本执行成功");
                }
            );
        });
    });
}

async function checkKaoShiBaoAuth(config) {
    const token = await resolveKaoShiBaoToken();
    return JSON.stringify({
        ok: !!token,
    });
}

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`请求超时（${timeoutMs}ms）`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function parseJsonResponse(response, errorLabel) {
    const responseText = await response.text().catch(() => "");

    if (!response.ok) {
        throw new Error(
            `${errorLabel}: HTTP ${response.status} ${response.statusText}${responseText ? `；返回内容：${truncateErrorText(responseText)}` : ""}`
        );
    }

    if (!responseText) {
        throw new Error(`${errorLabel}: 接口返回为空，未得到可解析的 JSON 内容`);
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        throw new Error(`${errorLabel}: 返回内容不是有效 JSON；原始返回：${truncateErrorText(responseText)}`);
    }
}

async function makeJsonRequest(url, options, errorLabel, timeoutMs = DEFAULT_TIMEOUT) {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    return parseJsonResponse(response, errorLabel);
}

function removeThink(contentText) {
    if (!contentText) {
        return "";
    }

    const thinkTag = "</think>";
    let result = contentText;
    const thinkIndex = result.indexOf(thinkTag);
    if (thinkIndex !== -1) {
        result = result.substring(thinkIndex + thinkTag.length).trim();
    }

    return result
        .replace(/<\|begin_of_box\|>/g, "")
        .replace(/<\|end_of_box\|>/g, "")
        .trim();
}

function getThinkingMode(config) {
    if (config && (config.thinkingMode === "omit" || config.thinkingMode === "off" || config.thinkingMode === "on")) {
        return config.thinkingMode;
    }

    if (config && config.enableThinking === true) {
        return "on";
    }

    return "omit";
}

function applyThinkingModeToRequestBody(requestBody, config) {
    const thinkingMode = getThinkingMode(config);
    if (thinkingMode === "on") {
        requestBody.enable_thinking = true;
    } else if (thinkingMode === "off") {
        requestBody.enable_thinking = false;
    }
}

async function getOpenaiAPIResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const effectiveTimeout = resolveOpenAICompatibleTimeout(config, timeoutMs);
    const requestBody = {
        model: config.model,
        messages: [{ role: "user", content: text }],
        stream: false,
    };
    applyThinkingModeToRequestBody(requestBody, config);

    const result = await makeJsonRequest(
        buildChatCompletionsUrl(config.url),
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        },
        "OpenAI API错误",
        effectiveTimeout
    );

    return removeThink(result?.choices?.[0]?.message?.content || UNKNOWN_ANSWER);
}

async function getOpenAIResponsesResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const effectiveTimeout = resolveOpenAICompatibleTimeout(config, timeoutMs);
    const requestBody = {
        model: config.model,
        input: text,
        stream: false,
    };
    applyThinkingModeToRequestBody(requestBody, config);

    const result = await makeJsonRequest(
        buildResponsesUrl(config.url),
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        },
        "OpenAI Responses API错误",
        effectiveTimeout
    );

    const content = extractResponsesText(result);
    return removeThink(content || UNKNOWN_ANSWER);
}

async function getOllamaResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    if (!config || !config.url) {
        throw new Error("Ollama 配置缺少 URL");
    }

    if (!config.model) {
        throw new Error("Ollama 配置缺少模型名称");
    }

    let result;
    try {
        result = await makeJsonRequest(
            buildOllamaGenerateUrl(config.url),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: config.model,
                    prompt: text,
                    stream: false,
                }),
            },
            "Ollama API错误",
            timeoutMs
        );
    } catch (error) {
        if (isLikelyOllamaOrigin403(error, config.url)) {
            throw new Error(
                `Ollama 返回 403 Forbidden。当前配置地址是 ${config.url}，这通常不是接口路径错误，而是 Ollama 默认拒绝浏览器扩展来源。请在 Ollama 端允许扩展来源，例如设置 OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*,safari-web-extension://* 后重启 Ollama。`
            );
        }

        throw error;
    }

    if (!result || typeof result !== "object") {
        throw new Error("Ollama API错误：返回结果为空或格式不正确");
    }

    if (typeof result.error === "string" && result.error.trim()) {
        throw new Error(`Ollama API错误：${result.error.trim()}`);
    }

    if (typeof result.response !== "string" || !result.response.trim()) {
        throw new Error(`Ollama API错误：未返回有效回答。原始返回：${truncateErrorText(JSON.stringify(result))}`);
    }

    return removeThink(result?.response || UNKNOWN_ANSWER);
}

async function getAliyunQwenResponse(text, config) {
    const requestBody = {
        model: config.model,
        messages: [{ role: "user", content: text }],
        stream: false,
    };
    applyThinkingModeToRequestBody(requestBody, config);

    const result = await makeJsonRequest(
        buildChatCompletionsUrl(config.url),
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.key}`,
            },
            body: JSON.stringify(requestBody),
        },
        "阿里云 API错误",
        ALIYUN_TIMEOUT
    );

    return removeThink(result?.choices?.[0]?.message?.content || KNOWLEDGE_BASE_ANSWER);
}

async function getDifyResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const result = await makeJsonRequest(
        `${config.url}/v1/chat-messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                inputs: {},
                query: text,
                response_mode: "blocking",
                conversation_id: "",
                user: "有手就行",
                files: [],
            }),
        },
        "Dify API错误",
        timeoutMs
    );

    return result.answer || KNOWLEDGE_BASE_ANSWER;
}

async function getCloudFlareResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const result = await makeJsonRequest(
        config.url,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "你是一个友好的问答助手，请使用中文回答所有问题。" },
                    { role: "user", content: text },
                ],
                stream: false,
            }),
        },
        "Cloudflare API错误",
        timeoutMs
    );

    return result?.result?.response || UNKNOWN_ANSWER;
}

async function getAnythingLLMResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const baseUrl = config.url.endsWith("/") ? config.url : `${config.url}/`;
    const result = await makeJsonRequest(
        `${baseUrl}api/v1/workspace/${config.model}/chat`,
        {
            method: "POST",
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                message: text,
                mode: "chat",
            }),
        },
        "AnythingLLM API错误",
        timeoutMs
    );

    return result.textResponse || "未能获取到有效的本地知识库回答";
}

async function getRagflowResponse(text, config, timeoutMs = RAGFLOW_TIMEOUT) {
    const ragflowChatId = resolveRagflowChatId(config.other);
    if (!ragflowChatId) {
        throw new Error("Ragflow 配置缺少 shared_id 或 chat_id");
    }

    const requestOptions = {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: config.model || "model",
            messages: [{ role: "user", content: text }],
            stream: false,
        }),
    };

    const candidateUrls = buildRagflowRequestUrls(config.url, ragflowChatId);
    if (candidateUrls.length === 0) {
        throw new Error("Ragflow 配置缺少有效 URL");
    }

    let lastError = null;
    for (let index = 0; index < candidateUrls.length; index += 1) {
        const requestUrl = candidateUrls[index];
        console.log("Ragflow 请求 URL:", requestUrl);
        console.log("Ragflow 请求体:", JSON.parse(requestOptions.body));
        try {
            const result = await makeJsonRequest(
                requestUrl,
                requestOptions,
                "Ragflow API错误",
                timeoutMs
            );
            console.log("Ragflow 原始响应:", result);

            if (result && typeof result === "object" && !Array.isArray(result) && typeof result.message === "string" && typeof result.code !== "undefined" && !result.choices) {
                throw new Error(`Ragflow API错误：${result.message}（code: ${result.code}）`);
            }

            return removeThink(result?.choices?.[0]?.message?.content || KNOWLEDGE_BASE_ANSWER);
        } catch (error) {
            lastError = error;
            if (index === candidateUrls.length - 1 || !shouldRetryRagflowWithLegacyPath(error)) {
                throw error;
            }
        }
    }

    throw lastError || new Error("Ragflow API错误：未能获取有效响应");
}

function shouldRetryRagflowWithLegacyPath(error) {
    const message = error && error.message ? error.message : String(error || "");
    return /HTTP 404|HTTP 405|not found|not\s+match|no route/i.test(message);
}

function buildRagflowRequestUrls(rawUrl, chatId) {
    const normalizedUrl = String(rawUrl || "").trim().replace(/\/+$/, "");
    if (!normalizedUrl) {
        return [];
    }

    const urls = [];
    const encodedChatId = encodeURIComponent(chatId);
    const replaceChatIdToken = (url) => url.replaceAll("{chat_id}", encodedChatId).replaceAll("%7Bchat_id%7D", encodedChatId);

    if (normalizedUrl.includes("{chat_id}") || normalizedUrl.includes("%7Bchat_id%7D")) {
        urls.push(replaceChatIdToken(normalizedUrl));

        if (normalizedUrl.includes("/api/v1/openai/")) {
            urls.push(replaceChatIdToken(normalizedUrl.replace("/api/v1/openai/", "/api/v1/chats_openai/")));
        } else if (normalizedUrl.includes("/api/v1/chats_openai/")) {
            urls.push(replaceChatIdToken(normalizedUrl.replace("/api/v1/chats_openai/", "/api/v1/openai/")));
        }

        return dedupeUrls(urls);
    }

    if (/\/api\/v1\/(?:openai|chats_openai)\/[^/]+\/chat\/completions$/i.test(normalizedUrl)) {
        urls.push(normalizedUrl);
        if (normalizedUrl.includes("/api/v1/openai/")) {
            urls.push(normalizedUrl.replace("/api/v1/openai/", "/api/v1/chats_openai/"));
        } else {
            urls.push(normalizedUrl.replace("/api/v1/chats_openai/", "/api/v1/openai/"));
        }
        return dedupeUrls(urls);
    }

    urls.push(`${normalizedUrl}/api/v1/openai/${encodedChatId}/chat/completions`);
    urls.push(`${normalizedUrl}/api/v1/chats_openai/${encodedChatId}/chat/completions`);
    return dedupeUrls(urls);
}

function dedupeUrls(urls) {
    return urls.filter((url, index) => url && urls.indexOf(url) === index);
}

function resolveRagflowChatId(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
        return "";
    }

    try {
        const url = new URL(value);
        const sharedId = url.searchParams.get("shared_id");
        if (sharedId) {
            return sharedId.trim();
        }

        const chatId = url.searchParams.get("chat_id");
        if (chatId) {
            return chatId.trim();
        }
    } catch (error) {
        // Raw ID values are expected here; ignore URL parse failures.
    }

    const sharedIdMatch = value.match(/shared_id=([^&]+)/i);
    if (sharedIdMatch && sharedIdMatch[1]) {
        return decodeURIComponent(sharedIdMatch[1]).trim();
    }

    const chatIdMatch = value.match(/chat_id=([^&]+)/i);
    if (chatIdMatch && chatIdMatch[1]) {
        return decodeURIComponent(chatIdMatch[1]).trim();
    }

    return value;
}

async function getGeminiResponse(text, config, timeoutMs = DEFAULT_TIMEOUT) {
    const model = config.model || "gemini-2.0-flash:generateContent";
    const result = await makeJsonRequest(
        `${config.url}/${model}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": config.key,
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text }],
                    },
                ],
            }),
        },
        "Gemini API错误",
        timeoutMs
    );

    return result?.candidates?.[0]?.content?.parts?.[0]?.text || UNKNOWN_ANSWER;
}

async function getKaoShiBaoResponse(text, config, sender) {
    const url = "https://www.kaoshibao.com/api/search/questions";
    const payload = JSON.stringify({
        keyword: findFirstLongString(text),
        size: 10,
        qtype: "",
        page: 1,
        paperid: "",
    });
    const maxRetries = 5;

    if (!config) {
        throw new Error("考试宝配置不存在");
    }

    const token = await resolveKaoShiBaoToken();
    if (!token) {
        return "未获取到考试宝登录态。请先在当前 Chrome 配置文件中任意标签页登录考试宝，插件会自动同步到考试宝配置。";
    }

    if (token.includes("token=")) {
        return '考试宝配置错误，应设置为cookie中token的值，不包括"token="';
    }

    for (let retry = 0; retry < maxRetries; retry += 1) {
        const response = await fetchWithTimeout(
            url,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: payload,
            },
            DEFAULT_TIMEOUT
        );

        const result = await parseJsonResponse(response, "考试宝API请求失败");
        console.log("考试宝搜索结果:", result);
        await logKaoShiBaoResultToPage(sender, result);
        const parsedResult = await parseKaoShiBaoResult(result, text, config);
        if (parsedResult.retry) {
            if (retry === maxRetries - 1) {
                return parsedResult.answer;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
        }

        return parsedResult.answer;
    }

    return "考试宝：发生未知错误。";
}

async function logKaoShiBaoResultToPage(sender, result) {
    const tabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
    if (tabId === null) {
        return;
    }

    await new Promise((resolve) => {
        chrome.tabs.sendMessage(
            tabId,
            {
                action: "logKaoShiBaoResult",
                payload: result,
            },
            () => resolve()
        );
    });
}

async function resolveKaoShiBaoToken() {
    const browserToken = await getKaoShiBaoTokenFromCookies();
    if (browserToken) {
        await syncKaoShiBaoTokenToConfigs(browserToken);
        return browserToken;
    }

    return "";
}

async function getKaoShiBaoTokenFromCookies() {
    for (const url of KAOSHIBAO_COOKIE_URLS) {
        const cookie = await new Promise((resolve, reject) => {
            chrome.cookies.get({ url, name: KAOSHIBAO_COOKIE_NAME }, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve(result || null);
            });
        }).catch((error) => {
            console.error("读取考试宝 cookie 失败:", error);
            return null;
        });

        if (cookie && cookie.value) {
            return cookie.value;
        }
    }

    return "";
}

async function syncKaoShiBaoTokenFromBrowser() {
    const token = await getKaoShiBaoTokenFromCookies();
    if (!token) {
        return;
    }

    await syncKaoShiBaoTokenToConfigs(token);
}

async function syncKaoShiBaoTokenFromMatchingTabs() {
    const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({ url: KAOSHIBAO_TAB_PATTERNS }, (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            resolve(result || []);
        });
    });

    if (!Array.isArray(tabs) || tabs.length === 0) {
        return false;
    }

    return syncKaoShiBaoTokenFromBrowser();
}

async function syncKaoShiBaoTokenToConfigs(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken || normalizedToken.includes("token=")) {
        return false;
    }

    const configs = await getStoredConfigs();
    if (!Array.isArray(configs) || configs.length === 0) {
        return false;
    }

    let hasChanges = false;
    const updatedConfigs = configs.map((config) => {
        if (!config || config.type !== "KaoShiBao") {
            return config;
        }

        if ((config.key || "") === normalizedToken) {
            return config;
        }

        hasChanges = true;
        return {
            ...config,
            key: normalizedToken,
        };
    });

    if (!hasChanges) {
        return false;
    }

    await setStoredConfigs(updatedConfigs);
    return true;
}

function isKaoShiBaoTabUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    try {
        const parsed = new URL(url);
        return parsed.hostname === KAOSHIBAO_COOKIE_DOMAIN || parsed.hostname.endsWith(`.${KAOSHIBAO_COOKIE_DOMAIN}`);
    } catch (error) {
        return false;
    }
}

async function parseKaoShiBaoResult(result, text, config) {
    switch (result.code) {
        case "200":
            if (!result.data?.rows?.length) {
                return { answer: "考试宝：未查询到相关题目。" };
            }

            return {
                answer: await buildKaoShiBaoAnswer(text, result.data.rows.slice(0, 5), config),
            };
        case "998":
        case "999":
            return { answer: result.msg };
        case "30001":
            return { retry: true, answer: parseApiMessage(result.msg) };
        default:
            return { answer: parseApiMessage(result.msg) };
    }
}

async function buildKaoShiBaoAnswer(text, rows, config) {
    let data = "";
    rows.forEach((item) => {
        data += `题：${item.question}<br>`;
        data += `选项：${getKaoShiBaoOptions(item.options)}<br>`;
        data += `答案：${item.answer}<br>`;
    });

    const reasoningConfig = await resolveKaoShiBaoReasoningConfig(config);
    if (!reasoningConfig) {
        return data;
    }

    try {
        const aiAnswer = await getKaoShiBaoAnswerByAI(text, data, reasoningConfig);
        if (!aiAnswer) {
            return data;
        }

        if (config.other) {
            return aiAnswer;
        }

        return `${data}AI处理后的考试宝答案：${aiAnswer}`;
    } catch (error) {
        console.error("考试宝二次模型整理失败，回退原始结果:", error);
        return data;
    }
}

async function resolveKaoShiBaoReasoningConfig(config) {
    const configs = await getStoredConfigs();
    if (!Array.isArray(configs) || configs.length === 0) {
        return undefined;
    }

    const dashscopeAliyunConfig = configs.find((item) => {
        return item &&
            item.type === "Aliyun" &&
            typeof item.url === "string" &&
            item.url.includes("dashscope.aliyuncs.com");
    });

    if (dashscopeAliyunConfig) {
        return dashscopeAliyunConfig;
    }

    const anyAliyunConfig = configs.find((item) => item && item.type === "Aliyun");
    if (anyAliyunConfig) {
        return anyAliyunConfig;
    }

    return configs.find((item) => item && item.type === "OpenaiAPI") || undefined;
}

function findFirstLongString(inputStr) {
    const strArray = inputStr.split("\n");
    for (let i = 0; i < strArray.length; i += 1) {
        if (strArray[i].length > 10) {
            return strArray[i];
        }
    }

    return inputStr;
}

function getKaoShiBaoOptions(data) {
    let msg = "";
    try {
        const options = JSON.parse(data);
        if (!Array.isArray(options) || options.length === 0) {
            return "";
        }

        options.forEach((item) => {
            const key = sanitizeHtmlText(item.Key);
            const value = sanitizeHtmlText(item.Value);
            msg += `${key}、${value}； `;
        });
        return msg;
    } catch (error) {
        return "";
    }
}

async function getStoredConfigs() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["configs"], function (result) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            resolve(result.configs || []);
        });
    });
}

async function setStoredConfigs(configs) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ configs }, function () {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            resolve();
        });
    });
}

async function findConfigByNameAsync(configName) {
    try {
        const allConfigs = await getStoredConfigs();

        if (!Array.isArray(allConfigs)) {
            console.error("从存储中获取的配置不是一个有效的数组。");
            return undefined;
        }

        return allConfigs.find((config) => config.name === configName);
    } catch (error) {
        console.error(`在查找配置 "${configName}" 时发生错误:`, error);
        return undefined;
    }
}

async function getKaoShiBaoAnswerByAI(text, data, config) {
    const sanitizedData = data.replace(/<\/?span\b[^>]*>/gi, "");
    const prompt = `你是一个精通各类考试的专家。我这里有一个题目，以及考试宝返回的参考题库。考试宝内容只能作为参考，不能直接照抄。请先判断参考题库和当前题目是否真正匹配：如果匹配，再结合参考题库答案与选项给出最终答案；如果不匹配，忽略参考题库内容，直接根据题目独立作答。不需要解释，不要输出分析过程，只输出最终答案。题目内容如下："${text}。"\n\n考试宝返回的参考题库如下：${sanitizedData}`;

    if (!config) {
        return "";
    }

    switch (config.type) {
        case "OpenaiAPI":
            return getOpenaiAPIResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "OpenAIResponses":
            return getOpenAIResponsesResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "Ollama":
            return getOllamaResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "Aliyun":
            return getAliyunQwenResponse(prompt, config);
        case "Dify":
            return getDifyResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "CloudFlare":
            return getCloudFlareResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "AnythingLLM":
            return getAnythingLLMResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "Ragflow":
            return getRagflowResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        case "Gemini":
            return getGeminiResponse(prompt, config, KAOSHIBAO_REASONING_TIMEOUT);
        default:
            return "代码错误，请骂老谭。";
    }
}

function parseApiMessage(message) {
    try {
        const parsedMsg = JSON.parse(message);
        return parsedMsg.message || parsedMsg.title || JSON.stringify(parsedMsg);
    } catch (error) {
        return message || "未知错误";
    }
}

function sanitizeHtmlText(text) {
    return String(text || "")
        .replaceAll("<br>", "")
        .replaceAll("<p>", "")
        .replaceAll("</p>", "")
        .trim();
}

function buildChatCompletionsUrl(baseUrl) {
    const normalizedUrl = String(baseUrl || "").replace(/\/+$/, "");
    if (normalizedUrl.endsWith("/chat/completions")) {
        return normalizedUrl;
    }

    return `${normalizedUrl}/chat/completions`;
}

function buildOllamaGenerateUrl(baseUrl) {
    const normalizedUrl = String(baseUrl || "").replace(/\/+$/, "");
    if (normalizedUrl.endsWith("/api/generate")) {
        return normalizedUrl;
    }

    return `${normalizedUrl}/api/generate`;
}

function resolveOpenAICompatibleTimeout(config, timeoutMs) {
    if (timeoutMs !== DEFAULT_TIMEOUT) {
        return timeoutMs;
    }

    if (isLocalOrPrivateNetworkUrl(config && config.url)) {
        return LOCAL_OPENAI_COMPAT_TIMEOUT;
    }

    return timeoutMs;
}

function isLocalOrPrivateNetworkUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
        return false;
    }

    try {
        const parsed = new URL(rawUrl);
        const hostname = (parsed.hostname || "").toLowerCase();
        if (hostname === "localhost" || hostname.endsWith(".local")) {
            return true;
        }

        if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
            return true;
        }

        const private172Match = hostname.match(/^172\.(\d{1,3})\./);
        if (private172Match) {
            const secondOctet = Number(private172Match[1]);
            return secondOctet >= 16 && secondOctet <= 31;
        }

        return false;
    } catch (error) {
        return false;
    }
}

function isLikelyOllamaOrigin403(error, baseUrl) {
    const message = error && error.message ? String(error.message) : "";
    const url = String(baseUrl || "");
    const isLocalOllama = /^(http:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(url);
    return isLocalOllama && /Ollama API错误: HTTP 403/i.test(message);
}

function buildResponsesUrl(baseUrl) {
    const normalizedUrl = String(baseUrl || "").replace(/\/+$/, "");
    if (normalizedUrl.endsWith("/responses")) {
        return normalizedUrl;
    }

    return `${normalizedUrl}/responses`;
}

function extractResponsesText(result) {
    if (!result) {
        return "";
    }

    if (typeof result.output_text === "string" && result.output_text.trim()) {
        return result.output_text;
    }

    if (Array.isArray(result.output)) {
        const parts = [];
        result.output.forEach((item) => {
            if (!Array.isArray(item.content)) {
                return;
            }

            item.content.forEach((contentItem) => {
                if (typeof contentItem.text === "string") {
                    parts.push(contentItem.text);
                } else if (contentItem.text && typeof contentItem.text.value === "string") {
                    parts.push(contentItem.text.value);
                }
            });
        });

        if (parts.length > 0) {
            return parts.join("\n");
        }
    }

    return "";
}

function truncateErrorText(text, maxLength = 300) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength)}...`;
}
