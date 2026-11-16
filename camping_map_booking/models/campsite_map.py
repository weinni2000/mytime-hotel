from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from odoo import Command, api, fields, models


class CampsiteMap(models.Model):
    _name = "campsite.map"
    _description = "Campsite Map"
    _order = "name, id"

    name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    image = fields.Binary(required=True, attachment=True)
    show_legend = fields.Boolean(
        default=True,
        help="Display a color legend on the map.",
    )
    legend_position = fields.Selection(
        [
            ("top_left", "Top left"),
            ("top_right", "Top right"),
            ("bottom_left", "Bottom left"),
            ("bottom_right", "Bottom right"),
        ],
        default="bottom_left",
        required=True,
        help="Where the color legend sits on the map.",
    )
    label_scale = fields.Float(
        default=1.0,
        help="Zoom factor for the zone labels shown on the map preview.",
    )
    zone_ids = fields.One2many("camping.map.zone", "map_id", string="Zones")
    preview_data = fields.Json(compute="_compute_preview_data")
    refresh = fields.Boolean(help="Toggle to force the tested availability to recompute.")
    availability_check_start = fields.Date(
        string="Check-in",
        default=fields.Date.context_today,
    )
    availability_check_end = fields.Date(
        string="Check-out",
        default=lambda self: fields.Date.context_today(self) + timedelta(days=1),
    )
    vehicle_type_id = fields.Many2one(
        "camping.vehicle.type",
        string="Check Vehicle",
        help="Vehicle type to check pitch suitability for. Leave empty to ignore vehicle suitability.",
    )
    test_preview_data = fields.Json(compute="_compute_test_preview_data")

    def action_generate_zones_from_resources(self):
        self.ensure_one()
        Zone = self.env["camping.map.zone"]
        assigned_resource_ids = Zone.search([]).resource_ids.ids
        resources = self.env["resource.resource"].search(
            [("id", "not in", assigned_resource_ids), ("resource_type", "=", "material")]
        )
        Zone.create(
            [
                {
                    "name": resource.name,
                    "map_id": self.id,
                    "resource_ids": [Command.set(resource.ids)],
                }
                for resource in resources
            ]
        )

    def _legend_position(self):
        """Configured legend position, or 'none' when the legend is hidden."""
        self.ensure_one()
        return self.legend_position if self.show_legend else "none"

    def _get_availability_legend(self):
        """Legend items [{label, color}] for the availability states."""
        self.ensure_one()
        return [
            {"label": colors["label"], "color": colors["fill"]}
            for colors in self.env["camping.map.state"]._get_frontend_map().values()
            if colors.get("label")
        ]

    def _image_url(self):
        self.ensure_one()
        if not isinstance(self.id, int):
            # Unsaved record: nothing has been uploaded to preview yet.
            return False
        # For a saved map (image is required), always serve the stored image from
        # the DB. Don't gate on `self.image`: during an onchange (e.g. switching
        # the checked vehicle) the web client omits the binary, which would
        # otherwise make this flip to a blank preview.
        url = f"/web/image/campsite.map/{self.id}/image"
        # Cache-buster so a newly uploaded image isn't served stale by the browser.
        return f"{url}?unique={self.write_date.isoformat()}" if self.write_date else url

    def _to_utc_naive(self, date):
        """User-local date, as the naive UTC datetime Odoo stores.

        The check dates are entered (and defaulted) in the user's timezone,
        while planning slots are stored in UTC: combining the date with
        midnight directly would shift the stay window by the user's UTC
        offset and count bookings of the neighbouring night.
        """
        self.ensure_one()
        if not date:
            return False
        tz = ZoneInfo(self.env.user.tz or "UTC")
        local_midnight = datetime.combine(date, time.min, tzinfo=tz)
        return local_midnight.astimezone(timezone.utc).replace(tzinfo=None)

    @api.depends(
        "image",
        "zone_ids.name",
        "zone_ids.code",
        "zone_ids.symbol",
        "zone_ids.points",
        "show_legend",
        "legend_position",
    )
    def _compute_preview_data(self):
        for record in self:
            map_id = record.id if isinstance(record.id, int) else False
            # Only this map's own zones — not every zone globally, otherwise
            # zones belonging to another map (or orphan/demo zones with points)
            # would render on top of this map's preview.
            zones = record.zone_ids
            shapes = []
            for zone in zones:
                shapes += zone._get_map_shapes()
            record.preview_data = {
                "map_id": map_id,
                "image_url": record._image_url(),
                "zones": [
                    {
                        "id": zone.id,
                        "name": zone.name,
                        "code": zone.code,
                        "symbol": zone.symbol,
                        "map_id": zone.map_id.id,
                    }
                    for zone in zones
                ],
                "shapes": shapes,
                "legend": record._get_availability_legend(),
                "legend_position": record._legend_position(),
            }

    @api.depends(
        "image",
        "zone_ids",
        "zone_ids.points",
        "zone_ids.resource_ids",
        "zone_ids.resource_ids.role_ids.allowed_vehicle_type_ids",
        "availability_check_start",
        "availability_check_end",
        "vehicle_type_id",
        "refresh",
        "show_legend",
        "legend_position",
    )
    def _compute_test_preview_data(self):
        # One query for every state's colors, shared by all the zones below.
        colors_by_code = self.env["camping.map.state"]._get_colors_map()
        for record in self:
            # Color every pitch on this map from the map's test parameters
            # (checked vehicle + stay range), reusing the per-zone availability logic.
            # Nights only: a night spans [date 00:00, next date 00:00), so the stay
            # covers [check-in 00:00, check-out 00:00) and the check-out day is not
            # itself a booked night.
            start_dt = record._to_utc_naive(record.availability_check_start)
            end_dt = record._to_utc_naive(record.availability_check_end)
            shapes = []
            for zone in record.zone_ids:
                state = (
                    zone._get_availability_state(record.vehicle_type_id, start_dt, end_dt) if start_dt else False
                )
                shapes += zone._get_map_shapes(state, colors_by_code.get(state))
            record.test_preview_data = {
                "map_id": record.id if isinstance(record.id, int) else False,
                "image_url": record._image_url(),
                "shapes": shapes,
                "legend": record._get_availability_legend(),
                "legend_position": record._legend_position(),
            }
