const QUICK_ANSWER_PROMPT = "你是一个精通各类考试的专家，我这里有一个题目：#question。请只返回 JSON，不要返回 Markdown 代码块，不要补充说明。格式必须是：{\"type\":\"single|multiple|judge|unknown\",\"answers\":[\"A\"],\"answer_texts\":[\"选项内容\"],\"summary\":\"给用户看的简短答案\"}。要求：1. 如果是单选题，answers 填选项字母，例如 [\"B\"]；2. 如果是多选题，answers 填选项字母，例如 [\"A\",\"C\"]；3. 如果是判断题且选项有字母标号（如 A.正确 B.错误），answers 填字母，例如 [\"B\"]；如果判断题选项无字母标号，answers 填 [\"正确\"] 或 [\"错误\"]；4. answer_texts 尽量填写对应选项内容；5. summary 用中文简要输出最终建议答案；6. 如果无法确定，type 填 unknown，answers 和 answer_texts 返回空数组。注意：answers 中只填选项字母或判断结果，不要混合字母和文字，不要附带选项内容。";
const EXPLAIN_ANSWER_PROMPT = "你是一个精通各类考试的专家，我这里有一个题目：#question，请先告诉我正确答案内容,然后告诉我你对答案的判断依据。请使用<br>进行换行。";
const HIGHLIGHT_CLASS_NAME = "aitalk-answer-highlight";
const VOTING_TIMEOUT_MS = 45000;

let floatingTextElement = null;
let currentAnswerDiv = null;
let currentRequestId = "";
let lastPointerPosition = { x: 0, y: 0 };
let ttsEnabled = false;
let answerHighlightEnabled = true;
let autoSelectEnabled = true;
let mouseFollowEnabled = true;
let answerHighlightColor = "#dcdcdc";
let answerHighlightWidth = 1;
let selectedRangeRect = null;
let activeHighlights = [];
let selectedScopeElement = null;
let currentSelectionSnapshot = null;
let autoSelectDoneForRequest = "";
let votingCollector = null;

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = function () {
        window.speechSynthesis.getVoices();
    };
}

chrome.runtime.onMessage.addListener((request) => {
    if (!request || request.action !== "logKaoShiBaoResult") {
        return false;
    }

    console.log("考试宝搜索结果:", request.payload);
    return false;
});

document.addEventListener(
    "mousemove",
    (event) => {
        lastPointerPosition = { x: event.pageX, y: event.pageY };
        if (floatingTextElement) {
            positionFloatingElement();
        }
    },
    true
);

document.addEventListener("dblclick", (event) => {
    if (event.ctrlKey || event.metaKey) {
        chrome.runtime.sendMessage({ action: "executeScript", file: "js/enableA.js" }, () => {});
        chrome.runtime.sendMessage({ action: "executeScript", file: "js/enable.js" }, () => {});
        return;
    }

    if (!event.altKey) {
        removeFloatingElement();
        stopSpeaking();
    }
}, true);

document.body.addEventListener("click", async (event) => {
    if (!(event.ctrlKey || event.metaKey || event.altKey) || event.button !== 0) {
        return;
    }

    const selectedText = getSelectedText();
    if (!selectedText) {
        return;
    }

    removeFloatingElement();
    stopSpeaking();
    selectedRangeRect = getSelectionRect();
    selectedScopeElement = getSelectionScopeElement();
    currentSelectionSnapshot = captureSelectionSnapshot(selectedText);
    currentRequestId = createRequestId();
    const requestId = currentRequestId;

    const storage = await getStorageValues(["configs", "selectedConfigs", "enableTTS", "enableAnswerHighlight", "enableAutoSelect", "enableMouseFollow", "answerHighlightColor", "answerHighlightWidth", "mousepadOpacity"]);
    const configs = storage.configs || [];
    const selectedConfigs = storage.selectedConfigs || [];
    ttsEnabled = !!storage.enableTTS;
    answerHighlightEnabled = storage.enableAnswerHighlight !== false;
    autoSelectEnabled = storage.enableAutoSelect !== false;
    mouseFollowEnabled = storage.enableMouseFollow !== false;
    answerHighlightColor = normalizeHighlightColorValue(storage.answerHighlightColor);
    answerHighlightWidth = normalizeHighlightWidthValue(storage.answerHighlightWidth);
    setHighlightOpacity(storage.mousepadOpacity || 50);
    setHighlightAppearance(answerHighlightColor, answerHighlightWidth);

    currentAnswerDiv = document.createElement("div");
    currentAnswerDiv.id = requestId;
    if (mouseFollowEnabled) {
        floatingTextElement = createFloatingElement(storage.mousepadOpacity || 50);
        floatingTextElement.appendChild(currentAnswerDiv);
        setFloatingMessage("内容加载中");
        document.body.appendChild(floatingTextElement);
        positionFloatingElement();
    }
    clearSelection();

    const matchedConfigs = selectedConfigs
        .map((configName) => configs.find((config) => config.name === configName))
        .filter(Boolean);

    if (matchedConfigs.length === 0) {
        if (mouseFollowEnabled) {
            setFloatingMessage("未选择可用模型，请先在弹窗中勾选配置。");
        }
        return;
    }

    const prompt = buildPrompt(selectedText, event.altKey);
    currentAnswerDiv.textContent = "";
    initVotingCollector(requestId, matchedConfigs.length, selectedText);

    matchedConfigs.forEach((config) => {
        requestAI(config.type, prompt, selectedText, config, requestId)
            .then((response) => {
                if (!isActiveRequest(response.answerDivId)) {
                    return;
                }

                const structuredAnswer = parseStructuredAnswer(response.answer || "");
                appendAnswerBlock(config.name, getDisplayAnswer(response.answer || "", structuredAnswer), false);
                registerVote(config.name, structuredAnswer);
            })
            .catch((error) => {
                if (!isActiveRequest(requestId)) {
                    return;
                }

                appendAnswerBlock(config.name, error.message || "发生未知错误", true);
                registerVote(config.name, null);
            })
            .finally(() => {
                if (!isActiveRequest(requestId) || !floatingTextElement) {
                    return;
                }

                if (!currentAnswerDiv.childNodes.length) {
                    setFloatingMessage("内容加载中");
                } else {
                    floatingTextElement.textContent = "";
                    floatingTextElement.appendChild(currentAnswerDiv);
                }
            });
    });
});

function createRequestId() {
    return `answer-${Math.random().toString(36).substring(2, 8)}`;
}

function getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : "";
}

function clearSelection() {
    const selection = window.getSelection && window.getSelection();
    if (selection && selection.removeAllRanges) {
        selection.removeAllRanges();
    }
}

function buildPrompt(selectedText, explainMode) {
    const template = explainMode ? EXPLAIN_ANSWER_PROMPT : QUICK_ANSWER_PROMPT;
    return template.replaceAll("#question", selectedText);
}

function createFloatingElement(opacity) {
    const element = document.createElement("div");
    element.id = "floatingTextElement";
    element.style.position = "absolute";
    element.style.pointerEvents = "auto";
    element.style.fontSize = "12px";
    element.style.color = "rgba(0, 0, 0, 0.5)";
    element.style.zIndex = "999999";
    element.style.opacity = String(opacity / 100);
    setHighlightOpacity(opacity);
    setHighlightAppearance(answerHighlightColor, answerHighlightWidth);
    return element;
}

function positionFloatingElement() {
    if (!floatingTextElement) {
        return;
    }

    floatingTextElement.style.left = `${lastPointerPosition.x + 10}px`;
    floatingTextElement.style.top = `${lastPointerPosition.y + 10}px`;
}

function removeFloatingElement() {
    clearVotingCollector();
    if (floatingTextElement && floatingTextElement.parentNode) {
        floatingTextElement.parentNode.removeChild(floatingTextElement);
    }

    clearAnswerHighlights();
    floatingTextElement = null;
    currentAnswerDiv = null;
    currentRequestId = "";
    selectedRangeRect = null;
    selectedScopeElement = null;
    currentSelectionSnapshot = null;
    autoSelectDoneForRequest = "";
}

function setFloatingMessage(message) {
    if (!floatingTextElement) {
        return;
    }

    floatingTextElement.textContent = message;
}

function appendAnswerBlock(configName, message, isError) {
    if (!currentAnswerDiv) {
        return;
    }

    const block = document.createElement("div");
    const br1 = document.createElement("br");
    const header = document.createElement("b");
    const br2 = document.createElement("br");
    const content = document.createElement("div");

    const label = isError ? `${configName} 错误：` : `${configName} 的回答：`;
    header.textContent = label;
    content.style.whiteSpace = "pre-wrap";
    content.textContent = message;
    console.log(`${label}${message}`);

    block.appendChild(br1);
    block.appendChild(header);
    block.appendChild(br2);
    block.appendChild(content);
    currentAnswerDiv.appendChild(block);

    if (ttsEnabled) {
        const prefix = isError ? `${configName} 错误。` : `${configName}的答案：`;
        speakText(`${prefix}${content.textContent}`);
    }

    copyAnswerToClipboard();
}

function isActiveRequest(answerDivId) {
    return !!currentAnswerDiv && currentRequestId === answerDivId && currentAnswerDiv.id === answerDivId;
}

function copyAnswerToClipboard() {
    if (!currentAnswerDiv) {
        return;
    }

    chrome.storage.local.get(["copyClipboard"], function (result) {
        if (!result.copyClipboard) {
            return;
        }

        const textToCopy = currentAnswerDiv.innerText;
        copyText(textToCopy).catch((error) => {
            console.error("无法拷贝内容到剪贴板:", error);
        });
    });
}

function speakText(text) {
    try {
        if (!ttsEnabled || !text || !window.speechSynthesis) {
            return;
        }

        const utter = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("zh"));
        if (zhVoice) {
            utter.voice = zhVoice;
        }

        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        window.speechSynthesis.speak(utter);
    } catch (error) {
        console.error("语音朗读失败:", error);
    }
}

function stopSpeaking() {
    if (window.speechSynthesis) {
        try {
            window.speechSynthesis.cancel();
        } catch (error) {
            console.error("停止朗读失败:", error);
        }
    }
}

function getStorageValues(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, function (result) {
            resolve(result || {});
        });
    });
}

function requestAI(action, text, selectText, config, answerDivId) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, text, selectText, config, answerDivId }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (!response) {
                reject(new Error("未能获取到有效的AI回答"));
                return;
            }

            resolve(response);
        });
    });
}

function parseStructuredAnswer(rawText) {
    if (!rawText) {
        return null;
    }

    const normalizedText = rawText.trim();
    const directJson = tryParseJson(normalizedText);
    if (directJson) {
        return normalizeStructuredAnswer(directJson);
    }

    const jsonMatch = normalizedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return parsePlainTextAnswer(normalizedText);
    }

    const parsedJson = normalizeStructuredAnswer(tryParseJson(jsonMatch[0]));
    return parsedJson || parsePlainTextAnswer(normalizedText);
}

function tryParseJson(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function normalizeStructuredAnswer(data) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const answers = Array.isArray(data.answers) ? data.answers.map((item) => String(item).trim()).filter(Boolean) : [];
    const answerTexts = Array.isArray(data.answer_texts) ? data.answer_texts.map((item) => String(item).trim()).filter(Boolean) : [];
    const type = typeof data.type === "string" ? data.type.trim() : "unknown";
    const summary = typeof data.summary === "string" ? data.summary.trim() : "";

    return {
        type,
        answers,
        answerTexts,
        summary,
    };
}

function parsePlainTextAnswer(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
        return null;
    }

    const answerLabelMatch = normalized.match(/答案(?:为|是)?[\s：:]*([A-Ha-h](?:[\s、,，/和及与]+[A-Ha-h])*)/);
    if (answerLabelMatch) {
        const answers = answerLabelMatch[1]
            .split(/[\s、,，/和及与]+/)
            .map((item) => item.trim().toUpperCase())
            .filter((item) => /^[A-H]$/.test(item));

        if (answers.length > 0) {
            return {
                type: answers.length > 1 ? "multiple" : "single",
                answers,
                answerTexts: [],
                summary: normalized,
            };
        }
    }

    const answerLabelJudgeMatch = normalized.match(/答案(?:为|是)?[\s：:]*(正确|错误|对|错)/);
    if (answerLabelJudgeMatch) {
        return {
            type: "judge",
            answers: [answerLabelJudgeMatch[1]],
            answerTexts: [],
            summary: normalized,
        };
    }

    const multipleOptionMatch = normalized.match(/^([A-Ha-h](?:[\s、,，/和及与]+[A-Ha-h])+)/);
    if (multipleOptionMatch) {
        const answers = multipleOptionMatch[1]
            .split(/[\s、,，/和及与]+/)
            .map((item) => item.trim().toUpperCase())
            .filter((item) => /^[A-H]$/.test(item));

        if (answers.length > 1) {
            return {
                type: "multiple",
                answers,
                answerTexts: [],
                summary: normalized,
            };
        }
    }

    const singleOptionMatch = normalized.match(/^([A-Ha-h])(?:[\s、.．:：,，]|$)/);
    if (singleOptionMatch) {
        const option = singleOptionMatch[1].toUpperCase();
        const answerText = normalized
            .replace(/^([A-Ha-h])(?:[\s、.．:：,，])+/, "")
            .trim();

        return {
            type: "single",
            answers: [option],
            answerTexts: answerText ? [answerText] : [],
            summary: normalized,
        };
    }

    const judgeMatch = normalized.match(/^(正确|错误|对|错)/);
    if (judgeMatch) {
        return {
            type: "judge",
            answers: [judgeMatch[1]],
            answerTexts: [],
            summary: normalized,
        };
    }

    return null;
}

function getDisplayAnswer(rawText, structuredAnswer) {
    if (!structuredAnswer) {
        return rawText;
    }

    const parts = [];
    if (structuredAnswer.answers.length > 0) {
        parts.push(structuredAnswer.answers.join(", "));
    }
    if (structuredAnswer.answerTexts.length > 0) {
        parts.push(structuredAnswer.answerTexts.join("；"));
    }
    if (parts.length > 0) {
        return parts.join("\n");
    }
    if (structuredAnswer.summary) {
        return structuredAnswer.summary;
    }

    return rawText;
}

function applyAnswerMarkersV2(structuredAnswer, selectedText) {
    clearAnswerHighlights();

    if (!structuredAnswer || (!structuredAnswer.answers.length && !structuredAnswer.answerTexts.length)) {
        return;
    }

    if (answerHighlightEnabled || autoSelectEnabled) {
        directApplyAnswers(structuredAnswer);
    }
}

function initVotingCollector(requestId, expectedCount, selectedText) {
    clearVotingCollector();
    votingCollector = {
        requestId,
        expectedCount,
        selectedText,
        responses: [],
        resolved: false,
        timeoutId: expectedCount > 1
            ? setTimeout(handleVotingTimeout, VOTING_TIMEOUT_MS)
            : null
    };
}

function clearVotingCollector() {
    if (votingCollector && votingCollector.timeoutId) {
        clearTimeout(votingCollector.timeoutId);
    }
    votingCollector = null;
}

function registerVote(configName, structuredAnswer) {
    if (!votingCollector || votingCollector.requestId !== currentRequestId || votingCollector.resolved) {
        return;
    }
    votingCollector.responses.push({
        configName,
        structuredAnswer,
        receivedAt: Date.now()
    });
    evaluateVotes();
}

function evaluateVotes() {
    const vc = votingCollector;
    if (!vc || vc.resolved) return;

    const validResponses = vc.responses.filter(r => r.structuredAnswer && r.structuredAnswer.answers && r.structuredAnswer.answers.length > 0);

    if (vc.expectedCount === 1 && validResponses.length === 1) {
        executeVotingResult(validResponses[0].structuredAnswer);
        return;
    }

    if (vc.expectedCount === 2) {
        if (validResponses.length === 2) {
            const key0 = normalizeAnswerKey(validResponses[0].structuredAnswer);
            const key1 = normalizeAnswerKey(validResponses[1].structuredAnswer);
            executeVotingResult(key0 === key1
                ? validResponses[0].structuredAnswer
                : validResponses.sort((a, b) => a.receivedAt - b.receivedAt)[0].structuredAnswer
            );
            return;
        }
        const failedCount = vc.responses.length - validResponses.length;
        if (failedCount > 0 && validResponses.length === 1) {
            executeVotingResult(validResponses[0].structuredAnswer);
            return;
        }
        return;
    }

    const threshold = Math.ceil(vc.expectedCount / 2);
    const groups = {};
    validResponses.forEach(r => {
        const key = normalizeAnswerKey(r.structuredAnswer);
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    for (const key in groups) {
        if (groups[key].length >= threshold) {
            executeVotingResult(groups[key][0].structuredAnswer);
            return;
        }
    }

    const totalReceived = vc.responses.length;
    if (totalReceived >= vc.expectedCount) {
        if (validResponses.length > 0) {
            executeVotingResult(validResponses.sort((a, b) => a.receivedAt - b.receivedAt)[0].structuredAnswer);
        } else {
            vc.resolved = true;
        }
    }
}

function executeVotingResult(structuredAnswer) {
    if (!votingCollector) return;
    votingCollector.resolved = true;
    if (votingCollector.timeoutId) {
        clearTimeout(votingCollector.timeoutId);
        votingCollector.timeoutId = null;
    }
    applyAnswerMarkersV2(structuredAnswer, votingCollector.selectedText);
}

function handleVotingTimeout() {
    if (!votingCollector || votingCollector.resolved || votingCollector.requestId !== currentRequestId) {
        return;
    }
    const validResponses = votingCollector.responses.filter(r => r.structuredAnswer && r.structuredAnswer.answers && r.structuredAnswer.answers.length > 0);
    if (validResponses.length > 0) {
        executeVotingResult(selectBestVotingAnswer(validResponses));
    } else {
        votingCollector.resolved = true;
    }
}

function selectBestVotingAnswer(validResponses) {
    if (!Array.isArray(validResponses) || validResponses.length === 0) {
        return null;
    }

    const groups = {};
    validResponses.forEach((response) => {
        const key = normalizeAnswerKey(response.structuredAnswer);
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(response);
    });

    const rankedGroups = Object.values(groups).sort((groupA, groupB) => {
        if (groupB.length !== groupA.length) {
            return groupB.length - groupA.length;
        }

        const earliestA = Math.min(...groupA.map((item) => item.receivedAt));
        const earliestB = Math.min(...groupB.map((item) => item.receivedAt));
        return earliestA - earliestB;
    });

    return rankedGroups[0][0].structuredAnswer;
}

function normalizeAnswerKey(structuredAnswer) {
    if (!structuredAnswer || !structuredAnswer.answers || !structuredAnswer.answers.length) return "";
    return structuredAnswer.answers
        .map(a => String(a || "").trim().toUpperCase())
        .map(a => a === "对" ? "正确" : a === "错" ? "错误" : a)
        .sort()
        .join(",");
}

function directApplyAnswers(structuredAnswer) {
    if (!structuredAnswer || !structuredAnswer.answers.length) {
        return;
    }

    const answerMode = getAnswerSelectionModeV2(structuredAnswer);
    const shouldAutoSelect = autoSelectEnabled && autoSelectDoneForRequest !== currentRequestId;
    if (shouldAutoSelect) {
        autoSelectDoneForRequest = currentRequestId;
    }

    const scopeRoot = selectedScopeElement || (currentSelectionSnapshot && currentSelectionSnapshot.scopeElement) || document.body;
    const selectionRect = selectedRangeRect || (currentSelectionSnapshot && currentSelectionSnapshot.rect) || null;

    structuredAnswer.answers.forEach((answer) => {
        const normalizedAnswer = String(answer || "").trim().toUpperCase();
        if (!normalizedAnswer) {
            return;
        }

        let optionElement = findOptionElementByAnswer(scopeRoot, normalizedAnswer, structuredAnswer.type);
        if (!optionElement && scopeRoot !== document.body) {
            optionElement = findClosestOptionElement(document.body, normalizedAnswer, structuredAnswer.type, selectionRect);
        }
        if (!optionElement) {
            console.log("[aitalk] 未找到元素:", normalizedAnswer, "scopeRoot=", scopeRoot.tagName, "bodySearch=true");
            return;
        }
        console.log("[aitalk] 找到元素:", normalizedAnswer, optionElement.tagName, "class=", optionElement.className, "text=", optionElement.innerText.substring(0, 30));

        if (answerHighlightEnabled) {
            addAnswerHighlightOverlay(optionElement);
        }

        if (shouldAutoSelect) {
            const control = findSelectableControlV2(optionElement, 3, answerMode);
            if (control && !control.disabled) {
                if (!control.checked) {
                    if (typeof control.click === "function") {
                        control.click();
                    } else {
                        control.checked = true;
                        dispatchControlEventsV2(control);
                    }
                }
                return;
            }

            const customControl = findCustomSelectableControlV2(optionElement, 3, answerMode);
            if (customControl) {
                activateCustomControlV2(customControl);
            }
        }
    });
}

function findOptionElementByAnswer(scopeRoot, answer, questionType) {
    const isJudge = ["正确", "错误", "对", "错"].includes(answer);
    const judgeAliases = { "正确": ["正确", "对", "√"], "错误": ["错误", "错", "×"], "对": ["对", "正确", "√"], "错": ["错", "错误", "×"] };
    const candidates = Array.from(scopeRoot.querySelectorAll("label, li, div, p, td, th, button, span"));

    let judgeFallback = null;

    for (let i = 0; i < candidates.length; i++) {
        const element = candidates[i];
        const text = (element.innerText || "").trim();
        if (!text || text.length > 200) {
            continue;
        }

        if (element.children.length > 4) {
            continue;
        }

        if (countOptionMarkers(text) > 1) {
            continue;
        }

        // 如果文本含换行且有多个选项字母开头的行，说明是包含所有选项的父容器，跳过
        if ((text.match(/\n\s*[A-Ha-h][\s、.．:：)\]]/g) || []).length >= 2) {
            continue;
        }

        if (isJudge) {
            const normalizedText = normalizeText(text);
            const normalizedAnswer = normalizeText(answer);
            // 精确匹配：文本就是"正确"/"错误"等
            if (normalizedText === normalizedAnswer || (normalizedText.startsWith(normalizedAnswer) && text.length <= answer.length + 2)) {
                return element;
            }
            // 文本以答案开头且附近有控件
            if (normalizedText.startsWith(normalizedAnswer)) {
                const hasControl = element.querySelector && element.querySelector('input[type="radio"], input[type="checkbox"]');
                const parentHasControl = element.parentElement && element.parentElement.querySelector && element.parentElement.querySelector('input[type="radio"], input[type="checkbox"]');
                const grandParentHasControl = element.parentElement && element.parentElement.parentElement && element.parentElement.parentElement.querySelector && element.parentElement.parentElement.querySelector('input[type="radio"], input[type="checkbox"]');
                if (hasControl || parentHasControl || grandParentHasControl) {
                    return element;
                }
            }
            // 备选：选项格式如 "A. 正确" / "B. 错误"，文本包含判断答案的别名
            if (!judgeFallback && text.length < 20) {
                const aliases = judgeAliases[answer] || [answer];
                for (const alias of aliases) {
                    if (normalizedText.includes(normalizeText(alias))) {
                        const hasCtrl = element.querySelector && element.querySelector('input[type="radio"], input[type="checkbox"]');
                        const parentHasCtrl = element.parentElement && element.parentElement.querySelector && element.parentElement.querySelector('input[type="radio"], input[type="checkbox"]');
                        const grandParentHasCtrl = element.parentElement && element.parentElement.parentElement && element.parentElement.parentElement.querySelector && element.parentElement.parentElement.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (hasCtrl || parentHasCtrl || grandParentHasCtrl) {
                            judgeFallback = element;
                            break;
                        }
                    }
                }
            }
            continue;
        }

        const optionKey = extractOptionKeyV2(text);
        if (optionKey === answer && text.length > 1) {
            return element;
        }

        if (!optionKey && /^[A-Ha-h]/.test(text) && text[0].toUpperCase() === answer) {
            const hasControl = element.querySelector && element.querySelector('input[type="radio"], input[type="checkbox"]');
            const parentHasControl = element.parentElement && element.parentElement.querySelector && element.parentElement.querySelector('input[type="radio"], input[type="checkbox"]');
            if (hasControl || parentHasControl) {
                return element;
            }
        }
    }

    return judgeFallback || null;
}

function findClosestOptionElement(scopeRoot, answer, questionType, selectionRect) {
    const isJudge = ["正确", "错误", "对", "错"].includes(answer);
    const judgeAliases = { "正确": ["正确", "对", "√"], "错误": ["错误", "错", "×"], "对": ["对", "正确", "√"], "错": ["错", "错误", "×"] };
    const candidates = Array.from(scopeRoot.querySelectorAll("label, li, div, p, td, th, button, span"));
    const matches = [];

    for (let i = 0; i < candidates.length; i++) {
        const element = candidates[i];
        const text = (element.innerText || "").trim();
        if (!text || text.length > 200) continue;
        if (element.children.length > 4) continue;
        if (countOptionMarkers(text) > 1) continue;
        if ((text.match(/\n\s*[A-Ha-h][\s、.．:：)\]]/g) || []).length >= 2) continue;

        if (isJudge) {
            const normalizedText = normalizeText(text);
            const normalizedAnswer = normalizeText(answer);
            if (normalizedText === normalizedAnswer || (normalizedText.startsWith(normalizedAnswer) && text.length <= answer.length + 2)) {
                matches.push(element);
                continue;
            }
            if (text.length < 20) {
                const aliases = judgeAliases[answer] || [answer];
                for (const alias of aliases) {
                    if (normalizedText.includes(normalizeText(alias))) {
                        matches.push(element);
                        break;
                    }
                }
            }
            continue;
        }

        const optionKey = extractOptionKeyV2(text);
        if (optionKey === answer && text.length > 1) {
            matches.push(element);
        }
    }

    if (matches.length === 0) return null;
    if (matches.length === 1 || !selectionRect) return matches[0];

    // 返回距离选中文字最近的匹配元素
    let closest = matches[0];
    let minDist = Infinity;
    matches.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;
        const dist = Math.abs(rect.top - selectionRect.top) + Math.abs(rect.left - selectionRect.left);
        if (dist < minDist) {
            minDist = dist;
            closest = el;
        }
    });
    return closest;
}

function captureSelectionSnapshot(selectedText) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const rect = getRangeViewportRect(range);
    const commonNode = range.commonAncestorContainer;
    const commonElement = commonNode
        ? (commonNode.nodeType === Node.ELEMENT_NODE ? commonNode : commonNode.parentElement)
        : null;
    const scopeElement = findSelectionScopeElementV2(range, selectedText, commonElement);
    const optionRows = extractOptionRowsFromRangeV2(range, scopeElement, selectedText);

    return {
        selectedText,
        normalizedSelectedText: normalizeText(selectedText),
        range,
        rect,
        commonElement,
        scopeElement,
        optionRows,
    };
}

function getRangeViewportRect(range) {
    if (!range) {
        return null;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
        return null;
    }

    return rect;
}

function findSelectionScopeElementV2(range, selectedText, commonElement) {
    const root = commonElement || selectedScopeElement || document.body;
    let current = root;
    let bestMatch = root;
    const normalizedSelectedText = normalizeText(selectedText);

    while (current && current !== document.body) {
        const text = normalizeText(current.innerText || "");
        if (text && normalizedSelectedText && text.includes(normalizedSelectedText)) {
            bestMatch = current;
        }
        current = current.parentElement;
    }

    return bestMatch || root || document.body;
}

function extractOptionRowsFromRangeV2(range, scopeElement, selectedText) {
    const searchRoot = scopeElement || document.body;
    const walker = document.createTreeWalker(
        searchRoot,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode(node) {
                if (!node || !isCandidateOptionElementV2(node)) {
                    return NodeFilter.FILTER_SKIP;
                }

                if (isElementIntersectingRangeV2(node, range)) {
                    return NodeFilter.FILTER_ACCEPT;
                }

                return NodeFilter.FILTER_SKIP;
            },
        }
    );

    const rows = [];
    const seen = new Set();
    let currentNode = walker.nextNode();

    while (currentNode) {
        const normalizedText = normalizeText(currentNode.innerText || "");
        if (normalizedText && !seen.has(currentNode)) {
            seen.add(currentNode);
            rows.push(buildOptionRowV2(currentNode, selectedText));
        }
        currentNode = walker.nextNode();
    }

    if (rows.length > 0) {
        return rows.filter(Boolean);
    }

    return collectFallbackOptionRowsV2(searchRoot, selectedText);
}

function collectFallbackOptionRowsV2(searchRoot, selectedText) {
    return Array.from(searchRoot.querySelectorAll("label, li, div, p, td, th, button, span"))
        .filter((element) => isCandidateOptionElementV2(element))
        .map((element) => buildOptionRowV2(element, selectedText))
        .filter(Boolean);
}

function buildOptionRowV2(element, selectedText) {
    const text = (element.innerText || "").trim();
    const normalizedText = normalizeText(text);
    if (!text || !normalizedText) {
        return null;
    }

    return {
        element,
        text,
        normalizedText,
        optionKey: extractOptionKeyV2(text),
        isJudge: isJudgeOptionTextV2(text),
        rect: getElementViewportRect(element),
        selectedTextDistance: getDistanceToSelectedRectV2(getElementViewportRect(element)),
        containsSelectedText: normalizedText.includes(normalizeText(selectedText)),
    };
}

function isElementIntersectingRangeV2(element, range) {
    if (!element || !range) {
        return false;
    }

    try {
        const elementRange = document.createRange();
        elementRange.selectNodeContents(element);
        return (
            range.compareBoundaryPoints(Range.END_TO_START, elementRange) < 0 &&
            range.compareBoundaryPoints(Range.START_TO_END, elementRange) > 0
        );
    } catch (error) {
        return false;
    }
}

function isCandidateOptionElementV2(element) {
    if (!element || !(element instanceof Element)) {
        return false;
    }

    const text = (element.innerText || "").trim();
    if (!text || text.length > 200) {
        return false;
    }

    if (element.children.length > 4) {
        return false;
    }

    if (countOptionMarkers(text) > 1) {
        return false;
    }

    if (isOptionLikeText(text)) {
        return true;
    }

    if (element.matches('label, [role="radio"], [role="checkbox"]')) {
        return true;
    }

    const input = element.querySelector('input[type="radio"], input[type="checkbox"]');
    if (input) {
        return true;
    }

    const siblings = element.parentElement ? Array.from(element.parentElement.children) : [];
    const similarCount = siblings.filter((item) => item !== element && isOptionLikeText((item.innerText || "").trim())).length;
    return similarCount >= 1;
}

function extractOptionKeyV2(text) {
    const match = String(text || "").trim().match(/^(?:[（(]?)([A-Ha-h])(?:[）)\].、．:：\s]|$)/);
    return match ? match[1].toUpperCase() : "";
}

function isJudgeOptionTextV2(text) {
    return /^(正确|错误|对|错)/.test(String(text || "").trim());
}

function buildMarkerCandidatesV2(snapshot, selectedText) {
    const baseCandidates = snapshot && snapshot.optionRows && snapshot.optionRows.length > 0
        ? snapshot.optionRows
        : [];

    if (baseCandidates.length > 0) {
        return dedupeCandidatesV2(baseCandidates);
    }

    const scopeRoot = (snapshot && snapshot.scopeElement) || selectedScopeElement || document.body;
    const fallbackCandidates = collectFallbackOptionRowsV2(scopeRoot, selectedText);
    if (fallbackCandidates.length > 0) {
        return dedupeCandidatesV2(fallbackCandidates);
    }

    return dedupeCandidatesV2(collectFallbackOptionRowsV2(document.body, selectedText));
}

function dedupeCandidatesV2(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
        if (!candidate || !candidate.element) {
            return false;
        }

        if (seen.has(candidate.element)) {
            return false;
        }

        seen.add(candidate.element);
        return true;
    });
}

function getMarkerScoreV2(candidate, structuredAnswer, snapshot) {
    if (!candidate || !candidate.text) {
        return 0;
    }

    let score = 0;

    structuredAnswer.answers.forEach((answer) => {
        const normalizedAnswer = String(answer || "").trim().toUpperCase();
        if (!normalizedAnswer) {
            return;
        }

        if (candidate.optionKey && normalizedAnswer === candidate.optionKey) {
            score += 12;
        }

        if (["正确", "错误", "对", "错"].includes(normalizedAnswer) && isJudgeOptionTextV2(candidate.text)) {
            if (normalizeText(candidate.text).startsWith(normalizeText(normalizedAnswer))) {
                score += 12;
            }
        }
    });

    structuredAnswer.answerTexts.forEach((answerText) => {
        const normalizedAnswerText = normalizeText(answerText);
        if (!normalizedAnswerText) {
            return;
        }

        if (candidate.normalizedText === normalizedAnswerText) {
            score += 14;
            return;
        }

        if (candidate.normalizedText.includes(normalizedAnswerText)) {
            score += 9;
        }
    });

    if (structuredAnswer.summary) {
        const normalizedSummary = normalizeText(structuredAnswer.summary);
        if (normalizedSummary && candidate.normalizedText.includes(normalizedSummary)) {
            score += 2;
        }
    }

    if (snapshot && snapshot.rect && candidate.rect) {
        score += getDistanceScoreV2(candidate.rect, snapshot.rect);
    }

    if (candidate.containsSelectedText) {
        score -= 8;
    }

    return score;
}

function getDistanceToSelectedRectV2(rect) {
    if (!rect || !selectedRangeRect) {
        return Number.MAX_SAFE_INTEGER;
    }

    const selectionCenterX = selectedRangeRect.left + selectedRangeRect.width / 2;
    const selectionCenterY = selectedRangeRect.top + selectedRangeRect.height / 2;
    const candidateCenterX = rect.left + rect.width / 2;
    const candidateCenterY = rect.top + rect.height / 2;

    return Math.abs(candidateCenterX - selectionCenterX) + Math.abs(candidateCenterY - selectionCenterY);
}

function getDistanceScoreV2(candidateRect, referenceRect) {
    if (!candidateRect || !referenceRect) {
        return 0;
    }

    const referenceCenterX = referenceRect.left + referenceRect.width / 2;
    const referenceCenterY = referenceRect.top + referenceRect.height / 2;
    const candidateCenterX = candidateRect.left + candidateRect.width / 2;
    const candidateCenterY = candidateRect.top + candidateRect.height / 2;
    const dx = Math.abs(candidateCenterX - referenceCenterX);
    const dy = Math.abs(candidateCenterY - referenceCenterY);

    if (dx < 220 && dy < 360) {
        return 3;
    }

    if (dx < 420 && dy < 640) {
        return 1;
    }

    return 0;
}

function pickMarkerTargetsV2(scoredCandidates, structuredAnswer) {
    const picked = [];
    const pickedElements = new Set();

    structuredAnswer.answers.forEach((answer) => {
        const normalizedAnswer = String(answer || "").trim().toUpperCase();
        const match = scoredCandidates.find((item) => {
            const candidate = item.candidate;
            if (pickedElements.has(candidate.element)) {
                return false;
            }

            if (candidate.optionKey && candidate.optionKey === normalizedAnswer) {
                return true;
            }

            if (["正确", "错误", "对", "错"].includes(normalizedAnswer) && isJudgeOptionTextV2(candidate.text)) {
                return normalizeText(candidate.text).startsWith(normalizeText(normalizedAnswer));
            }

            return false;
        });

        if (match) {
            picked.push(match.candidate.element);
            pickedElements.add(match.candidate.element);
        }
    });

    structuredAnswer.answerTexts.forEach((answerText) => {
        const normalizedAnswerText = normalizeText(answerText);
        const match = scoredCandidates.find((item) => {
            const candidate = item.candidate;
            return !pickedElements.has(candidate.element) &&
                normalizedAnswerText &&
                candidate.normalizedText.includes(normalizedAnswerText);
        });

        if (match) {
            picked.push(match.candidate.element);
            pickedElements.add(match.candidate.element);
        }
    });

    if (picked.length > 0) {
        return picked.slice(0, 4);
    }

    return scoredCandidates.slice(0, 3).map((item) => item.candidate.element);
}

function autoSelectAnswerControlV2(targetElement, structuredAnswer) {
    if (!targetElement || !structuredAnswer) {
        return;
    }

    const answerMode = getAnswerSelectionModeV2(structuredAnswer);
    const control = findSelectableControlV2(targetElement, 3, answerMode);
    const customControl = control ? null : findCustomSelectableControlV2(targetElement, 3, answerMode);

    if (!control && !customControl) {
        return;
    }

    if (control && control.disabled) {
        return;
    }

    if (control && control.checked) {
        dispatchControlEventsV2(control);
        return;
    }

    if (control) {
        const label = findAssociatedLabelV2(control, targetElement, 3);
        if (label && typeof label.click === "function") {
            label.click();
            return;
        }

        if (typeof control.click === "function") {
            control.click();
            return;
        }

        control.checked = true;
        dispatchControlEventsV2(control);
        return;
    }

    activateCustomControlV2(customControl);
}

function getAnswerSelectionModeV2(structuredAnswer) {
    if (!structuredAnswer) {
        return "any";
    }

    const type = String(structuredAnswer.type || "").toLowerCase();
    const answers = Array.isArray(structuredAnswer.answers) ? structuredAnswer.answers : [];
    return type === "multiple" || answers.length > 1 ? "multiple" : "single";
}

function findSelectableControlV2(element, maxLevels, answerMode = "any") {
    let current = element;
    let levels = 0;

    while (current && levels <= maxLevels) {
        const directMatch = current.matches && current.matches('input[type="radio"], input[type="checkbox"]')
            ? current
            : null;

        if (directMatch && isSelectableControlAllowedV2(directMatch, answerMode)) {
            return directMatch;
        }

        if (current.querySelector) {
            const scopedMatch = findAllowedSelectableControlInElementV2(current, answerMode);
            if (scopedMatch) {
                return scopedMatch;
            }
        }

        current = current.parentElement;
        levels += 1;
    }

    return null;
}

function findAllowedSelectableControlInElementV2(element, answerMode) {
    const preferredSelector = answerMode === "multiple"
        ? 'input[type="checkbox"]'
        : answerMode === "single"
            ? 'input[type="radio"], input[type="checkbox"]'
            : 'input[type="radio"], input[type="checkbox"]';
    const preferredMatches = Array.from(element.querySelectorAll(preferredSelector))
        .filter((control) => isSelectableControlAllowedV2(control, answerMode));
    if (preferredMatches.length === 1) {
        const preferred = preferredMatches[0];
        return preferred;
    }

    const fallbackMatches = Array.from(element.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .filter((control) => isSelectableControlAllowedV2(control, answerMode));
    return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

function isSelectableControlAllowedV2(control, answerMode) {
    if (!control || !control.type) {
        return false;
    }

    const type = String(control.type).toLowerCase();
    if (answerMode === "multiple") {
        return type === "checkbox";
    }

    return type === "radio" || type === "checkbox";
}

function findCustomSelectableControlV2(element, maxLevels, answerMode = "any") {
    let current = element;
    let levels = 0;
    const selector = getCustomSelectableSelectorV2(answerMode);

    while (current && levels <= maxLevels) {
        const directMatch = current.matches && current.matches(selector)
            ? current
            : null;

        if (directMatch && isCustomSelectableAllowedV2(directMatch, answerMode)) {
            return directMatch;
        }

        if (current.querySelectorAll) {
            const scopedMatches = Array.from(current.querySelectorAll(selector))
                .filter((control) => isCustomSelectableAllowedV2(control, answerMode));
            if (scopedMatches.length === 1) {
                return scopedMatches[0];
            }
        }

        current = current.parentElement;
        levels += 1;
    }

    return null;
}

function isCustomSelectableAllowedV2(control, answerMode) {
    if (!control || answerMode !== "multiple") {
        return !!control;
    }

    const role = control.getAttribute && String(control.getAttribute("role") || "").toLowerCase();
    if (role === "checkbox") {
        return true;
    }
    if (role === "radio") {
        return false;
    }

    const checkboxInput = control.querySelector && control.querySelector('input[type="checkbox"]');
    if (checkboxInput) {
        return true;
    }

    const radioInput = control.querySelector && control.querySelector('input[type="radio"]');
    if (radioInput) {
        return false;
    }

    if (control.tagName === "LABEL" && control.htmlFor) {
        const associated = document.getElementById(control.htmlFor);
        if (associated && associated.matches('input[type="checkbox"]')) {
            return true;
        }
        if (associated && associated.matches('input[type="radio"]')) {
            return false;
        }
    }

    return control.matches && control.matches('.checkbox, .ant-checkbox-wrapper, .el-checkbox, .van-checkbox, [aria-checked]');
}

function getCustomSelectableSelectorV2(answerMode) {
    if (answerMode === "multiple") {
        return [
            '[role="checkbox"]',
            '.checkbox',
            '.ant-checkbox-wrapper',
            '.el-checkbox',
            '.van-checkbox',
            'label'
        ].join(', ');
    }

    return [
        'label',
        '[role="radio"]',
        '[role="checkbox"]',
        '[aria-checked]',
        '.radio',
        '.checkbox',
        '.ant-radio-wrapper',
        '.ant-checkbox-wrapper',
        '.el-radio',
        '.el-checkbox',
        '.van-radio',
        '.van-checkbox'
    ].join(', ');
}

function findAssociatedLabelV2(control, fallbackElement, maxLevels) {
    if (!control) {
        return null;
    }

    if (control.labels && control.labels.length > 0) {
        return control.labels[0];
    }

    let current = fallbackElement;
    let levels = 0;
    while (current && levels <= maxLevels) {
        if (current.tagName === "LABEL") {
            return current;
        }

        current = current.parentElement;
        levels += 1;
    }

    return null;
}

function dispatchControlEventsV2(control) {
    ["input", "change", "click"].forEach((eventName) => {
        control.dispatchEvent(new Event(eventName, { bubbles: true }));
    });
}

function activateCustomControlV2(control) {
    if (!control) {
        return;
    }

    const ariaChecked = control.getAttribute && control.getAttribute("aria-checked");
    if (ariaChecked === "true") {
        return;
    }

    if (typeof control.click === "function") {
        control.click();
        return;
    }

    ["mousedown", "mouseup", "click"].forEach((eventName) => {
        control.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
    });
}

function applyAnswerHighlights(structuredAnswer, selectedText) {
    clearAnswerHighlights();

    if (!structuredAnswer || (!structuredAnswer.answers.length && !structuredAnswer.answerTexts.length)) {
        return;
    }

    const scopeRoot = findSearchScope(selectedText) || document.body;
    const scopeCandidates = [];
    let currentScope = scopeRoot;

    while (currentScope && currentScope !== document.body) {
        scopeCandidates.push(currentScope);
        currentScope = currentScope.parentElement;
    }

    scopeCandidates.push(document.body);

    const uniqueScopes = Array.from(new Set(scopeCandidates.filter(Boolean)));
    const searchPlans = [];

    uniqueScopes.forEach((scope, index) => {
        searchPlans.push({ scope, nearbyOnly: index === 0 });
        searchPlans.push({ scope, nearbyOnly: false });
    });

    let scoredCandidates = [];

    for (const plan of searchPlans) {
        const candidates = collectTextCandidates(plan.scope, selectedText, { nearbyOnly: plan.nearbyOnly });
        scoredCandidates = candidates
            .map((candidate) => ({
                candidate,
                score: getCandidateMatchScore(candidate, structuredAnswer),
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scoredCandidates.length > 0) {
            break;
        }
    }

    if (scoredCandidates.length === 0) {
        return;
    }

    const highestScore = scoredCandidates[0].score;
    const uniqueTargets = Array.from(
        new Set(
            scoredCandidates
                .filter((item) => item.score === highestScore)
                .map((item) => getHighlightTarget(item.candidate.element))
                .filter(Boolean)
        )
    );

    uniqueTargets.slice(0, 3).forEach((element) => {
        addAnswerHighlightOverlay(element);
    });
}

function clearAnswerHighlights() {
    activeHighlights.forEach((element) => {
        if (element) {
            element.classList.remove(HIGHLIGHT_CLASS_NAME);
        }
    });
    activeHighlights = [];
}

function addAnswerHighlightOverlay(element) {
    if (!element || !answerHighlightEnabled) {
        return;
    }
    const target = findNearestHighlightTarget(element);
    target.classList.add(HIGHLIGHT_CLASS_NAME);
    activeHighlights.push(target);
}

function findNearestHighlightTarget(element) {
    const tag = element.tagName.toLowerCase();
    // 本身就是 label/span，直接用
    if (tag === "label" || tag === "span") {
        return element;
    }
    // 如果是 div/li/p 等，找内部最直接的 label 或 span
    const label = element.querySelector("label");
    if (label && label.innerText.trim().length > 0) {
        return label;
    }
    const spans = element.querySelectorAll("span");
    if (spans.length > 0) {
        let best = null;
        let bestLen = 0;
        spans.forEach(s => {
            const len = (s.innerText || "").trim().length;
            if (len > bestLen) {
                best = s;
                bestLen = len;
            }
        });
        if (best && bestLen > 1) {
            return best;
        }
    }
    return element;
}

function findSearchScope(selectedText) {
    if (selectedScopeElement && document.contains(selectedScopeElement)) {
        return selectedScopeElement;
    }

    if (selectedRangeRect) {
        const centerX = selectedRangeRect.left + selectedRangeRect.width / 2;
        const centerY = selectedRangeRect.top + selectedRangeRect.height / 2;
        const elementAtPoint = document.elementFromPoint(centerX, centerY);
        if (elementAtPoint) {
            return elementAtPoint.closest("article, section, form, table, ul, ol, li, div") || elementAtPoint.parentElement || document.body;
        }
    }

    return document.body;
}

function getSelectionScopeElement() {
    const selection = window.getSelection();
    const anchorNode = selection && selection.anchorNode ? selection.anchorNode : null;
    const anchorElement = anchorNode ? (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement) : null;
    if (!anchorElement) {
        return null;
    }

    return findLogicalQuestionContainer(anchorElement);
}

function collectTextCandidates(scopeRoot, selectedText, options = {}) {
    const nearbyOnly = options.nearbyOnly !== false;
    const normalizedSelectedText = normalizeText(selectedText);
    const structuredOptionNodes = findStructuredOptionNodes(scopeRoot);
    const elements = structuredOptionNodes.length > 0
        ? structuredOptionNodes
        : Array.from(scopeRoot.querySelectorAll("label, span, div, li, p, td, th, button"));
    return elements
        .map((element) => ({
            element,
            text: (element.innerText || "").trim(),
            normalizedText: normalizeText(element.innerText || ""),
            rect: getElementViewportRect(element),
        }))
        .filter((item) => item.text.length > 0 && item.text.length < 200)
        .filter((item) => isCandidateElement(item.element, item.normalizedText, normalizedSelectedText))
        .filter((item) => !nearbyOnly || isCandidateNearSelection(item.rect));
}

function isCandidateElement(element, normalizedText, normalizedSelectedText) {
    if (!element || !normalizedText) {
        return false;
    }

    if (normalizedSelectedText && normalizedText.includes(normalizedSelectedText)) {
        return false;
    }

    if (element.children.length > 3) {
        return false;
    }

    const childTextLength = Array.from(element.children).reduce((sum, child) => {
        return sum + normalizeText(child.innerText || "").length;
    }, 0);

    if (childTextLength > 0 && childTextLength >= normalizedText.length * 0.8) {
        return false;
    }

    if (countOptionMarkers(element.innerText || "") > 1) {
        return false;
    }

    return true;
}

function getCandidateMatchScore(candidate, structuredAnswer) {
    if (!candidate || !candidate.text || !candidate.normalizedText) {
        return 0;
    }

    let score = 0;

    if (isStructuredOptionNode(candidate.element)) {
        score += getStructuredOptionMatchScore(candidate, structuredAnswer);
    }

    structuredAnswer.answers.forEach((answer) => {
        if (isOptionAnswerMatch(candidate.text, answer)) {
            score += 4;
        }
    });

    structuredAnswer.answerTexts.forEach((text) => {
        const normalizedTextValue = normalizeText(text);
        if (!normalizedTextValue) {
            return;
        }

        if (candidate.normalizedText === normalizedTextValue) {
            score += 5;
            return;
        }

        if (candidate.normalizedText.includes(normalizedTextValue)) {
            score += 3;
        }
    });

    if (structuredAnswer.summary) {
        const normalizedSummary = normalizeText(structuredAnswer.summary);
        if (normalizedSummary && candidate.normalizedText.includes(normalizedSummary)) {
            score += 1;
        }
    }

    return score;
}

function getStructuredOptionMatchScore(candidate, structuredAnswer) {
    const text = String(candidate.text || "").trim();
    const rowOptionMatch = text.match(/^([A-Ha-h])\s*[、.．:：)\]]?/);
    let score = 0;

    if (rowOptionMatch) {
        const rowOption = rowOptionMatch[1].toUpperCase();
        if (structuredAnswer.answers.some((answer) => String(answer || "").trim().toUpperCase() === rowOption)) {
            score += 8;
        }
    }

    structuredAnswer.answerTexts.forEach((answerText) => {
        const normalizedAnswerText = normalizeText(answerText);
        if (normalizedAnswerText && candidate.normalizedText.includes(normalizedAnswerText)) {
            score += 6;
        }
    });

    return score;
}

function isOptionAnswerMatch(text, answer) {
    const normalizedAnswer = String(answer || "").trim().toUpperCase();
    if (!normalizedAnswer) {
        return false;
    }

    if (["正确", "错误", "对", "错"].includes(normalizedAnswer)) {
        return normalizeText(text).startsWith(normalizeText(normalizedAnswer));
    }

    if (!/^[A-H]$/.test(normalizedAnswer)) {
        return false;
    }

    const optionPrefixPattern = new RegExp(`^(?:[（(\\[]?${normalizedAnswer}[）)\\].、．:：\\s]|${normalizedAnswer}$)`, "i");
    return optionPrefixPattern.test(String(text || "").trim());
}

function getHighlightTarget(element) {
    if (!element) {
        return element;
    }

    const structuredOptionNode = findNearestStructuredOptionNode(element);
    if (structuredOptionNode) {
        return structuredOptionNode;
    }

    let current = element;
    let bestMatch = element;

    while (current && current !== selectedScopeElement && current !== document.body) {
        const text = (current.innerText || "").trim();
        if (isOptionLikeText(text)) {
            bestMatch = current;
        }
        current = current.parentElement;
    }

    return bestMatch;
}

function isOptionLikeText(text) {
    const normalized = String(text || "").trim();
    if (!normalized || normalized.length > 160) {
        return false;
    }

    if (countOptionMarkers(normalized) > 1) {
        return false;
    }

    return /^(?:[A-Ha-h][、.．:：)\]\s]|[（(]?[A-Ha-h][）)]\s?|正确|错误|对|错)/.test(normalized);
}

function normalizeText(text) {
    return String(text || "")
        .replace(/\s+/g, "")
        .replace(/[.。．、,:：;；()（）【】\[\]-]/g, "")
        .toLowerCase();
}

function countOptionMarkers(text) {
    const matches = String(text || "").match(/(?:^|\n|\r)\s*(?:[A-Ha-h][、.．:：)\]]|[（(][A-Ha-h][）)]|正确|错误|对|错)/g);
    return matches ? matches.length : 0;
}

function findLogicalQuestionContainer(element) {
    let current = element;
    let bestMatch = element.parentElement || element;

    while (current && current !== document.body) {
        if (isQuestionLikeContainer(current)) {
            bestMatch = current;
        }
        current = current.parentElement;
    }

    return bestMatch || document.body;
}

function isQuestionLikeContainer(element) {
    if (!element) {
        return false;
    }

    const text = (element.innerText || "").trim();
    if (!text || text.length > 1500) {
        return false;
    }

    const optionChildren = findDirectOptionLikeChildren(element);
    if (optionChildren.length < 2) {
        return false;
    }

    return true;
}

function findStructuredOptionNodes(scopeRoot) {
    if (!scopeRoot) {
        return [];
    }

    const allElements = Array.from(scopeRoot.querySelectorAll("div, li, label, p, td, th, button, span"));
    return allElements.filter((element) => isStructuredOptionNode(element));
}

function isStructuredOptionNode(element) {
    if (!element) {
        return false;
    }

    const text = (element.innerText || "").trim();
    if (!isOptionLikeText(text)) {
        return false;
    }

    const parent = element.parentElement;
    if (!parent) {
        return false;
    }

    const siblings = Array.from(parent.children).filter((child) => child !== element);
    const optionLikeSiblingCount = siblings.filter((child) => isOptionLikeText(child.innerText || "")).length;
    return optionLikeSiblingCount >= 1;
}

function findNearestStructuredOptionNode(element) {
    let current = element;
    while (current && current !== document.body) {
        if (isStructuredOptionNode(current)) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}

function findDirectOptionLikeChildren(element) {
    if (!element) {
        return [];
    }

    return Array.from(element.children).filter((child) => isOptionLikeText(child.innerText || ""));
}

function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
        return null;
    }

    return rect;
}

function getElementViewportRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
        return null;
    }

    const rect = element.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
        return null;
    }

    return rect;
}

function isCandidateNearSelection(rect) {
    if (!rect || !selectedRangeRect) {
        return true;
    }

    const selectionCenterX = selectedRangeRect.left + selectedRangeRect.width / 2;
    const selectionCenterY = selectedRangeRect.top + selectedRangeRect.height / 2;
    const candidateCenterX = rect.left + rect.width / 2;
    const candidateCenterY = rect.top + rect.height / 2;

    const horizontalDistance = Math.abs(candidateCenterX - selectionCenterX);
    const verticalDistance = Math.abs(candidateCenterY - selectionCenterY);
    const maxHorizontalDistance = Math.max(window.innerWidth * 0.5, 420);
    const maxVerticalDistance = Math.max(window.innerHeight * 0.65, 520);

    return horizontalDistance <= maxHorizontalDistance && verticalDistance <= maxVerticalDistance;
}

function ensureHighlightStyle() {
    if (document.getElementById("aitalk-highlight-style")) {
        return;
    }

    const style = document.createElement("style");
    style.id = "aitalk-highlight-style";
    style.textContent = `
        .${HIGHLIGHT_CLASS_NAME} {
            border: var(--aitalk-highlight-width, 1px) solid rgba(var(--aitalk-highlight-rgb, 220, 220, 220), var(--aitalk-highlight-opacity, 0.5)) !important;
            border-radius: 3px !important;
            box-sizing: border-box !important;
            background: rgba(255, 255, 255, calc(var(--aitalk-highlight-opacity, 0.5) * 0.06)) !important;
            box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.85) !important;
        }
    `;
    document.head.appendChild(style);
}

ensureHighlightStyle();

function setHighlightOpacity(opacity) {
    const normalizedOpacity = Math.max(0, Math.min(100, Number(opacity) || 0)) / 100;
    document.documentElement.style.setProperty("--aitalk-highlight-opacity", String(normalizedOpacity));
}

function setHighlightAppearance(color, width) {
    document.documentElement.style.setProperty("--aitalk-highlight-rgb", hexToRgbValue(color).join(", "));
    document.documentElement.style.setProperty("--aitalk-highlight-width", `${width}px`);
}

function normalizeHighlightColorValue(color) {
    const normalized = String(color || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "#dcdcdc";
}

function normalizeHighlightWidthValue(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth)) {
        return 1;
    }

    return Math.max(0.5, Math.min(6, numericWidth));
}

function hexToRgbValue(hex) {
    const normalized = normalizeHighlightColorValue(hex).slice(1);
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ];
}

async function copyText(text) {
    if (!text) {
        return;
    }

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (error) {
            console.warn("Clipboard API 写入失败，尝试降级复制:", error);
        }
    }

    fallbackCopyText(text);
}

function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (selection) {
        selection.removeAllRanges();
        if (originalRange) {
            selection.addRange(originalRange);
        }
    }

    if (!copied) {
        throw new Error("当前页面不支持自动复制，请手动复制。");
    }
}
