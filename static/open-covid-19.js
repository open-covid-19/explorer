function setting(key, val) {
    if (val === null) {
        sessionStorage.removeItem(key);
    } else {
        sessionStorage.setItem(key, val);
    }
}

function loadData(tableNames, callback) {
    async function downloadTable(key, path) {
        const oneMinuteCache = Math.round(Date.now() / 1000 / 60);
        const tableUrl = `${OPEN_COVID_CONFIG['data-url']}/v3/${path}`;
        const data = await loadJSON(`${tableUrl}?cache=${oneMinuteCache}`);
        callback(key, data);
    }
    tableNames = tableNames || Object.keys(OPEN_COVID_CONFIG['tables']);
    tableNames.forEach(key => downloadTable(key, `${key}.csv`));
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
        loadResource(url).then(res => res.json().then(resolve)).catch(reject);
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
            delimiter: ',',
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
        const maxDaily = Math.max(...indices.filter(row =>
            row.date < '2020-06-01' && !Number.isNaN(row.new_confirmed))
            .map(row => row.new_confirmed));
        const firstDataPointIndex = indices
            .map((row, idx) => ((Number(row.new_confirmed) || 0) / ratio > maxDaily) ? idx : null)
            .filter(idx => idx)[0];
        indices = indices.slice(Math.max(0, firstDataPointIndex - pad));
    }

    // Filter by dates if requested in the settings
    if (CURRENT_OPTIONS['min-date']) {
        const firstDataPointIndex = indices
            .map((row, idx) => row['date'] >= CURRENT_OPTIONS['min-date'] ? idx : null)
            .filter(idx => idx)[0];
        indices = indices.slice(Math.max(0, firstDataPointIndex - pad));
    }
    if (CURRENT_OPTIONS['max-date']) {
        const lastDataPointIndex = indices
            .map((row, idx) => row['date'] <= CURRENT_OPTIONS['max-date'] ? idx : null)
            .filter(idx => idx).slice(-1)[0];
        indices = indices.slice(0, Math.min(indices.length, lastDataPointIndex));
    }

    // Remove the data at the beginning which has null values
    const nullColumns = columns || ['new_confirmed', 'new_deceased'];
    const firstRecord = col => indices.slice(0, 1)[0][col];
    const nullish = val => val === '' || val === null || Number.isNaN(val);
    while (nullColumns.every(col => nullish(firstRecord(col)))) {
        indices.shift();
    }

    // Remove the data at the end which has null values
    const latestRecord = col => indices.slice(-1)[0][col];
    while (nullColumns.every(col => nullish(latestRecord(col)))) {
        indices.pop();
    }

    // Use only the last few data points if this is a touchscreen device or history is limited
    if ('ontouchstart' in document.documentElement) {
        const historySize = CURRENT_OPTIONS['history-size-mobile'];
        indices = indices.slice(-historySize - pad);
    } else if (CURRENT_OPTIONS['history-size-limit'] > 0) {
        const historySize = CURRENT_OPTIONS['history-size-limit'];
        indices = indices.slice(-historySize - pad);
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
    return title + (CURRENT_OPTIONS['shareable-charts'] ? ` in ${window.locationLabel}` : '');
}

function mergeAgeBins(records, columnPrefix) {
    const mergeBins = ['80-89', '80-90', '90-99', '90-100', '90-', '100-'];

    return records.map(row => {
        row = Object.assign({}, row);
        const columns = Object.keys(row);

        const ageBinsMap = columns
            .filter(col => col.startsWith('age_bin_'))
            .reduce((acc, col, idx) => Object.assign(acc, { [idx]: row[col] }), {});

        // Early exit: age bins already contain 80-
        if (Object.keys(ageBinsMap).map(idx => ageBinsMap[idx]).includes('80-')) return row;

        // Clear all age bins to be merged
        const mergeAgeBinIndices = Object.keys(ageBinsMap)
            .filter(idx => mergeBins.includes(ageBinsMap[idx]));
        mergeAgeBinIndices.forEach(idx => {
            row[`age_bin_${idx}`] = '';
        });

        // Merge the desired column as the sum of all merged bins
        const replaceIndex = mergeAgeBinIndices[0];
        row[`${columnPrefix}_age_${replaceIndex}`] = mergeAgeBinIndices.reduce((total, idx) =>
            total + row[`${columnPrefix}_age_${idx}`], 0);

        // Add the new age bin to the record
        row[`age_bin_${replaceIndex}`] = '80-';
        return row;
    });
}

function colorScaleValue(rgb0, rgb1, val) {
    const val_ = 1 - val;
    const [r0, g0, b0] = rgb0;
    const [r1, g1, b1] = rgb1;
    const [r, g, b] = [
        Math.round(r0 * val_ + r1 * val),
        Math.round(g0 * val_ + g1 * val),
        Math.round(b0 * val_ + b1 * val),
    ];
    const [rh, gh, bh] = [r, g, b].map(c => ('00' + c.toString(16)).slice(-2));
    return '#' + [rh, gh, bh].join('');
}

function *colorScaleGenerator(rgb0, rgb1, size) {
    for (let i = 0; i < size - 1; i++) {
        yield colorScaleValue(rgb0, rgb1, i / (size - 1));
    }
    yield colorScaleValue(rgb0, rgb1, 1);
}