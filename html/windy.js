let currentWindData = null;
let currentMslData = null;
let pressureStyle = "none";

let isobarLayer = L.layerGroup();

const WIND_COLOR_SCALE = [
    "#00429d",
    "#4771b2",
    "#73a2c6",
    "#a5d5d8",
    "#ffffe0",
    "#fdae61",
    "#d7191c"
];

// Diverging blue<->gray<->red scale anchored on the physical 1013.25 hPa
// standard pressure - not today's min/max - so an ordinary flat day stays
// gray instead of being stretched across the full range. Built by
// interpolating in OKLCH from a neutral gray midpoint towards this
// project's blue/red diverging pair and checked with the project's
// palette validator (monotonic lightness, single hue per arm, light-end
// contrast >= 2:1; the adjacent-band CVD separation sits in the 8-12
// "floor" band, mitigated by the isobar lines/labels always drawn on top).
const PRESSURE_BANDS = [
    { max: 1000.6, color: "#2a78d6" },
    { max: 1003.9, color: "#5b94dd" },
    { max: 1010.3, color: "#87afe3" },
    { max: 1016.3, color: "#f0efec" },
    { max: 1022.6, color: "#f19a91" },
    { max: 1025.9, color: "#eb746d" },
    { max: Infinity, color: "#e34948" }
];

function bandColor(hpa) {
    for (const band of PRESSURE_BANDS) {
        if (hpa <= band.max) {
            return band.color;
        }
    }

    return PRESSURE_BANDS[PRESSURE_BANDS.length - 1].color;
}

// Renders the pressure grid as filled isobands. Mirrors the canvas-overlay
// pattern L.CanvasLayer (leaflet-velocity.js) already uses in this app:
// reposition via containerPointToLayerPoint on moveend/resize, draw with
// latLngToContainerPoint.
const PressureFillLayer = L.Layer.extend({
    initialize: function(options) {
        L.setOptions(this, options);
        this._grid = null;
    },

    setData: function(pressureGrid) {
        this._grid = pressureGrid;

        if (this._map) {
            this._draw();
        }
    },

    onAdd: function(map) {
        this._map = map;
        this._canvas = L.DomUtil.create("canvas", "pressure-fill-canvas");
        this._canvas.style.pointerEvents = "none";

        const size = map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        this.options.pane.appendChild(this._canvas);

        map.on("moveend resize", this._reset, this);
        this._reset();
    },

    onRemove: function(map) {
        this.options.pane.removeChild(this._canvas);
        map.off("moveend resize", this._reset, this);
        this._canvas = null;
    },

    _reset: function() {
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        const size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        this._draw();
    },

    _draw: function() {
        if (!this._canvas || !this._grid) {
            return;
        }

        const ctx = this._canvas.getContext("2d");
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        const { lats, lngs, grid } = this._grid;
        const map = this._map;

        // Batch same-colored cells into one Path2D per band: far fewer
        // fillStyle switches, and no antialiasing seams between adjacent
        // same-band cells.
        const pathsByColor = new Map();

        for (let i = 0; i < lats.length - 1; i++) {
            for (let j = 0; j < lngs.length - 1; j++) {
                const v00 = grid[i][j], v01 = grid[i][j + 1];
                const v10 = grid[i + 1][j], v11 = grid[i + 1][j + 1];

                if (v00 == null || v01 == null || v10 == null || v11 == null) {
                    continue;
                }

                const color = bandColor((v00 + v01 + v10 + v11) / 4);

                let path = pathsByColor.get(color);
                if (!path) {
                    path = new Path2D();
                    pathsByColor.set(color, path);
                }

                const p1 = map.latLngToContainerPoint([lats[i], lngs[j]]);
                const p2 = map.latLngToContainerPoint([lats[i], lngs[j + 1]]);
                const p3 = map.latLngToContainerPoint([lats[i + 1], lngs[j + 1]]);
                const p4 = map.latLngToContainerPoint([lats[i + 1], lngs[j]]);

                path.moveTo(p1.x, p1.y);
                path.lineTo(p2.x, p2.y);
                path.lineTo(p3.x, p3.y);
                path.lineTo(p4.x, p4.y);
                path.closePath();
            }
        }

        pathsByColor.forEach((path, color) => {
            ctx.fillStyle = color;
            ctx.fill(path);
        });
    }
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
    colorScale: WIND_COLOR_SCALE
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

// Sits above the basemap but below the isobar lines/labels (overlayPane)
// and the wind particles, so isobands read as a background field.
map.createPane("pressureFillPane");
map.getPane("pressureFillPane").style.zIndex = 350;

const pressureFillLayer = new PressureFillLayer({
    pane: map.getPane("pressureFillPane")
});

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

    const edges = PRESSURE_BANDS.slice(0, -1).map(b => b.max);
    const bandLabels = [
        `< ${edges[0].toFixed(0)} hPa`,
        `${edges[0].toFixed(0)}–${edges[1].toFixed(0)} hPa`,
        `${edges[1].toFixed(0)}–${edges[2].toFixed(0)} hPa`,
        `${edges[2].toFixed(0)}–${edges[3].toFixed(0)} hPa (normal)`,
        `${edges[3].toFixed(0)}–${edges[4].toFixed(0)} hPa`,
        `${edges[4].toFixed(0)}–${edges[5].toFixed(0)} hPa`,
        `> ${edges[5].toFixed(0)} hPa`
    ];

    const rows = PRESSURE_BANDS
        .map((b, i) => `
            <div class="pressure-swatch-row">
                <i style="background:${b.color}"></i>
                <span>${bandLabels[i]}</span>
            </div>
        `)
        .join("");

    container.innerHTML = `
        <div class="pressure-legend">
            <div><strong>Isobands</strong></div>
            <div class="pressure-swatch-list">${rows}</div>
            <div>Fixed scale, anchored on 1013 hPa standard pressure</div>
        </div>
    `;
}

function showLoading() {
    document.getElementById("loading").style.display = "flex";
}

function hideLoading() {
    document.getElementById("loading").style.display = "none";
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

    map.removeLayer(pressureFillLayer);
    map.removeLayer(isobarLayer);

    if (pressureStyle === "isoband") {
        pressureFillLayer.setData(buildPressureGrid(currentMslData));
        renderIsobars(currentMslData);
        map.addLayer(pressureFillLayer);
        map.addLayer(isobarLayer);
    } else if (pressureStyle === "isobar") {
        renderIsobars(currentMslData);
        map.addLayer(isobarLayer);
    }

    addPressureLegend(min, max);
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

    const dataBounds =
        L.latLngBounds(
            mslData.map(
                p => [p[0], p[1]]
            )
        );

    map.fitBounds(
        dataBounds,
        {
            padding: [8, 8]
        }
    );

    map.setZoom(
        map.getZoom() + 0.25
    );

    map.setMaxBounds(
        dataBounds.pad(0.10)
    );

    map.options.maxBoundsViscosity = 0.8;

    setTimeout(() => {
        map.invalidateSize();

        map.fitBounds(
            dataBounds,
            {
                padding: [8, 8]
            }
        );

        map.setZoom(
            map.getZoom() + 0.25
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