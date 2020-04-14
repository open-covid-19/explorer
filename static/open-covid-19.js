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
