// 插件代码：解除网页的复制、右键、拖拽等限制
(function () {
    'use strict';

    // 插入 CSS 以允许文本选择
    const style = document.createElement("style");
    style.type = "text/css";
    style.innerText = `
        * {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            user-select: text !important;
        }
    `;
    document.head.appendChild(style);

    // 移除样式 user-select: none 的元素样式限制
    document.querySelectorAll("*").forEach((element) => {
        if (window.getComputedStyle(element).userSelect === "none") {
            element.style.userSelect = "auto";
        }
    });

    // 移除常见的右键、选择、剪切、复制、粘贴限制
    const clearEventListeners = () => {
        const eventsToClear = [
            "contextmenu", "selectstart", "dragstart", "mousedown",
            "cut", "copy", "paste"
        ];

        eventsToClear.forEach(event => {
            document.addEventListener(event, (e) => e.stopPropagation(), true);
            document.body.addEventListener(event, (e) => e.stopPropagation(), true);
        });
    };

    // 尝试解除已绑定的事件，确保右键和复制功能正常
    const removeRestrictions = () => {
        document.oncontextmenu = null;
        document.onselectstart = null;
        document.ondragstart = null;
        document.onmousedown = null;

        document.body.oncontextmenu = null;
        document.body.onselectstart = null;
        document.body.ondragstart = null;
        document.body.onmousedown = null;
        document.body.oncut = null;
        document.body.oncopy = null;
        document.body.onpaste = null;

        clearEventListeners();
    };

    // 监听内容加载完成后运行
    document.addEventListener("DOMContentLoaded", () => {
        removeRestrictions();
        console.log("Content restrictions removed.");
    });

})();
