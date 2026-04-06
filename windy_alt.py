import json
import logging
import numpy as np
import requests
import uritemplate

from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
_LOGGER = logging.getLogger(__name__)


class Windy:
    BASE_URL = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1"

    def __init__(
        self,
        grid_size=150,
        sample_size=10000,
        smoothing_sigma=0.6
    ):
        self.grid_size = grid_size
        self.sample_size = sample_size
        self.smoothing_sigma = smoothing_sigma

    # -------------------------
    # HTTP helpers
    # -------------------------
    def _get_json(self, url, params=None):
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        return r.json()

    def _fetch_parameter(self, template, t, param_name):
        url = uritemplate.expand(template, t=t, par=param_name)
        return self._get_json(url, {"with-geo": True})

    # -------------------------
    # Fetch data
    # -------------------------
    def fetch(self):
        times = self._get_json(f"{self.BASE_URL}/times.json")
        parameters = self._get_json(f"{self.BASE_URL}/parameter.json")

        st = times["time"][0]
        vt = st.replace("-", "").replace(":", "")

        def find_param(short):
            return next((p for p in parameters["parameter"] if p["shortName"] == short), None)

        wd_par = find_param("wd")
        ws_par = find_param("ws")
        msl_par = find_param("pres")

        if not all([wd_par, ws_par, msl_par]):
            raise ValueError("Missing required parameters")

        data_url = f"{self.BASE_URL}/geotype/multipoint/time/{{t}}/parameter/{{par}}/data.json"

        self.wd_data = self._fetch_parameter(data_url, vt, wd_par["name"])
        self.ws_data = self._fetch_parameter(data_url, vt, ws_par["name"])
        self.msl_data = self._fetch_parameter(data_url, vt, msl_par["name"])

        self.param_names = {
            "wd": wd_par["name"],
            "ws": ws_par["name"],
            "msl": msl_par["name"]
        }

        self.ref_time = st.replace("Z", "")

    # -------------------------
    # Processing
    # -------------------------
    def process(self):
        coords = np.array(self.wd_data["geometry"]["coordinates"])
        lons = coords[:, 0]
        lats = coords[:, 1]

        wd = np.array(self.wd_data["timeSeries"][0]["data"][self.param_names["wd"]])
        ws = np.array(self.ws_data["timeSeries"][0]["data"][self.param_names["ws"]])

        print("\n--- INPUT DATA ---")
        print("Total points:", len(lons))

        # -------------------------
        # Downsampling
        # -------------------------
        if self.sample_size and len(lons) > self.sample_size:
            idx = np.random.choice(len(lons), self.sample_size, replace=False)
            lons = lons[idx]
            lats = lats[idx]
            wd = wd[idx]
            ws = ws[idx]

            print("Downsampled to:", len(lons))

        # -------------------------
        # Convert wind → u/v
        # -------------------------
        theta = np.radians(270 - wd)
        u = ws * np.cos(theta)
        v = ws * np.sin(theta)

        # -------------------------
        # Grid creation
        # -------------------------
        lon_grid = np.linspace(lons.min(), lons.max(), self.grid_size)
        lat_grid = np.linspace(lats.min(), lats.max(), self.grid_size)

        grid_lon, grid_lat = np.meshgrid(lon_grid, lat_grid)

        print("\n--- GRID ---")
        print("Grid shape:", grid_lon.shape)

        # -------------------------
        # Interpolation (cubic → linear → nearest)
        # -------------------------
        print("\nInterpolating (cubic)...")

        u_grid = griddata((lons, lats), u, (grid_lon, grid_lat), method="cubic")
        v_grid = griddata((lons, lats), v, (grid_lon, grid_lat), method="cubic")

        print("NaNs after cubic (u):", np.isnan(u_grid).sum())
        print("NaNs after cubic (v):", np.isnan(v_grid).sum())

        # --- Linear fallback ---
        if np.isnan(u_grid).any():
            u_linear = griddata((lons, lats), u, (grid_lon, grid_lat), method="linear")
            u_grid[np.isnan(u_grid)] = u_linear[np.isnan(u_grid)]

        if np.isnan(v_grid).any():
            v_linear = griddata((lons, lats), v, (grid_lon, grid_lat), method="linear")
            v_grid[np.isnan(v_grid)] = v_linear[np.isnan(v_grid)]

        # --- Nearest fallback ---
        if np.isnan(u_grid).any():
            u_nearest = griddata((lons, lats), u, (grid_lon, grid_lat), method="nearest")
            u_grid[np.isnan(u_grid)] = u_nearest[np.isnan(u_grid)]

        if np.isnan(v_grid).any():
            v_nearest = griddata((lons, lats), v, (grid_lon, grid_lat), method="nearest")
            v_grid[np.isnan(v_grid)] = v_nearest[np.isnan(v_grid)]

        print("Remaining NaNs (u):", np.isnan(u_grid).sum())
        print("Remaining NaNs (v):", np.isnan(v_grid).sum())

        # -------------------------
        # Balanced smoothing
        # -------------------------
        if self.smoothing_sigma and self.smoothing_sigma > 0:
            print(f"\nApplying Gaussian smoothing (sigma={self.smoothing_sigma})...")
            u_grid = gaussian_filter(u_grid, sigma=self.smoothing_sigma)
            v_grid = gaussian_filter(v_grid, sigma=self.smoothing_sigma)

        # -------------------------
        # Flatten for leaflet-velocity
        # -------------------------
        u_flat = u_grid.flatten()
        v_flat = v_grid.flatten()

        nx = grid_lon.shape[1]
        ny = grid_lat.shape[0]

        dx = (lon_grid.max() - lon_grid.min()) / (nx - 1)
        dy = (lat_grid.max() - lat_grid.min()) / (ny - 1)

        print("\n--- OUTPUT GRID ---")
        print("nx:", nx, "ny:", ny)
        print("dx:", dx, "dy:", dy)
        print("u length:", len(u_flat))
        print("v length:", len(v_flat))

        self.wind_u = u_flat
        self.wind_v = v_flat
        self.lon_min = lon_grid.min()
        self.lat_max = lat_grid.max()
        self.dx = dx
        self.dy = dy
        self.nx = nx
        self.ny = ny

    # -------------------------
    # Save output
    # -------------------------
    def save(self, filename="./html/wind.json"):
        header = {
            "parameterCategory": 2,
            "parameterNumber": 2,
            "lo1": self.lon_min,
            "la1": self.lat_max,
            "dx": self.dx,
            "dy": self.dy,
            "nx": self.nx,
            "ny": self.ny,
            "refTime": self.ref_time
        }

        data = [
            {
                "header": header,
                "data": self.wind_u.tolist()
            },
            {
                "header": {**header, "parameterNumber": 3},
                "data": self.wind_v.tolist()
            }
        ]

        with open(filename, "w") as f:
            json.dump(data, f, indent=2)

        print("\nSaved:", filename)


# -------------------------
# Run
# -------------------------
if __name__ == "__main__":
    w = Windy(
        grid_size=150,
        sample_size=10000,
        smoothing_sigma=0.6
    )

    print("\nFetching...")
    w.fetch()

    print("Processing...")
    w.process()

    print("Saving...")
    w.save()

    print("\nDone.")