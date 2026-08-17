Turns a plain campsite photo or site plan into an interactive booking map.

Draw clickable zones over your own map image, link each one to the pitches
(`product.template` / `resource.resource` records) it contains, and the
zones color themselves live: **free**, **occupied**, or **not suitable**
for the visitor's vehicle - computed straight from existing `planning.slot`
bookings for the dates and vehicle type they're checking.

The same map component powers two places:

- **Website checkout** - shown during pitch selection in the booking flow
  (`website_sale_renting`), so guests pick a pitch by clicking it on the map
  instead of scrolling a list.
- **Backend preview** - the `campsite.map` record's "Map Preview" and
  "Testing" tabs let staff calibrate zones and simulate a stay/vehicle to
  see exactly what guests will see before it goes live.
