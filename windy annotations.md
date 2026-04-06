# 🌬️ Windy Data Processing Pipeline

This project fetches meteorological data from the SMHI open data API, processes it into a structured grid, and outputs wind vector data suitable for visualization in a Leaflet-based frontend (using the velocity layer plugin).

---

## 📌 Overview

The script performs the following steps:

1. Fetches metadata and available parameters from the API
2. Retrieves geospatial wind data (direction and speed)
3. Downsamples large datasets (optional)
4. Converts wind direction and speed into vector components (u, v)
5. Interpolates scattered data onto a नियमित grid
6. Applies fallback interpolation strategies to handle missing values
7. Smooths the resulting vector field
8. Outputs a JSON file compatible with frontend visualization

---

## 🧱 Project Structure

* `windy.py` — Main processing script
* `wind.json` — Generated output used by the frontend
* `html/` — (Optional) frontend visualization files

---

## ⚙️ Requirements

* Python 3.8+
* Dependencies:

  * numpy
  * scipy
  * requests
  * uritemplate

Install dependencies:

```bash
pip install numpy scipy requests uritemplate
```

---

## 🚀 Usage

Run the script:

```bash
python windy.py
```

This will:

1. Fetch data from the SMHI API
2. Process and interpolate wind data
3. Save the result to:

```
./html/wind.json
```

---

## ⚙️ Configuration

The `Windy` class can be configured via constructor parameters:

```python
Windy(
    grid_size=150,
    sample_size=10000,
    smoothing_sigma=0.6
)
```

### Parameters

* **grid_size**: Resolution of output grid (NxN)

  * Higher values = more detail but increased computation

* **sample_size**: Maximum number of input points used

  * Randomly downsampled if dataset exceeds this size

* **smoothing_sigma**: Gaussian smoothing factor

  * Controls smoothing strength of the vector field

---

## 📡 Data Source

Data is retrieved from the SMHI open data API:

```
https://opendata-download-metfcst.smhi.se/api/
```

The script specifically uses:

* Wind direction (`wd`)
* Wind speed (`ws`)
* Pressure (`pres`) *(optional for future use)*

---

## 🧮 Processing Pipeline

### 1. Data Fetching

* Retrieves available timestamps and parameter definitions
* Selects the first available time step

### 2. Parameter Extraction

* Identifies required parameters:

  * Wind direction
  * Wind speed
  * Pressure

### 3. Downsampling

* Randomly reduces dataset size if it exceeds `sample_size`

### 4. Wind Vector Conversion

* Converts wind direction and speed into:

  * **u** (east-west component)
  * **v** (north-south component)

### 5. Grid निर्माण

* Creates a uniform latitude/longitude grid using `numpy.meshgrid`

### 6. Interpolation

* Applies spatial interpolation using:

  * Cubic interpolation (primary)
  * Linear interpolation (fallback)
  * Nearest-neighbor interpolation (final fallback)

### 7. Smoothing

* Applies Gaussian filter to reduce noise and improve visual continuity

### 8. Output Formatting

* Flattens grid data
* Computes metadata (grid spacing, bounds)
* Writes structured JSON output

---

## 📤 Output Format

The generated `wind.json` file contains two datasets:

* u-component (east-west wind)
* v-component (north-south wind)

Example structure:

```json
[
  {
    "header": {
      "lo1": ...,
      "la1": ...,
      "dx": ...,
      "dy": ...,
      "nx": ...,
      "ny": ...,
      "refTime": ...
    },
    "data": [ ... ]
  },
  {
    "header": {
      "parameterNumber": 3
    },
    "data": [ ... ]
  }
]
```

---

## 🖥️ Frontend Integration

The output file is designed to be consumed by a Leaflet-based visualization using the `leaflet-velocity` plugin.

Typical usage:

* Load `wind.json` via AJAX
* Pass data into velocity layer
* Render animated wind particles on a map

---

## ⚠️ Notes

* Cubic interpolation may produce NaN values in sparse regions
* Fallback interpolation ensures full grid coverage
* Random downsampling introduces non-deterministic results
* Higher grid sizes increase computation time significantly
* Gaussian smoothing may slightly blur sharp gradients

---

## 📈 Performance Considerations

* Reduce `grid_size` for faster processing
* Lower `sample_size` for large datasets
* Adjust `smoothing_sigma` to balance smoothness vs. detail

---

## 📄 License

This project uses publicly available meteorological data from SMHI. Ensure compliance with their data usage policies when redistributing or deploying.

---

## 🙌 Acknowledgements

* SMHI Open Data API
* SciPy and NumPy for numerical processing
* Leaflet and leaflet-velocity for visualization


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

