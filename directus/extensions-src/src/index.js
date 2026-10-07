// Jalali (Shamsi) date + Persian digits display for the Directus app.
// Uses the browser's built-in Intl calendar (fa-IR default calendar IS Persian),
// so no external date libraries are needed.
import { defineDisplay } from '@directus/extensions-sdk';
import { h } from 'vue';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toFa = (s) => String(s).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
// ISO date or datetime, e.g. 2025-04-20 or 2025-04-20T00:00:00.000Z
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

function formatDate(value) {
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return toFa(value);
	try {
		return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(d);
	} catch {
		return toFa(value);
	}
}

function formatNumber(value) {
	const n = Number(value);
	if (Number.isNaN(n)) return toFa(value);
	try {
		return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 6 }).format(n);
	} catch {
		return toFa(value);
	}
}

export default defineDisplay({
	id: 'fa-display',
	name: 'Persian (Jalali) Format',
	description: 'تاریخ شمسی و اعداد فارسی',
	icon: 'translate',
	types: ['date', 'dateTime', 'timestamp', 'integer', 'float', 'decimal', 'bigInteger'],
	component: ({ value }) => {
		if (value === null || value === undefined || value === '') {
			return h('span', { style: { opacity: '.4' } }, '—');
		}
		const isNumeric =
			typeof value === 'number' ||
			(typeof value === 'string' && value.trim() !== '' && !DATE_RE.test(value) && !Number.isNaN(Number(value)));
		const out = isNumeric ? formatNumber(value) : formatDate(value);
		return h('span', { dir: 'ltr' }, out);
	},
});
