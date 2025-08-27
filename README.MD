# Windy
This is **Windy**, a visualization of Wind conditions and air pressure over the Nordic and Baltic areas, using open 
data from [SMHI](http://opendata.smhi.se/apidocs/metfcst/index.html).

It is inspired from:
* [Earth](https://earth.nullschool.net/#current/wind/surface/level/orthographic=-343.58,23.08,421)
* [Wind map](http://hint.fm/wind/)

The implementation have a server side daemon, `windy.py`, that collects new data from SMHI every hour. Results are 
stored into two json files: `msl.json` (air pressure) and `wind.json`. For implementation, see blog entry 
[here](https://wlog.viltstigen.se/articles/2021/11/08/visualizing-wind-using-leaflet/)


The visualization is on the client side, using [Leaflet](https://leafletjs.com/) and its plugin 
[leaflet-velocity](https://github.com/onaci/leaflet-velocity).

The result can be seen [here](https://www.viltstigen.se/windy/windy.html)

### Bilinear transformations
As an added bonus, `bil.py` implements bilinear interpolation of a square surface and display the results.
The implementation is following the [Wikipedia article](https://en.wikipedia.org/wiki/Bilinear_interpolation).

Why this?

When studying the background for displaying wind directions and velocities as a vector field, references to bilinear
interpolation were made, and I got curious. Hence, I wanted to make a simple experiment and added this to the 
repository. It got stuck there.