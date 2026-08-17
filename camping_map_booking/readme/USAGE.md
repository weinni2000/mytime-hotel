1. Go to **Camping Maps** and open (or create) a `campsite.map` record.
2. Upload the site image and use **Create Zone for Each Resource** on the
   "Zones" tab to generate one zone per material `resource.resource`
   (existing pitches/bungalows), or add zones by hand.
3. For each zone, draw its outline by setting `points` to the polygon's
   pixel coordinates on the image (`"x1,y1 x2,y2 x3,y3 ..."`), and pick an
   optional icon (tent, water, electricity, ...).
4. Check the result on the "Map Preview" tab. Use the "Testing" tab to pick
   a stay and a vehicle type and confirm the free/occupied/not-suitable
   colors match what's actually booked.
5. Restrict which vehicles a pitch suits by setting **Allowed Vehicles** on
   its `planning.role` (leave empty to allow any vehicle).
6. Publish the pitches as rentable products; the map then appears
   automatically during pitch selection at website checkout.

Availability labels and colors are themselves editable records
(`camping.map.state`), and vehicle types (`camping.vehicle.type`) can be
extended to match your fleet.
