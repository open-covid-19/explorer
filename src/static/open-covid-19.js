/** Wait until all data is loaded, then perform callback */
function loadData(callback) {
    const data = {
        'latest': null,
        'forecast': null,
        'history': null,
        'mobility': null
    };
    function loadJSON(key, path) {
        $.getJSON(`${OPEN_COVID_19_URL}/data/${path}`, json => {
            data[key] = json;
            Object.keys(data).every(key => data[key]) && callback(data);
        });
    }
    loadJSON('latest', 'data_latest.json');
    loadJSON('forecast', 'data_forecast.json');
    loadJSON('history', 'data.json');
    loadJSON('mobility', 'mobility.json');
}

function loadDataV2(tableNames, callback) {
    function loadJSON(key, path) {
        $.getJSON(`${OPEN_COVID_19_URL}/data/v2/${path}?cache=${Date.now()}`, json => {
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
