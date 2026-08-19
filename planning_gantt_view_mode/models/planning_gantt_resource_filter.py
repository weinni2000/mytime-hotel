from odoo import api, fields, models


class PlanningGanttResourceFilter(models.Model):
    _name = "planning.gantt.resource.filter"
    _description = "Saved resource filter for the Planning Gantt view"
    _order = "name"

    name = fields.Char(required=True)
    domain = fields.Char(required=True)
    user_id = fields.Many2one("res.users", required=True, default=lambda self: self.env.user)
    is_default = fields.Boolean(string="Default")

    def _unset_other_defaults(self):
        for record in self:
            self.search(
                [
                    ("user_id", "=", record.user_id.id),
                    ("id", "!=", record.id),
                    ("is_default", "=", True),
                ]
            ).write({"is_default": False})

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records.filtered("is_default")._unset_other_defaults()
        return records

    def write(self, vals):
        result = super().write(vals)
        if vals.get("is_default"):
            self.filtered("is_default")._unset_other_defaults()
        return result
