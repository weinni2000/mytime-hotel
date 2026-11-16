import {Component, onWillStart, useState} from "@odoo/owl";
import {ResourceMap} from "@ressource_map/components/resource_map/resource_map";
import {_t} from "@web/core/l10n/translation";
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";

export class CampingMapPreviewAction extends Component {
    static template = "camping_map_booking.CampingMapPreviewAction";
    static components = {ResourceMap};
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            zones: [],
            mapImageUrl: "",
            emptyMessage: _t(
                "No active campsite map yet. Create one in Camping Maps first."
            ),
        });
        onWillStart(async () => {
            // The action opens from a zone: preview its zones on the image of
            // the first active map, rather than on a bundled placeholder that
            // doesn't ship with the addon.
            const [map_data] = await this.orm.searchRead(
                "campsite.map",
                [["active", "=", true]],
                ["id", "write_date"],
                {limit: 1, order: "id"}
            );
            if (!map_data) {
                return;
            }
            const unique = encodeURIComponent(map_data.write_date || "");
            const image_url = `/web/image/campsite.map/${map_data.id}/image`;
            this.state.mapImageUrl = `${image_url}?unique=${unique}`;
            const zones = await this.orm.searchRead(
                "camping.map.zone",
                [
                    ["map_id", "=", map_data.id],
                    ["points", "!=", false],
                ],
                ["name", "code", "symbol", "points"]
            );
            this.state.zones = zones.map((zone) => ({
                id: `zone-${zone.id}`,
                zone_id: zone.id,
                name: zone.name,
                code: zone.code,
                symbol: zone.symbol,
                points: zone.points,
                // The map panel reads `products` when a zone is clicked.
                products: [],
                state: false,
            }));
        });
    }
}

registry
    .category("actions")
    .add("camping_map_booking.map_preview_action", CampingMapPreviewAction);
