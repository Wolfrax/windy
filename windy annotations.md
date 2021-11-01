#leaflet-velocity

See https://github.com/onaci/leaflet-velocity
For GRIB definitions, see https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/
Specifically, Table 4.1 in Section 4.

`windy.js` assumes parameter input of a list with wind data.
This is read from a json file: wind-gbr.json

windy.js
```javascript
 // load data (u, v grids) from somewhere (e.g. https://github.com/danwild/wind-js-server)
$.getJSON("wind.json", function(data) {
    var velocityLayer = L.velocityLayer({
        displayValues: true,
        displayOptions: {
            velocityType: "GBR Wind",
            position: "bottomleft",
            emptyString: "No wind data",
            showCardinal: true
        },
        data: data,
        maxVelocity: 10
    });
});
```
Format
wind_data = [{'header':{...} ,'data':[...]}, {'header':{...} ,'data':[...]}]

wind_data is a list of 2 dictionary elements. Each dictionary element consist of a 'header' element and a
'data' element. 

'header' have GRIB2 information, not all used by windy, see below for the ones used.

'data' is a list of float values, each representing a wind vector component (u or v).
The length of each data element must be the same. windy will calculate the magnitude of the wind vector by:
`Math.sqrt(u * u + v * v)`

See http://colaweb.gmu.edu/dev/clim301/lectures/wind/wind-uv
For winds, the u wind is parallel to the x axis. A positive u wind is from the west. 
A negative u wind is from the east. The v wind runs parallel to the y axis. 
A positive v wind is from the south, and a negative v wind is from the north.
    u = ws * cos(θ)
    v = ws * sin(θ)

These header information elements are used by windy:
- parameterCategory: integer, fixed value 1 ("Moisture"???) or 2 ("Momentum")
- parameterNumber: integer, 
  - either 2 ("U-component_of_wind") or 3 ("V-component_of_wind") when parameterCategory == 2
  - either 2 ("Humidity Mixing Ratio") or 3 ("Precipitable Water") when parameterCategory == 3
- lo1: float (143.0), grid origin (longitude) (Papua, New Guinea)
- la1: float (-7.5), grid origin (latitude)   (Papua, New Guinea)
- dx: float (1.0), distance between grid points
- dy: float (1.0), distance between grid points
- nx: integer (14), number of grid points W-E (lon)
- ny: integer (22), number of grid points N-S (lat) (14*22 = 308, the length of the data list)
- refTime: date when observation was made, time ("2017-02-01 23:00:00")
- forecastTime: integer (), hours of forecast <-- Not used?

Usage for `refTime` and `forecastTime`
```javascript
var date = new Date(header.refTime);
date.setHours(date.getHours() + header.forecastTime);
```

Note that windy determines u and v components in this routine (parameterNumber should be enough):

```javascript
  var createBuilder = function(data) {
    var uComp = null,
      vComp = null,
      scalar = null;

    data.forEach(function(record) {
      switch (
        record.header.parameterCategory +
        "," +
        record.header.parameterNumber
      ) {
        case "1,2":
        case "2,2":
          uComp = record;
          break;
        case "1,3":
        case "2,3":
          vComp = record;
          break;
        default:
          scalar = record;
      }
    });

    return createWindBuilder(uComp, vComp);
  };
```
windy builds a grid by first using u/v values in W-E direction using header element `nx`, then in N-S using `ny`.
See below. 
This implies that u/v data values needs to be sorted accordingly West to East, then North to South

    row 1 (north): West value, ... East value
    ...
    row n (south): West value, ... East value

```javascript
    ni = header.nx;
    nj = header.ny; // number of grid points W-E and N-S (e.g., 144 x 73)

    grid = [];
    var p = 0;
    var isContinuous = Math.floor(ni * Δλ) >= 360;

    for (var j = 0; j < nj; j++) {
      var row = [];
      for (var i = 0; i < ni; i++, p++) {
        row[i] = builder.data(p);
      }
      if (isContinuous) {
        // For wrapped grids, duplicate first column as last column to simplify interpolation logic
        row.push(row[0]);
      }
      grid[j] = row;
    }
```

