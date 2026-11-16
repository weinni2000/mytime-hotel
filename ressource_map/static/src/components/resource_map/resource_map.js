import {
    Component,
    onMounted,
    onRendered,
    onWillUnmount,
    useRef,
    useState,
} from "@odoo/owl";

// --- Polygon geometry helpers for the proportional slice fill -------------

function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

// Sutherland-Hodgman clip against a vertical line. keepLeft keeps x <= cut,
// otherwise x >= cut. A half-plane is convex, so this is exact for concave
// polygons too.
function clipVertical(points, cut, keepLeft) {
    const out = [];
    const inside = (point) => (keepLeft ? point[0] <= cut : point[0] >= cut);
    for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const next = points[(i + 1) % points.length];
        const curIn = inside(cur);
        const nextIn = inside(next);
        if (curIn) {
            out.push(cur);
        }
        if (curIn !== nextIn && next[0] !== cur[0]) {
            const t = (cut - cur[0]) / (next[0] - cur[0]);
            out.push([cut, cur[1] + t * (next[1] - cur[1])]);
        }
    }
    return out;
}

// Binary-search the x where the area left of it equals targetArea.
function cutXForArea(points, minX, maxX, targetArea) {
    let lo = minX;
    let hi = maxX;
    for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        if (polygonArea(clipVertical(points, mid, true)) < targetArea) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

export class ResourceMap extends Component {
    static template = "ressource_map.ResourceMap";
    static props = {
        zones: Array,
        mapImageUrl: String,
        editable: {type: Boolean, optional: true},
        draftPoints: {type: String, optional: true},
        onMapClick: {type: Function, optional: true},
        onRemoveZone: {type: Function, optional: true},
        onCloseDraft: {type: Function, optional: true},
        onCornersChanged: {type: Function, optional: true},
        selectedItemIds: {type: Array, optional: true},
        onSelectItem: {type: Function, optional: true},
        legend: {type: Array, optional: true},
        legendPosition: {type: String, optional: true},
        labelScale: {type: Number, optional: true},
        products: {type: Array, optional: true},
        defaultProductId: {type: [Number, Boolean], optional: true},
        startDateValue: {type: String, optional: true},
        endDateValue: {type: String, optional: true},
        onFiltersChange: {type: Function, optional: true},
    };

    setup() {
        this.mapImageRef = useRef("mapImage");
        this.pitchRowsRef = useRef("pitchRows");
        this.updateAvailableHeight = () => {
            const image = this.mapImageRef.el;
            if (!image) {
                return;
            }
            // Target close to the full window height, minus whatever the
            // Start/End + product rows above the map are currently taking up
            // (that block grows/shrinks - e.g. the "no pitch available"
            // warning appearing - so this has to be measured on every
            // render, not just once on mount, or the map visibly jumps
            // whenever that content changes height).
            const rowsEl = this.pitchRowsRef.el;
            const rowsHeight = rowsEl ? rowsEl.getBoundingClientRect().height : 0;
            const nextHeight = Math.round(
                Math.max(120, window.innerHeight - 48 - rowsHeight)
            );
            if (nextHeight !== this.state.availableHeight) {
                this.state.availableHeight = nextHeight;
            }
            // Drives the legend size so it stays proportional to the map.
            const nextWidth = Math.round(image.getBoundingClientRect().width);
            if (nextWidth !== this.state.mapWidth) {
                this.state.mapWidth = nextWidth;
            }
        };
        // Seeds the first pending row: the last-picked pitch's product (see
        // the controller's default_pitch_product_id) or the first available
        // one, so a direct map click works immediately without touching the
        // Product select first.
        const initialProductId =
            this.props.defaultProductId ||
            (this.props.products && this.props.products.length
                ? this.props.products[0].id
                : false);
        this.state = useState({
            naturalWidth: 0,
            naturalHeight: 0,
            availableHeight: 0,
            mapWidth: 0,
            hoveredZoneId: null,
            selectedZoneId: null,
            // One or more products the customer is picking pitches for ("Add
            // another product" opens a second one). Exactly one row is ever
            // active - via its radio, its Product select, or its own "+1"/
            // "-1" - and that's the one a direct map click applies to, since
            // a zone click doesn't name a row the way those controls do.
            pendingProducts: [initialProductId],
            activePendingIndex: 0,
            // Multiple pitches can be selected at once (one per free resource).
            selectedItemIds: this.props.selectedItemIds
                ? [...this.props.selectedItemIds]
                : [],
            // Corner-editing an existing zone (editor only).
            editZoneId: null,
            editPoints: [],
            draggingCorner: null,
        });
        onMounted(() => {
            this.updateAvailableHeight();
            window.addEventListener("resize", this.updateAvailableHeight);
        });
        // Re-measure after every render, not just on mount/resize, so the
        // map's height stays in sync as the rows above it grow or shrink.
        // Guarded by the equality checks above against re-triggering itself.
        onRendered(() => this.updateAvailableHeight());
        onWillUnmount(() =>
            window.removeEventListener("resize", this.updateAvailableHeight)
        );
    }

    get isDrafting() {
        return Boolean(this.props.draftPoints);
    }

    get draftPointList() {
        return this.props.draftPoints
            ? this.props.draftPoints
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((point) => point.split(",").map(Number))
            : [];
    }

    get draftStartPoint() {
        // The first point of the polygon being drawn — shown as a marker the
        // user can click to close and save the zone.
        return this.draftPointList[0];
    }

    onCloseDraftClick() {
        if (this.props.onCloseDraft) {
            this.props.onCloseDraft();
        }
    }

    get showLegend() {
        return Boolean(
            this.props.legend &&
                this.props.legend.length &&
                this.props.legendPosition &&
                this.props.legendPosition !== "none"
        );
    }

    get legendClass() {
        return `o_camping_map_legend o_camping_map_legend_${this.props.legendPosition}`;
    }

    get legendStyle() {
        // Scale the legend font with the rendered map width (everything else in
        // the legend is sized in em), so it stays proportional and never
        // dominates a small map. Clamped to keep it readable.
        const width = this.state.mapWidth;
        if (!width) {
            return undefined;
        }
        const fontPx = Math.max(9, Math.min(14, width * 0.03));
        return `font-size: ${fontPx}px`;
    }

    onProductChange(ev, pendingIndex) {
        this.state.pendingProducts[pendingIndex] = Number(ev.target.value);
        this.state.activePendingIndex = pendingIndex;
    }

    // Each row is its own distinct product (its Amount is a count of that
    // product's pitches, so two rows sharing a product would just show the
    // same number twice) — this is the first product not already open in
    // another row.
    onAddPosition() {
        const usedProductIds = new Set(this.state.pendingProducts);
        const nextProduct = (this.props.products || []).find(
            (product) => !usedProductIds.has(product.id)
        );
        if (!nextProduct) {
            return;
        }
        this.state.pendingProducts.push(nextProduct.id);
        this.state.activePendingIndex = this.state.pendingProducts.length - 1;
    }

    get canAddPosition() {
        return this.state.pendingProducts.length < (this.props.products || []).length;
    }

    // The products selectable in one row's Product select: every product
    // except whichever other rows already have open (see onAddPosition).
    availableProductsFor(pendingIndex) {
        const usedElsewhere = new Set(
            this.state.pendingProducts.filter((_, i) => i !== pendingIndex)
        );
        return (this.props.products || []).filter(
            (product) => !usedElsewhere.has(product.id)
        );
    }

    // Closes a row again — always keeps at least one around. Also releases
    // any pitches already picked for that product, since a closed row can no
    // longer account for them.
    onRemovePosition(pendingIndex) {
        if (this.state.pendingProducts.length <= 1) {
            return;
        }
        const productId = this.state.pendingProducts[pendingIndex];
        this.selectedItems
            .filter((item) => item.product_id === productId)
            .forEach((item) => {
                const index = this.state.selectedItemIds.indexOf(item.id);
                if (index !== -1) {
                    this.state.selectedItemIds.splice(index, 1);
                }
            });
        this.state.pendingProducts.splice(pendingIndex, 1);
        if (this.state.activePendingIndex >= this.state.pendingProducts.length) {
            this.state.activePendingIndex = this.state.pendingProducts.length - 1;
        }
        this.notifySelection();
    }

    onSelectRow(pendingIndex) {
        this.state.activePendingIndex = pendingIndex;
    }

    // The row a direct map click applies to (a zone click doesn't name a row
    // the way a specific row's own "+1" does) — the one radio-selected, or
    // last touched via its Product select or "+1"/"-1".
    get activeProductId() {
        return this.state.pendingProducts[this.state.activePendingIndex];
    }

    // How many pitches of this product are currently picked — shown as each
    // row's read-only Amount, and what "-1" removes the most recent of.
    amountFor(productId) {
        return this.selectedItems.filter((item) => item.product_id === productId)
            .length;
    }

    // "-1": drop the most recently added pitch of this product.
    onRemovePitch(productId) {
        const items = this.selectedItems.filter(
            (item) => item.product_id === productId
        );
        const last = items[items.length - 1];
        if (last) {
            this.removeItem(last.id);
        }
    }

    notifyFiltersChange(startDate, endDate) {
        if (this.props.onFiltersChange) {
            this.props.onFiltersChange(startDate, endDate);
        }
    }

    onStartDateChange(ev) {
        const newStart = ev.target.value;
        if (!newStart) {
            // The field was cleared - nothing valid to submit yet.
            return;
        }
        // Shift End by the same number of days Start just moved, so the stay
        // length is preserved - the server only accepts the change when
        // end > start (_apply_pitch_filters), so dragging Start past the old
        // End without doing this makes the edit silently not stick.
        let newEnd = this.props.endDateValue;
        if (this.props.startDateValue && this.props.endDateValue) {
            const deltaDays = Math.round(
                (new Date(`${newStart}T00:00:00`) -
                    new Date(`${this.props.startDateValue}T00:00:00`)) /
                    86400000
            );
            newEnd = this._shiftDate(this.props.endDateValue, deltaDays);
        }
        this.notifyFiltersChange(newStart, this._ensureAfter(newEnd, newStart));
    }

    onEndDateChange(ev) {
        const newEnd = ev.target.value;
        if (!newEnd || !this.props.startDateValue) {
            return;
        }
        this.notifyFiltersChange(
            this.props.startDateValue,
            this._ensureAfter(newEnd, this.props.startDateValue)
        );
    }

    // A valid end date for the given start: end itself when it's genuinely
    // after start, otherwise start + 1 day. Without this, a stay that was
    // already degenerate (start == end, e.g. from before this safeguard
    // existed) stays stuck forever - shifting both dates by the same delta
    // preserves a zero-length gap just as much as a real one.
    _ensureAfter(end, start) {
        if (
            end &&
            start &&
            new Date(`${end}T00:00:00`) > new Date(`${start}T00:00:00`)
        ) {
            return end;
        }
        return this._shiftDate(start, 1);
    }

    _shiftDate(dateStr, deltaDays) {
        const date = new Date(`${dateStr}T00:00:00`);
        date.setDate(date.getDate() + deltaDays);
        return date.toISOString().slice(0, 10);
    }

    // The next still-free pitch matching a given product, wherever it is on
    // the map — shared by "+1" and the "nothing available" warning below.
    _findNextMatchingPitch(productId) {
        if (!productId) {
            return null;
        }
        for (const zone of this.props.zones) {
            const next = (zone.products || []).find(
                (product) =>
                    product.selectable &&
                    product.product_id === productId &&
                    !this.state.selectedItemIds.includes(product.id)
            );
            if (next) {
                return next;
            }
        }
        return null;
    }

    // "+1": auto-assign the next selectable pitch matching that pending
    // row's product, wherever it is on the map — an alternative to clicking
    // a specific zone. The row stays open afterwards, so it can be used
    // again for another of the same product.
    onAddPitch(pendingIndex) {
        const next = this._findNextMatchingPitch(
            this.state.pendingProducts[pendingIndex]
        );
        if (next) {
            this.state.selectedItemIds.push(next.id);
            this.notifySelection();
        }
    }

    // False when a product has no free pitch left anywhere on the map —
    // every matching zone is greyed out in that case, so this drives a
    // clear message instead of leaving the customer guessing why nothing
    // clicks (and disables that row's own "+1").
    hasAvailablePitchFor(productId) {
        return Boolean(this._findNextMatchingPitch(productId));
    }

    productName(productId) {
        const product = (this.props.products || []).find(
            (item) => item.id === productId
        );
        return product ? product.name : "";
    }

    // One compact row per pitch already picked, plus one open row per pending
    // product ("Add another product" adds more of these). Picked rows aren't
    // stored, they fall out of selectedItems.
    // One row per product being picked from — Amount (see amountFor) is the
    // count of pitches already chosen for it, not a separate line per pitch.
    get rows() {
        return this.state.pendingProducts.map((productId, pendingIndex) => ({
            productId,
            pendingIndex,
        }));
    }

    // Whether this zone has a still-selectable pitch for the active pending
    // product. Used to grey out pitches that don't match, so the customer
    // can't accidentally book the wrong product from the map.
    zoneMatchesArmedProduct(zone) {
        const productId = this.activeProductId;
        return (zone.products || []).some(
            (product) =>
                product.selectable &&
                product.product_id === productId &&
                !this.state.selectedItemIds.includes(product.id)
        );
    }

    get hoveredZone() {
        return this.props.zones.find((zone) => zone.id === this.state.hoveredZoneId);
    }

    get selectedZone() {
        return this.props.zones.find(
            (zone) => zone.zone_id === this.state.selectedZoneId
        );
    }

    onImageLoad(ev) {
        this.state.naturalWidth = ev.target.naturalWidth;
        this.state.naturalHeight = ev.target.naturalHeight;
        this.updateAvailableHeight();
    }

    onZoneHover(zoneId) {
        this.state.hoveredZoneId = zoneId;
    }

    onZoneClick(zone, ev) {
        if (this.props.editable) {
            // In the editor, click an existing zone (with an outline) to edit
            // its corners — unless a new polygon is currently being drawn.
            if (this.props.onCornersChanged && !this.isDrafting && zone.points) {
                if (ev) {
                    ev.stopPropagation();
                }
                this.startCornerEdit(zone);
            }
            return;
        }
        if (this.props.onSelectItem) {
            // Each click books the next still-free resource in the zone, so a
            // zone with several pitches can be clicked several times.
            this.selectNextInZone(zone);
            return;
        }
        this.state.selectedZoneId = zone.zone_id;
    }

    startCornerEdit(zone) {
        this.state.editZoneId = zone.zone_id;
        this.state.editPoints = this.zonePoints(zone);
        this.state.draggingCorner = null;
    }

    isEditingZone(zone) {
        return (
            zone.zone_id === this.state.editZoneId && this.state.editPoints.length > 0
        );
    }

    zonePointsString(zone) {
        if (this.isEditingZone(zone)) {
            return this.state.editPoints.map((point) => point.join(",")).join(" ");
        }
        return zone.points;
    }

    eventToImageCoords(ev) {
        const image = this.mapImageRef.el;
        if (!image) {
            return null;
        }
        const bounds = image.getBoundingClientRect();
        return [
            Math.round(
                ((ev.clientX - bounds.left) / bounds.width) * this.state.naturalWidth
            ),
            Math.round(
                ((ev.clientY - bounds.top) / bounds.height) * this.state.naturalHeight
            ),
        ];
    }

    _saveCorners() {
        if (this.props.onCornersChanged) {
            this.props.onCornersChanged(
                this.state.editZoneId,
                this.state.editPoints.map((point) => point.join(",")).join(" ")
            );
        }
    }

    onCornerPointerDown(index, ev) {
        ev.stopPropagation();
        ev.target.setPointerCapture(ev.pointerId);
        this.state.draggingCorner = index;
        this.cornerDragged = false;
    }

    onCornerPointerMove(index, ev) {
        if (this.state.draggingCorner !== index) {
            return;
        }
        const coords = this.eventToImageCoords(ev);
        if (coords) {
            this.state.editPoints[index] = coords;
            this.cornerDragged = true;
        }
    }

    onCornerPointerUp(index, ev) {
        if (this.state.draggingCorner !== index) {
            return;
        }
        ev.target.releasePointerCapture(ev.pointerId);
        this.state.draggingCorner = null;
        // Only persist when the corner actually moved (ignore plain clicks and
        // the click pair of a double-click that removes a corner).
        if (this.cornerDragged) {
            this._saveCorners();
        }
    }

    removeCorner(index, ev) {
        if (ev) {
            ev.stopPropagation();
        }
        // A polygon needs at least three corners.
        if (this.state.editPoints.length <= 3) {
            return;
        }
        this.state.editPoints.splice(index, 1);
        this._saveCorners();
    }

    insertCorner(index, ev) {
        ev.stopPropagation();
        const coords = this.eventToImageCoords(ev);
        if (!coords) {
            return;
        }
        // Add a corner on the clicked edge, between its two endpoints.
        this.state.editPoints.splice(index + 1, 0, coords);
        this._saveCorners();
    }

    onMapClick(ev) {
        if (!this.props.editable || !this.props.onMapClick) {
            return;
        }
        const bounds = ev.currentTarget.getBoundingClientRect();
        this.props.onMapClick({
            x: Math.round(
                ((ev.clientX - bounds.left) / bounds.width) * this.state.naturalWidth
            ),
            y: Math.round(
                ((ev.clientY - bounds.top) / bounds.height) * this.state.naturalHeight
            ),
        });
    }

    zonePoints(zone) {
        return zone.points
            .split(/\s+/)
            .filter(Boolean)
            .map((point) => point.split(",").map(Number));
    }

    zoneLabelPosition(zone) {
        const points = this.zonePoints(zone);
        const total = points.reduce(
            (position, [x, y]) => ({
                x: position.x + x,
                y: position.y + y,
            }),
            {x: 0, y: 0}
        );
        return {x: total.x / points.length, y: total.y / points.length};
    }

    get labelScale() {
        return this.props.labelScale || 1;
    }

    get labelFontPx() {
        // Base font size of the marker code (see SCSS), scaled by the slider.
        return 11 * this.labelScale;
    }

    zoneMarkerBox(zone) {
        // A box centered on the zone centroid so the label stays centered as it
        // grows/shrinks with the slider.
        const center = this.zoneLabelPosition(zone);
        const width = 140 * this.labelScale;
        const height = 44 * this.labelScale;
        return {
            x: center.x - width / 2,
            y: center.y - height / 2,
            width,
            height,
        };
    }

    zoneTopRight(zone) {
        const points = this.zonePoints(zone);
        return {
            x: Math.max(...points.map(([x]) => x)),
            y: Math.min(...points.map(([, y]) => y)),
        };
    }

    onRemoveZoneClick(zone) {
        if (this.props.onRemoveZone) {
            this.props.onRemoveZone(zone);
        }
    }

    onItemClick(item) {
        if (!item.selectable || !this.props.onSelectItem) {
            return;
        }
        if (this.state.selectedItemIds.includes(item.id)) {
            this.removeItem(item.id);
        } else {
            this.state.selectedItemIds.push(item.id);
            this.notifySelection();
        }
    }

    selectNextInZone(zone) {
        // Only a pitch matching the active pending product can be picked, so
        // clicking the map never silently books the wrong accommodation.
        const productId = this.activeProductId;
        const next = zone.products.find(
            (product) =>
                product.selectable &&
                product.product_id === productId &&
                !this.state.selectedItemIds.includes(product.id)
        );
        if (next) {
            this.state.selectedItemIds.push(next.id);
            this.notifySelection();
        }
    }

    removeItem(itemId) {
        const index = this.state.selectedItemIds.indexOf(itemId);
        if (index !== -1) {
            this.state.selectedItemIds.splice(index, 1);
            this.notifySelection();
        }
    }

    notifySelection() {
        if (this.props.onSelectItem) {
            this.props.onSelectItem(this.selectedItems);
        }
    }

    get selectedItems() {
        const byId = new Map();
        for (const zone of this.props.zones) {
            for (const product of zone.products || []) {
                byId.set(product.id, product);
            }
        }
        return this.state.selectedItemIds.map((id) => byId.get(id)).filter(Boolean);
    }

    isSelectedItem(item) {
        return this.state.selectedItemIds.includes(item.id);
    }

    selectedCountForZone(zone) {
        return (zone.products || []).filter((product) =>
            this.state.selectedItemIds.includes(product.id)
        ).length;
    }

    itemClass(item) {
        const classes = ["o_camping_map_pitch", "btn", "w-100", "text-start"];
        classes.push(
            this.isSelectedItem(item) ? "btn-primary" : "btn-outline-secondary"
        );
        return classes.join(" ");
    }

    itemStateLabel(item) {
        // Label comes from the camping.map.state model (see _get_frontend_map);
        // the map below is only a fallback when no label was provided.
        return (
            item.state_label ||
            {
                free: "Free",
                occupied: "Occupied",
                not_suitable: "Not suitable",
            }[item.state] ||
            ""
        );
    }

    closePanel() {
        this.state.selectedZoneId = null;
    }

    zoneClass(zone) {
        const classes = ["o_camping_map_zone"];
        if (zone.state) {
            classes.push(`o_camping_map_zone_state_${zone.state}`);
        }
        // Colour comes from a CSS class (e.g. the Gantt palette "o_gantt_color_N")
        // resolved by the stylesheet, so the map tracks the theme. Empty pitches
        // (nothing booked) get their own muted class.
        if (zone.color_class) {
            classes.push(zone.color_class);
        }
        if (zone.empty) {
            classes.push("o_camping_map_zone_empty");
        }
        if (this.isSelectedZone(zone)) {
            // The chosen pitch's zone is highlighted in radiant gold; every
            // other zone keeps its own availability colour (no greying out).
            classes.push("o_camping_map_zone_gold");
        }
        if (zone.id === this.state.hoveredZoneId) {
            classes.push("o_camping_map_zone_hover");
        }
        if (zone.zone_id === this.state.selectedZoneId) {
            classes.push("o_camping_map_zone_selected");
        }
        if (this.isEditingZone(zone)) {
            classes.push("o_camping_map_zone_editing");
        }
        if (
            this.props.onSelectItem &&
            !this.isSelectedZone(zone) &&
            !this.zoneMatchesArmedProduct(zone)
        ) {
            classes.push("o_camping_map_zone_disabled");
        }
        return classes.join(" ");
    }

    zoneStyle(zone) {
        // Feed the zone's availability colors (from the camping.map.state model)
        // into CSS custom properties so the SCSS renders straight from them.
        const colors = zone.colors;
        const vars = [];
        if (colors) {
            if (colors.fill) {
                vars.push(`--o-zone-fill: ${colors.fill}`);
            }
            if (colors.stroke) {
                vars.push(`--o-zone-stroke: ${colors.stroke}`);
            }
            if (colors.hover) {
                vars.push(`--o-zone-hover: ${colors.hover}`);
            }
        }
        // When a zone carries occupancy segments it is filled transparent so
        // the proportional slice polygons (drawn on top) show through. The
        // chosen pitch's zone keeps its solid radiant-gold fill instead.
        if (this.hasParts(zone) && !this.isSelectedZone(zone)) {
            vars.push("fill: transparent");
        }
        return vars.length ? vars.join("; ") : undefined;
    }

    hasParts(zone) {
        return Boolean(zone.segments && zone.segments.length > 1);
    }

    isSelectedZone(zone) {
        return this.selectedCountForZone(zone) > 0;
    }

    zonePolygonParts(zone) {
        // Split the polygon into vertical bands whose areas are proportional to
        // the segment fractions, each drawn as a solid-colored polygon. This
        // splits by real area (not a bounding-box gradient), so a skewed pitch
        // still shows each color at its true share.
        if (!this.hasParts(zone)) {
            return [];
        }
        const points = this.zonePoints(zone);
        const totalArea = polygonArea(points);
        if (points.length < 3 || !totalArea) {
            return [];
        }
        const xs = points.map(([x]) => x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const parts = [];
        let cumulative = 0;
        let leftX = minX;
        zone.segments.forEach((segment, index) => {
            cumulative += segment.fraction;
            const rightX =
                index === zone.segments.length - 1
                    ? maxX
                    : cutXForArea(points, minX, maxX, totalArea * cumulative);
            const band = clipVertical(clipVertical(points, rightX, true), leftX, false);
            if (band.length >= 3) {
                parts.push({
                    points: band.map((point) => point.join(",")).join(" "),
                    // Either an explicit fill (colors.fill) or a CSS colour class
                    // (color_class, e.g. the Gantt palette) resolved by the sheet.
                    color: segment.colors && segment.colors.fill,
                    colorClass: segment.color_class,
                });
            }
            leftX = rightX;
        });
        return parts;
    }
}
