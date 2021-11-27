class CacheHelper {

    static async loadGoogleCharts(packages = ['corechart']) {
        return google.charts.load('current', { packages: packages });
    }

    static _formatUrl(url, resolution) {
        url = String(url);
        url += url.includes('?') ? '&' : '?';
        url += 'cache_timestamp=' + Math.floor(Date.now() / resolution);
        return url;
    }

    static _tableToRecords(table) {
        return table.data.map(row =>
            table.columns.reduce((acc, col, idx) => Object.assign(acc, { [col]: row[idx] }), {}));
    }

    static _loadInMemoryItem(key) {
        return window._CACHE_IN_MEMORY[key];
    }

    static _setInMemoryItem(key, val) {
        window._CACHE_IN_MEMORY[key] = val;
        return val;
    }

    static async fetch(url, resolution = 1000 * 10) {
        url = CacheHelper._formatUrl(url, resolution);
        const c = await caches.open('CacheHelper');
        let res = await c.match(url);
        if (res) {
            return res;
        } else {
            res = await window.fetch(url);
            if (res?.ok) c.put(url, res.clone());
            return res;
        }
    }

    static getJSON(url, resolution = 10000) {
        return CacheHelper.fetch(url, resolution).then(res => res.json());
    }

    static async getCSV(url, resolution = 10000) {
        return CacheHelper.fetch(url, resolution).then(res => res.text()).then(csvText =>
            new Promise((resolve, reject) => Papa.parse(csvText, {
                header: true,
                delimiter: ',',
                skipEmptyLines: true,
                complete: result => {
                    if (result.errors.length > 0) {
                        reject(result.errors[0]);
                    } else {
                        resolve(result.data);
                    }
                }
            }))
        );
    }

    static async getLocationData(locationKey, resolution = 10000) {
        const cacheKey = CacheHelper._formatUrl(locationKey, resolution);
        return CacheHelper._setInMemoryItem(cacheKey, CacheHelper._loadInMemoryItem(cacheKey) ?? new Promise(async resolve => {
            if (_CFG['read-format'] === 'CSV') {
                resolve(CacheHelper.getCSV(`${_CFG['data-url']}/v3/location/${locationKey}.csv`));
            } else {
                resolve(CacheHelper._tableToRecords(
                    await CacheHelper.getJSON(`${_CFG['data-url']}/v3/location/${locationKey}.json`)));
            }
        }));
    }

}

window._CACHE_IN_MEMORY = {};
