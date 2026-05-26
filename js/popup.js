// 生成一个随机的nonce值
const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

/**
 * 初始化Popup页面功能
 */
function initPopup() {
    // 初始化事件监听
    setupEventListeners();
    
    // 加载初始数据
    loadInitialData();
}

/**
 * 设置所有事件监听器
 */
function setupEventListeners() {
    // 复制到剪贴板设置变更事件
    const copyClipboardCheckbox = document.getElementById('copyClipboard');
    if (copyClipboardCheckbox) {
        copyClipboardCheckbox.addEventListener('change', handleCopyClipboardChange);
    }

    // 透明度滑块变更事件
    const opacitySlider = document.getElementById('opacitySlider');
    if (opacitySlider) {
        opacitySlider.addEventListener('input', handleOpacityChange);
    }

    // 设置按钮点击事件
    const settingsButton = document.getElementById('settingsButton');
    if (settingsButton) {
        settingsButton.addEventListener('click', openOptionsPage);
    }

    // 监听配置变化，实时更新列表
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChanges);
    } else {
        // 在非Chrome插件环境中，可以添加一些模拟数据或提示
        console.log('This is not a Chrome extension environment, some features may not work.');
    }
}

/**
 * 加载初始数据（设置和配置列表）
 */
function loadInitialData() {
    loadAppVersion();
    loadOpacitySetting();
    loadCopyClipboardSetting();
    loadAnswerFeatureSettings();
    loadHighlightStyleSettings();
    loadConfigs();
}

function loadAppVersion() {
    const versionElement = document.getElementById('appVersion');
    if (!versionElement) {
        return;
    }

    const version = typeof chrome !== 'undefined' &&
        chrome.runtime &&
        typeof chrome.runtime.getManifest === 'function'
        ? chrome.runtime.getManifest().version
        : '--';

    versionElement.textContent = `版本 ${version}`;
}

/**
 * 处理复制到剪贴板设置变更
 */
function handleCopyClipboardChange() {
    const copyClipboard = this.checked;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'copyClipboard': copyClipboard }, function() {
            console.log('拷贝结果到剪贴板设置已保存:', copyClipboard);
            refreshStatusPanel();
        });
    } else {
        console.log('模拟保存拷贝到剪贴板设置:', copyClipboard);
        refreshStatusPanel();
    }
}

/**
 * 处理透明度设置变更
 */
function handleOpacityChange() {
    const opacity = this.value;
    document.getElementById('opacityValue').textContent = `${opacity}%`;
    updateHighlightPreview();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'mousepadOpacity': opacity }, function() {
            console.log('鼠标垫层透明度设置已保存:', opacity);
        });
    } else {
        console.log('模拟保存透明度设置:', opacity);
    }
}

/**
 * 打开选项页面
 */
function openOptionsPage() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        console.log('这不是Chrome扩展环境，无法打开选项页面。');
    }
}

/**
 * 处理存储变化
 * @param {Object} changes - 变更的存储项
 * @param {string} namespace - 命名空间
 */
function handleStorageChanges(changes, namespace) {
    if (changes.configs || changes.selectedConfigs) {
        loadConfigs();
    }
    
    if (changes.mousepadOpacity) {
        loadOpacitySetting();
    }
    
    if (changes.copyClipboard) {
        loadCopyClipboardSetting();
    }

    if (changes.enableAnswerHighlight || changes.enableAutoSelect || changes.enableTTS || changes.enableMouseFollow) {
        loadAnswerFeatureSettings();
        refreshStatusPanel();
    }

    if (changes.answerHighlightColor || changes.answerHighlightWidth) {
        loadHighlightStyleSettings();
    }
}

/**
 * 加载透明度设置
 */
function loadOpacitySetting() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['mousepadOpacity'], function(result) {
            const opacity = result.mousepadOpacity || 50;
            const opacitySlider = document.getElementById('opacitySlider');
            const opacityValue = document.getElementById('opacityValue');
            
            if (opacitySlider && opacityValue) {
                opacitySlider.value = opacity;
                opacityValue.textContent = `${opacity}%`;
            }
        });
    } else {
        // 在非Chrome扩展环境中使用默认值
        const opacity = 50;
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');
        
        if (opacitySlider && opacityValue) {
            opacitySlider.value = opacity;
            opacityValue.textContent = `${opacity}%`;
        }
    }
}

/**
 * 加载复制到剪贴板设置
 */
function loadCopyClipboardSetting() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['copyClipboard'], function(result) {
            const copyClipboardCheckbox = document.getElementById('copyClipboard');
            if (copyClipboardCheckbox) {
                copyClipboardCheckbox.checked = result.copyClipboard || false;
            }
            refreshStatusPanel();
        });
    } else {
        // 在非Chrome扩展环境中使用默认值
        const copyClipboardCheckbox = document.getElementById('copyClipboard');
        if (copyClipboardCheckbox) {
            copyClipboardCheckbox.checked = false;
        }
        refreshStatusPanel();
    }
}

function loadAnswerFeatureSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['enableAnswerHighlight', 'enableAutoSelect', 'enableTTS', 'enableMouseFollow'], function(result) {
            const enableAnswerHighlight = document.getElementById('enableAnswerHighlight');
            const enableAutoSelect = document.getElementById('enableAutoSelect');
            const enableTTS = document.getElementById('enableTTS');
            const enableMouseFollow = document.getElementById('enableMouseFollow');

            if (enableAnswerHighlight) {
                enableAnswerHighlight.checked = result.enableAnswerHighlight !== false;
            }

            if (enableAutoSelect) {
                enableAutoSelect.checked = result.enableAutoSelect !== false;
            }

            if (enableTTS) {
                enableTTS.checked = result.enableTTS || false;
            }

            if (enableMouseFollow) {
                enableMouseFollow.checked = result.enableMouseFollow !== false;
            }
            refreshStatusPanel();
        });
        return;
    }

    const enableAnswerHighlight = document.getElementById('enableAnswerHighlight');
    const enableAutoSelect = document.getElementById('enableAutoSelect');
    const enableTTS = document.getElementById('enableTTS');
    const enableMouseFollow = document.getElementById('enableMouseFollow');

    if (enableAnswerHighlight) {
        enableAnswerHighlight.checked = true;
    }

    if (enableAutoSelect) {
        enableAutoSelect.checked = true;
    }

    if (enableTTS) {
        enableTTS.checked = false;
    }

    if (enableMouseFollow) {
        enableMouseFollow.checked = true;
    }
    refreshStatusPanel();
}

function loadHighlightStyleSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['answerHighlightColor', 'answerHighlightWidth'], function(result) {
            const colorInput = document.getElementById('highlightBorderColor');
            const widthInput = document.getElementById('highlightBorderWidth');

            if (colorInput) {
                colorInput.value = normalizeHighlightColor(result.answerHighlightColor);
            }

            if (widthInput) {
                widthInput.value = normalizeHighlightWidth(result.answerHighlightWidth);
            }

            updateHighlightPreview();
        });
        return;
    }

    const colorInput = document.getElementById('highlightBorderColor');
    const widthInput = document.getElementById('highlightBorderWidth');

    if (colorInput) {
        colorInput.value = '#dcdcdc';
    }

    if (widthInput) {
        widthInput.value = '1';
    }

    updateHighlightPreview();
}

function normalizeHighlightColor(color) {
    return /^#[0-9a-fA-F]{6}$/.test(String(color || '').trim()) ? String(color).trim() : '#dcdcdc';
}

function normalizeHighlightWidth(width) {
    const numericWidth = Number(width);
    if (!Number.isFinite(numericWidth)) {
        return '1';
    }

    return String(Math.max(0.5, Math.min(6, numericWidth)));
}

function updateHighlightPreview() {
    const previewBox = document.getElementById('highlightPreviewBox');
    const colorInput = document.getElementById('highlightBorderColor');
    const widthInput = document.getElementById('highlightBorderWidth');
    const opacitySlider = document.getElementById('opacitySlider');

    if (!previewBox || !colorInput || !widthInput || !opacitySlider) {
        return;
    }

    const color = normalizeHighlightColor(colorInput.value);
    const width = normalizeHighlightWidth(widthInput.value);
    const opacity = Math.max(0, Math.min(100, Number(opacitySlider.value) || 0)) / 100;
    const rgbaColor = hexToRgba(color, opacity);

    previewBox.style.border = `${width}px solid ${rgbaColor}`;
    previewBox.style.boxShadow = `inset 0 0 0 0.5px rgba(255,255,255,${Math.max(opacity, 0.2)})`;
}

function hexToRgba(hex, alpha) {
    const normalized = normalizeHighlightColor(hex).slice(1);
    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * 加载模型配置列表
 */
function loadConfigs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['configs', 'selectedConfigs'], function(result) {
            const configs = result.configs || [];
            const selectedConfigs = result.selectedConfigs || [];
            
            // 过滤无效的选中配置
            const filteredSelectedConfigs = selectedConfigs.filter(selectedConfigName =>
                configs.some(config => config.name === selectedConfigName)
            );
            
            // 如果有无效配置被移除，保存更新后的列表
            if (filteredSelectedConfigs.length !== selectedConfigs.length) {
                chrome.storage.local.set({ 'selectedConfigs': filteredSelectedConfigs }, function() {
                    console.log('已移除无效的selectedConfigs项');
                });
            }

            renderConfigsList(configs, filteredSelectedConfigs);
            refreshStatusPanel(configs, filteredSelectedConfigs);
        });
    } else {
        // 在非Chrome扩展环境中使用模拟数据
        const mockConfigs = [
            { name: '模型1' },
            { name: '模型2' },
            { name: '模型3' }
        ];
        const mockSelectedConfigs = ['模型1'];
        renderConfigsList(mockConfigs, mockSelectedConfigs);
        refreshStatusPanel(mockConfigs, mockSelectedConfigs);
    }
}

/**
 * 渲染配置列表
 * @param {Array} configs - 配置列表
 * @param {Array} selectedConfigs - 已选中的配置列表
 */
function renderConfigsList(configs, selectedConfigs) {
    const configList = document.getElementById('configList');
    const modelsCount = document.getElementById('modelsCount');
    if (!configList) return;
    
    configList.innerHTML = '';
    if (modelsCount) {
        modelsCount.textContent = `${selectedConfigs.length} / ${configs.length}`;
    }
    
    // 如果没有配置，显示空状态
    if (configs.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        const emptyTitle = document.createElement('div');
        emptyTitle.className = 'empty-state-title';
        emptyTitle.textContent = '暂无可用模型';

        const emptyDesc = document.createElement('div');
        emptyDesc.className = 'empty-state-desc';
        emptyDesc.textContent = '先添加一个配置，再回来启用。';

        const emptyButton = document.createElement('button');
        emptyButton.type = 'button';
        emptyButton.className = 'empty-state-action';
        emptyButton.textContent = '打开配置管理';
        emptyButton.addEventListener('click', openOptionsPage);

        emptyState.appendChild(emptyTitle);
        emptyState.appendChild(emptyDesc);
        emptyState.appendChild(emptyButton);
        configList.appendChild(emptyState);
        return;
    }
    
    // 渲染配置项
    configs.forEach((config, index) => {
        const configItem = createConfigItem(config, selectedConfigs, index);
        configList.appendChild(configItem);
    });
}

/**
 * 创建单个配置项元素
 * @param {Object} config - 配置对象
 * @param {Array} selectedConfigs - 已选中的配置列表
 * @param {number} index - 索引，用于动画延迟
 * @returns {HTMLElement} 配置项元素
 */
function createConfigItem(config, selectedConfigs, index) {
    const configItem = document.createElement('label');
    configItem.className = 'model-card';
    configItem.title = config.name;
    
    // 设置动画延迟，创造错开的动画效果
    configItem.style.animationDelay = `${index * 50}ms`;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedConfigs.includes(config.name);
    checkbox.dataset.configName = config.name;
    
    // 添加复选框变更事件
    checkbox.addEventListener('change', async function() {
        const allowed = await guardKaoShiBaoSelection(config, this.checked);
        if (!allowed) {
            this.checked = false;
            configItem.classList.remove('is-selected');
            return;
        }

        configItem.classList.toggle('is-selected', this.checked);
        handleConfigSelectionChange(config.name, this.checked, selectedConfigs);
    });

    if (checkbox.checked) {
        configItem.classList.add('is-selected');
    }
    
    const stateIcon = document.createElement('span');
    stateIcon.className = 'model-state';
    stateIcon.setAttribute('aria-hidden', 'true');
    stateIcon.textContent = '✓';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'model-name';
    nameSpan.textContent = config.name;

    const metaSpan = document.createElement('span');
    metaSpan.className = 'model-type';
    metaSpan.textContent = config.type || '模型';
    
    configItem.appendChild(checkbox);
    configItem.appendChild(stateIcon);
    configItem.appendChild(nameSpan);
    configItem.appendChild(metaSpan);
    
    return configItem;
}

async function guardKaoShiBaoSelection(config, isChecked) {
    if (!isChecked || !config || config.type !== 'KaoShiBao') {
        return true;
    }

    if (String(config.key || '').trim()) {
        return true;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return true;
    }

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                {
                    action: 'checkKaoShiBaoAuth',
                    config
                },
                (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    resolve(result || null);
                }
            );
        });

        const payload = tryParseJson(response && response.answer);
        if (payload && payload.ok) {
            return true;
        }
    } catch (error) {
        console.error('检查考试宝登录状态失败:', error);
    }

    alert('未采集到考试宝登录信息。请先在当前 Chrome 配置文件中的任意标签页登录考试宝，然后再勾选启用。');
    return false;
}

function tryParseJson(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

/**
 * 处理配置选择变更
 * @param {string} configName - 配置名称
 * @param {boolean} isChecked - 是否选中
 * @param {Array} selectedConfigs - 已选中的配置列表
 */
function handleConfigSelectionChange(configName, isChecked, selectedConfigs) {
    let updatedSelectedConfigs = Array.from(document.querySelectorAll('#configList input[type="checkbox"]:checked'))
        .map((checkbox) => checkbox.dataset.configName)
        .filter(Boolean);

    if (updatedSelectedConfigs.length === 0 && isChecked) {
        updatedSelectedConfigs = [...selectedConfigs, configName].filter((name, index, list) => list.indexOf(name) === index);
    }
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ 'selectedConfigs': updatedSelectedConfigs }, function() {
            console.log('模型选择已更新:', updatedSelectedConfigs);
            updateModelsCount(updatedSelectedConfigs.length);
            refreshStatusPanel(null, updatedSelectedConfigs);
        });
    } else {
        console.log('模拟更新模型选择:', updatedSelectedConfigs);
        updateModelsCount(updatedSelectedConfigs.length);
        refreshStatusPanel(null, updatedSelectedConfigs);
    }
}

function refreshStatusPanel(configsOverride, selectedOverride) {
    const enabledSummary = document.getElementById('enabledSummary');
    const riskNotice = document.getElementById('riskNotice');
    if (!enabledSummary && !riskNotice) {
        return;
    }

    const render = (configs, selectedConfigs) => {
        const enableAutoSelect = document.getElementById('enableAutoSelect');
        const enableAnswerHighlight = document.getElementById('enableAnswerHighlight');
        const enableTTS = document.getElementById('enableTTS');
        const copyClipboard = document.getElementById('copyClipboard');

        const autoSelectText = enableAutoSelect && enableAutoSelect.checked ? '自动选中开' : '自动选中关';
        const highlightText = enableAnswerHighlight && enableAnswerHighlight.checked ? '答案标记开' : '答案标记关';
        const ttsText = enableTTS && enableTTS.checked ? '朗读开' : '朗读关';
        const copyText = copyClipboard && copyClipboard.checked ? '复制开' : '复制关';

        if (enabledSummary) {
            enabledSummary.textContent = `已启用 ${selectedConfigs.length} 个模型 · ${autoSelectText} · ${highlightText} · ${copyText} · ${ttsText}`;
        }

        if (!riskNotice) {
            return;
        }

        const selectedConfigSet = new Set(selectedConfigs);
        const enabledConfigs = configs.filter((config) => selectedConfigSet.has(config.name));
        const risks = [];
        if (configs.length === 0) {
            risks.push('还没有配置模型，请先打开配置管理添加。');
        } else if (enabledConfigs.length === 0) {
            risks.push('当前没有启用模型，答题时不会发起请求。');
        }

        const kaoShiBaoNeedsLogin = enabledConfigs.some((config) => config.type === 'KaoShiBao' && !String(config.key || '').trim());
        if (kaoShiBaoNeedsLogin) {
            risks.push('考试宝模型需要当前浏览器已登录，否则可能无法查询。');
        }

        if (risks.length > 0) {
            riskNotice.hidden = false;
            riskNotice.textContent = risks.join(' ');
        } else {
            riskNotice.hidden = true;
            riskNotice.textContent = '';
        }
    };

    if (Array.isArray(configsOverride) && Array.isArray(selectedOverride)) {
        render(configsOverride, selectedOverride);
        return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['configs', 'selectedConfigs'], function(result) {
            render(result.configs || [], Array.isArray(selectedOverride) ? selectedOverride : (result.selectedConfigs || []));
        });
        return;
    }

    render([], Array.isArray(selectedOverride) ? selectedOverride : []);
}

function updateModelsCount(selectedCount) {
    const modelsCount = document.getElementById('modelsCount');
    const totalModels = document.querySelectorAll('#configList .model-card').length;
    if (modelsCount) {
        modelsCount.textContent = `${selectedCount} / ${totalModels}`;
    }
}

// 当DOM加载完成后初始化Popup
document.addEventListener('DOMContentLoaded', initPopup);
document.addEventListener('DOMContentLoaded', function() {
    const enableTTS = document.getElementById('enableTTS');
    const enableAnswerHighlight = document.getElementById('enableAnswerHighlight');
    const enableAutoSelect = document.getElementById('enableAutoSelect');
    const highlightBorderColor = document.getElementById('highlightBorderColor');
    const highlightBorderWidth = document.getElementById('highlightBorderWidth');
    const enableMouseFollow = document.getElementById('enableMouseFollow');

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (enableTTS) {
            enableTTS.addEventListener('change', function() {
                chrome.storage.local.set({ 'enableTTS': enableTTS.checked }, function() {
                    refreshStatusPanel();
                });
            });
        }

        if (enableAnswerHighlight) {
            enableAnswerHighlight.addEventListener('change', function() {
                chrome.storage.local.set({ 'enableAnswerHighlight': enableAnswerHighlight.checked }, function() {
                    refreshStatusPanel();
                });
            });
        }

        if (enableAutoSelect) {
            enableAutoSelect.addEventListener('change', function() {
                chrome.storage.local.set({ 'enableAutoSelect': enableAutoSelect.checked }, function() {
                    refreshStatusPanel();
                });
            });
        }

        if (enableMouseFollow) {
            enableMouseFollow.addEventListener('change', function() {
                chrome.storage.local.set({ 'enableMouseFollow': enableMouseFollow.checked }, function() {
                    refreshStatusPanel();
                });
            });
        }

        if (highlightBorderColor) {
            highlightBorderColor.addEventListener('input', function() {
                const value = normalizeHighlightColor(highlightBorderColor.value);
                highlightBorderColor.value = value;
                updateHighlightPreview();
                chrome.storage.local.set({ 'answerHighlightColor': value }, function() {});
            });
        }

        if (highlightBorderWidth) {
            const persistWidth = function() {
                const value = normalizeHighlightWidth(highlightBorderWidth.value);
                highlightBorderWidth.value = value;
                updateHighlightPreview();
                chrome.storage.local.set({ 'answerHighlightWidth': Number(value) }, function() {});
            };

            highlightBorderWidth.addEventListener('input', updateHighlightPreview);
            highlightBorderWidth.addEventListener('change', persistWidth);
        }
    }
});
