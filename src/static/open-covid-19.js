/** Wait until all data is loaded, then perform callback */
function loadData(callback) {
    const data = { 'world': null, 'forecasting': null, 'charts': null };
    const isReady = () => data['world'] && data['forecasting'] && data['charts'];

    $.getJSON(`${OPEN_COVID_19_URL}/data/data_latest.json`, world => {
        data['world'] = world;
        isReady() && callback(data);
    });
    $.getJSON(`${OPEN_COVID_19_URL}/data/data_forecast.json`, forecasting => {
        data['forecasting'] = forecasting;
        isReady() && callback(data);
    });
    $.getJSON(`${OPEN_COVID_19_URL}/data/charts/map.json`, charts => {
        data['charts'] = charts;
        isReady() && callback(data);
    });
}
