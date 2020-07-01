function loadData(tableNames, callback) {
    function loadJSON(key, path) {
        const oneMinuteCache = Math.round(Date.now() / 1000 / 60);
        console.log(`Loading ${OPEN_COVID_DATA_URL}/v2/${path}?cache=${oneMinuteCache}`);
        $.getJSON(`${OPEN_COVID_DATA_URL}/v2/${path}?cache=${oneMinuteCache}`, json => {
            console.log(`Loaded ${key}`);
            callback(key, json);
        });
    }
    tableNames = tableNames || Object.keys(OPEN_COVID_19_TABLES);
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
