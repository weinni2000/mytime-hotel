import {Component, useState} from "@odoo/owl";
import {Dialog} from "@web/core/dialog/dialog";
import {useAutofocus} from "@web/core/utils/hooks";
import {_t} from "@web/core/l10n/translation";

export class SaveGanttFilterDialog extends Component {
    static template = "planning_gantt_view_mode.SaveGanttFilterDialog";
    static components = {Dialog};
    static props = {
        close: Function,
        onSave: Function,
    };

    setup() {
        this.title = _t("Save Resource Filter");
        this.state = useState({name: "", isDefault: false});
        useAutofocus();
    }

    save() {
        const name = this.state.name.trim();
        if (!name) {
            return;
        }
        this.props.onSave(name, this.state.isDefault);
        this.props.close();
    }
}
