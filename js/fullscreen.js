// 插件代码：解除网页的全屏锁定检测
(function () {
    'use strict';

    // 1. 阻断页面监听 fullscreenchange — 页面收不到退出全屏通知
    document.addEventListener('fullscreenchange', function (e) {
        e.stopImmediatePropagation();
    }, true);

    // 同时处理带前缀的事件
    document.addEventListener('webkitfullscreenchange', function (e) {
        e.stopImmediatePropagation();
    }, true);
    document.addEventListener('mozfullscreenchange', function (e) {
        e.stopImmediatePropagation();
    }, true);

    // 2. 伪造 fullscreenElement，让页面以为始终在全屏状态
    var fakeEl = document.documentElement;
    ['fullscreenElement', 'webkitFullscreenElement', 'mozFullScreenElement', 'msFullscreenElement'].forEach(function (prop) {
        try {
            Object.defineProperty(document, prop, {
                get: function () { return fakeEl; },
                configurable: true
            });
        } catch (_) {}
    });

    // 3. 拦截并清除页面用于检测全屏状态的定时器
    var originalSetInterval = window.setInterval;
    var suspiciousIds = [];
    window.setInterval = function (fn, delay) {
        var id = originalSetInterval.apply(window, arguments);
        var fnStr = String(fn);
        if (typeof delay === 'number' && delay > 0 && delay < 5000 &&
            /fullscreen|exitFullscreen|webkitExitFullscreen|mozCancelFullScreen|FullscreenElement/i.test(fnStr)) {
            suspiciousIds.push(id);
        }
        return id;
    };

    setTimeout(function () {
        suspiciousIds.forEach(function (id) {
            clearInterval(id);
        });
    }, 800);

    console.log("[aitalk] 全屏锁定检测已解除");
})();
