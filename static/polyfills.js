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

})();