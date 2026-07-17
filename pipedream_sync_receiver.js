// Workflow: "Elevate Sync Receiver"
// Trigger: HTTP / Webhook (New Requests) — copy its URL into
//          PIPEDREAM_SYNC_URL in app.py
// Steps: 1) the HTTP trigger  2) this code step
//
// Add a "Data Store" prop below and pick/create a store called
// something like "elevate-outage". Use the SAME store in the other
// workflow (pipedream_alert_cron.js).

export default defineComponent({
  props: {
    dataStore: { type: "data_store" },
  },
  async run({ steps, $ }) {
    const body = steps.trigger.event.body || {};
    if (!body.outage) {
      return { ok: false, error: "no outage data in payload" };
    }
    await this.dataStore.set("outage", body.outage);
    if (body.chat_id) {
      await this.dataStore.set("chat_id", body.chat_id);
    }
    return { ok: true, synced_at: new Date().toISOString() };
  },
});
