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
        particleMultiplier: 1/150,
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
        velocityScale: .008, // 0.005
        colorScale: ["rgb(255,255, 255)"]
    });

var USGS_USImagery = L.tileLayer(
    'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', {
	maxZoom: 20,
	attribution: 'Tiles courtesy of the <a href="https://usgs.gov/">U.S. Geological Survey</a>'
});

const map = L.map("map", {
    layers: [USGS_USImagery, velocityLayer, heatmapLayer]
});

map.setView([62.386843596239835, 16.32126446584757], 5); // Sweden midpoint

$.getJSON("wind.json", function (data) {
    velocityLayer.setData(data);

    L.Control.textbox = L.Control.extend({
		onAdd: function(map) {
            const text = L.DomUtil.create('div');
            text.id = "info_text";
		    text.innerHTML = "<h1>" + data[0].header.refTime.substr(0, 10) + " " +
                data[0].header.refTime.substr(11, 8) + "</h1>"
		    return text;
		},

		onRemove: function(map) {
			// Nothing to do here
		}
	});
	L.control.textbox = function(opts) { return new L.Control.textbox(opts);}
	L.control.textbox({ position: 'topleft' }).addTo(map);
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
