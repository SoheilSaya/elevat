// ══════════════════════════════════════════════════════
//  JALALI HELPERS  —  jalali.js
//  Pure-JS Gregorian <-> Jalali (Shamsi) conversion.
//  Used by js_goals.js and js_car.js for date pickers
//  that store ISO (YYYY-MM-DD) under the hood but
//  display/enter Jalali everywhere, matching the rest
//  of the app's Jalali-first convention.
// ══════════════════════════════════════════════════════

const JALALI_MONTHS = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar',
                        'Mehr','Aban','Azar','Dey','Bahman','Esfand'];

function g2d(gy, gm, gd) {
  // Gregorian date -> Julian Day Number
  let a = Math.floor((14 - gm) / 12);
  let y = gy + 4800 - a;
  let m = gm + 12 * a - 3;
  return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function d2j(jdn) {
  // Julian Day Number -> Jalali [jy, jm, jd]
  const gy = d2g(jdn)[0];
  let jy = gy - 621;
  const r = jalCal(jy);
  const gy2 = jalGregYear(jy);
  let jdn1f = g2d(gy2, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + Math.floor(k / 31);
      const jd = (k % 31) + 1;
      return [jy, jm, jd];
    } else {
      k -= 186;
    }
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  const jm = 7 + Math.floor(k / 30);
  const jd = (k % 30) + 1;
  return [jy, jm, jd];
}

function jalGregYear(jy) { return jy + 621; }

function jalCal(jy) {
  // Simplified 33-year leap cycle algorithm (Borkowski / common JS impl)
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  let bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, n, i;
  if (jy < jp || jy >= breaks[bl - 1]) {
    // fallback safe defaults
  }
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + Math.floor(jump / 33) * 8 + Math.floor((jump % 33) / 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + Math.floor(n / 33) * 8 + Math.floor(((n % 33) + 3) / 4);
  if ((jump % 33) === 4 && (jump - n) === 4) leapJ += 1;
  const leapG = Math.floor(gy / 4) - Math.floor((Math.floor(gy / 100) + 1) * 3 / 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33;
  leap = ((((n + 1) % 33) - 1) % 4);
  if (leap === -1) leap = 4;
  return { leap, march, jy };
}

function d2g(jdn) {
  // Julian Day Number -> Gregorian [gy, gm, gd]
  let j = 4 * jdn + 139361631;
  j = j + Math.floor(Math.floor((4 * jdn + 183187720) / 146097) * 3 / 4) * 4 - 3908;
  const i = Math.floor((j % 1461) / 4) * 5 + 308;
  const gd = Math.floor((i % 153) / 5) + 1;
  const gm = (Math.floor(i / 153) % 12) + 1;
  const gy = Math.floor(j / 1461) - 100100 + Math.floor((8 - gm) / 6);
  return [gy, gm, gd];
}

function j2d(jy, jm, jd) {
  // Jalali -> Julian Day Number
  const r = jalCal(jy);
  return g2d(jalGregYear(jy), 3, r.march) + (jm - 1) * 31 - Math.floor(jm / 7) * (jm - 7) + jd - 1;
}

/** Convert "YYYY-MM-DD" (Gregorian ISO) -> {y,m,d,str,month_name} Jalali */
function gregToJalali(iso) {
  if (!iso) return null;
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (!gy || !gm || !gd) return null;
  const [jy, jm, jd] = d2j(g2d(gy, gm, gd));
  return {
    y: jy, m: jm, d: jd,
    month_name: JALALI_MONTHS[jm - 1],
    str: `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`,
  };
}

/** Convert Jalali (jy, jm, jd) -> "YYYY-MM-DD" Gregorian ISO */
function jalaliToGreg(jy, jm, jd) {
  const [gy, gm, gd] = d2g(j2d(jy, jm, jd));
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/** Short display label e.g. "14 Mehr 1404" from an ISO gregorian date */
function jalaliFullLabel(iso) {
  const j = gregToJalali(iso);
  if (!j) return '';
  return `${j.d} ${j.month_name} ${j.y}`;
}

/** Today, in Jalali, as {y,m,d} */
function jalaliTodayLocal() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  return gregToJalali(iso);
}

function jalaliDaysInMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Esfand: 29 or 30 on leap years — check by converting day 30 back and forth
  const iso = jalaliToGreg(jy, 12, 30);
  const back = gregToJalali(iso);
  return (back && back.m === 12 && back.d === 30) ? 30 : 29;
}

// ── Reusable Jalali date-picker widget ─────────────────
// Renders 3 selects (day/month/year) into a container div.
// Stores the resulting Gregorian ISO string into a hidden
// input with id = hiddenInputId, calling onChange(iso) too.

function renderJalaliPicker(containerId, hiddenInputId, isoValue, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let j = isoValue ? gregToJalali(isoValue) : jalaliTodayLocal();
  if (!j) j = jalaliTodayLocal();

  const curYear = j.y;
  const yearOptions = [];
  for (let y = curYear - 5; y <= curYear + 5; y++) yearOptions.push(y);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:70px 1fr 90px;gap:6px;">
      <select class="builder-select jalali-day" style="font-size:13px;padding:8px 6px;"></select>
      <select class="builder-select jalali-month" style="font-size:13px;"></select>
      <select class="builder-select jalali-year" style="font-size:13px;padding:8px 6px;"></select>
    </div>`;

  const dayEl   = container.querySelector('.jalali-day');
  const monthEl = container.querySelector('.jalali-month');
  const yearEl  = container.querySelector('.jalali-year');

  function fillDays(jy, jm, selectedDay) {
    const dim = jalaliDaysInMonth(jy, jm);
    dayEl.innerHTML = '';
    for (let d = 1; d <= dim; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === selectedDay) opt.selected = true;
      dayEl.appendChild(opt);
    }
  }

  JALALI_MONTHS.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = idx + 1;
    opt.textContent = name;
    if (idx + 1 === j.m) opt.selected = true;
    monthEl.appendChild(opt);
  });

  yearOptions.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === j.y) opt.selected = true;
    yearEl.appendChild(opt);
  });

  fillDays(j.y, j.m, j.d);

  function emit() {
    const jy = parseInt(yearEl.value);
    const jm = parseInt(monthEl.value);
    const jd = parseInt(dayEl.value);
    fillDays(jy, jm, jd);
    const iso = jalaliToGreg(jy, jm, parseInt(dayEl.value));
    const hidden = document.getElementById(hiddenInputId);
    if (hidden) hidden.value = iso;
    if (onChange) onChange(iso);
  }

  dayEl.onchange = emit;
  monthEl.onchange = emit;
  yearEl.onchange = emit;

  // Set initial hidden value
  const hidden = document.getElementById(hiddenInputId);
  const initIso = isoValue || jalaliToGreg(j.y, j.m, j.d);
  if (hidden) hidden.value = initIso;
}
