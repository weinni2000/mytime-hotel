import {patch} from "@web/core/utils/patch";
import {Domain} from "@web/core/domain";
import {_t} from "@web/core/l10n/translation";
import {GanttModel} from "@web_gantt/gantt_model";
import {GanttRenderer} from "@web_gantt/gantt_renderer";
import {DomainSelectorDialog} from "@web/core/domain_selector_dialog/domain_selector_dialog";
import {SaveGanttFilterDialog} from "./save_filter_dialog";

const SAVED_FILTER_MODEL = "planning.gantt.resource.filter";

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
const DEFAULT_RESOURCE_FILTER_DOMAIN = '[("resource_type", "=", "material")]';

// The toggle state lives on the model rather than the renderer so it survives
// across re-renders. false = planning mode (all bookable rows), true =
// watching mode. Saved resource filters live here too, for the same reason.
patch(GanttModel.prototype, {
    setup(params, services) {
        super.setup(params, services);
        this.watchingMode = false;
        this.filterActive = false;
        this.filterDomain = this.isPlanningResourceGantt
            ? DEFAULT_RESOURCE_FILTER_DOMAIN
            : "[]";
        // Resource ids resolved from the filter domain on the last fetch. Used by
        // `_getDomain` to also drop rows of non-matching resources that DO have
        // shifts (filter_resource_ids alone only controls empty rows).
        this.filterResourceIds = null;
        this.savedFilters = [];
    },

    get ganttViewId() {
        return this.env.config.viewId;
    },

    get isPlanningResourceGantt() {
        return (
            this.metaData.resModel === "planning.slot" &&
            "resource_id" in this.metaData.fields
        );
    },

    get filterResModel() {
        return this.isPlanningResourceGantt
            ? "resource.resource"
            : this.metaData.resModel;
    },

    /**
     * @override
     * On the first load of a fresh view instance, apply the user's default
     * saved filter (if any) before the initial fetch, so the Gantt opens
     * already filtered instead of flashing unfiltered data first.
     */
    async load(searchParams) {
        if (!this._defaultFilterLoaded) {
            this._defaultFilterLoaded = true;
            await this.loadSavedFilters();
            const defaultFilter = this.savedFilters.find((f) => f.is_default);
            if (defaultFilter) {
                this.filterDomain = defaultFilter.domain;
                this.filterActive = true;
            }
        }
        return super.load(searchParams);
    },

    async _fetchData(metaData, additionalContext) {
        const extraContext = {...additionalContext};
        if (this.watchingMode) {
            for (const key of PLANNING_EXPAND_KEYS) {
                extraContext[key] = false;
            }
        }
        if (this.filterActive && this.isPlanningResourceGantt) {
            // Resolve the (editable) resource domain to ids. Two things use it:
            //  - `filter_resource_ids`: Planning injects empty rows for these
            //    resources, so matching resources stay visible even with no shift.
            //  - `_getDomain` below: restricts the fetched records to these
            //    resources, so non-matching resources that DO have shifts are
            //    dropped instead of appearing anyway.
            const resourceIds = await this.orm.search(
                this.filterResModel,
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
        if (
            this.filterActive &&
            this.isPlanningResourceGantt &&
            this.filterResourceIds
        ) {
            return Domain.and([
                domain,
                [["resource_id", "in", this.filterResourceIds]],
            ]).toList();
        }
        if (this.filterActive && !this.isPlanningResourceGantt) {
            return Domain.and([
                domain,
                new Domain(this.filterDomain).toList(),
            ]).toList();
        }
        return domain;
    },

    // Plain string properties, not getters: the Owl template extractor that
    // feeds `i18n export` only picks up static text/attributes, never a
    // runtime JS expression like `cond ? 'Foo' : 'Bar'` embedded in a
    // t-esc/t-att. Routing these through `_t()` calls in a real .js file
    // makes them show up in the .pot like any other translatable string.
    get watchingModeLabel() {
        return this.watchingMode ? _t("Watching") : _t("Planning");
    },

    get watchingModeTitle() {
        return this.watchingMode
            ? _t("Switch to planning mode (show all bookable resources)")
            : _t("Switch to watching mode (show only booked rows)");
    },

    get filterTitle() {
        return this.filterActive
            ? _t("Remove the Gantt filter")
            : _t("Filter the displayed records");
    },

    defaultFilterTitle(savedFilter) {
        return savedFilter.is_default ? _t("Unset as default") : _t("Set as default");
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

    async loadSavedFilters() {
        const viewDomain = this.isPlanningResourceGantt
            ? ["|", ["view_id", "=", this.ganttViewId], ["view_id", "=", false]]
            : [["view_id", "=", this.ganttViewId]];
        this.savedFilters = await this.orm.searchRead(SAVED_FILTER_MODEL, viewDomain, [
            "name",
            "domain",
            "is_default",
        ]);
        this.notify();
    },

    applySavedFilter(savedFilter) {
        this.setFilterDomain(savedFilter.domain);
    },

    async deleteSavedFilter(savedFilter) {
        await this.orm.unlink(SAVED_FILTER_MODEL, [savedFilter.id]);
        await this.loadSavedFilters();
    },

    async toggleDefaultFilter(savedFilter) {
        await this.orm.write(SAVED_FILTER_MODEL, [savedFilter.id], {
            is_default: !savedFilter.is_default,
        });
        await this.loadSavedFilters();
    },

    async saveCurrentFilterAs(name, isDefault) {
        await this.orm.create(SAVED_FILTER_MODEL, [
            {
                name,
                domain: this.filterDomain,
                is_default: isDefault,
                view_id: this.ganttViewId,
            },
        ]);
        await this.loadSavedFilters();
    },
});

// Opens the domain selector prefilled with the current filter domain.
function openFilterDomainDialog(component) {
    const model = component.model;
    component.env.services.dialog.add(DomainSelectorDialog, {
        resModel: model.filterResModel,
        domain: model.filterDomain,
        isDebugMode: Boolean(component.env.debug),
        onConfirm: (domain) => model.setFilterDomain(domain),
    });
}

// Opens the "save current filter" name prompt.
function openSaveFilterDialog(component) {
    component.env.services.dialog.add(SaveGanttFilterDialog, {
        onSave: (name, isDefault) =>
            component.model.saveCurrentFilterAs(name, isDefault),
    });
}

patch(GanttRenderer.prototype, {
    editFilterDomain() {
        openFilterDomainDialog(this);
    },

    saveCurrentFilter() {
        openSaveFilterDialog(this);
    },
});
