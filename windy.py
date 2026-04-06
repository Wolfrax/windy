import math
import numpy as np
import json
import requests
import uritemplate
import logging
from logging.handlers import HTTPHandler
from datetime import datetime

_LOGGER = logging.getLogger(__name__)
_LOGGER.setLevel(logging.DEBUG)

http_handler = logging.handlers.HTTPHandler('www.viltstigen.se', '/logger/log', method='POST', secure=True)
_LOGGER.addHandler(http_handler)

# Latitude: N-S, Longitude: W-E

# Note that this now uses SMHI forecast data model snow1g, 
# The data is downloaded for the first valid time, which is the same for all parameters. 
# The data is then sorted in order of increasing longitude (W-E) and then increasing latitude (S-N). 
# The distance between grid points in x-direction (longitudes) and y-direction (latitudes) is calculated, as well as 
# the reference time for the forecast data. The wind direction and speed are converted to u and v vector components.


class Windy:
    def __init__(self, wind_downsample=None, msl_downsample=None):
        base_url = "https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1"
        data_url = base_url + "/geotype/multipoint/time/{t}/parameter/{par}/data.json"
        par_url = base_url + "/parameter.json"
        times_url = base_url + "/times.json"

        try:
            times = requests.get(times_url).json()
            # Valid time is given in iso format UTC time, eg "2024-11-04T17:00:00Z" (Z = zero time offset)
            # The first index of list of valid times is used (index 0).
            # Later on, below, this time is converted to local time, ie UTC + 1:00 hour (or +2:00 hour if daylight saving time is in effect).

            st = times['time'][0]
            vt = st.replace('-', '').replace(':', '')

            parameters = requests.get(par_url).json()

            # https://stackoverflow.com/a/31988734
            # wd = wind direction, ws = wind speed, msl = air pressure at mean sea level
            wd_par = next((item for item in parameters['parameter'] if item['shortName'] == 'wd'), None)
            ws_par = next((item for item in parameters['parameter'] if item['shortName'] == 'ws'), None)
            msl_par = next((item for item in parameters['parameter'] if item['shortName'] == 'pres'), None)
            if wd_par and ws_par and msl_par:
                # Wind direction data
                wd_url = uritemplate.expand(data_url, t=vt, par=wd_par['name'])
                wd_data = requests.get(wd_url, params={'with-geo': True, 'downsample': wind_downsample}).json()

                # wind speed data
                ws_url = uritemplate.expand(data_url, t=vt, par=ws_par['name'])
                ws_data = requests.get(ws_url, params={'with-geo': True, 'downsample': wind_downsample}).json()

                # air pressure at mean sea level data
                msl_url = uritemplate.expand(data_url, t=vt, par=msl_par['name'])
                msl_data = requests.get(msl_url, params={'with-geo': True, 'downsample': msl_downsample}).json()
            else:
                raise ValueError('wd_par: {} or ws_par: {} is None'.format(wd_par, ws_par))

            # Note that coordinates comes in order [lon, lat], but we want [lat, lon], thus we shift columns and add the data column at the end
            self.msl = np.array(msl_data['geometry']['coordinates'])[:, [1, 0]]  # Shift columns so we have lat, lon
            self.msl = np.column_stack((self.msl, msl_data['timeSeries'][0]['data'][msl_par['name']]))

            self.wind = np.column_stack((wd_data['geometry']['coordinates'],
                                         wd_data['timeSeries'][0]['data'][wd_par['name']],
                                         ws_data['timeSeries'][0]['data'][ws_par['name']]))
            
            # Find out the distance between grid points in x-direction (longitudes) and y-direction (latitudes)
            # longitudes comes in increased (West to East) order, thus after a certain number of longitudes it
            # wraps back to next grid row
            self.lon_nx = 0
            for ind in range(1, self.wind.shape[0]):
                self.lon_nx += 1
                if self.wind[ind][0] < self.wind[ind - 1][0]:
                    # Next grid row found, break here as we know number of grid points in x-direction (longitudes)
                    break
            self.lat_ny = int(self.wind.shape[0] / self.lon_nx)  # Number of grid points in y-direction (latitudes)

            # Convert to local time, see link
            # https://stackoverflow.com/questions/68664644/how-can-i-convert-from-utc-time-to-local-time-in-python
            self.ref_time = datetime.fromisoformat(st[:-1] + '+00:00').astimezone().isoformat(timespec='seconds')[:-6]

            # Sort first on lon/W-E (column 0), then lat/N-S (column 1), lexsort uses reversed order
            # See https://stackoverflow.com/a/64053838
            ind = np.lexsort((self.wind[:, 1], self.wind[:, 0]))
            self.wind = self.wind[ind]

            # http://colaweb.gmu.edu/dev/clim301/lectures/wind/wind-uv
            u_vector = []
            v_vector = []
            for i in range(self.wind.shape[0]):
                theta = 270 - self.wind[i][2]
                if theta < 0:
                    theta += 360
                theta = math.radians(theta)
                u = self.wind[i][3] * math.cos(theta)
                v = self.wind[i][3] * math.sin(theta)
                u_vector.append(u)
                v_vector.append(v)

            self.wind = np.column_stack((self.wind, u_vector, v_vector))
            self.bounds = {'Min lon': np.amin(self.wind, 0)[0], 'Max lon': np.amax(self.wind, 0)[0],
                           'Min lat': np.amin(self.wind, 0)[1], 'Max lat': np.amax(self.wind, 0)[1]}

            self.json = None

        except requests.HTTPError:
            logging.warning("HTTPError")

    def save_wind(self, name='wind.json'):
        head_u = {'parameterCategory': 2,
                  'parameterNumber': 2,
                  'lo1': self.bounds['Min lon'],
                  'la1': self.bounds['Max lat'],
                  'dx': abs((self.bounds['Min lon'] - self.bounds['Max lon']) / (self.lon_nx - 1)),
                  'dy': abs((self.bounds['Min lat'] - self.bounds['Max lat']) / (self.lat_ny - 1)),
                  'nx': self.lon_nx,  # lon W-E
                  'ny': self.lat_ny,  # lat S-N
                  'refTime': self.ref_time}

        head_v = head_u.copy()
        head_v['parameterNumber'] = 3

        self.json = [{'header': head_u,
                      'data': [self.wind[i][4] for i in range(self.wind.shape[0])]},
                     {'header': head_v,
                      'data': [self.wind[i][5] for i in range(self.wind.shape[0])]}]

        with open(name, 'w') as f:
            json.dump(self.json, f)

    def save_msl(self, name='msl.json'):
        with open(name, 'w') as f:
            json.dump(self.msl.tolist(), f)


if __name__ == "__main__":
    w = Windy(wind_downsample=60, msl_downsample=5)
    w.save_wind(name='./html/wind.json')
    w.save_msl(name='./html/msl.json')
