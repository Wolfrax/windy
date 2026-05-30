let currentWindData = null;
let windStyle = "dark";

function getWindColorScale(style) {
    if (style === "colored") {
        return [
            "#00429d",
            "#4771b2",
            "#73a2c6",
            "#a5d5d8",
            "#ffffe0",
            "#fdae61",
            "#d7191c"
        ];
    }

    return [
        "rgb(20,40,80)"
    ];
}

const heatmapLayer = new HeatmapOverlay({
    radius: 18,
    maxOpacity: 0.30,
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
    particleMultiplier: 1 / 120,
    frameRate: 30,
    lineWidth: 2,
    particleAge: 220,

    displayValues: true,
    displayOptions: {
        velocityType: "Wind",
        position: "bottomleft",
        emptyString: "No wind data",
        showCardinal: true
    },

    minVelocity: 0,
    maxVelocity: 10,
    velocityScale: 0.010,
    colorScale: getWindColorScale(windStyle)
});

const Positron = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }
);

const map = L.map("map", {
    layers: [
        Positron,
        velocityLayer,
        heatmapLayer
    ]
});

const nordicBounds = [
    [54, 5],
    [71, 31]
];

map.fitBounds(nordicBounds);

const layerControl = L.control.layers(
    {},
    {
        "Wind": velocityLayer,
        "Pressure": heatmapLayer
    },
    {
        collapsed: false
    }
).addTo(map);

const layerControlContainer =
    document.getElementById("layer-control-container");

if (layerControlContainer) {
    layerControlContainer.appendChild(
        layerControl.getContainer()
    );
}

function formatRefTime(refTime) {
    const date = new Date(refTime + "Z");

    const formatter = new Intl.DateTimeFormat(
        "sv-SE",
        {
            timeZone: "Europe/Stockholm",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        }
    );

    const parts = formatter.formatToParts(date);

    const get = (type) =>
        parts.find(p => p.type === type).value;

    return (
        `${get("year")}-${get("month")}-${get("day")} ` +
        `${get("hour")}:${get("minute")}:${get("second")}`
    );
}

function setTimestamp(refTime) {
    const timestampPanel =
        document.getElementById("timestamp-panel");

    if (!timestampPanel) {
        return;
    }

    timestampPanel.textContent =
        formatRefTime(refTime);
}

function addPressureLegend(min, max) {
    const container =
        document.getElementById(
            "pressure-legend-container"
        );

    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="pressure-legend">
            <div>
                <strong>Pressure</strong>
            </div>

            <div class="pressure-gradient"></div>

            <div class="pressure-labels">
                <span>${min} hPa</span>
                <span>${max} hPa</span>
            </div>
        </div>
    `;
}

function showLoading() {
    document.getElementById("loading").style.display =
        "flex";
}

function hideLoading() {
    document.getElementById("loading").style.display =
        "none";
}

function refreshWindLayerStyle() {
    velocityLayer.options.colorScale =
        getWindColorScale(windStyle);

    if (currentWindData) {
        velocityLayer.setData(currentWindData);
    }

    if (typeof velocityLayer._clearAndRestart === "function") {
        velocityLayer._clearAndRestart();
    }
}

const windStyleSelector =
    document.getElementById("wind-style");

if (windStyleSelector) {
    windStyleSelector.addEventListener("change", function(e) {
        windStyle = e.target.value;
        refreshWindLayerStyle();
    });
}

showLoading();

Promise.all([
    $.getJSON("wind.json"),
    $.getJSON("msl.json")
])

.then(([windData, mslData]) => {
    currentWindData = windData;

    velocityLayer.setData(windData);

    setTimestamp(
        windData[0].header.refTime
    );

    const values =
        mslData.map(p => p[2]);

    const min =
        Math.min(...values);

    const max =
        Math.max(...values);

    const padding = 1.0;

    const msl = {
        min: min - padding,
        max: max + padding,
        data: mslData.map(p => ({
            lat: p[0],
            lng: p[1],
            value: p[2]
        }))
    };

    heatmapLayer.setData(msl);

    addPressureLegend(
        msl.min,
        msl.max
    );

    const heatmapBounds =
        L.latLngBounds(
            mslData.map(
                p => [p[0], p[1]]
            )
        );

    map.fitBounds(
        heatmapBounds,
        {
            padding: [8, 8]
        }
    );

    map.setZoom(
        map.getZoom() + 1
    );

    map.setMaxBounds(
        heatmapBounds.pad(0.10)
    );

    map.options.maxBoundsViscosity =
        0.8;

    setTimeout(() => {
        map.invalidateSize();

        map.fitBounds(
            heatmapBounds,
            {
                padding: [8, 8]
            }
        );

        map.setZoom(
            map.getZoom() + 1
        );

    }, 100);
})

.catch(err => {
    console.error(
        "Failed to load weather data:",
        err
    );

    alert(
        "Failed to load weather data"
    );
})

.finally(() => {
    hideLoading();
});