let currentWindData = null;
let currentMslData = null;
let windStyle = "colored";
let pressureStyle = "none";


let isobarLayer = L.layerGroup();

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
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    layers: [
        Positron,
        velocityLayer
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
        "Wind": velocityLayer
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
    const get = (type) => parts.find(p => p.type === type).value;

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
        document.getElementById("pressure-legend-container");

    if (!container) {
        return;
    }

    if (pressureStyle === "none") {
        container.innerHTML = `
            <div class="pressure-legend">
                <div><strong>Pressure</strong></div>
                <div>Off</div>
            </div>
        `;
        return;
    }

    if (pressureStyle === "isobar") {
        container.innerHTML = `
            <div class="pressure-legend">
                <div><strong>Isobars</strong></div>
                <div class="isobar-sample"></div>
                <div>${min.toFixed(1)} – ${max.toFixed(1)} hPa</div>
                <div>Contours every 2 hPa</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="pressure-legend">
            <div><strong>Pressure Heatmap</strong></div>
            <div class="pressure-gradient"></div>
            <div class="pressure-labels">
                <span>${min.toFixed(1)} hPa</span>
                <span>${max.toFixed(1)} hPa</span>
            </div>
            <div>Normalized 0–1 for color scaling</div>
        </div>
    `;
}

function showLoading() {
    document.getElementById("loading").style.display = "flex";
}

function hideLoading() {
    document.getElementById("loading").style.display = "none";
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

function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) => a - b);
}

function buildPressureGrid(mslData) {
    const lats = uniqueSorted(mslData.map(p => p[0]));
    const lngs = uniqueSorted(mslData.map(p => p[1]));

    const latIndex = new Map();
    const lngIndex = new Map();

    lats.forEach((v, i) => latIndex.set(v, i));
    lngs.forEach((v, i) => lngIndex.set(v, i));

    const grid = Array.from(
        { length: lats.length },
        () => Array(lngs.length).fill(null)
    );

    mslData.forEach(p => {
        const i = latIndex.get(p[0]);
        const j = lngIndex.get(p[1]);
        grid[i][j] = p[2];
    });

    return {
        lats: lats,
        lngs: lngs,
        grid: grid
    };
}

function interpolatePoint(p1, p2, level) {
    const denom = p2.value - p1.value;

    if (Math.abs(denom) < 0.000001) {
        return [
            (p1.lat + p2.lat) / 2,
            (p1.lng + p2.lng) / 2
        ];
    }

    const t = (level - p1.value) / denom;

    return [
        p1.lat + t * (p2.lat - p1.lat),
        p1.lng + t * (p2.lng - p1.lng)
    ];
}

function createIsobarSegments(mslData, interval) {
    const pressureGrid = buildPressureGrid(mslData);

    const lats = pressureGrid.lats;
    const lngs = pressureGrid.lngs;
    const grid = pressureGrid.grid;

    const values = mslData.map(p => p[2]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    const start = Math.ceil(min / interval) * interval;
    const end = Math.floor(max / interval) * interval;

    const segments = [];

    for (let level = start; level <= end; level += interval) {
        for (let i = 0; i < lats.length - 1; i++) {
            for (let j = 0; j < lngs.length - 1; j++) {
                const bl = {
                    lat: lats[i],
                    lng: lngs[j],
                    value: grid[i][j]
                };

                const br = {
                    lat: lats[i],
                    lng: lngs[j + 1],
                    value: grid[i][j + 1]
                };

                const tr = {
                    lat: lats[i + 1],
                    lng: lngs[j + 1],
                    value: grid[i + 1][j + 1]
                };

                const tl = {
                    lat: lats[i + 1],
                    lng: lngs[j],
                    value: grid[i + 1][j]
                };

                if (
                    bl.value === null ||
                    br.value === null ||
                    tr.value === null ||
                    tl.value === null
                ) {
                    continue;
                }

                const points = [];

                if ((bl.value < level && br.value >= level) ||
                    (bl.value >= level && br.value < level)) {
                    points.push(interpolatePoint(bl, br, level));
                }

                if ((br.value < level && tr.value >= level) ||
                    (br.value >= level && tr.value < level)) {
                    points.push(interpolatePoint(br, tr, level));
                }

                if ((tl.value < level && tr.value >= level) ||
                    (tl.value >= level && tr.value < level)) {
                    points.push(interpolatePoint(tl, tr, level));
                }

                if ((bl.value < level && tl.value >= level) ||
                    (bl.value >= level && tl.value < level)) {
                    points.push(interpolatePoint(bl, tl, level));
                }

                if (points.length === 2) {
                    segments.push({
                        level: level,
                        points: points
                    });
                } else if (points.length === 4) {
                    segments.push({
                        level: level,
                        points: [points[0], points[1]]
                    });

                    segments.push({
                        level: level,
                        points: [points[2], points[3]]
                    });
                }
            }
        }
    }

    console.log("Isobar segments:", segments.length);

    return segments;
}

function renderIsobars(mslData) {
    isobarLayer.clearLayers();

    const segments = createIsobarSegments(mslData, 2);

    segments.forEach((segment, index) => {
        const line = L.polyline(
            segment.points,
            {
                color: "#111111",
                weight: segment.level % 4 === 0 ? 2.2 : 1.4,
                opacity: 0.85
            }
        );

        if (index % 90 === 0) {
            line.bindTooltip(
                `${segment.level.toFixed(0)} hPa`,
                {
                    permanent: true,
                    direction: "center",
                    className: "isobar-label"
                }
            );
        }

        line.addTo(isobarLayer);
    });
}

function renderHeatmap(mslData, min, max) {
    const range = max - min;

    const normalizedData = mslData.map(p => ({
        lat: p[0],
        lng: p[1],
        value: range > 0 ? (p[2] - min) / range : 0.5
    }));

    const normalizedValues = normalizedData.map(p => p.value);

    console.log("Pressure raw min:", min);
    console.log("Pressure raw max:", max);
    console.log("Pressure raw range:", range);
    console.log("Heatmap normalized min:", Math.min(...normalizedValues));
    console.log("Heatmap normalized max:", Math.max(...normalizedValues));
    console.log("Heatmap point count:", normalizedData.length);

    heatmapLayer.setData({
        min: 0,
        max: 1,
        data: normalizedData
    });
}

function refreshPressureDisplay() {
    if (!currentMslData) {
        return;
    }

    const values = currentMslData.map(p => p[2]);
    const min = Math.min(...values);
    const max = Math.max(...values);

    console.log("Pressure style:", pressureStyle);
    console.log("Pressure data points:", currentMslData.length);
    console.log("Pressure min hPa:", min);
    console.log("Pressure max hPa:", max);

    map.removeLayer(heatmapLayer);
    map.removeLayer(isobarLayer);

    if (pressureStyle === "heatmap") {
        renderHeatmap(currentMslData, min, max);
        map.addLayer(heatmapLayer);
    } else if (pressureStyle === "isobar") {
        renderIsobars(currentMslData);
        map.addLayer(isobarLayer);
    }

    addPressureLegend(min, max);
}

const windStyleSelector =
    document.getElementById("wind-style");

if (windStyleSelector) {
    windStyleSelector.addEventListener("change", function(e) {
        windStyle = e.target.value;
        refreshWindLayerStyle();
    });
}

const pressureStyleSelector =
    document.getElementById("pressure-style");

if (pressureStyleSelector) {
    pressureStyleSelector.addEventListener("change", function(e) {
        pressureStyle = e.target.value;
        refreshPressureDisplay();
    });
}

showLoading();

Promise.all([
    $.getJSON("wind.json"),
    $.getJSON("msl.json")
])

.then(([windData, mslData]) => {
    currentWindData = windData;
    currentMslData = mslData;

    velocityLayer.setData(windData);

    setTimestamp(
        windData[0].header.refTime
    );

    refreshPressureDisplay();

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
        map.getZoom() + 0.5
    );

    map.setMaxBounds(
        heatmapBounds.pad(0.10)
    );

    map.options.maxBoundsViscosity = 0.8;

    setTimeout(() => {
        map.invalidateSize();

        map.fitBounds(
            heatmapBounds,
            {
                padding: [8, 8]
            }
        );
        map.setZoom(
            map.getZoom() + 0.5
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