import {patch} from "@web/core/utils/patch";
import {Domain} from "@web/core/domain";
import {PlanningGanttModel} from "@planning/views/planning_gantt/planning_gantt_model";
import {PlanningGanttController} from "@planning/views/planning_gantt/planning_gantt_controller";
import {PlanningGanttRenderer} from "@planning/views/planning_gantt/planning_gantt_renderer";
import {DomainSelectorDialog} from "@web/core/domain_selector_dialog/domain_selector_dialog";

// Context keys that make Planning expand every resource/role/employee even when
// they have no shift. Forcing them to false in "watching" mode collapses the
// Gantt down to rows that actually contain a booking.
const PLANNING_EXPAND_KEYS = [
    "planning_expand_resource",
    "planning_expand_employee",
    "planning_expand_role",
    "planning_expand_sale_line_id",
];

// Default resource domain used by the filter button. Editable in the UI through
// the domain selector dialog.
const DEFAULT_FILTER_DOMAIN = '[("resource_type", "=", "material")]';

// The toggle state lives on the model so that every consumer (controller
// buttons and the renderer header) reads/writes the same value and stays in
// sync. false = planning mode (all bookable rows), true = watching mode.
patch(PlanningGanttModel.prototype, {
    setup() {
        super.setup(...arguments);
        this.watchingMode = false;
        this.filterActive = false;
        this.filterDomain = DEFAULT_FILTER_DOMAIN;
        // Resource ids resolved from the filter domain on the last fetch. Used by
        // `_getDomain` to also drop rows of non-matching resources that DO have
        // shifts (filter_resource_ids alone only controls empty rows).
        this.filterResourceIds = null;
    },

    async _fetchData(metaData, additionalContext) {
        const extraContext = {...additionalContext};
        if (this.watchingMode) {
            for (const key of PLANNING_EXPAND_KEYS) {
                extraContext[key] = false;
            }
        }
        if (this.filterActive) {
            // Resolve the (editable) resource domain to ids. Two things use it:
            //  - `filter_resource_ids`: Planning injects empty rows for these
            //    resources, so matching resources stay visible even with no shift.
            //  - `_getDomain` below: restricts the fetched records to these
            //    resources, so non-matching resources that DO have shifts are
            //    dropped instead of appearing anyway.
            const resourceIds = await this.orm.search(
                "resource.resource",
                new Domain(this.filterDomain).toList()
            );
            this.filterResourceIds = resourceIds;
            extraContext.filter_resource_ids = resourceIds;
        } else {
            this.filterResourceIds = null;
        }
        return super._fetchData(metaData, extraContext);
    },

    /**
     * @override
     * When the filter is active, only keep records whose resource matches the
     * filter domain. Without this, a resource excluded by the filter still shows
     * up as a row as soon as it has at least one shift in the period.
     */
    _getDomain(metaData) {
        const domain = super._getDomain(metaData);
        if (this.filterActive && this.filterResourceIds) {
            return Domain.and([
                domain,
                [["resource_id", "in", this.filterResourceIds]],
            ]).toList();
        }
        return domain;
    },

    toggleWatchingMode() {
        this.watchingMode = !this.watchingMode;
        this.fetchData();
    },

    toggleFilter() {
        this.filterActive = !this.filterActive;
        this.fetchData();
    },

    setFilterDomain(domain) {
        this.filterDomain = domain;
        this.filterActive = true;
        this.fetchData();
    },
});

// Opens the domain selector prefilled with the current filter domain. Shared by
// the controller (button next to Publish) and the renderer (grid header).
function openFilterDomainDialog(component) {
    const model = component.model;
    component.env.services.dialog.add(DomainSelectorDialog, {
        resModel: "resource.resource",
        domain: model.filterDomain,
        isDebugMode: Boolean(component.env.debug),
        onConfirm: (domain) => model.setFilterDomain(domain),
    });
}

patch(PlanningGanttController.prototype, {
    editFilterDomain() {
        openFilterDomainDialog(this);
    },
});

patch(PlanningGanttRenderer.prototype, {
    editFilterDomain() {
        openFilterDomainDialog(this);
    },
});
