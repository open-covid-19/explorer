(function () {
    'use strict';
    // URLSearchParameters
    window.URLSearchParameters = function (querystring) {
        return (querystring || location.search).split('?').pop().split('&').reduce(function (acc, keyval) {
            var parts = keyval.split('=');
            var key = decodeURIComponent(parts[0]);
            var val = parts[1] ? decodeURIComponent(parts[1]) : true;
            acc[key] = val;
            return acc;
        }, {});
    };

    // Go to a certain URL, trigger reload if necessary
    window.goto = function goto(href, newtab = false) {
        window.open(href, newtab ? '_blank' : '_top');
        if (window.location.pathname === href.split('#')[0]) {
            window.location.reload();
        }
    };

    /**
     * Shorthand for creating an element with attributes and attaching it to a root.
     *
     * @param {String} tag
     * @param {Map<String, Object>} attributes
     * @param {HTMLElement} root
     * @param {boolean} prepend
     * @returns {HTMLElement}
     */
    window.attachElement = function attachElement(tag, attributes, root = null, prepend = false) {
        const elem = document.createElement(tag);
        Object.assign(elem, attributes);
        if (root) prepend ? root.prepend(elem) : root.append(elem);
        return elem;
    };

    Array.prototype.roll = function* roll(windowSize) {
        for (let idx = 1; idx <= this.length; idx++) {
            const start = Math.max(0, idx - windowSize);
            yield this.slice(start, idx);
        }
    };

    Array.prototype.sum = function sum() {
        if (this.every(x => Number.isNaN(x))) return Number.NaN;
        return this.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
    };

    Array.prototype.rolling = function rolling(windowSize) {
        const generator = this.roll(windowSize);
        return {
            map: (func) => Array.from(generator).map(func),
            sum: () => Array.from(generator).map(iter => iter.sum()),
            avg: () => Array.from(generator).map(iter => iter.sum() / iter.length),
        };
    };

})();