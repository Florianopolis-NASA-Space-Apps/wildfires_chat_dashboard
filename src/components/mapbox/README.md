# Visualizing Data with Leaflet

## Introduction
The USGS is responsible for providing scientific data about natural hazards, the health of our ecosystems and environment; and the impacts of climate and land-use change. Their scientists develop new methods and tools to supply timely, relevant, and useful information about the Earth and its processes. 

The USGS is interested in building a new set of tools that will allow them visualize their earthquake data. They collect a massive amount of data from all over the world each day, but they lack a meaningful way of displaying it. Their hope is that being able to visualize their data will allow them to better educate the public and other government organizations (and hopefully secure more funding..) on issues facing our planet.

## Level 1: Basic Visualization
* This mas was built using Leaflet to plot all of the earthquakes from your data set based on their longitude and latitude.
* The data markers reflect the magnitude of the earthquake in their size and and the significance of earthquake in their color. Earthquakes with higher magnitudes appear larger and those with higher significance appear darker in color.
* Popups provide additional information about the earthquake when a marker is clicked.

## Level 2: Advanced Visualization
* Fault system is included
* Fault-lines with slip_rate values, Greater than 5.0 mm/yr and Between 1.0 and 5.0 mm/yr are plotted
* Three base maps added  to choose from as well as separate out our two different data sets into overlays that can be turned on and off independently.
* Added layer controls 
* Fault popups included to provide additional information about the fault when a fault-line is clicked.

The results can be seen at:  https://zernach.github.io/geomapping-earthquakes/

![animated-scatter](Images/results.gif)

![USGS logo](https://github.com/Zernach/geomapping-earthquakes/blob/master/Images/1-Logo.png?raw=true)
