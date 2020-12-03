function setting(key, val) {
    if (val === null) {
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.setItem(key, val);
    }
}

function loadData(tableNames, callback) {
    function loadJSON(key, path) {
        const oneMinuteCache = Math.round(Date.now() / 1000 / 60);
        const tableUrl = `${OPEN_COVID_CONFIG['data-url']}/v2/${path}`;
        $.getJSON(`${tableUrl}?cache=${oneMinuteCache}`, json => callback(key, json));
    }
    tableNames = tableNames || Object.keys(OPEN_COVID_CONFIG['tables']);
    tableNames.forEach(key => loadJSON(key, `${key}.json`));
}

async function loadLocationData(locationKey) {
    if (CURRENT_OPTIONS['read-format'] === 'CSV') {
        return await loadCSV(`${CURRENT_OPTIONS['data-url']}/v3/location/${locationKey}.csv`);
    } else {
        return tableToRecords(
            await loadJSON(`${CURRENT_OPTIONS['data-url']}/v3/location/${locationKey}.json`));
    }
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

function loadJSON(url, forceCors = false) {
    // Early exit: return from cache
    if (url in CACHE['JSON']) return CACHE['JSON'][url];
    // Add promise to cache to avoid others loading simultaneously
    CACHE['JSON'][url] = new Promise(async (resolve, reject) => {
        if (forceCors) url = `https://cors-anywhere.herokuapp.com/${url}`;
        resolve((await loadResource(url)).json());
    });
    return CACHE['JSON'][url];
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

function filterDataIndices(records, pad = 0, columns = null) {
    let indices = records.map((row, idx) => Object.assign({}, row, { 'idx': idx }));

    // Get rid of irrelevant data prior to the first outbreak
    if (CURRENT_OPTIONS['skip-until-outbreak']) {
        const ratio = CURRENT_OPTIONS['outbreak-threshold-ratio'];
        const maxDaily = Math.max(...records.filter(row =>
            row.date < '2020-06-01' && !Number.isNaN(row.new_confirmed))
            .map(row => row.new_confirmed));
        const firstDataPointIndex = records
            .map((row, idx) => ((Number(row.new_confirmed) || 0) / ratio > maxDaily) ? idx : null)
            .filter(idx => idx)[0];
        indices = indices.slice(Math.max(0, firstDataPointIndex - pad));
    }

    // Remove the data at the end which has null values
    const nullColumns = columns || ['new_confirmed', 'new_deceased'];
    while (nullColumns.every(col => Number.isNaN(indices.slice(-1)[0][col]))) {
        indices.pop();
    }

    // Use only the last few data points if this is a touchscreen device
    if ('ontouchstart' in document.documentElement) {
        indices = indices.slice(-CURRENT_OPTIONS['history-size-mobile'] - pad);
    }

    // Return the indices of data which we keep
    return indices.map(row => row['idx']);
}

function mapToNumeric(records, columns, positive = true) {
    // Make sure the confirmed and deceased cases are always mapped to numeric
    columns = columns.concat(['new_confirmed', 'new_deceased']);
    return records.map(row => {
        const record = Object.assign({}, row);
        columns.forEach(col => {
            const num = parseInt(record[col]);
            if (record[col] === null || Number.isNaN(num)) {
                record[col] = Number.NaN;
            } else if (positive) {
                record[col] = Math.max(0, num);
            } else {
                record[col] = num;
            }
        });
        return record;
    });
}

function chartLabel(title) {
    const locationName = document.querySelector('#location-title').innerText;
    return title + (CURRENT_OPTIONS['shareable-charts'] ? ` in ${locationName}` : '');
}