import {registry} from "@web/core/registry";
import {Interaction} from "@web/public/interaction";
import {ResourceMap} from "@ressource_map/components/resource_map/resource_map";

export class CampingMapBooking extends Interaction {
    static selector = ".o_camping_map_booking";

    setup() {
        const zones = JSON.parse(this.el.dataset.zones || "[]");
        const mapImageUrl = this.el.dataset.mapImage;
        const mountEl = this.el.querySelector(".o_camping_map_mount");
        const selectable = this.el.dataset.selectable === "true";
        const selectedItemIds = (this.el.dataset.selectedItems || "")
            .split(",")
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0);
        const legend = JSON.parse(this.el.dataset.legend || "[]");
        const legendPosition = this.el.dataset.legendPosition || "none";
        const props = {zones, mapImageUrl, selectedItemIds, legend, legendPosition};
        if (selectable) {
            props.onSelectItem = (items) => {
                const input = document.getElementById(this.el.dataset.inputId);
                const button = document.getElementById(this.el.dataset.buttonId);
                if (input) {
                    input.value = items.map((item) => item.id).join(",");
                }
                if (button) {
                    button.disabled = items.length === 0;
                }
            };
        }
        this.mountComponent(mountEl, ResourceMap, props);

        if (this.el.dataset.noAvailability === "true") {
            this._showNoAvailabilityModal();
        }
    }

    _showNoAvailabilityModal() {
        const modalId = this.el.dataset.modalId;
        const modalEl = modalId && document.getElementById(modalId);
        if (modalEl && window.Modal) {
            window.Modal.getOrCreateInstance(modalEl).show();
        }
    }
}

registry
    .category("public.interactions")
    .add("camping_map_booking.camping_map_booking", CampingMapBooking);
