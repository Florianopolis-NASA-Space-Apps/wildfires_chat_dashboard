// store geoJSON
const link = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
const faults='https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';

//Earhtquake Data and Fault Data
d3.json(faults).then(function(response){
    const faults = L.geoJSON(response,{  
        style: function(feature){
            return{
                color: '#c1c1c1',
                weight: 2
            }
        }
    })

    d3.json(link).then((data) => {
        var earthQuakes = L.geoJSON(data,{
            onEachFeature: function(feature,layer){
                layer.bindPopup("<h1>Earthquake: " + feature.properties.place + "</h1> <hr> Time: " + new Date (feature.properties.time) + "<hr> Magnitude: " + feature.properties.mag + "<hr> Significance: " + feature.properties.sig, {maxWidth: 400});
            },
            pointToLayer: addCircleMarker
            });
        function addCircleMarker (feature, latlng){
            let options={
                radius: feature.properties.mag * 3,
                stroke:false,
                fillColor: markerColor(feature.properties.sig),
                fillOpacity: 0.75,
            }
            return L.circleMarker( latlng, options );
        }
        createMap(earthQuakes, faults);    
    })
})


//Create Map Function
function createMap(earthQuakes, faults) {
    const dark= L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox/dark-v10',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: API_KEY
        });

    const light= L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox/light-v10',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: API_KEY
        });

    const sattelite= L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        id: 'mapbox/satellite-v9',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: API_KEY
        });

    const baseMaps = {
        Light: light,
        Dark: dark,
        Sattelite: sattelite
        };

    const overlayMaps = {
        "Earthquakes" : earthQuakes,
         "Faults": faults
        };

    let myMap = L.map('map', {
        center: [0, 0],
        zoom: 3,
        layers: [dark, earthQuakes,faults]
        });

    
    L.control.layers(baseMaps, overlayMaps, {
            collapsed: false
        }).addTo(myMap);
    
    //Add legend
    var legend = L.control({position: 'bottomright'});
    legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'info legend');
    div.innerHTML += "<h5>EQ Significance</h5>";
    significance = [0, 250, 500, 750, 1000];
    for (var i = 0; i < significance.length; i++) {
        div.innerHTML +=
            '<i style="background:' + markerColor(significance[i] + 1) + '"></i> ' + 
    + significance[i] + (significance[i + 1] ? ' - ' + significance[i + 1] + '<br><br>' : ' + ');
    }
    return div;
};

legend.addTo(myMap);

}

// Define function for Market Color
function markerColor(sig) {
    if (sig <= 250) {
        return "#ffffff";
    } else if (sig <= 500) {
        return "#72fa41";
    } else if (sig <= 750) {
        return "#24ccff";
    } else if (sig <= 1000) {
        return "#fbff00";
    } else {
        return "#ff69b4";
    }
  };

// Define function for fault stroke weight
  function strokeWeight (slip_rate){
    switch(slip_rate){
        case "Greater than 5.0 mm/yr":
            return 2;
        case "Between 1.0 and 5.0 mm/yr":
            return 1;
        default:
            return 0;
    }
    };