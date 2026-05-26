// 首先在全局作用域中提供chrome对象的兼容处理
if (typeof chrome === 'undefined') {
    console.log('在非Chrome扩展环境中运行，使用localStorage替代chrome.storage');
    window.chrome = {
        storage: {
            local: {
                get: function(keys, callback) {
                    try {
                        let result = {};
                        if (typeof keys === 'string') {
                            const value = localStorage.getItem(keys);
                            result[keys] = value ? JSON.parse(value) : undefined;
                        } else if (Array.isArray(keys)) {
                            keys.forEach(key => {
                                const value = localStorage.getItem(key);
                                result[key] = value ? JSON.parse(value) : undefined;
                            });
                        }
                        callback(result);
                    } catch (error) {
                        console.error('localStorage get error:', error);
                        callback({});
                    }
                },
                set: function(items, callback) {
                    try {
                        Object.keys(items).forEach(key => {
                            localStorage.setItem(key, JSON.stringify(items[key]));
                        });
                        if (callback) callback();
                    } catch (error) {
                        console.error('localStorage set error:', error);
                        if (callback) callback();
                    }
                }
            }
        }
    };
    
    // 为了演示，添加一些模拟配置数据
    if (!localStorage.getItem('configs')) {
        const mockConfigs = [
            {
                name: "测试配置1",
                url: "https://api.example.com/v1/chat/completions",
                key: "sk-abcdef1234567890",
                model: "gpt-3.5-turbo",
                other: "{\"temperature\":0.7}",
                type: "OpenaiAPI"
            },
            {
                name: "测试配置2",
                url: "https://api.example2.com/v1/chat/completions",
                key: "sk-xyz9876543210",
                model: "claude-3-opus-20240229",
                other: "",
                type: "ClaudeAPI"
            }
        ];
        localStorage.setItem('configs', JSON.stringify(mockConfigs));
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // 获取DOM元素
    const addButton = document.getElementById('addButton');
    const exportButton = document.getElementById('exportButton');
    const importButton = document.getElementById('importButton');
    const restoreBackupButton = document.getElementById('restoreBackupButton');
    const configList = document.getElementById('configList');
    const emptyState = document.getElementById('emptyState');
    const configCount = document.getElementById('configCount');
    const configSearchInput = document.getElementById('configSearchInput');
    const configTypeFilter = document.getElementById('configTypeFilter');
    const clearConfigFilter = document.getElementById('clearConfigFilter');
    const toggleConfigView = document.getElementById('toggleConfigView');
    const summaryTotalConfigs = document.getElementById('summaryTotalConfigs');
    const summaryEnabledConfigs = document.getElementById('summaryEnabledConfigs');
    const summaryConfigTypes = document.getElementById('summaryConfigTypes');
    const summaryViewMode = document.getElementById('summaryViewMode');
    const importPreviewOverlay = document.getElementById('importPreviewOverlay');
    const importPreviewSummary = document.getElementById('importPreviewSummary');
    const importPreviewList = document.getElementById('importPreviewList');
    const closeImportPreview = document.getElementById('closeImportPreview');
    const cancelImportPreview = document.getElementById('cancelImportPreview');
    const confirmImportPreview = document.getElementById('confirmImportPreview');
    const exportModalOverlay = document.getElementById('exportModalOverlay');
    const closeExportModal = document.getElementById('closeExportModal');
    const cancelExport = document.getElementById('cancelExport');
    const confirmExport = document.getElementById('confirmExport');
    const exportTypeSelect = document.getElementById('exportTypeSelect');
    const exportPasswordFields = document.getElementById('exportPasswordFields');
    const exportPassword = document.getElementById('exportPassword');
    const exportPasswordConfirm = document.getElementById('exportPasswordConfirm');
    const toggleExportPassword = document.getElementById('toggleExportPassword');
    const exportPreviewText = document.getElementById('exportPreviewText');
    const importPasswordOverlay = document.getElementById('importPasswordOverlay');
    const importPassword = document.getElementById('importPassword');
    const closeImportPassword = document.getElementById('closeImportPassword');
    const cancelImportPassword = document.getElementById('cancelImportPassword');
    const confirmImportPassword = document.getElementById('confirmImportPassword');
    const toggleImportPassword = document.getElementById('toggleImportPassword');
    const editModalOverlay = document.getElementById('editModalOverlay');
    const editModal = document.getElementById('editModal');
    const modalTitle = document.getElementById('modalTitle');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveEdit = document.getElementById('saveEdit');
    const cancelEdit = document.getElementById('cancelEdit');
    
    // 表单元素
    const editName = document.getElementById('editName');
    const editUrl = document.getElementById('editUrl');
    const editKey = document.getElementById('editKey');
    const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
    const editModelGroup = document.getElementById('editModelGroup');
    const editModelLabel = document.getElementById('editModelLabel');
    const editModel = document.getElementById('editModel');
    const editOther = document.getElementById('editOther');
    const editOtherLabel = document.getElementById('editOtherLabel');
    const editOtherHelpText = document.getElementById('editOtherHelpText');
    const editType = document.getElementById('editType');
    const editThinkingMode = document.getElementById('editThinkingMode');
    const thinkingOptionGroup = document.getElementById('thinkingOptionGroup');
    const easterEggTrigger = document.getElementById('easterEggTrigger');
    const specialThanksToast = document.getElementById('specialThanksToast');
    const specialThanksModalOverlay = document.getElementById('specialThanksModalOverlay');
    const closeSpecialThanks = document.getElementById('closeSpecialThanks');
    
    let editingIndex = -1;
    let allConfigs = [];
    let selectedConfigNames = [];
    let lastFilteredConfigs = [];
    let compactConfigView = localStorage.getItem('configCompactView') === 'true';
    let draggedConfigIndex = null;
    let pendingImportConfigs = null;
    let pendingImportFileName = '';
    let pendingImportRawContent = '';
    let pendingImportAnalysis = null;
    const supportedConfigTypes = ['OpenaiAPI', 'OpenAIResponses', 'Ollama', 'Aliyun', 'Dify', 'CloudFlare', 'AnythingLLM', 'Ragflow', 'Gemini', 'KaoShiBao'];

    let easterEggClickCount = 0;
    let easterEggClickTimer = null;
    let easterEggCooldownUntil = 0;
    let easterEggHideTimer = null;
    let cleanupStarMap = null;

    if (easterEggTrigger) {
        easterEggTrigger.addEventListener('click', handleEasterEggTrigger);
        easterEggTrigger.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleEasterEggTrigger();
            }
        });
    }

    if (closeSpecialThanks) {
        closeSpecialThanks.addEventListener('click', hideEasterEgg);
    }

    if (specialThanksToast) {
        specialThanksToast.addEventListener('click', openContributorStarMap);
    }

    if (specialThanksModalOverlay) {
        specialThanksModalOverlay.addEventListener('click', function(event) {
            if (event.target === specialThanksModalOverlay) {
                hideEasterEgg();
            }
        });
    }

    if (closeImportPreview) {
        closeImportPreview.addEventListener('click', hideImportPreview);
    }
    if (cancelImportPreview) {
        cancelImportPreview.addEventListener('click', hideImportPreview);
    }
    if (confirmImportPreview) {
        confirmImportPreview.addEventListener('click', confirmImportConfigs);
    }
    if (importPreviewOverlay) {
        importPreviewOverlay.addEventListener('click', function(event) {
            if (event.target === importPreviewOverlay) {
                hideImportPreview();
            }
        });
    }
    if (restoreBackupButton) {
        restoreBackupButton.addEventListener('click', restoreLastImportBackup);
    }
    if (closeExportModal) {
        closeExportModal.addEventListener('click', hideExportModal);
    }
    if (cancelExport) {
        cancelExport.addEventListener('click', hideExportModal);
    }
    if (confirmExport) {
        confirmExport.addEventListener('click', exportConfigsWithOptions);
    }
    if (exportModalOverlay) {
        exportModalOverlay.addEventListener('click', function(event) {
            if (event.target === exportModalOverlay) {
                hideExportModal();
            }
        });
    }
    document.querySelectorAll('input[name="exportScope"], input[name="exportFormat"]').forEach((input) => {
        input.addEventListener('change', updateExportDialogState);
    });
    if (exportTypeSelect) {
        exportTypeSelect.addEventListener('change', updateExportDialogState);
    }
    if (toggleExportPassword) {
        toggleExportPassword.addEventListener('click', function() {
            togglePasswordInput(exportPassword, toggleExportPassword);
            if (exportPasswordConfirm && exportPassword) {
                exportPasswordConfirm.type = exportPassword.type;
            }
        });
    }
    if (closeImportPassword) {
        closeImportPassword.addEventListener('click', hideImportPasswordDialog);
    }
    if (cancelImportPassword) {
        cancelImportPassword.addEventListener('click', hideImportPasswordDialog);
    }
    if (confirmImportPassword) {
        confirmImportPassword.addEventListener('click', decryptPendingImportFile);
    }
    if (importPasswordOverlay) {
        importPasswordOverlay.addEventListener('click', function(event) {
            if (event.target === importPasswordOverlay) {
                hideImportPasswordDialog();
            }
        });
    }
    if (toggleImportPassword) {
        toggleImportPassword.addEventListener('click', function() {
            togglePasswordInput(importPassword, toggleImportPassword);
        });
    }
    document.querySelectorAll('input[name="importMode"]').forEach((input) => {
        input.addEventListener('change', refreshImportPreview);
    });

    showInstallThanksToastOnce();

    if (configSearchInput) {
        configSearchInput.addEventListener('input', renderFilteredConfigs);
    }
    if (configTypeFilter) {
        configTypeFilter.addEventListener('change', renderFilteredConfigs);
    }
    if (clearConfigFilter) {
        clearConfigFilter.addEventListener('click', function() {
            if (configSearchInput) {
                configSearchInput.value = '';
            }
            if (configTypeFilter) {
                configTypeFilter.value = '';
            }
            renderFilteredConfigs();
        });
    }
    if (toggleConfigView) {
        toggleConfigView.addEventListener('click', function() {
            compactConfigView = !compactConfigView;
            localStorage.setItem('configCompactView', String(compactConfigView));
            applyConfigViewMode();
        });
    }
    if (toggleKeyVisibility) {
        toggleKeyVisibility.addEventListener('click', function() {
            const visible = editKey.type === 'text';
            editKey.type = visible ? 'password' : 'text';
            toggleKeyVisibility.textContent = visible ? '显示' : '隐藏';
        });
    }
    document.querySelectorAll('.quick-add-config').forEach((button) => {
        button.addEventListener('click', function() {
            openAddConfigModal(this.dataset.type || 'OpenaiAPI');
        });
    });
    applyConfigViewMode();

    function handleEasterEggTrigger() {
        if (editModalOverlay && editModalOverlay.style.display === 'flex') {
            return;
        }

        const now = Date.now();
        if (now < easterEggCooldownUntil) {
            return;
        }

        easterEggClickCount += 1;
        clearTimeout(easterEggClickTimer);
        easterEggClickTimer = setTimeout(function() {
            easterEggClickCount = 0;
        }, 5000);

        if (easterEggClickCount >= 7) {
            easterEggClickCount = 0;
            clearTimeout(easterEggClickTimer);
            easterEggCooldownUntil = now + 15000;
            showEasterEgg();
        }
    }

    function showEasterEgg(displayMs = 30000) {
        if (!specialThanksToast) {
            return;
        }

        hideEasterEgg();
        specialThanksToast.classList.add("is-visible");
        easterEggHideTimer = setTimeout(hideEasterEgg, displayMs);
    }

    function showInstallThanksToastOnce() {
        if (!specialThanksToast || !chrome || !chrome.storage || !chrome.storage.local) {
            return;
        }

        chrome.storage.local.get(['hasShownInstallThanksToast'], function(result) {
            if (result.hasShownInstallThanksToast) {
                return;
            }

            chrome.storage.local.set({ hasShownInstallThanksToast: true }, function() {
                setTimeout(function() {
                    showEasterEgg();
                }, 700);
            });
        });
    }

    function applyConfigViewMode() {
        const configSection = document.querySelector('.config-section');
        if (configSection) {
            configSection.classList.toggle('is-compact', compactConfigView);
        }
        if (toggleConfigView) {
            toggleConfigView.textContent = compactConfigView ? '详细模式' : '紧凑模式';
        }
        if (summaryViewMode) {
            summaryViewMode.textContent = compactConfigView ? '紧凑模式' : '详细模式';
        }
    }

    function openContributorStarMap() {
        if (specialThanksToast) {
            specialThanksToast.classList.remove("is-visible");
        }

        if (!specialThanksModalOverlay) {
            return;
        }

        clearTimeout(easterEggHideTimer);
        specialThanksModalOverlay.classList.add("is-visible");
        specialThanksModalOverlay.setAttribute("aria-hidden", "false");
        if (cleanupStarMap) {
            cleanupStarMap();
        }
        cleanupStarMap = initStarMap(document.getElementById("star-map-canvas"));
        easterEggHideTimer = setTimeout(hideEasterEgg, 12000);
    }

    function hideEasterEgg() {
        if (specialThanksToast) {
            specialThanksToast.classList.remove("is-visible");
        }

        if (specialThanksModalOverlay) {
            specialThanksModalOverlay.classList.remove("is-visible");
            specialThanksModalOverlay.setAttribute("aria-hidden", "true");
        }

        if (cleanupStarMap) {
            cleanupStarMap();
            cleanupStarMap = null;
        }

        clearTimeout(easterEggHideTimer);
        easterEggHideTimer = null;
    }

    function initStarMap(canvas) {
        if (!canvas) {
            return function() {};
        }

        const ctx = canvas.getContext('2d');
        const stars = [];
        let animationId;

        function resizeCanvas() {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        function createStars() {
            stars.length = 0;
            const count = Math.max(46, Math.floor((canvas.width * canvas.height) / 5200));
            for (let i = 0; i < count; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 1.7 + 0.4,
                    speed: Math.random() * 0.16 + 0.04,
                    phase: Math.random() * Math.PI * 2,
                    opacity: Math.random() * 0.45 + 0.35
                });
            }
        }

        function handleResize() {
            resizeCanvas();
            createStars();
        }

        function drawStar(star, time) {
            const pulse = (Math.sin(time * star.speed + star.phase) + 1) / 2;
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity + pulse * 0.35})`;
            ctx.arc(star.x, star.y, star.radius + pulse * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawConstellations(time) {
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.18)';
            ctx.lineWidth = 1;
            for (let i = 0; i < stars.length - 1; i += 7) {
                const first = stars[i];
                const second = stars[i + 1];
                if (!first || !second) {
                    continue;
                }
                ctx.beginPath();
                ctx.moveTo(first.x, first.y);
                ctx.lineTo(second.x + Math.sin(time * 0.001 + i) * 8, second.y);
                ctx.stroke();
            }
        }

        function animate(time) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawConstellations(time);
            stars.forEach((star) => drawStar(star, time * 0.001));
            animationId = requestAnimationFrame(animate);
        }

        handleResize();
        window.addEventListener('resize', handleResize);
        animationId = requestAnimationFrame(animate);

        return function () {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }

    // 导出配置
    exportButton.addEventListener('click', showExportModal);

    // 导入配置
    importButton.addEventListener('click', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function (event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const content = e.target.result;
                    pendingImportRawContent = content;
                    pendingImportFileName = file.name;

                    try {
                        const configs = JSON.parse(content);
                        showImportPreview(configs, file.name, '明文 JSON');
                    } catch (error) {
                        showImportPasswordDialog(file.name);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    });

    function showExportModal() {
        populateExportTypeOptions();
        if (exportPassword) {
            exportPassword.value = '';
            exportPassword.type = 'password';
        }
        if (exportPasswordConfirm) {
            exportPasswordConfirm.value = '';
            exportPasswordConfirm.type = 'password';
        }
        if (toggleExportPassword) {
            toggleExportPassword.textContent = '显示';
        }
        updateExportDialogState();
        if (exportModalOverlay) {
            exportModalOverlay.style.display = 'flex';
        }
    }

    function hideExportModal() {
        if (exportModalOverlay) {
            exportModalOverlay.style.display = 'none';
        }
    }

    function populateExportTypeOptions() {
        if (!exportTypeSelect) {
            return;
        }

        const currentValue = exportTypeSelect.value;
        const types = Array.from(new Set(allConfigs.map((config) => config.type).filter(Boolean))).sort();
        exportTypeSelect.innerHTML = '<option value="">请选择类型</option>';
        types.forEach((type) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            exportTypeSelect.appendChild(option);
        });
        exportTypeSelect.value = types.includes(currentValue) ? currentValue : '';
    }

    function updateExportDialogState() {
        const scope = getCheckedValue('exportScope', 'all');
        const format = getCheckedValue('exportFormat', 'encrypted');
        if (exportTypeSelect) {
            exportTypeSelect.disabled = scope !== 'type';
        }
        if (exportPasswordFields) {
            exportPasswordFields.style.display = format === 'encrypted' ? 'grid' : 'none';
        }
        if (exportPreviewText) {
            const configs = getConfigsForExport();
            exportPreviewText.textContent = `将导出 ${configs.length} 个配置，格式：${format === 'encrypted' ? '加密 JSON' : '明文 JSON'}。`;
            exportPreviewText.classList.toggle('is-danger', configs.length === 0);
            exportPreviewText.classList.toggle('is-info', configs.length > 0);
        }
    }

    function getConfigsForExport() {
        const scope = getCheckedValue('exportScope', 'all');
        if (scope === 'enabled') {
            return allConfigs.filter((config) => selectedConfigNames.includes(config.name));
        }
        if (scope === 'filtered') {
            return lastFilteredConfigs.map((item) => item.config);
        }
        if (scope === 'type') {
            const type = exportTypeSelect ? exportTypeSelect.value : '';
            return type ? allConfigs.filter((config) => config.type === type) : [];
        }
        return [...allConfigs];
    }

    function exportConfigsWithOptions() {
        const configs = getConfigsForExport();
        if (configs.length === 0) {
            alert('没有可导出的配置。');
            return;
        }

        const format = getCheckedValue('exportFormat', 'encrypted');
        let content = JSON.stringify(configs, null, 2);
        if (format === 'encrypted') {
            const password = exportPassword ? exportPassword.value : '';
            const passwordConfirm = exportPasswordConfirm ? exportPasswordConfirm.value : '';
            if (!password) {
                alert('请输入加密密码。');
                return;
            }
            if (password !== passwordConfirm) {
                alert('两次输入的密码不一致。');
                return;
            }
            const sm4 = new SM4Util();
            sm4.secretKey = md5(password).slice(0, 16);
            content = sm4.encryptData_ECB(content);
        }

        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = createExportFileName(format);
        a.click();
        URL.revokeObjectURL(url);
        hideExportModal();
        showNotification(`已导出 ${configs.length} 个配置！`);
    }

    function createExportFileName(format) {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        const timestamp = [
            now.getFullYear(),
            pad(now.getMonth() + 1),
            pad(now.getDate())
        ].join('-') + '-' + [pad(now.getHours()), pad(now.getMinutes())].join('');
        const suffix = format === 'encrypted' ? 'encrypted' : 'plain';
        return `aitalk-configs-${timestamp}-${suffix}.json`;
    }

    function showImportPasswordDialog(fileName) {
        pendingImportFileName = fileName || pendingImportFileName;
        if (!importPasswordOverlay || !importPassword) {
            alert('导入失败：文件不是明文 JSON，且无法打开解密窗口。');
            return;
        }
        importPassword.value = '';
        importPassword.type = 'password';
        if (toggleImportPassword) {
            toggleImportPassword.textContent = '显示';
        }
        importPasswordOverlay.style.display = 'flex';
        importPassword.focus();
    }

    function hideImportPasswordDialog() {
        if (importPasswordOverlay) {
            importPasswordOverlay.style.display = 'none';
        }
        if (importPassword) {
            importPassword.value = '';
        }
    }

    function decryptPendingImportFile() {
        const password = importPassword ? importPassword.value : '';
        if (!password) {
            alert('请输入解密密码。');
            return;
        }

        try {
            const sm4 = new SM4Util();
            sm4.secretKey = md5(password).slice(0, 16);
            const decryptedContent = sm4.decryptData_ECB(pendingImportRawContent);
            const configs = JSON.parse(decryptedContent);
            hideImportPasswordDialog();
            showImportPreview(configs, pendingImportFileName, '加密 JSON');
        } catch (error) {
            alert('导入失败，请确认密码正确且文件没有损坏。');
        }
    }

    function showImportPreview(configs, fileName, formatLabel) {
        if (!Array.isArray(configs)) {
            alert('导入失败，配置文件内容必须是配置数组。');
            return;
        }

        pendingImportConfigs = configs;
        pendingImportFileName = fileName || 'configs.json';
        pendingImportAnalysis = analyzeImportConfigs(configs);

        if (!importPreviewOverlay || !importPreviewSummary || !importPreviewList) {
            confirmImportConfigs();
            return;
        }
        importPreviewOverlay.dataset.format = formatLabel || '未知格式';
        refreshImportPreview();
        importPreviewOverlay.style.display = 'flex';
    }

    function hideImportPreview() {
        if (importPreviewOverlay) {
            importPreviewOverlay.style.display = 'none';
        }
        pendingImportConfigs = null;
        pendingImportFileName = '';
        pendingImportAnalysis = null;
    }

    function confirmImportConfigs() {
        if (!Array.isArray(pendingImportConfigs)) {
            hideImportPreview();
            return;
        }

        const mode = getCheckedValue('importMode', 'replace');
        const analysis = pendingImportAnalysis || analyzeImportConfigs(pendingImportConfigs);
        if (analysis.errorCount > 0) {
            alert('导入文件存在必填错误，请修正后再导入。');
            return;
        }

        chrome.storage.local.get(['configs', 'selectedConfigs'], function(result) {
            const currentConfigs = result.configs || [];
            const currentSelectedConfigs = result.selectedConfigs || [];
            const importedConfigs = buildImportedConfigsByMode(currentConfigs, pendingImportConfigs, mode);
            const importedNames = new Set(importedConfigs.map((config) => config && config.name).filter(Boolean));
            const selectedConfigs = currentSelectedConfigs.filter((name) => importedNames.has(name));
            const backup = {
                createdAt: new Date().toISOString(),
                configs: currentConfigs,
                selectedConfigs: currentSelectedConfigs
            };
            chrome.storage.local.set({
                'lastImportBackup': backup,
                'configs': importedConfigs,
                'selectedConfigs': selectedConfigs
            }, function () {
                hideImportPreview();
                loadConfigs();
                showNotification(`已导入 ${importedConfigs.length} 个配置！`);
            });
        });
    }

    function refreshImportPreview() {
        if (!pendingImportConfigs || !importPreviewSummary || !importPreviewList) {
            return;
        }

        const mode = getCheckedValue('importMode', 'replace');
        const analysis = pendingImportAnalysis || analyzeImportConfigs(pendingImportConfigs);
        const formatLabel = importPreviewOverlay ? importPreviewOverlay.dataset.format : '未知格式';
        const typeSummary = Object.keys(analysis.typeCounts).length > 0
            ? Object.keys(analysis.typeCounts).map((type) => `${type} ${analysis.typeCounts[type]}`).join(' / ')
            : '-';
        const projectedConfigs = buildImportedConfigsByMode(allConfigs, pendingImportConfigs, mode);
        const projectedNames = new Set(projectedConfigs.map((config) => config && config.name).filter(Boolean));
        const keptEnabled = selectedConfigNames.filter((name) => projectedNames.has(name)).length;
        const lostEnabled = selectedConfigNames.length - keptEnabled;
        const modeText = mode === 'append' ? '追加导入' : mode === 'merge' ? '智能合并' : '覆盖全部';

        importPreviewSummary.innerHTML = `
            <div class="import-preview-stat">
                <span>文件</span>
                <strong title="${escapeHtml(pendingImportFileName)}">${escapeHtml(pendingImportFileName)}</strong>
            </div>
            <div class="import-preview-stat">
                <span>格式</span>
                <strong>${escapeHtml(formatLabel || '未知')}</strong>
            </div>
            <div class="import-preview-stat">
                <span>导入数量</span>
                <strong>${pendingImportConfigs.length}</strong>
            </div>
            <div class="import-preview-stat">
                <span>新增 / 冲突</span>
                <strong>${analysis.newCount} / ${analysis.conflictCount}</strong>
            </div>
            <div class="import-preview-stat">
                <span>启用保留 / 失效</span>
                <strong>${keptEnabled} / ${lostEnabled}</strong>
            </div>
            <div class="import-preview-stat">
                <span>类型分布</span>
                <strong title="${escapeHtml(typeSummary)}">${escapeHtml(typeSummary)}</strong>
            </div>
            <div class="import-preview-warning ${analysis.errorCount > 0 ? 'is-danger' : 'is-info'}">${escapeHtml(modeText)}后预计得到 ${projectedConfigs.length} 个配置。${analysis.errorCount > 0 ? ` 有 ${analysis.errorCount} 个错误需要处理。` : ''} 覆盖或合并前会自动保存当前配置备份。</div>
        `;

        importPreviewList.innerHTML = '';
        analysis.items.slice(0, 30).forEach((item) => {
            const config = item.config || {};
            const element = document.createElement('div');
            element.className = `import-preview-item ${item.errors.length ? 'has-error' : item.warnings.length ? 'has-risk' : ''}`;
            const name = config.name || '未命名配置';
            const type = config.type || '未知';
            const model = config.model || '-';
            const key = config.key ? maskKey(config.key) : '无 Key';
            const badges = [
                item.isConflict ? '<span class="import-preview-badge is-warning">同名冲突</span>' : '<span class="import-preview-badge">新增</span>',
                ...item.errors.map((message) => `<span class="import-preview-badge is-error">${escapeHtml(message)}</span>`),
                ...item.warnings.map((message) => `<span class="import-preview-badge is-warning">${escapeHtml(message)}</span>`)
            ].join('');
            element.innerHTML = `
                <div class="import-preview-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                <div class="import-preview-type">${escapeHtml(type)}</div>
                <div class="import-preview-model" title="${escapeHtml(model)}">模型：${escapeHtml(model)} · Key：${escapeHtml(key)}</div>
                <div class="import-preview-badges">${badges}</div>
            `;
            importPreviewList.appendChild(element);
        });

        if (analysis.items.length > 30) {
            const rest = document.createElement('div');
            rest.className = 'import-preview-warning';
            rest.textContent = `还有 ${analysis.items.length - 30} 个配置未在预览中展开，确认后会按当前模式一并处理。`;
            importPreviewList.appendChild(rest);
        }
    }

    // 加载配置
    function loadConfigs() {
        chrome.storage.local.get(['configs', 'selectedConfigs'], function (result) {
            allConfigs = result.configs || [];
            selectedConfigNames = result.selectedConfigs || [];
            updateTypeFilterOptions();
            renderFilteredConfigs();
        });
    }

    function renderFilteredConfigs() {
        const searchTerm = normalizeFilterText(configSearchInput ? configSearchInput.value : '');
        const selectedType = configTypeFilter ? configTypeFilter.value : '';
        const filteredConfigs = allConfigs
            .map((config, index) => ({ config, index }))
            .filter((item) => {
                if (selectedType && item.config.type !== selectedType) {
                    return false;
                }
                if (!searchTerm) {
                    return true;
                }
                return normalizeFilterText([
                    item.config.name,
                    item.config.type,
                    item.config.url,
                    item.config.model,
                    item.config.other
                ].join(' ')).includes(searchTerm);
            });
        lastFilteredConfigs = filteredConfigs;

        configList.innerHTML = '';
        configCount.textContent = `${filteredConfigs.length} / ${allConfigs.length} 个配置`;
        updateConfigSummary(filteredConfigs.length);

        if (allConfigs.length === 0) {
            emptyState.style.display = 'block';
            emptyState.querySelector('h3').textContent = '暂无配置项';
            emptyState.querySelector('p').textContent = '点击上方的「添加配置」按钮创建您的第一个AI配置';
            configList.style.display = 'none';
            return;
        }

        if (filteredConfigs.length === 0) {
            emptyState.style.display = 'block';
            emptyState.querySelector('h3').textContent = '没有匹配的配置';
            emptyState.querySelector('p').textContent = '换个关键词或清空筛选条件后再试';
            configList.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        configList.style.display = 'grid';

        filteredConfigs.forEach((item, displayIndex) => {
            configList.appendChild(createConfigCard(item.config, item.index, displayIndex));
        });
    }

    function createConfigCard(config, index, displayIndex) {
        const enabled = selectedConfigNames.includes(config.name);
        const card = document.createElement('div');
        card.className = `config-card fade-in ${enabled ? 'is-enabled' : ''}`;
        card.style.animationDelay = `${displayIndex * 0.05}s`;

        card.innerHTML = `
            <div class="config-card-header">
                <div class="config-card-heading">
                    <div class="config-card-title">${escapeHtml(config.name || '未命名配置')}</div>
                    <div class="config-card-meta">
                        <div class="config-card-type">${escapeHtml(config.type || '-')}</div>
                        <div class="config-status ${enabled ? 'config-status-enabled' : 'config-status-disabled'}">${enabled ? '已启用' : '未启用'}</div>
                    </div>
                </div>
                <div class="config-card-actions">
                    <span class="config-drag-handle" draggable="true" data-index="${index}" title="拖动排序" aria-label="拖动排序 ${escapeHtml(config.name || '配置')}">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                    </span>
                    <button class="config-icon-btn config-test-btn" data-index="${index}" title="测试连接" aria-label="测试 ${escapeHtml(config.name || '配置')}">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="config-icon-btn config-copy-btn" data-index="${index}" title="复制" aria-label="复制 ${escapeHtml(config.name || '配置')}">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M8 8H6C4.89543 8 4 8.89543 4 10V18C4 19.1046 4.89543 20 6 20H14C15.1046 20 16 19.1046 16 18V16" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                            <path d="M10 4H18C19.1046 4 20 4.89543 20 6V14C20 15.1046 19.1046 16 18 16H10C8.89543 16 8 15.1046 8 14V6C8 4.89543 8.89543 4 10 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="config-icon-btn config-edit-btn" data-index="${index}" title="编辑" aria-label="编辑 ${escapeHtml(config.name || '配置')}">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20H21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <path d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="config-icon-btn config-delete-btn" data-index="${index}" title="删除" aria-label="删除 ${escapeHtml(config.name || '配置')}">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <path d="M10 11V17M14 11V17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <path d="M6 7L7 20H17L18 7" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                            <path d="M9 7V4H15V7" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="config-card-body">
                <div class="config-info-item">
                    <span class="config-info-label">URL:</span>
                    <span class="config-info-value" title="${escapeHtml(config.url || '')}">${escapeHtml(truncateText(config.url || '', 52))}</span>
                </div>
                <div class="config-info-item">
                    <span class="config-info-label">Key:</span>
                    <span class="config-info-value">${escapeHtml(maskKey(config.key || ''))}</span>
                </div>
                <div class="config-info-item">
                    <span class="config-info-label">模型:</span>
                    <span class="config-info-value">${escapeHtml(config.model || '-')}</span>
                </div>
                ${['Aliyun', 'OpenAIResponses'].includes(config.type) ? `
                <div class="config-info-item">
                    <span class="config-info-label">思考输出:</span>
                    <span class="config-info-value">${escapeHtml(getThinkingModeLabel(config.thinkingMode, config.enableThinking))}</span>
                </div>
                ` : ''}
                ${config.other ? `
                <div class="config-info-item">
                    <span class="config-info-label">预留参数:</span>
                    <span class="config-info-value" title="${escapeHtml(config.other)}">${escapeHtml(truncateText(config.other, 42))}</span>
                </div>
                ` : ''}
            </div>
        `;

        card.dataset.index = String(index);
        addConfigDragHandlers(card, index);
        card.querySelector('.config-test-btn').addEventListener('click', () => testConfig(index));
        card.querySelector('.config-copy-btn').addEventListener('click', () => copyConfig(index));
        card.querySelector('.config-edit-btn').addEventListener('click', () => editConfig(index));
        card.querySelector('.config-delete-btn').addEventListener('click', () => deleteConfig(index));
        return card;
    }

    function updateConfigSummary(filteredCount) {
        const enabledCount = allConfigs.filter((config) => selectedConfigNames.includes(config.name)).length;
        const typeCount = new Set(allConfigs.map((config) => config.type).filter(Boolean)).size;

        if (summaryTotalConfigs) {
            summaryTotalConfigs.textContent = String(allConfigs.length);
            summaryTotalConfigs.title = typeof filteredCount === 'number'
                ? `当前筛选显示 ${filteredCount} 个`
                : '';
        }
        if (summaryEnabledConfigs) {
            summaryEnabledConfigs.textContent = String(enabledCount);
        }
        if (summaryConfigTypes) {
            summaryConfigTypes.textContent = String(typeCount);
        }
        if (summaryViewMode) {
            summaryViewMode.textContent = compactConfigView ? '紧凑模式' : '详细模式';
        }
    }

    function analyzeImportConfigs(configs) {
        const currentNames = new Set(allConfigs.map((config) => config.name).filter(Boolean));
        const seenNames = new Set();
        const typeCounts = {};
        let newCount = 0;
        let conflictCount = 0;
        let errorCount = 0;

        const items = configs.map((config, index) => {
            const name = config && config.name ? String(config.name).trim() : '';
            const type = config && config.type ? String(config.type).trim() : '';
            const url = config && config.url ? String(config.url).trim() : '';
            const model = config && config.model ? String(config.model).trim() : '';
            const key = config && config.key ? String(config.key).trim() : '';
            const errors = [];
            const warnings = [];
            const isConflict = Boolean(name && currentNames.has(name));

            if (!name) {
                errors.push('缺名称');
            }
            if (!type) {
                errors.push('缺类型');
            } else if (!supportedConfigTypes.includes(type)) {
                warnings.push('未知类型');
            }
            if (!url && type !== 'KaoShiBao') {
                errors.push('缺 URL');
            }
            if (!model && type !== 'KaoShiBao') {
                warnings.push('缺模型');
            }
            if (!key) {
                warnings.push('Key 为空');
            }
            if (name && seenNames.has(name)) {
                warnings.push('文件内重名');
            }

            if (type) {
                typeCounts[type] = (typeCounts[type] || 0) + 1;
            }
            if (name) {
                seenNames.add(name);
            }
            if (isConflict) {
                conflictCount += 1;
            } else {
                newCount += 1;
            }
            if (errors.length > 0) {
                errorCount += 1;
            }

            return {
                config,
                index,
                isConflict,
                errors,
                warnings
            };
        });

        return {
            items,
            typeCounts,
            newCount,
            conflictCount,
            errorCount
        };
    }

    function buildImportedConfigsByMode(currentConfigs, importedConfigs, mode) {
        if (mode === 'append') {
            const existingNames = new Set(currentConfigs.map((config) => config.name).filter(Boolean));
            return [
                ...currentConfigs,
                ...importedConfigs.map((config) => {
                    if (!config || !config.name || !existingNames.has(config.name)) {
                        if (config && config.name) {
                            existingNames.add(config.name);
                        }
                        return config;
                    }
                    const copiedConfig = { ...config };
                    copiedConfig.name = createUniqueConfigName(config.name, existingNames);
                    existingNames.add(copiedConfig.name);
                    return copiedConfig;
                })
            ];
        }

        if (mode === 'merge') {
            const importedByName = new Map(importedConfigs
                .filter((config) => config && config.name)
                .map((config) => [config.name, config]));
            const mergedConfigs = currentConfigs.map((config) => importedByName.has(config.name) ? importedByName.get(config.name) : config);
            const existingNames = new Set(mergedConfigs.map((config) => config.name).filter(Boolean));
            importedConfigs.forEach((config) => {
                if (!config || !config.name || existingNames.has(config.name)) {
                    return;
                }
                mergedConfigs.push(config);
                existingNames.add(config.name);
            });
            return mergedConfigs;
        }

        return [...importedConfigs];
    }

    function createUniqueConfigName(baseName, existingNames) {
        const cleanBaseName = String(baseName || '未命名配置').replace(/\s+副本(?:\s*\d+)?$/, '');
        let nextName = `${cleanBaseName} 副本`;
        let copyIndex = 2;
        while (existingNames.has(nextName)) {
            nextName = `${cleanBaseName} 副本 ${copyIndex}`;
            copyIndex += 1;
        }
        return nextName;
    }

    function restoreLastImportBackup() {
        chrome.storage.local.get('lastImportBackup', function(result) {
            const backup = result.lastImportBackup;
            if (!backup || !Array.isArray(backup.configs)) {
                alert('暂无可恢复的导入前备份。');
                return;
            }

            const createdAt = backup.createdAt ? new Date(backup.createdAt).toLocaleString() : '未知时间';
            if (!confirm(`确定恢复 ${createdAt} 的导入前备份吗？当前配置会被覆盖。`)) {
                return;
            }

            chrome.storage.local.set({
                'configs': backup.configs,
                'selectedConfigs': backup.selectedConfigs || []
            }, function() {
                loadConfigs();
                showNotification('已恢复上一次导入前备份！');
            });
        });
    }

    function getCheckedValue(name, fallback) {
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : fallback;
    }

    function togglePasswordInput(input, button) {
        if (!input || !button) {
            return;
        }
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        button.textContent = visible ? '显示' : '隐藏';
    }

    function addConfigDragHandlers(card, index) {
        const dragHandle = card.querySelector('.config-drag-handle');
        if (!dragHandle) {
            return;
        }

        dragHandle.addEventListener('dragstart', function(event) {
            draggedConfigIndex = index;
            card.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(index));
        });

        dragHandle.addEventListener('dragend', function() {
            draggedConfigIndex = null;
            document.querySelectorAll('.config-card.is-drag-over, .config-card.is-dragging, .config-card.is-drop-before, .config-card.is-drop-after').forEach((element) => {
                element.classList.remove('is-drag-over', 'is-dragging', 'is-drop-before', 'is-drop-after');
            });
        });

        card.addEventListener('dragover', function(event) {
            if (draggedConfigIndex === null || draggedConfigIndex === index) {
                return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const rect = card.getBoundingClientRect();
            const dropAfter = event.clientY > rect.top + rect.height / 2;
            card.classList.add('is-drag-over');
            card.classList.toggle('is-drop-before', !dropAfter);
            card.classList.toggle('is-drop-after', dropAfter);
        });

        card.addEventListener('dragleave', function() {
            card.classList.remove('is-drag-over', 'is-drop-before', 'is-drop-after');
        });

        card.addEventListener('drop', function(event) {
            event.preventDefault();
            const dropAfter = card.classList.contains('is-drop-after');
            card.classList.remove('is-drag-over', 'is-drop-before', 'is-drop-after');
            const sourceIndex = draggedConfigIndex !== null
                ? draggedConfigIndex
                : Number(event.dataTransfer.getData('text/plain'));
            reorderConfig(sourceIndex, index, dropAfter);
        });
    }

    function updateTypeFilterOptions() {
        if (!configTypeFilter) {
            return;
        }

        const currentValue = configTypeFilter.value;
        const types = Array.from(new Set(allConfigs.map((config) => config.type).filter(Boolean))).sort();
        configTypeFilter.innerHTML = '<option value="">全部类型</option>';
        types.forEach((type) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            configTypeFilter.appendChild(option);
        });
        configTypeFilter.value = types.includes(currentValue) ? currentValue : '';
    }

    // 辅助函数：截断文本
    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function normalizeFilterText(text) {
        return String(text || '').trim().toLowerCase();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    // 辅助函数：掩码API密钥
    function maskKey(key) {
        if (!key) return '-';
        if (key.length <= 4) return key;
        return key.substring(0, 4) + '*'.repeat(key.length - 4);
    }

    function normalizeThinkingMode(mode, legacyEnableThinking) {
        if (mode === 'omit' || mode === 'off' || mode === 'on') {
            return mode;
        }

        if (legacyEnableThinking === true) {
            return 'on';
        }

        return 'omit';
    }

    function getThinkingModeLabel(mode, legacyEnableThinking) {
        const normalized = normalizeThinkingMode(mode, legacyEnableThinking);
        if (normalized === 'on') {
            return '开启';
        }
        if (normalized === 'off') {
            return '关闭';
        }
        return '不传';
    }

    function updatePlaceholders() {
        const t = editType.value;
        const isRagflow = t === 'Ragflow';

        if (editModelGroup) {
            editModelGroup.style.display = 'block';
        }
        editUrl.type = isRagflow ? 'text' : 'url';
        if (editModelLabel) {
            editModelLabel.textContent = isRagflow ? '模型（可选）' : '模型';
        }
        editModel.disabled = false;
        editModel.required = false;

        if (editOtherLabel) {
            editOtherLabel.textContent = '预留参数';
        }
        if (editOtherHelpText) {
            editOtherHelpText.style.display = 'none';
            editOtherHelpText.textContent = '';
        }

        if (t === 'OpenaiAPI') {
            editUrl.placeholder = 'https://api.openai.com/v1';
            editModel.placeholder = 'gpt-4o-mini';
            editOther.placeholder = '';
            editKey.placeholder = 'sk-...';
        } else if (t === 'OpenAIResponses') {
            editUrl.placeholder = 'https://api.openai.com/v1/responses';
            editModel.placeholder = 'gpt-4.1-mini';
            editOther.placeholder = '';
            editKey.placeholder = 'sk-...';
        } else if (t === 'Aliyun') {
            editUrl.placeholder = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
            editModel.placeholder = 'qwen3.6-plus';
            editOther.placeholder = '';
            editKey.placeholder = 'sk-...';
        } else if (t === 'Ollama') {
            editUrl.placeholder = 'http://localhost:11434';
            editModel.placeholder = 'llama3.1:8b';
            editOther.placeholder = '';
            editKey.placeholder = '';
        } else if (t === 'CloudFlare') {
            editUrl.placeholder = 'https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}';
            editModel.placeholder = '@cf/meta/llama';
            editOther.placeholder = '';
            editKey.placeholder = 'CF_API_TOKEN';
        } else if (t === 'Dify') {
            editUrl.placeholder = 'https://api.dify.ai';
            editModel.placeholder = '';
            editOther.placeholder = '';
            editKey.placeholder = 'dify-api-key';
        } else if (t === 'AnythingLLM') {
            editUrl.placeholder = 'https://your-anythingllm/';
            editModel.placeholder = 'workspace-id';
            editOther.placeholder = '';
            editKey.placeholder = 'token';
        } else if (t === 'Ragflow') {
            editUrl.placeholder = 'https://your-ragflow 或完整 /api/v1/.../chat/completions';
            editModel.placeholder = 'glm-4-flash@ZHIPU-AI';
            editOther.placeholder = 'shared_id 或聊天分享链接';
            editKey.placeholder = 'ragflow-key';
            if (editOtherLabel) {
                editOtherLabel.textContent = 'shared_id / chat_id';
            }
            if (editOtherHelpText) {
                editOtherHelpText.style.display = 'block';
                editOtherHelpText.textContent = 'Ragflow 必填 shared_id 或 chat_id。URL 可填写站点根地址，也可直接填写带 {chat_id} 的完整模板路径。模型字段可选；如果你的新版实例要求真实模型名，请填写如 glm-4-flash@ZHIPU-AI。不填写时插件会回退默认值 model。支持直接粘贴聊天分享链接，插件会自动提取 shared_id。';
            }
        } else if (t === 'Gemini') {
            editUrl.placeholder = 'https://generativelanguage.googleapis.com/v1beta/models';
            editModel.placeholder = 'gemini-1.5-flash:generateContent';
            editOther.placeholder = '';
            editKey.placeholder = 'AIza...';
        } else if (t === 'KaoShiBao') {
            editUrl.placeholder = 'https://www.kaoshibao.com/api';
            editModel.placeholder = '';
            editOther.placeholder = '';
            editKey.placeholder = '可留空，登录考试宝后自动同步 token';
        } else {
            editModel.placeholder = '';
            editOther.placeholder = '';
            editKey.placeholder = '';
        }

        updateThinkingOptionVisibility();
    }

    function updateThinkingOptionVisibility() {
        if (!thinkingOptionGroup || !editType || !editThinkingMode) { return; }

        const shouldShow = ['OpenaiAPI', 'Aliyun', 'OpenAIResponses'].includes(editType.value);
        thinkingOptionGroup.style.display = shouldShow ? 'block' : 'none';
        if (!shouldShow) {
            editThinkingMode.value = 'omit';
        }
    }

    function validateConfigData(data) {
        const u = data.url.trim();
        if (!/^https?:\/\//.test(u)) {
            alert('API 地址需以 http 或 https 开头');
            editUrl.focus();
            return false;
        }
        if (data.type === 'Ragflow' && (!data.other || !data.other.trim())) {
            alert('Ragflow 需填写 shared_id 或 chat_id');
            editOther.focus();
            return false;
        }
        if (data.type === 'AnythingLLM' && (!data.key || !data.key.trim())) {
            alert('AnythingLLM 需填写 API Key');
            editKey.focus();
            return false;
        }
        if (data.type === 'CloudFlare' && (!data.key || !data.key.trim())) {
            alert('Cloudflare 需填写 API Token');
            editKey.focus();
            return false;
        }
        if (data.type === 'Gemini' && (!data.key || !data.key.trim())) {
            alert('Gemini 需填写 API Key');
            editKey.focus();
            return false;
        }
        if (data.type === 'KaoShiBao' && data.key && data.key.indexOf('token=') >= 0) {
            alert('考试宝 Key 不能包含"token="，只填其值');
            editKey.focus();
            return false;
        }
        return true;
    }

    // 添加配置
    addButton.addEventListener('click', function () {
        openAddConfigModal('OpenaiAPI');
    });

    function openAddConfigModal(type) {
        editingIndex = -1;
        modalTitle.textContent = '添加新配置';
        resetForm();
        editType.value = type || 'OpenaiAPI';
        updatePlaceholders();
        editModalOverlay.style.display = 'flex';
    }

    // 编辑配置
    function editConfig(index) {
        editingIndex = index;
        modalTitle.textContent = '编辑配置';
        
        chrome.storage.local.get('configs', function (result) {
            const configs = result.configs || [];
            const config = configs[index];
            
            editName.value = config.name || '';
            editUrl.value = config.url || '';
            editKey.value = config.key || '';
            editKey.type = 'password';
            if (toggleKeyVisibility) {
                toggleKeyVisibility.textContent = '显示';
            }
            editModel.value = config.model || '';
            editOther.value = config.other || '';
            editType.value = config.type || 'OpenaiAPI';
            editThinkingMode.value = normalizeThinkingMode(config.thinkingMode, config.enableThinking);
            updatePlaceholders();
            
            editModalOverlay.style.display = 'flex';
        });
    }

    function copyConfig(index) {
        chrome.storage.local.get('configs', function (result) {
            const configs = result.configs || [];
            const sourceConfig = configs[index];
            if (!sourceConfig) {
                return;
            }

            const copiedConfig = { ...sourceConfig };
            copiedConfig.name = createCopyConfigName(sourceConfig.name || '未命名配置', configs);
            configs.splice(index + 1, 0, copiedConfig);

            chrome.storage.local.set({ 'configs': configs }, function () {
                loadConfigs();
                showNotification('配置已复制！');
            });
        });
    }

    function reorderConfig(sourceIndex, targetIndex, dropAfter) {
        if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex) || sourceIndex === targetIndex) {
            return;
        }

        chrome.storage.local.get('configs', function (result) {
            const configs = result.configs || [];
            if (sourceIndex < 0 || sourceIndex >= configs.length || targetIndex < 0 || targetIndex >= configs.length) {
                return;
            }

            const movedItems = configs.splice(sourceIndex, 1);
            let insertIndex = dropAfter ? targetIndex + 1 : targetIndex;
            if (sourceIndex < insertIndex) {
                insertIndex -= 1;
            }
            configs.splice(insertIndex, 0, movedItems[0]);

            chrome.storage.local.set({ 'configs': configs }, function () {
                loadConfigs();
                showNotification('配置顺序已更新！');
            });
        });
    }

    function testConfig(index) {
        const config = allConfigs[index];
        if (!config) {
            return;
        }

        if (!validateConfigData({
            name: config.name || '测试配置',
            url: config.url || '',
            key: config.key || '',
            model: config.model || '',
            other: config.other || '',
            type: config.type || 'OpenaiAPI'
        })) {
            return;
        }

        showNotification(`正在测试 ${config.name || '配置'}...`);
        const answerDivId = `test-${Date.now()}`;
        let settled = false;
        const timeoutId = setTimeout(function() {
            settled = true;
            showNotification('测试超时，请检查网络、URL、Key 或模型名');
        }, 30000);

        chrome.runtime.sendMessage({
            action: config.type,
            text: '请只回复 OK',
            selectText: '连接测试',
            config,
            answerDivId
        }, function(response) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError) {
                showNotification(`测试失败：${chrome.runtime.lastError.message}`);
                return;
            }

            const answer = response && response.answer ? String(response.answer) : '';
            if (!answer || /^错误[:：]/.test(answer) || /失败|error|unauthorized|forbidden/i.test(answer)) {
                showNotification(`测试失败：${truncateText(answer || '未返回有效响应', 60)}`);
                return;
            }

            showNotification('测试通过，接口已返回响应！');
        });
    }

    function createCopyConfigName(baseName, configs) {
        const cleanBaseName = String(baseName || '未命名配置').replace(/\s+副本(?:\s*\d+)?$/, '');
        const existingNames = new Set(configs.map((config) => config.name));
        let copyName = `${cleanBaseName} 副本`;
        let copyIndex = 2;

        while (existingNames.has(copyName)) {
            copyName = `${cleanBaseName} 副本 ${copyIndex}`;
            copyIndex += 1;
        }

        return copyName;
    }

    // 保存编辑
    saveEdit.addEventListener('click', function () {
        // 表单验证
        if (!editName.value.trim()) {
            alert('请输入配置名称');
            editName.focus();
            return;
        }
        
        if (!editUrl.value.trim()) {
            alert('请输入API地址');
            editUrl.focus();
            return;
        }

        if (editType.value === 'Ragflow') {
            if (!editOther.value.trim()) {
                alert('Ragflow 必须填写 shared_id 或 chat_id');
                editOther.focus();
                return;
            }
        } else if (!editModel.value.trim() && !editOther.value.trim()) {
            alert('请输入模型名称或预留参数其中一个');
            editModel.focus();
            return;
        }
        
        // 处理URL末尾的斜杠
        let url = editUrl.value.trim();
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        
        // 收集表单数据
        const configData = {
            name: editName.value.trim(),
            url: url,
            key: editKey.value,
            model: editModel.value.trim(),
            other: editOther.value,
            type: editType.value,
            thinkingMode: normalizeThinkingMode(editThinkingMode.value),
            enableThinking: normalizeThinkingMode(editThinkingMode.value) === 'on'
        };
        if (!validateConfigData(configData)) { return; }
        
        // 保存到存储
        chrome.storage.local.get(['configs', 'selectedConfigs'], function (result) {
            const configs = result.configs || [];
            const selectedConfigs = result.selectedConfigs || [];
            const oldConfigName = editingIndex === -1 ? null : configs[editingIndex] && configs[editingIndex].name;
            
            if (editingIndex === -1) {
                // 添加新配置
                configs.push(configData);
            } else {
                // 更新现有配置
                configs[editingIndex] = configData;
            }

            const updatedSelectedConfigs = oldConfigName && oldConfigName !== configData.name
                ? selectedConfigs.map((name) => name === oldConfigName ? configData.name : name)
                : selectedConfigs;
            
            chrome.storage.local.set({ 'configs': configs, 'selectedConfigs': updatedSelectedConfigs }, function () {
                editModalOverlay.style.display = 'none';
                loadConfigs();
                
                // 显示成功消息
                showNotification(editingIndex === -1 ? '配置添加成功！' : '配置更新成功！');
            });
        });
    });

    // 取消编辑
    cancelEdit.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('click', closeModal);
    
    // 点击模态框外部关闭
    editModalOverlay.addEventListener('click', function (e) {
        if (e.target === editModalOverlay) {
            closeModal();
        }
    });
    
    // 关闭模态框函数
    function closeModal() {
        editModalOverlay.style.display = 'none';
        resetForm();
    }
    
    // 重置表单
    function resetForm() {
        editName.value = '';
        editUrl.value = '';
        editKey.value = '';
        editKey.type = 'password';
        if (toggleKeyVisibility) {
            toggleKeyVisibility.textContent = '显示';
        }
        editModel.value = '';
        editOther.value = '';
        editType.value = 'OpenaiAPI';
        editThinkingMode.value = 'omit';
        updatePlaceholders();
    }

    // 删除配置
    function deleteConfig(index) {
        if (confirm('确定要删除这个配置吗？')) {
            chrome.storage.local.get(['configs', 'selectedConfigs'], function (result) {
                const configs = result.configs || [];
                const removedConfig = configs[index];
                configs.splice(index, 1);
                const selectedConfigs = (result.selectedConfigs || []).filter((name) => {
                    return !removedConfig || name !== removedConfig.name;
                });
                
                chrome.storage.local.set({ 'configs': configs, 'selectedConfigs': selectedConfigs }, function () {
                    loadConfigs();
                    showNotification('配置已删除！');
                });
            });
        }
    }
    
    // 显示通知
    function showNotification(message) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--success-color);
            color: white;
            padding: 12px 20px;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-md);
            z-index: 2000;
            animation: slideIn 0.3s ease;
            font-size: 0.875rem;
        `;
        
        // 添加动画
        document.head.insertAdjacentHTML('beforeend', `
            <style>
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
            </style>
        `);
        
        // 添加到文档
        document.body.appendChild(notification);
        
        // 3秒后移除
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // 初始化加载配置
    updatePlaceholders();
    editType.addEventListener('change', updatePlaceholders);
    loadConfigs();
});
