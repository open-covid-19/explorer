function loadData(tableNames, callback) {
    function loadJSON(key, path) {
        const oneMinuteCache = Math.round(Date.now() / 1000 / 60);
        const tableUrl = `${OPEN_COVID_CONFIG['data-url']}/v2/${path}`;
        $.getJSON(`${tableUrl}?cache=${oneMinuteCache}`, json => callback(key, json));
    }
    tableNames = tableNames || Object.keys(OPEN_COVID_CONFIG['tables']);
    tableNames.forEach(key => loadJSON(key, `${key}.json`));
}

function tableToRecords(table) {
    return table.data.map(row =>
        table.columns.reduce((acc, col, idx) => Object.assign(acc, { [col]: row[idx] }), {}));
}

function removeEmptyColumns(table) {
    const nnColumns = [];
    table.forEach(row => {
        Object.keys(row).forEach(col => {
            if (row[col]) nnColumns.push(col);
        });
    });
    return table.map(row => nnColumns.reduce((acc, col) =>
        Object.assign(acc, { [col]: row[col] }), {}));
}

function retryCallback(callback) {
    let counter = 0;
    const maxRetries = 32;
    const timer = setInterval(() => {
        try {
            callback();
            clearInterval(timer);
        } catch (exc) {
            console.error(`Callback failed: ${++counter}`, exc);
            if (counter >= maxRetries) clearInterval(timer);
        }
    }, 250);
}

async function loadResource(url) {
    const response = await fetch(url);
    if (response.ok) {
        return response;
    } else {
        throw new Error('Response failed');
    }
}

function loadCSV(url, forceCors = false) {
    // Early exit: return from cache
    if (url in CACHE['CSV']) return CACHE['CSV'][url];
    // Add promise to cache to avoid others loading simultaneously
    CACHE['CSV'][url] = new Promise(async (resolve, reject) => {
        if (forceCors) url = `https://cors-anywhere.herokuapp.com/${url}`;
        const response = await loadResource(url);
        const csvText = await response.text();
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: result => {
                if (result.errors.length > 0) {
                    reject(result.errors[0]);
                } else {
                    resolve(result.data);
                }
            }
        });
    });
    return CACHE['CSV'][url];
}

function recordsToDataTable(records, columns = null) {
    columns = columns || Object.keys(records[0]);
    const data = [columns].concat(records.map(row => columns.map(col => row[col])));
    return google.visualization.arrayToDataTable(data);
}

function loadGoogleCharts(packages = ['corechart']) {
    // Early exit: return from cache
    const cacheKey = packages.join(',');
    if (cacheKey in CACHE['gcharts']) return CACHE['gcharts'][cacheKey];
    // Add promise to cache to avoid others loading simultaneously
    CACHE['gcharts'][cacheKey] = google.charts.load('current', { packages: packages });
    return CACHE['gcharts'][cacheKey];
}

function filterData(records) {

    // Get rid of irrelevant data prior to the first outbreak
    if (CURRENT_OPTIONS['skip-until-outbreak']) {
        const ratio = CURRENT_OPTIONS['outbreak-threshold-ratio'];
        const maxDaily = Math.max(...records.map(row => row.new_confirmed));
        const firstDataPointIndex = records
            .map((row, idx) => ((parseInt(row.new_confirmed) || 0) / ratio > maxDaily) ? idx : null)
            .filter(idx => idx)[0];
        records = records.slice(firstDataPointIndex);
    }

    // Use only the last few data points if this is a touchscreen device
    if ('ontouchstart' in document.documentElement) {
        records = records.slice(-CURRENT_OPTIONS['history-size-mobile']);
    }

    return records;
}
