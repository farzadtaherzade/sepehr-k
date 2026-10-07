# Directus Data-Model Configuration

- **apply_model.py** — idempotent configurator for the 7 EVM collections
  (labels fa/en, interfaces, relation wiring, form groups, navigation group,
  `report_date_jalali` column, presets). Safe to re-run.

  ```bash
  DX_TOKEN=<static admin token> python apply_model.py
  ```

- **Jalali dates** — `project_snapshot.report_date_jalali` was filled with one
  `UPDATE ... FROM (VALUES ...)` built from the workbook column «تاریخ 2»
  (227/227 rows matched by project name + report date).

Design decisions and the full change list: see `../setup_instructions.md` §11.
