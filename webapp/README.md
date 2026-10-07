# سامانه مدیریت داده‌های پروژه (EVM) — Web App

وب‌اپلیکیشن فارسی (RTL) روی دیتابیس PostgreSQL پلتفرم EVM: جدول‌های شبیه اکسل، ثبت و ویرایش داده،
فیلتر و مرتب‌سازی روی همه ستون‌ها، تاریخ شمسی (جلالی)، ورود کاربران با نقش و لاگ کامل تغییرات.

## اجرا (Docker)

```bash
cd evm-platform
docker compose up -d --build webapp
# → http://localhost:3600  (WEBAPP_HOST_PORT در .env)
```

نکته‌های استقرار روی این سیستم:

- پورت ۳۰۰۰ ویندوز (رزرو سوکت) بسته است؛ اپ روی `WEBAPP_HOST_PORT=3600` منتشر می‌شود.
- اگر Docker Hub در دسترس نبود، ایمیج پایه از میرور گرفته شده و تگ شده است:
  ```bash
  docker pull docker.m.daocloud.io/library/node:20-alpine
  docker tag docker.m.daocloud.io/library/node:20-alpine node:20-alpine
  docker compose build webapp
  ```

اولین اجرا به‌صورت خودکار این کارها را انجام می‌دهد (idempotent — در هر بار اجرا امن است):

1. ساخت جدول‌های `app_user` و `audit_log` و ستون `updated_at` روی `project_snapshot`
2. ساخت نقش کم‌دسترسی `evm_app` (فقط روی جدول‌های EVM؛ هیچ دسترسی به جدول‌های Directus)
3. ساخت کاربر admin اولیه از `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD` — تغییر رمز در اولین ورود اجباری است)

> `ADMIN_PASSWORD` فقط بار اول استفاده می‌شود؛ اگر ادمین پسورد را عوض کند، تغییر `.env` آن را بازنویسی نمی‌کند.

## نقش‌ها

| نقش | دسترسی |
|---|---|
| مدیر (admin) | همه‌چیز: مدیریت کاربران، گزارش تغییرات، حذف پروژه |
| ویرایشگر (editor) | ثبت/ویرایش/حذف داده‌ها (گزارش، اصلاحیه، تمدید، نیروی انسانی) |
| بازدیدکننده (viewer) | فقط مشاهده |

## امنیت

- رمزها با bcrypt (cost 12) هش می‌شوند؛ نشست‌ها JWT امضاشده در کوکی `httpOnly` + `SameSite=Lax` (اعتبار ۸ ساعت)
- قفل شدن حساب بعد از تلاش‌های ناموفق (۵ بار در ۱۰ دقیقه → قفل ۵ تا ۳۰ دقیقه) + شمارنده سمت دیتابیس
- بررسی Origin/Referer برای همه درخواست‌های تغییردهنده (ضد CSRF در کنار SameSite)
- همه کوئری‌ها parameterized؛ ستون‌های قابل ویرایش/مرتب‌سازی سمت سرور whitelist شده‌اند
- کنترل دسترسی سمت سرور در همه API (نه فقط در UI) + مسیر اجباری تغییر رمز اول
- لاگ کامل (audit) با مقدار قبلی/جدید برای هر تغییر
- کانتینر با کاربر غیر root اجرا می‌شود؛ هدرهای امنیتی (CSP، X-Frame-Options، nosniff، …)
- اتصال runtime دیتابیس فقط با نقش `evm_app` — حتی در صورت نفوذ به اپ، دسترسی DDL وجود ندارد

## متغیرهای `.env` مربوط به اپ

```env
WEBAPP_HOST_PORT=3000
AUTH_SECRET=<64 hex — با openssl rand -hex 32>
EVM_APP_PASSWORD=<رمز نقش evm_app>
COOKIE_SECURE=false          # فقط پشت HTTPS روی true بگذارید
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...           # فقط بار اول
```

## نکته‌ها

- تاریخ‌ها در دیتابیس میلادی ذخیره می‌شوند (`DATE`)؛ نمایش و ورودی همه‌جا شمسی است.
- درصدها (پیشرفت فیزیکی/ریالی، درصد وصول، درصد زمان) در دیتابیس به‌صورت کسر ذخیره می‌شوند (0.4520 = ۴۵.۲۰٪) — در فرم‌ها به‌صورت درصد وارد می‌شوند.
- SPI و CPI در صورت وارد کردن EV/PV و EV/AC به‌صورت خودکار محاسبه می‌شوند.
- «خروجی CSV» با BOM ذخیره می‌شود تا در اکسل فارسی درست باز شود.
- جدول‌های سیستمی Directus و ستون‌های audit آن (`status`, `sort`, `user_created`, …) توسط این اپ خوانده یا نوشته نمی‌شوند.

## اجرای محلی (بدون Docker)

```bash
npm install
# متغیرهای محیطی لازم: PGHOST, PGPORT, PGDATABASE, EVM_APP_USER, EVM_APP_PASSWORD,
# PGADMIN_USER, PGADMIN_PASSWORD, AUTH_SECRET, INIT_ON_START=true
npm run dev   # http://localhost:3000
```
