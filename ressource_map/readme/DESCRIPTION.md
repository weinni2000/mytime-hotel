Reusable OWL component that draws clickable zones on top of a map image.

The component renders an image with an SVG overlay above it, so zones stay
aligned with the picture whatever size it is displayed at. Zones are polygons
given as an image coordinate list; each one can expose products (pitches,
seats, ...) that the user picks directly on the map.

It is used both in the backend (map editor, where zones can be drawn and their
corners edited) and on the website (pitch selection for a booking), which is
why the same assets are loaded in `web.assets_backend` and
`web.assets_frontend`.

The component is presentation only: every action (adding a zone, saving
corners, selecting a product) is delegated to callbacks given as props, so the
consumer decides what to store.
