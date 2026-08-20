{
    "name": "Planning Gantt View Mode",
    "summary": "Toggle the Planning schedule between planning mode (all bookable"
    " resources) and watching mode (only booked rows).",
    "version": "19.0.1.2.0",
    "category": "Human Resources/Planning",
    "license": "OPL-1",
    "author": "mytime.click",
    "website": "https://mytime.click",
    "depends": [
        "planning",
    ],
    "data": [
        "security/ir.model.access.csv",
        "security/planning_gantt_resource_filter_security.xml",
    ],
    "assets": {
        # Gantt is shipped in the lazy backend bundle, so the generic model and
        # renderer patches must be loaded in that same bundle.
        "web.assets_backend_lazy": [
            "planning_gantt_view_mode/static/src/**/*",
        ],
    },
    "installable": True,
    "application": False,
}
