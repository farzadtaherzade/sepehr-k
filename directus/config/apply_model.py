# =============================================================================
# Directus data-model configurator for the EVM platform.
#
# Idempotent and ADDITIVE ONLY: it patches collection/field/relation *meta*,
# adds a navigation group, wires the O2M sides of the 6 existing FK relations,
# adds one new column (project_snapshot.report_date_jalali) and global default
# presets. It NEVER deletes collections, fields, rows or presets.
#
# Run:  DX_TOKEN=<token> python apply_model.py
# =============================================================================
import json
import os
import sys
import urllib.request
import urllib.error

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = os.environ.get("DX_URL", "http://localhost:8080")
TOKEN = os.environ["DX_TOKEN"]
DOMAIN = ("dim_project", "dim_contractor_category", "contract_revision",
          "contract_extension", "project_snapshot", "snapshot_revision_progress",
          "snapshot_contractor_headcount")


def api(method, path, body=None, ok=(200,)):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + TOKEN,
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if e.code in ok:
            return e.code, (json.loads(raw) if raw else None)
        raise RuntimeError(f"{method} {path} -> {e.code}: {raw[:500]}")


def tr(en, fa):
    return [{"language": "en-US", "translation": en},
            {"language": "fa-IR", "translation": fa}]


def F(field, en, fa, interface=None, options=None, display=None,
      display_options=None, width=None, note=None, hidden=False,
      readonly=False, special=None, group=None, sort=None):
    """Build a partial field-meta payload (schema is never touched)."""
    meta = {"hidden": hidden, "readonly": readonly}
    if interface: meta["interface"] = interface
    if options is not None: meta["options"] = options
    if display: meta["display"] = display
    if display_options is not None: meta["display_options"] = display_options
    if width: meta["width"] = width
    if note: meta["note"] = note
    if special is not None: meta["special"] = special
    if group: meta["group"] = group
    if sort is not None: meta["sort"] = sort
    meta["label"] = fa
    meta["translations"] = tr(en, fa)
    return {"field": field, "meta": meta}


STATUS_CHOICES = [{"text": "منتشرشده / published", "value": "published"},
                  {"text": "پیش‌نویس / draft", "value": "draft"},
                  {"text": "بایگانی / archived", "value": "archived"}]


def status_field(sort=None, width="quarter"):
    return F("status", "Status", "وضعیت", interface="select-dropdown",
             options={"choices": STATUS_CHOICES}, display="labels",
             display_options={"choices": STATUS_CHOICES}, width=width, sort=sort)


REV_CHOICES = [{"text": "REV0 (برنامه اولیه)", "value": 0},
               {"text": "REV1", "value": 1}, {"text": "REV2", "value": 2},
               {"text": "REV3", "value": 3}, {"text": "REV4", "value": 4},
               {"text": "REV5", "value": 5}]
EXT_CHOICES = [{"text": "تمدید اول", "value": 1}, {"text": "تمدید دوم", "value": 2},
               {"text": "تمدید سوم", "value": 3}, {"text": "تمدید چهارم", "value": 4},
               {"text": "تمدید پنجم", "value": 5}]

AUDIT = ["created_at", "updated_at", "sort", "user_created", "date_created",
         "user_updated", "date_updated"]

# =============================================================================
# Field definitions per collection
# =============================================================================
FIELDS = {}

FIELDS["dim_project"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("name", "Project Name", "نام پروژه", interface="input", width="half", sort=2,
      note="Master project name, unique / نام یکتای پروژه"),
    F("contract_start_date", "Contract Start", "شروع پیمان", interface="datetime",
      width="half", sort=3),
    status_field(sort=4),
    F("revisions", "Contract Revisions", "اصلاحات قرارداد (REV)", special=["o2m"],
      interface="list-o2m", options={"template": "REV{{revision_no}} — {{amount}}"},
      width="full", sort=10,
      note="One row per contract revision (REV0 = initial) / یک ردیف به‌ازای هر اصلاحیه"),
    F("extensions", "Contract Extensions", "تمدیدهای قرارداد", special=["o2m"],
      interface="list-o2m", options={"template": "تمدید {{extension_no}} — {{duration_days}} روز"},
      width="full", sort=11),
    F("snapshots", "Periodic Snapshots", "گزارش‌های دوره‌ای", special=["o2m"],
      interface="list-o2m", options={"template": "{{report_date}} — پیشرفت {{progress_physical_actual}}"},
      width="full", sort=12,
      note="Periodic EVM/progress reports / گزارش‌های پیشرفت و EVM هر دوره"),
]

FIELDS["dim_contractor_category"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("title_fa", "Title (Persian)", "عنوان فارسی", interface="input", width="half", sort=2),
    F("title", "Slug / Standard Title", "شناسه استاندارد", interface="input",
      width="half", sort=3, note="Canonical slug used by API/migration / شناسه یکتا برای API"),
    F("display_order", "Display Order", "ترتیب نمایش", interface="input", width="quarter", sort=4),
    status_field(sort=5),
    F("aliases", "Excel Aliases", "مترادف‌های اکسل", hidden=True, sort=90,
      note="Postgres text[] of Excel synonyms — API only / آرایه مترادف‌های ستون اکسل؛ فقط از طریق API"),
    F("headcount", "Headcount per Snapshot", "نیروی انسانی در گزارش‌ها", special=["o2m"],
      interface="list-o2m", options={"template": "{{snapshot_id.report_date}}: {{headcount}} نفر"},
      width="full", sort=10),
]

FIELDS["contract_revision"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("project_id", "Project", "پروژه", interface="select-dropdown-m2o",
      options={"template": "{{name}}"}, display="related-values",
      display_options={"template": "{{name}}"}, special=["m2o"], width="half", sort=2),
    F("revision_no", "Revision No.", "شماره اصلاحیه", interface="select-dropdown",
      options={"choices": REV_CHOICES, "allowOther": True}, display="labels",
      display_options={"choices": REV_CHOICES}, width="quarter", sort=3,
      note="REV0 = initial contract / صفر یعنی مبلغ و مدت اولیه پیمان"),
    F("amount", "Contract Amount (Rial)", "مبلغ پیمان (ریال)", interface="input",
      width="half", sort=4, note="For REV0 this is the initial amount / برای REV0 همان مبلغ اولیه پیمان"),
    F("duration_days", "Duration (days)", "مدت پیمان (روز)", interface="input", width="quarter", sort=5),
    F("effective_date", "Effective Date", "تاریخ اجرا", interface="datetime", width="quarter", sort=6),
    status_field(sort=7),
    F("created_at", "Created At", "زمان ایجاد", hidden=True, sort=90),
    F("project", "Legacy Link (unused)", "پیوند قدیمی (بدون اتصال)", hidden=True, sort=91,
      note="Orphan field left by an earlier setup — use project_id instead / فیلد ناتمام نسخه قبل؛ از project_id استفاده کنید"),
]

FIELDS["contract_extension"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("project_id", "Project", "پروژه", interface="select-dropdown-m2o",
      options={"template": "{{name}}"}, display="related-values",
      display_options={"template": "{{name}}"}, special=["m2o"], width="half", sort=2),
    F("extension_no", "Extension No.", "شماره تمدید", interface="select-dropdown",
      options={"choices": EXT_CHOICES, "allowOther": True}, display="labels",
      display_options={"choices": EXT_CHOICES}, width="quarter", sort=3),
    F("duration_days", "Extension (days)", "مدت تمدید (روز)", interface="input", width="quarter", sort=4),
    F("effective_date", "Effective Date", "تاریخ اجرا", interface="datetime", width="quarter", sort=5),
    status_field(sort=6),
]

SNAP_PROGRESS = [
    F("progress_physical_actual", "Physical Progress (Actual)", "پیشرفت فیزیکی واقعی",
      interface="input", width="half", sort=1,
      note="0..1 (weight = physical) / وزن فیزیکی، عدد بین 0 و 1"),
    F("progress_physical_planned", "Physical Progress (Planned)", "پیشرفت فیزیکی برنامه",
      interface="input", width="half", sort=2),
    F("progress_rial_actual", "Rial Progress (Actual)", "پیشرفت ریالی واقعی",
      interface="input", width="half", sort=3),
    F("progress_rial_planned", "Rial Progress (Planned)", "پیشرفت ریالی برنامه",
      interface="input", width="half", sort=4),
    F("time_elapsed_days", "Elapsed Days", "مدت سپری‌شده (روز)", interface="input", width="half", sort=5),
    F("time_progress_pct", "Time Progress", "پیشرفت زمانی", interface="input", width="half", sort=6,
      note="0..1 / عدد بین 0 و 1"),
]

SNAP_FINANCIAL = [
    F("gross_payment", "Gross Payment by Employer", "مجموع ناخالص پرداختی کارفرما (ریال)",
      interface="input", width="half", sort=1),
    F("net_payment", "Net Payment by Employer", "مجموع خالص پرداختی کارفرما (ریال)",
      interface="input", width="half", sort=2),
    F("last_progress_statement", "Last Approved Progress Statement", "آخرین صورت‌وضعیت کارکرد تأییدشده (ریال)",
      interface="input", width="half", sort=3),
    F("last_adjustment_statement", "Last Approved Adjustment Statement", "آخرین صورت‌وضعیت تعدیل تأییدشده (ریال)",
      interface="input", width="half", sort=4),
    F("actual_cost", "Actual Cost (AC)", "هزینه واقعی (AC)", interface="input", width="half", sort=5),
    F("overhead_cost", "Overhead Cost", "هزینه بالاسری (ریال)", interface="input", width="half", sort=6),
    F("equipment_cost", "Equipment Cost", "هزینه‌های تجهیز (ریال)", interface="input", width="half", sort=7),
    F("commitments", "Commitments", "تعهدات (ریال)", interface="input", width="half", sort=8),
    F("revenue", "Revenue", "درآمد (ریال)", interface="input", width="half", sort=9),
    F("production", "Production", "تولید (ریال)", interface="input", width="half", sort=10),
]

SNAP_EVM = [
    F("pv", "Planned Value (PV)", "ارزش برنامه‌ریزی‌شده (PV)", interface="input", width="half", sort=1),
    F("ev", "Earned Value (EV)", "ارزش کسب‌شده (EV)", interface="input", width="half", sort=2),
    F("spi", "Schedule Performance Index (SPI)", "شاخص عملکرد زمان‌بندی (SPI)",
      interface="input", width="half", sort=3, note="EV ÷ PV — carried over from the workbook / از فایل اکسل"),
    F("cpi", "Cost Performance Index (CPI)", "شاخص عملکرد هزینه (CPI)",
      interface="input", width="half", sort=4, note="EV ÷ AC — carried over from the workbook / از فایل اکسل"),
]

SNAP_RATIOS = [
    F("revenue_to_cost_ratio", "Revenue / Cost", "نسبت درآمد به هزینه", interface="input", width="half", sort=1),
    F("overhead_to_production_ratio", "Overhead / Production", "نسبت بالاسری به تولید", interface="input", width="half", sort=2),
    F("equipment_to_production_ratio", "Equipment / Production", "نسبت هزینه تجهیز به تولید", interface="input", width="half", sort=3),
    F("commitments_to_production_ratio", "Commitments / Production", "نسبت تعهدات به تولید", interface="input", width="half", sort=4),
    F("collection_rate", "Collection Rate", "درصد وصول مطالبات", interface="input", width="half", sort=5),
    F("avg_monthly_headcount", "Avg. Monthly Headcount", "متوسط نیروی انسانی پیمانکار در ماه",
      interface="input", width="half", sort=6),
]

FIELDS["project_snapshot"] = (
    [
        F("id", "Snapshot ID", "شناسه گزارش", interface="input", readonly=True, width="quarter", sort=1),
        F("project_id", "Project", "پروژه", interface="select-dropdown-m2o",
          options={"template": "{{name}}"}, display="related-values",
          display_options={"template": "{{name}}"}, special=["m2o"], width="half", sort=2),
        F("report_date", "Report Date", "تاریخ گزارش", interface="datetime", width="half", sort=3),
        F("report_date_jalali", "Report Date (Jalali)", "تاریخ گزارش (شمسی)",
          interface="input", readonly=True, width="half", sort=4,
          note="Jalali equivalent from the workbook column «تاریخ 2» / معادل شمسی از ستون تاریخ 2 اکسل"),
        F("revision_no", "Reported Revision", "REV گزارش‌شده", interface="select-dropdown",
          options={"choices": REV_CHOICES, "allowOther": True}, display="labels",
          display_options={"choices": REV_CHOICES}, width="quarter", sort=5),
        status_field(sort=6),
        {"field": "group_progress", "meta": {"special": ["group"], "interface": "group-detail",
            "options": {"start": "open"}, "label": "پیشرفت و زمان",
            "translations": tr("Progress & Time", "پیشرفت و زمان"), "sort": 10, "group": None}},
    ] + [dict(f, meta={**f["meta"], "group": "group_progress"}) for f in SNAP_PROGRESS] +
    [
        {"field": "group_financial", "meta": {"special": ["group"], "interface": "group-detail",
            "options": {"start": "open"}, "label": "مالی و صورت‌وضعیت",
            "translations": tr("Financial & Statements", "مالی و صورت‌وضعیت"), "sort": 20, "group": None}},
    ] + [dict(f, meta={**f["meta"], "group": "group_financial"}) for f in SNAP_FINANCIAL] +
    [
        {"field": "group_evm", "meta": {"special": ["group"], "interface": "group-detail",
            "options": {"start": "open"}, "label": "ارزش کسب‌شده و شاخص‌های EVM",
            "translations": tr("Earned Value & EVM Indices", "ارزش کسب‌شده و شاخص‌های EVM"), "sort": 30, "group": None}},
    ] + [dict(f, meta={**f["meta"], "group": "group_evm"}) for f in SNAP_EVM] +
    [
        {"field": "group_ratios", "meta": {"special": ["group"], "interface": "group-detail",
            "options": {"start": "closed"}, "label": "نسبت‌ها",
            "translations": tr("Ratios", "نسبت‌ها"), "sort": 40, "group": None}},
    ] + [dict(f, meta={**f["meta"], "group": "group_ratios"}) for f in SNAP_RATIOS] +
    [
        F("revision_progress", "Progress per Revision", "پیشرفت به تفکیک REV", special=["o2m"],
          interface="list-o2m", options={"template": "REV{{revision_no}} — EV: {{ev}}"},
          width="full", sort=50,
          note="Progress/EV/PV per REV (REV0..REV3) / پیشرفت و ارزش برای هر نسخه برنامه"),
        F("headcount", "Headcount per Trade", "نیروی انسانی به تفکیک رده", special=["o2m"],
          interface="list-o2m", options={"template": "{{contractor_category_id.title_fa}}: {{headcount}} نفر"},
          width="full", sort=51,
          note="Average monthly headcount per contractor category / میانگین نیروی هر رده در این دوره"),
        F("created_at", "Created At", "زمان ایجاد", hidden=True, sort=90),
    ]
)

FIELDS["snapshot_revision_progress"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("snapshot_id", "Periodic Snapshot", "گزارش دوره‌ای", interface="select-dropdown-m2o",
      options={"template": "{{project_id.name}} — {{report_date}}"}, display="related-values",
      display_options={"template": "{{project_id.name}} — {{report_date}}"},
      special=["m2o"], width="half", sort=2),
    F("revision_no", "Revision", "REV", interface="select-dropdown",
      options={"choices": REV_CHOICES, "allowOther": True}, display="labels",
      display_options={"choices": REV_CHOICES}, width="quarter", sort=3),
    status_field(sort=4),
    F("progress_physical_actual", "Physical Progress (Actual)", "پیشرفت فیزیکی واقعی", interface="input", width="half", sort=5),
    F("progress_physical_planned", "Physical Progress (Planned)", "پیشرفت فیزیکی برنامه", interface="input", width="half", sort=6),
    F("progress_rial_actual", "Rial Progress (Actual)", "پیشرفت ریالی واقعی", interface="input", width="half", sort=7),
    F("progress_rial_planned", "Rial Progress (Planned)", "پیشرفت ریالی برنامه", interface="input", width="half", sort=8),
    F("ev", "Earned Value (EV)", "ارزش کسب‌شده (EV)", interface="input", width="half", sort=9),
    F("pv", "Planned Value (PV)", "ارزش برنامه‌ریزی‌شده (PV)", interface="input", width="half", sort=10),
]

FIELDS["snapshot_contractor_headcount"] = [
    F("id", "ID", "شناسه", interface="input", readonly=True, width="quarter", sort=1),
    F("snapshot_id", "Periodic Snapshot", "گزارش دوره‌ای", interface="select-dropdown-m2o",
      options={"template": "{{project_id.name}} — {{report_date}}"}, display="related-values",
      display_options={"template": "{{project_id.name}} — {{report_date}}"},
      special=["m2o"], width="half", sort=2),
    F("contractor_category_id", "Contractor Category", "رده پیمانکار", interface="select-dropdown-m2o",
      options={"template": "{{title_fa}}"}, display="related-values",
      display_options={"template": "{{title_fa}}"}, special=["m2o"], width="half", sort=3),
    F("headcount", "Avg. Headcount (people)", "میانگین نیروی انسانی (نفر)", interface="input",
      width="half", sort=4, note="Average for the period, can be fractional / میانگین دوره؛ ممکن است اعشاری باشد"),
    status_field(sort=5),
]

# =============================================================================
# Collection meta (group, ordering, templates, bilingual names)
# =============================================================================
COLLECTIONS = {
    "dim_project": {
        "icon": "folder_special", "sort": 1,
        "display_template": "{{name}}",
        "note": "Master project registry / دفتر اصلی پروژه‌ها",
        "translations": [{"language": "en-US", "translation": "Projects", "singular": "project", "plural": "projects"},
                          {"language": "fa-IR", "translation": "پروژه‌ها", "singular": "پروژه", "plural": "پروژه‌ها"}],
    },
    "contract_revision": {
        "icon": "description", "sort": 2,
        "display_template": "REV{{revision_no}}",
        "note": "Contract revisions REV0, REV1, ... / اصلاحات قرارداد",
        "translations": [{"language": "en-US", "translation": "Contract Revisions", "singular": "revision", "plural": "revisions"},
                          {"language": "fa-IR", "translation": "اصلاحات قرارداد", "singular": "اصلاحیه", "plural": "اصلاحیه‌ها"}],
    },
    "contract_extension": {
        "icon": "schedule", "sort": 3,
        "display_template": "تمدید {{extension_no}}",
        "note": "Time extensions / تمدیدهای قرارداد",
        "translations": [{"language": "en-US", "translation": "Contract Extensions", "singular": "extension", "plural": "extensions"},
                          {"language": "fa-IR", "translation": "تمدیدهای قرارداد", "singular": "تمدید", "plural": "تمدیدها"}],
    },
    "project_snapshot": {
        "icon": "analytics", "sort": 4,
        "display_template": "{{project_id.name}} — {{report_date}}",
        "note": "Periodic EVM & progress report (one row per project per period) / گزارش دوره‌ای پیشرفت و EVM",
        "item_duplication_fields": ["project_id", "report_date", "report_date_jalali", "revision_no",
            "progress_physical_actual", "progress_physical_planned", "progress_rial_actual", "progress_rial_planned",
            "time_elapsed_days", "time_progress_pct", "gross_payment", "net_payment", "actual_cost",
            "overhead_cost", "equipment_cost", "commitments", "revenue", "production", "pv", "ev",
            "spi", "cpi", "last_progress_statement", "last_adjustment_statement", "revenue_to_cost_ratio",
            "overhead_to_production_ratio", "equipment_to_production_ratio", "commitments_to_production_ratio",
            "collection_rate", "avg_monthly_headcount", "status"],
        "translations": [{"language": "en-US", "translation": "Periodic Snapshots", "singular": "snapshot", "plural": "snapshots"},
                          {"language": "fa-IR", "translation": "گزارش‌های دوره‌ای", "singular": "گزارش", "plural": "گزارش‌ها"}],
    },
    "snapshot_revision_progress": {
        "icon": "trending_up", "sort": 5,
        "display_template": "REV{{revision_no}}",
        "note": "Per-revision progress/EV/PV behind each snapshot / پیشرفت به تفکیک هر REV",
        "translations": [{"language": "en-US", "translation": "Progress per Revision", "singular": "revision progress", "plural": "revision progress"},
                          {"language": "fa-IR", "translation": "پیشرفت به تفکیک REV", "singular": "پیشرفت REV", "plural": "پیشرفت‌های REV"}],
    },
    "snapshot_contractor_headcount": {
        "icon": "badge", "sort": 6,
        "display_template": "{{contractor_category_id.title_fa}}: {{headcount}}",
        "note": "Average headcount per trade per snapshot / نیروی انسانی هر رده در هر دوره",
        "translations": [{"language": "en-US", "translation": "Headcount per Trade", "singular": "headcount row", "plural": "headcount rows"},
                          {"language": "fa-IR", "translation": "نیروی انسانی به تفکیک رده", "singular": "نیروی انسانی", "plural": "نیروی انسانی"}],
    },
    "dim_contractor_category": {
        "icon": "groups", "sort": 7,
        "display_template": "{{title_fa}}",
        "note": "Standard construction trades / رده‌های استاندارد پیمانکاران",
        "translations": [{"language": "en-US", "translation": "Contractor Categories", "singular": "category", "plural": "categories"},
                          {"language": "fa-IR", "translation": "رده‌های پیمانکار", "singular": "رده", "plural": "رده‌ها"}],
    },
}

# Relation meta wiring: (collection, field) -> {one_field, sort_field}
RELATION_WIRING = {
    ("contract_revision", "project_id"): {"one_field": "revisions", "sort_field": "revision_no"},
    ("contract_extension", "project_id"): {"one_field": "extensions", "sort_field": "extension_no"},
    ("project_snapshot", "project_id"): {"one_field": "snapshots", "sort_field": "report_date"},
    ("snapshot_revision_progress", "snapshot_id"): {"one_field": "revision_progress", "sort_field": "revision_no"},
    ("snapshot_contractor_headcount", "snapshot_id"): {"one_field": "headcount"},
    ("snapshot_contractor_headcount", "contractor_category_id"): {"one_field": "headcount"},
}

# Global default presets (user=null, role=null): only created if absent.
PRESETS = {
    "dim_project": (["status", "name", "contract_start_date"], ["name"]),
    "dim_contractor_category": (["display_order", "title_fa", "title"], ["display_order"]),
    "contract_revision": (["project_id.name", "revision_no", "amount", "duration_days", "effective_date"],
                          ["project_id", "revision_no"]),
    "contract_extension": (["project_id.name", "extension_no", "duration_days", "effective_date"],
                           ["project_id", "extension_no"]),
    "project_snapshot": (["project_id.name", "report_date", "report_date_jalali", "revision_no",
                          "progress_physical_actual", "progress_physical_planned", "ev", "pv", "spi", "cpi"],
                         ["-report_date"]),
    "snapshot_revision_progress": (["snapshot_id.project_id.name", "snapshot_id.report_date", "revision_no",
                                    "progress_physical_actual", "progress_physical_planned", "ev", "pv"],
                                   ["snapshot_id", "revision_no"]),
    "snapshot_contractor_headcount": (["snapshot_id.project_id.name", "snapshot_id.report_date",
                                       "contractor_category_id.title_fa", "headcount"],
                                      ["snapshot_id", "contractor_category_id"]),
}


def main():
    # 1. Navigation group folder --------------------------------------------
    st, _ = api("GET", "/collections/evm_data", ok=(200, 403, 404))
    if st == 200:
        print("= group evm_data exists")
    else:
        api("POST", "/collections", {
            "collection": "evm_data", "schema": None, "fields": [],
            "meta": {"collection": "evm_data", "icon": "folder", "note": "All EVM domain collections / همه کالکشن‌های داده پروژه",
                     "collapse": "opened", "sort": 1, "hidden": False, "singleton": False,
                     "archive_app_filter": False,
                     "translations": [{"language": "en-US", "translation": "Project Data (EVM)", "singular": "item", "plural": "items"},
                                      {"language": "fa-IR", "translation": "داده‌های پروژه (EVM)", "singular": "آیتم", "plural": "آیتم‌ها"}]},
        })
        print("+ group evm_data created")

    # 2. New column: project_snapshot.report_date_jalali (ADD ONLY) ---------
    _, fields_all = api("GET", "/fields/project_snapshot")
    existing = {f["field"] for f in fields_all["data"]}
    if "report_date_jalali" in existing:
        print("= report_date_jalali exists")
    else:
        api("POST", "/fields/project_snapshot", {
            "field": "report_date_jalali", "type": "text",
            "schema": {"is_nullable": True, "default_value": None},
            "meta": {"interface": "input", "readonly": True, "hidden": False,
                     "width": "half", "label": "تاریخ گزارش (شمسی)",
                     "note": "Jalali date from workbook column «تاریخ 2» / معادل شمسی از اکسل",
                     "translations": tr("Report Date (Jalali)", "تاریخ گزارش (شمسی)")},
        })
        print("+ column project_snapshot.report_date_jalali added")

    # 3. Group fields for the snapshot form ---------------------------------
    for gname in ("group_progress", "group_financial", "group_evm", "group_ratios"):
        if gname not in existing:
            gdef = next(f for f in FIELDS["project_snapshot"] if f["field"] == gname)
            api("POST", "/fields/project_snapshot", {
                "field": gname, "type": "alias", "schema": None, "meta": gdef["meta"]})
            print(f"+ {gname} created")

    # 4. Patch every field meta ---------------------------------------------
    for coll, flds in FIELDS.items():
        for f in flds:
            if f["field"] in ("group_progress", "group_financial", "group_evm", "group_ratios"):
                continue
            api("PATCH", f"/fields/{coll}/{f['field']}", {"meta": f["meta"]})
        print(f"~ fields configured: {coll} ({len(flds)})")

    # 5. Patch collection meta ----------------------------------------------
    for coll, meta in COLLECTIONS.items():
        api("PATCH", f"/collections/{coll}", {"meta": {"group": "evm_data", "hidden": False, **meta}})
        print(f"~ collection configured: {coll}")

    # 6. Wire relations (O2M one_field + sorting) ---------------------------
    for (coll, field), wiring in RELATION_WIRING.items():
        _, rel = api("GET", f"/relations/{coll}/{field}")
        r = rel["data"]
        meta = dict(r.get("meta") or {})
        meta.update(wiring)
        meta["one_deselect_action"] = "null"  # unlink rows instead of cascading deletes from the UI
        api("PATCH", f"/relations/{coll}/{field}",
            {"collection": r["collection"], "field": r["field"],
             "related_collection": r["related_collection"], "meta": meta})
        print(f"~ relation wired: {coll}.{field} -> {r['related_collection']} (one_field={wiring['one_field']})")

    # 7. Global default presets ---------------------------------------------
    _, presets = api("GET", "/presets?limit=-1")
    have = {(p["collection"], p.get("user"), p.get("role"), p.get("bookmark"))
            for p in presets["data"]}
    for coll, (fields, sort) in PRESETS.items():
        if (coll, None, None, None) in have:
            print(f"= global preset exists: {coll}")
            continue
        api("POST", "/presets", {
            "collection": coll, "user": None, "role": None, "bookmark": None,
            "layout": "tabular",
            "layout_query": {"tabular": {"fields": fields, "sort": sort, "page": 1, "limit": 200}},
            "layout_options": {"tabular": {"widths": {}}},
        })
        print(f"+ global preset created: {coll}")

    print("\nDONE — model applied.")


if __name__ == "__main__":
    main()
