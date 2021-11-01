// https://www.patrick-wied.at/static/heatmapjs/docs.html#h337-create
const heatmapLayer = new HeatmapOverlay({
    radius: 7.0,
    maxOpacity: 0.4,
    gradient: {
        '.25': 'blue',
        '0.5': 'green',
        '0.95': 'red',
    },
    latField: 'lat',
    lngField: 'lng',
    valueField: 'value'
});

const velocityLayer = new L.velocityLayer({
        displayValues: true,
        displayOptions: {
            velocityType: "Wind",
            position: "bottomleft",
            emptyString: "No wind data",
            showCardinal: true
        },
        minVelocity: 0,
        maxVelocity: 10,
        velocityScale: .008, // 0.005
        colorScale: ["rgb(255,255, 255)"]
    });

const Esri_DarkGreyCanvas = L.tileLayer(
    "https://{s}.sm.mapstack.stamen.com/" +
    "(toner-lite,$fff[difference],$fff[@23],$fff[hsl-saturation@20])/" +
    "{z}/{x}/{y}.png",
    {
        attribution:
            "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, " +
            "NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community"
    }
);

const map = L.map("map", {
    layers: [Esri_DarkGreyCanvas, heatmapLayer, velocityLayer]
});

map.setView([62.386843596239835, 16.32126446584757], 5); // Sweden midpoint

$.getJSON("wind.json", function (data) {
    velocityLayer.setData(data);
});

$.getJSON("msl.json", function (data) {
    const msl = {min: 10000, max: 0, data: []};
    for (let i = 0; i < data.length; i++) {
        msl.data.push({'lat': data[i][0], 'lng': data[i][1], 'value': data[i][2]});
        if (data[i][2] > msl.max) {
            msl.max = data[i][2]
        }
        if (data[i][2] < msl.min) {
            msl.min = data[i][2]
        }
    }
    heatmapLayer.setData(msl);
});
