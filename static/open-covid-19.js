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
        const tableUrl = `${_CFG['data-url']}/v3/${path}`;
        const data = await loadJSON(`${tableUrl}?cache=${oneMinuteCache}`);
        callback(key, data);
    }
    tableNames = tableNames || Object.keys(_CFG['tables']);
    tableNames.forEach(key => downloadTable(key, `${key}.csv`));
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

function recordsToDataTable(records, columns = null) {
    columns = columns || Object.keys(records[0]);
    const data = [columns].concat(records.map(row => columns.map(col => row[col])));
    return google.visualization.arrayToDataTable(data);
}

function filterDataIndices(records, pad = 0, columns = null) {
    let indices = records.map((row, idx) => Object.assign({}, row, { 'idx': idx }));

    // Get rid of irrelevant data prior to the first outbreak
    // if (_CFG['skip-until-outbreak']) {
    //     const ratio = _CFG['outbreak-threshold-ratio'];
    //     const maxDaily = Math.max(...indices.filter(row =>
    //         row.date < '2020-06-01' && !Number.isNaN(row.new_confirmed))
    //         .map(row => row.new_confirmed));
    //     const firstDataPointIndex = indices
    //         .map((row, idx) => ((Number(row.new_confirmed) || 0) / ratio > maxDaily) ? idx : null)
    //         .filter(idx => idx)[0];
    //     indices = indices.slice(Math.max(0, firstDataPointIndex - pad));
    // }

    // Filter by dates if requested in the settings
    if (_CFG['min-date']) {
        const firstDataPointIndex = indices
            .map((row, idx) => row['date'] >= _CFG['min-date'] ? idx : null)
            .filter(idx => idx)[0];
        indices = indices.slice(Math.max(0, firstDataPointIndex - pad));
    }
    if (_CFG['max-date']) {
        const lastDataPointIndex = indices
            .map((row, idx) => row['date'] <= _CFG['max-date'] ? idx : null)
            .filter(idx => idx).slice(-1)[0];
        indices = indices.slice(0, Math.min(indices.length, lastDataPointIndex));
    }

    // Remove the data at the beginning which has null values
    const nullColumns = columns || ['new_confirmed', 'new_deceased'];
    const nullish = val => val === '' || val === null || Number.isNaN(val);
    let firstNonNullIndex = 0;
    while (nullColumns.every(col => nullish(indices[firstNonNullIndex][col]))) firstNonNullIndex++;
    if (firstNonNullIndex > 0) indices = indices.slice(Math.max(0, firstNonNullIndex));

    // Remove the data at the end which has null values
    let lastNonNullIndex = indices.length - 1;
    while (nullColumns.every(col => nullish(indices[lastNonNullIndex][col]))) lastNonNullIndex--;
    if (lastNonNullIndex < indices.length - 1) indices = indices.slice(0, Math.min(lastNonNullIndex + 1, indices.length));

    // Return the indices of data which we keep
    return indices.map(row => row['idx']);
}

function mapToNumeric(records, columns, positive = true) {
    return records.map(record => {
        columns.forEach(col => {
            if (record[col] === null) {
                record[col] = Number.NaN;
                return;
            }

            if (typeof record[col] !== 'number') {
                record[col] = parseInt(record[col]);
                if (Number.isNaN(record[col])) return;
            }

            if (positive && record[col] < 0) {
                record[col] = Math.max(0, record[col]);
            }
        });

        return record;
    });
}

function chartLabel(title) {
    return title + (_CFG['shareable-charts'] ? ` in ${window.locationLabel}` : '');
}

function mergeAgeBins(records) {
    const mergeBins = ['80-', '80-89', '80-90', '90-99', '90-100', '90-', '100-'];

    return records.map(row => {
        row = Object.assign({}, row);
        const columns = Object.keys(row);

        const ageBinsMap = columns
            .filter(col => col.startsWith('age_bin_'))
            .reduce((acc, col, idx) => Object.assign(acc, { [idx]: row[col] }), {});

        // Early exit: no bins to merge
        if (Object.keys(ageBinsMap).length === 0) return row;

        // Enumerate the columns that are stratified by age
        const stratifiedColumns = [...new Set(columns
            .filter(col => col.match(/.+_age_\d$/))
            .map(col => col.slice(0, -('_age_n'.length))))];

        // Compute the corresponding indices for the stratified age bins
        const mergeAgeBinIndices = Object.keys(ageBinsMap)
            .filter(idx => mergeBins.includes(ageBinsMap[idx]))
            .map(idx => Number(idx));

        // Add up the totals for all merged age bins
        const totalValues = stratifiedColumns.reduce((acc, col) =>
            Object.assign(acc, { [col]: mergeAgeBinIndices.map(idx => row[`${col}_age_${idx}`]).sum() }), {});

        // Clear all age bins to be merged
        mergeAgeBinIndices.forEach(idx => {
            row[`age_bin_${idx}`] = Number.NaN;
            stratifiedColumns.forEach(col => {
                row[`${col}_age_${idx}`] = Number.NaN;
            });
        });

        // Set the total for the lowest indexed bin
        const replaceIndex = Math.min(...mergeAgeBinIndices);
        stratifiedColumns.forEach(col => {
            row[`${col}_age_${replaceIndex}`] = totalValues[col];
        });

        // Add the new age bin to the record
        row[`age_bin_${replaceIndex}`] = mergeBins[0];
        return row;
    });
}

function ageBinAdapterBuilder(dataAgeBins, populationBinsMap) {
    // Convert the population bins to 1-year bins as an intermediate step
    const popest = [];
    Object.keys(populationBinsMap).sort((a, b) => a - b).forEach(popbin => {
        const popval = populationBinsMap[popbin];
        const [lo, hi] = popbin.substr('population_age_'.length).split('_', 2).map(x => parseInt(x));
        if (Number.isNaN(hi)) {
            popest.push(popval);
        } else {
            for (let i = lo; i <= hi; i++) popest.push(popval / (hi - lo));
        }
    });

    // Use the 1-year bins to estimate population between each sub-range
    return dataAgeBins.reduce((acc, agebin) => {
        const [lo, hi] = agebin.split('-', 2).map(x => parseInt(x));
        if (Number.isNaN(hi)) {
            acc[agebin] = popest.slice(lo).reduce((tot, x) => tot + x, 0);
        } else {
            acc[agebin] = popest.slice(lo, hi + 1).reduce((tot, x) => tot + x, 0);
        }
        return acc;
    }, {});
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

function* colorScaleGenerator(rgb0, rgb1, size) {
    for (let i = 0; i < size - 1; i++) {
        yield colorScaleValue(rgb0, rgb1, i / (size - 1));
    }
    yield colorScaleValue(rgb0, rgb1, 1);
}