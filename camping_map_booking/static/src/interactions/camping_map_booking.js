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
        const products = JSON.parse(this.el.dataset.products || "[]");
        const defaultProductId = this.el.dataset.defaultProductId
            ? Number(this.el.dataset.defaultProductId)
            : false;
        const props = {
            zones,
            mapImageUrl,
            selectedItemIds,
            legend,
            legendPosition,
            products,
            defaultProductId,
            startDateValue: this.el.dataset.startDate || "",
            endDateValue: this.el.dataset.endDate || "",
        };
        // Start/End are shared, order-wide values (see _apply_pitch_filters):
        // editing either one, from any row, resubmits the plain GET filters
        // form to reload the page with the new value. Vehicle type is set
        // once on the Camping step and isn't editable from here anymore, so
        // its hidden input is just carried along unchanged on submit.
        props.onFiltersChange = (startDate, endDate) => {
            const form = document.getElementById(this.el.dataset.filtersFormId);
            const startDateInput = document.getElementById(
                this.el.dataset.startDateInputId
            );
            const endDateInput = document.getElementById(
                this.el.dataset.endDateInputId
            );
            if (!form) {
                return;
            }
            if (startDateInput) {
                startDateInput.value = startDate;
            }
            if (endDateInput) {
                endDateInput.value = endDate;
            }
            form.submit();
        };
        if (selectable) {
            props.onSelectItem = (items) => {
                const input = document.getElementById(this.el.dataset.inputId);
                // A selector (not a single id) since the page has both a top
                // and a bottom Continue button sharing this class.
                const buttons = document.querySelectorAll(
                    this.el.dataset.buttonSelector
                );
                if (input) {
                    input.value = items.map((item) => item.id).join(",");
                }
                buttons.forEach((button) => {
                    button.disabled = items.length === 0;
                });
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
