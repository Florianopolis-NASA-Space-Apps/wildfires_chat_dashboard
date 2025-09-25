// Add tools
client.addTool(
  {
    name: 'get_observations',
    description:
      'Accepts a SQL query and returns a number, compatible with PostgreSQL and PostGIS with this schema: add a function get_observations that accepts a sql query and returns a number. The query should be compatible with postgresql and geogis. this is the schema: CREATE TABLE observations (id SERIAL PRIMARY KEY, latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, brightness DOUBLE PRECISION NOT NULL, scan DOUBLE PRECISION, track DOUBLE PRECISION, acq_date DATE NOT NULL, acq_time TIME NOT NULL, satellite VARCHAR(10) NOT NULL, confidence INTEGER, version VARCHAR(20), bright_t31 DOUBLE PRECISION, frp DOUBLE PRECISION, daynight VARCHAR(1), location GEOGRAPHY(POINT, 4326)',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to retrieve observations from the database',
        },
      },
      additionalProperties: false,
    },
  },
  async ({ query }: { query: string }) => {
    return fetchObservations(query);
  }
);
client.addTool(
  {
    name: 'get_weather',
    description:
      'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
    parameters: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude',
        },
        lng: {
          type: 'number',
          description: 'Longitude',
        },
        location: {
          type: 'string',
          description: 'Name of the location',
        },
      },
      required: ['lat', 'lng', 'location'],
    },
  },
  async ({ lat, lng, location }: { [key: string]: any }) => {
    setMarker({ lat, lng, location });
    setCoords({ lat, lng, location });
    const result = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
    );
    const json = await result.json();
    const temperature = {
      value: json.current.temperature_2m as number,
      units: json.current_units.temperature_2m as string,
    };
    const wind_speed = {
      value: json.current.wind_speed_10m as number,
      units: json.current_units.wind_speed_10m as string,
    };
    setMarker({ lat, lng, location, temperature, wind_speed });
    return json;
  }
);

client.addTool(
  {
    name: 'get_last_rain',
    description:
      'Retrieves the the last time it rained in a location, which is important to predict if an area is in danger of wildfires. It returns the number of days since last rainfall, or -1 is longer than 10 days ago',
    parameters: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude',
        },
        lng: {
          type: 'number',
          description: 'Longitude',
        },
      },
      required: ['lat', 'lng'],
    },
  },
  async ({ lat, lng }: { [key: string]: any }) => {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    const startDate = new Date(today.setDate(today.getDate() - 30))
      .toISOString()
      .split('T')[0];

    // Build the URL
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${startDate}&end_date=${endDate}&daily=precipitation_sum`;

    try {
      // Fetch the data from the API
      const response = await fetch(url);
      const data = await response.json();

      // Extract the daily precipitation data and dates
      const precipitationData = data.daily.precipitation_sum;
      const dates = data.daily.time;

      // Find the last date it rained
      let lastRainDate: string | null = null;
      for (let i = precipitationData.length - 1; i >= 0; i--) {
        if (precipitationData[i] > 0) {
          lastRainDate = dates[i];
          break;
        }
      }

      // Calculate the number of days without rain
      if (lastRainDate) {
        const lastRain = new Date(lastRainDate);
        const daysWithoutRain = Math.floor(
          (today.getTime() - lastRain.getTime()) / (1000 * 60 * 60 * 24)
        );
        console.log(`The last time it rained was on ${lastRainDate}.`);
        console.log(`It has been ${daysWithoutRain} days without rain.`);
        return daysWithoutRain;
      } else {
        console.log('No rain in the last 30 days.');
        return 30; // Assume 30 days without rain if there's no rain in the last 30 days
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      return null;
    }
  }
);
client.addTool(
  {
    name: 'map_fly_to',
    description:
      'Sets the map location of the map displayed in the UI to the given long and lat',
    parameters: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude',
        },
        lng: {
          type: 'number',
          description: 'Longitude',
        },
      },
      required: ['lat', 'lng'],
    },
  },
  async ({ lat, lng, location }: { [key: string]: any }) => {
    setMapPosition({ lat, lng });
  }
);
