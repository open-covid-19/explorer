/** Wait until all data is loaded, then perform callback */
function loadData(callback) {
    const data = { 'world': null, 'forecast': null, 'charts': null, 'history': null };
    const isReady = () => data['world'] && data['forecast'] && data['charts'] && data['history'];

    $.getJSON(`${OPEN_COVID_19_URL}/data/data_latest.json`, world => {
        data['world'] = world;
        isReady() && callback(data);
    });
    $.getJSON(`${OPEN_COVID_19_URL}/data/data_forecast.json`, forecast => {
        data['forecast'] = forecast;
        isReady() && callback(data);
    });
    $.getJSON(`${OPEN_COVID_19_URL}/data/charts/map.json`, charts => {
        data['charts'] = charts;
        isReady() && callback(data);
    });
    $.getJSON(`${OPEN_COVID_19_URL}/data/data.json`, history => {
        data['history'] = history;
        isReady() && callback(data);
    });
}
