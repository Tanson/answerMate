(function() {
    'use strict';

	var css = document.createElement("style");
    var head = document.head;
    head.appendChild(css);

    css.type = 'text/css';

    css.innerText = `* {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
         user-select: text !important;
    }`;

	[].forEach.call(['contextmenu', 'copy', 'cut', 'paste', 'mouseup', 'mousedown', 'keyup', 'keydown', 'drag', 'dragstart', 'select', 'selectstart'], function(event) {
		document.addEventListener(event, function(e) {
			e.stopPropagation();
		}, true);
	});

	// 解除全屏锁定
	(function disableFullscreenDetection() {
		// 1. 让 requestFullscreen 静默成功
		Element.prototype.requestFullscreen = function(options) {
			return Promise.resolve();
		};

		// 2. 阻断 fullscreenchange 事件
		document.addEventListener('fullscreenchange', function(e) {
			e.stopImmediatePropagation();
		}, true);

		// 3. 伪造 fullscreenElement
		var fakeEl = document.documentElement;
		['fullscreenElement', 'webkitFullscreenElement', 'mozFullScreenElement', 'msFullscreenElement'].forEach(function(prop) {
			try {
				Object.defineProperty(document, prop, {
					get: function() { return fakeEl; },
					configurable: true
				});
			} catch (_) {}
		});

		// 4. 清除全屏检测 interval
		var originalInterval = window.setInterval;
		var suspicious = [];
		window.setInterval = function(fn, delay) {
			var id = originalInterval.apply(window, arguments);
			if (/fullscreen|exitFullscreen|webkitExitFullscreen|mozCancelFullScreen/i.test(String(fn)) && delay < 3000) {
				suspicious.push(id);
			}
			return id;
		};
		setTimeout(function() {
			suspicious.forEach(function(id) { clearInterval(id); });
		}, 500);
	})();
})();
