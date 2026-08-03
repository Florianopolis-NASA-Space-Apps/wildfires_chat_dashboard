import { render, screen, waitFor } from '@testing-library/react';
import mapboxgl from 'mapbox-gl/dist/mapbox-gl-csp';
import { MBox } from './MBox';

jest.mock('mapbox-gl/dist/mapbox-gl-csp', () => ({
  __esModule: true,
  default: {
    Map: jest.fn(),
  },
}));

describe('MBox', () => {
  it('shows a configuration error without initializing Mapbox when the token is missing', async () => {
    const setIsLoading = jest.fn();

    render(
      <MBox
        isLargeScreen
        setIsLoading={setIsLoading}
        focusCoords={null}
        marker={null}
        numberOfDays="1"
        startDate="2026-08-03"
      />
    );

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /set react_app_mapbox_key/i
    );
    expect(mapboxgl.Map).not.toHaveBeenCalled();
    await waitFor(() => expect(setIsLoading).toHaveBeenCalledWith(false));
  });
});
