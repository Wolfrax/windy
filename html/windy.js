const PRESSURE_MIN = 1005;
const PRESSURE_MAX = 1030;

const heatmapLayer = new HeatmapOverlay({
    radius: 20,
    maxOpacity: 0.35,
    scaleRadius: false,
    useLocalExtrema: false,
    gradient: {
        0.00: '#313695',
        0.25: '#74add1',
        0.50: '#ffffbf',
        0.75: '#fdae61',
        1.00: '#a50026'
    },
    latField: 'lat',
    lngField: 'lng',
    valueField: 'value'
});

const velocityLayer = new L.velocityLayer({
    particleMultiplier: 1 / 150,
    frameRate: 30,
    lineWidth: 1,
    particleAge: 180,
    displayValues: true,
    displayOptions: {
        velocityType: "Wind",
        position: "bottomleft",
        emptyString: "No wind data",
        showCardinal: true
    },
    minVelocity: 0,
    maxVelocity: 10,
    velocityScale: 0.008,
    colorScale: ["rgb(255,255,255)"]
});

const USGS_USImagery = L.tileLayer(
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 20,
        attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>'
    }
);

const map = L.map("map", {
    layers: [USGS_USImagery, velocityLayer, heatmapLayer]
});

map.setView([62.386843596239835, 16.32126446584757], 5);

L.control.layers(
    {
        "Satellite": USGS_USImagery
    },
    {
        "Wind": velocityLayer,
        "Pressure": heatmapLayer
    },
    {
        collapsed: false
    }
).addTo(map);

function addTimestampControl(refTime) {
    L.Control.textbox = L.Control.extend({
        onAdd: function(map) {
            const text = L.DomUtil.create('div');
            text.id = "info_text";

            const date = new Date(refTime + "Z");

            const formatter = new Intl.DateTimeFormat("sv-SE", {
                timeZone: "Europe/Stockholm",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            });

            const parts = formatter.formatToParts(date);
            const get = (type) => parts.find(p => p.type === type).value;

            const formatted =
                `${get("year")}-${get("month")}-${get("day")} ` +
                `${get("hour")}:${get("minute")}:${get("second")}`;

            text.innerHTML = "<h1>" + formatted + "</h1>";
            return text;
        },

        onRemove: function(map) {}
    });

    L.control.textbox = function(opts) {
        return new L.Control.textbox(opts);
    };

    L.control.textbox({ position: 'topleft' }).addTo(map);
}

function addPressureLegend() {
    const legend = L.control({ position: "bottomright" });

    legend.onAdd = function(map) {
        const div = L.DomUtil.create("div", "pressure-legend");

        div.innerHTML = `
            <div><strong>Pressure</strong></div>
            <div class="pressure-gradient"></div>
            <div class="pressure-labels">
                <span>${PRESSURE_MIN} hPa</span>
                <span>${PRESSURE_MAX} hPa</span>
            </div>
        `;

        return div;
    };

    legend.addTo(map);
}

$.getJSON("wind.json", function(data) {
    velocityLayer.setData(data);
    addTimestampControl(data[0].header.refTime);
});

$.getJSON("msl.json", function(data) {

    const values = data.map(p => p[2]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = 1.0;

    const msl = {
        min: min - padding,
        max: max + padding,
        data: []
    };

/*
    const msl = {
        min: PRESSURE_MIN,
        max: PRESSURE_MAX,
        data: []
    };
*/

    for (let i = 0; i < data.length; i++) {
        msl.data.push({
            lat: data[i][0],
            lng: data[i][1],
            value: data[i][2]
        });
    }

    heatmapLayer.setData(msl);
    addPressureLegend();
});