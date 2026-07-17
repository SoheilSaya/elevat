// Workflow: "Elevate Outage Alerts"
// Trigger: Schedule / Cron — every 1 min (or every 5 min to save credits;
//          precision doesn't matter much for a "~5 min left" warning)
// Steps: 1) the Schedule trigger  2) this code step
//
// Add a "Data Store" prop below and select the SAME store used in
// pipedream_sync_receiver.js.

import { axios } from "@pipedream/platform";

// Same as TELEGRAM_BOT_TOKEN in app.py. If it ever changes, update it here too.
const BOT_TOKEN = "8203003667:AAF0XuyQvRK9uNyWqEHZilzV9VkA2yMi_1E";
const THRESHOLDS_MIN = [30, 15, 5];
const LOC_LABELS = { home: "🏠 Home", work: "🏢 Work" };

function hmToMin(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function minToHm(x) {
  x = Math.round(x) % 1440;
  if (x < 0) x += 1440;
  const h = Math.floor(x / 60), m = x % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Mirrors _predict_outage() in app.py
function predictOutage(cfg, forDateStr) {
  const refD = new Date(cfg.ref_date + "T00:00:00");
  const forD = new Date(forDateStr + "T00:00:00");
  const daysDiff = Math.round((forD - refD) / 86400000);
  const aStart = hmToMin(cfg.active_start);
  const aEnd = hmToMin(cfg.active_end);
  const span = Math.max(aEnd - aStart, 1);
  const dur = Math.max(parseInt(cfg.duration_min, 10), 1);
  const refStart = hmToMin(cfg.ref_start);
  const pos0 = (((refStart - aStart) % span) + span) % span;
  const pos = (((pos0 + daysDiff * dur) % span) + span) % span;
  const startMin = aStart + pos;
  return { start: minToHm(startMin), end: minToHm(startMin + dur) };
}

export default defineComponent({
  props: {
    dataStore: { type: "data_store" },
  },
  async run({ steps, $ }) {
    const outage = await this.dataStore.get("outage");
    const chatId = await this.dataStore.get("chat_id");
    if (!outage || !chatId) {
      return "not synced from Elevate yet";
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let log = (await this.dataStore.get("alert_log")) || {};

    // keep the log small — drop anything older than 7 days
    const cutoff = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    log = Object.fromEntries(Object.entries(log).filter(([k]) => k.split("|")[0] >= cutoff));

    let dirty = false;
    for (const loc of ["home", "work"]) {
      const cfg = outage[loc];
      if (!cfg) continue;

      const w = predictOutage(cfg, todayStr);
      const startDt = new Date(`${todayStr}T${w.start}:00`);

      for (const threshold of THRESHOLDS_MIN) {
        const targetDt = new Date(startDt.getTime() - threshold * 60000);
        const key = `${todayStr}|${loc}|${threshold}|${w.start}`;

        if (log[key] === "sent" || log[key] === "expired") continue;
        if (now < targetDt) continue;
        if (now >= startDt) {
          log[key] = "expired"; // missed the window, don't send a stale message
          dirty = true;
          continue;
        }

        let text = `${LOC_LABELS[loc]} power going out in ~${threshold} min (at ${w.start}).`;
        text += threshold <= 5
          ? " Shut down your PC and unplug sensitive devices now."
          : " Start wrapping up.";

        try {
          const res = await axios($, {
            method: "POST",
            url: `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            data: { chat_id: chatId, text },
          });
          if (res.ok) {
            log[key] = "sent";
            dirty = true;
          }
        } catch (e) {
          // send failed — leave unmarked, next tick retries automatically
        }
      }
    }

    if (dirty) {
      await this.dataStore.set("alert_log", log);
    }
  },
});
