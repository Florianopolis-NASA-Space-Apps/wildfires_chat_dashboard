# NASA SpaceX Hackathon

## Team I.O - Florianopolis

TODO: Add project description

## Setup

Add the supabase credentials for the project that contains the database with recent fire data from (FIRMS)[https://firms.modaps.eosdis.nasa.gov/] to the .env file.

```
SUPABASE_ANON_KEY=
SUPABASE_URL=
```

The supabase postgres should follow this data structure

```SQL
-- Schema
CREATE TABLE observations (
    id SERIAL PRIMARY KEY,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    brightness DOUBLE PRECISION NOT NULL,
    scan DOUBLE PRECISION,
    track DOUBLE PRECISION,
    acq_date DATE NOT NULL,
    acq_time TIME NOT NULL,
    satellite VARCHAR(10) NOT NULL,
    confidence INTEGER,
    version VARCHAR(20),
    bright_t31 DOUBLE PRECISION,
    frp DOUBLE PRECISION,
    daynight VARCHAR(1),
    location GEOGRAPHY(POINT, 4326) -- PostGIS geography type for storing latitude/longitude as a point
);

```

### To run

```bash
npm i

npm start
```
