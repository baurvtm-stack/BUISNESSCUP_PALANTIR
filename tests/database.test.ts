import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import catalog from "@/data/catalog.json";

// Run the production migrations against PostgreSQL, including actual RPC bodies
// and privilege checks. Provider mocks cannot catch SQL syntax/locking mistakes.
const sql = new PGlite();
beforeAll(async () => {
  await sql.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const dir = resolve(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await sql.exec(readFileSync(resolve(dir, file), "utf8"));
  }
}, 30000);
afterAll(async () => {
  await sql.close();
});

async function scalar<T>(query: string, params: unknown[] = []): Promise<T> {
  const result = await sql.query<Record<string, T>>(query, params);
  return Object.values(result.rows[0])[0];
}

async function kit(slug: string) {
  return scalar<string>(
    `insert into kits(slug, answers, items, created_at)
    values($1, '{}', $2::jsonb, now() - interval '100 days') returning id`,
    [
      slug,
      JSON.stringify([
        {
          pick: {
            product: { id: "boots", name: "Work boots" },
            lifespanMonths: 1,
          },
        },
      ]),
    ],
  );
}
async function signup(slug: string, email: string, token: string) {
  await sql.query("select register_reminder($1,$2,$3,$4)", [
    email,
    slug,
    token,
    `unsubscribe-${token}`,
  ]);
}

describe("production SQL migrations", () => {
  it("enforces one atomic rate-limit budget across concurrent calls and resets expired keys", async () => {
    const accepted = await Promise.all(
      Array.from({ length: 8 }, () =>
        scalar<boolean>("select retention_rate_limit('parallel',3,3600)"),
      ),
    );
    expect(accepted.filter(Boolean)).toHaveLength(3);
    expect(
      await scalar<number>(
        "select hits from retention_rate_limits where key='parallel'",
      ),
    ).toBe(4);
    await sql.exec(
      "update retention_rate_limits set expires_at=now()-interval '1 second' where key='parallel'",
    );
    expect(
      await scalar<boolean>("select retention_rate_limit('parallel',3,3600)"),
    ).toBe(true);
  });

  it("denies browser roles table access and RPC execution while granting service role", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of [
        "kits",
        "reminders",
        "reminder_deliveries",
        "subscriptions",
        "pro_checkouts",
        "wear_entries",
      ]) {
        expect(
          await scalar<boolean>("select has_table_privilege($1,$2,'SELECT')", [
            role,
            table,
          ]),
        ).toBe(false);
      }
      for (const fn of [
        "retention_rate_limit(text,integer,integer)",
        "confirm_reminder(text)",
        "claim_reminder_delivery(boolean,text)",
        "apply_stripe_subscription(text,bigint,text,uuid,text,text,text,boolean,timestamptz)",
      ]) {
        expect(
          await scalar<boolean>(
            "select has_function_privilege($1,$2,'EXECUTE')",
            [role, fn],
          ),
        ).toBe(false);
      }
    }
    expect(
      await scalar<boolean>(
        "select has_table_privilege('service_role','reminders','SELECT')",
      ),
    ).toBe(true);
    expect(
      await scalar<boolean>(
        "select has_function_privilege('service_role','confirm_reminder(text)','EXECUTE')",
      ),
    ).toBe(true);
  });

  it("queues only confirmed reminders, leases each delivery once and honors unsubscribe", async () => {
    const slug = "Confirmed001";
    await kit(slug);
    await signup(slug, "worker@example.com", "confirmed-hash");
    expect(
      (
        await sql.query("select * from claim_reminder_delivery(false,$1)", [
          slug,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(await scalar("select confirm_reminder('confirmed-hash')")).toEqual({
      status: "confirmed",
      slug,
    });
    expect(await scalar("select confirm_reminder('confirmed-hash')")).toEqual({
      status: "confirmed",
      slug,
    });
    expect(
      await scalar<boolean>(
        `select d.due_at = k.created_at + interval '30.4 days' - interval '7 days'
      from reminder_deliveries d join reminders r on r.id=d.reminder_id join kits k on k.id=r.kit_id
      where k.slug=$1 and not d.is_demo`,
        [slug],
      ),
    ).toBe(true);
    const claims = await Promise.all([
      sql.query("select * from claim_reminder_delivery(false,$1)", [slug]),
      sql.query("select * from claim_reminder_delivery(false,$1)", [slug]),
    ]);
    expect(claims.flatMap((result) => result.rows)).toHaveLength(1);
    expect(
      await scalar("select unsubscribe_reminder('unsubscribe-confirmed-hash')"),
    ).toEqual({ status: "unsubscribed", slug });
    await sql.exec("update reminder_deliveries set claim_until=null");
    expect(
      (
        await sql.query("select * from claim_reminder_delivery(false,$1)", [
          slug,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(await scalar("select confirm_reminder('confirmed-hash')")).toEqual({
      status: "expired",
      slug,
    });
    expect(
      await scalar<boolean>(
        "select unsubscribed_at is not null from reminders where email='worker@example.com'",
      ),
    ).toBe(true);
  });

  it("returns expired/invalid status with slug and queues a fresh demo on every rehearsal", async () => {
    const slug = "DemoSaved001";
    await kit(slug);
    await signup(slug, "demo@example.com", "demo-hash");
    expect(
      await scalar<number>("select queue_demo_reminders($1)", [slug]),
    ).toBe(0);
    await sql.exec(
      "update reminders set confirm_expires_at=now()-interval '1 second' where confirm_hash='demo-hash'",
    );
    expect(await scalar("select confirm_reminder('demo-hash')")).toEqual({
      status: "expired",
      slug,
    });
    expect(await scalar("select confirm_reminder('missing')")).toEqual({
      status: "invalid",
      slug: null,
    });
    expect(await scalar("select unsubscribe_reminder('missing')")).toEqual({
      status: "invalid",
      slug: null,
    });
    await signup(slug, "demo@example.com", "fresh-demo-hash");
    expect(await scalar("select confirm_reminder('fresh-demo-hash')")).toEqual({
      status: "confirmed",
      slug,
    });
    expect(
      await scalar<number>("select queue_demo_reminders($1)", [slug]),
    ).toBe(1);
    const demo = await sql.query<{
      id: string;
      is_demo: boolean;
      item_name: string;
    }>("select * from claim_reminder_delivery(true,$1)", [slug]);
    expect(demo.rows).toHaveLength(1);
    expect(demo.rows[0].is_demo).toBe(true);
    expect(demo.rows[0].item_name).toBe("Work boots");
    await sql.query(
      "update reminder_deliveries set sent_at=now() where id=$1",
      [demo.rows[0].id],
    );
    expect(
      await scalar<number>("select queue_demo_reminders($1)", [slug]),
    ).toBe(1);
    const second = await sql.query<{ id: string }>(
      "select * from claim_reminder_delivery(true,$1)",
      [slug],
    );
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0].id).not.toBe(demo.rows[0].id);
    expect(
      await scalar<number>(
        `select count(*)::int from reminder_deliveries d join reminders r on r.id=d.reminder_id
      join kits k on k.id=r.kit_id where k.slug=$1 and not d.is_demo`,
        [slug],
      ),
    ).toBe(1);
    expect(
      (
        await sql.query("select * from claim_reminder_delivery(false,$1)", [
          slug,
        ])
      ).rows,
    ).toHaveLength(1);
  });

  it("quarantines ambiguous mail attempts after the provider idempotency window", async () => {
    await sql.exec(
      "update reminder_deliveries set claim_until=null, first_attempt_at=now()-interval '24 hours' where is_demo=true",
    );
    expect(
      (
        await sql.query(
          "select * from claim_reminder_delivery(true,'DemoSaved001')",
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("applies Stripe events atomically, ignores replay/stale state and keeps cancellation terminal", async () => {
    const checkout = await scalar<string>(
      "insert into pro_checkouts(email,token_hash) values('pro@example.com','hash-pro') returning id",
    );
    const apply = (id: string, stamp: number, status: string) =>
      sql.query(
        "select apply_stripe_subscription($1,$2,'sub_test',$3,'pro@example.com',$4,'cus_test',false)",
        [id, stamp, checkout, status],
      );
    await apply("evt_active", 200, "active");
    await apply("evt_active", 300, "past_due");
    await apply("evt_stale", 100, "past_due");
    expect(
      await scalar<string>(
        "select status from subscriptions where id='sub_test'",
      ),
    ).toBe("active");
    await apply("evt_cancel", 300, "canceled");
    await apply("evt_late_active", 400, "active");
    expect(
      await scalar<string>(
        "select status from subscriptions where id='sub_test'",
      ),
    ).toBe("canceled");
    expect(
      await scalar<boolean>(
        "select activated_at is not null from subscriptions where id='sub_test'",
      ),
    ).toBe(true);
    expect(
      await scalar<number>("select count(*)::int from stripe_events"),
    ).toBe(4);
  });

  it("leases deal alerts once, retries inside the idempotency window and never resends acknowledged mail", async () => {
    const checkout = await scalar<string>(
      "select id from pro_checkouts where email='pro@example.com'",
    );
    const alert = await scalar<string>(
      "insert into pro_deal_alerts(checkout_id,email,kit_slug) values($1,'pro@example.com','DemoSaved001') returning id",
      [checkout],
    );
    const claim = () =>
      scalar<boolean>("select claim_deal_delivery($1,'price-drop')", [alert]);
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    await sql.query(
      "update deal_alert_deliveries set claimed_at=now()-interval '6 minutes' where alert_id=$1",
      [alert],
    );
    expect(await claim()).toBe(true);
    await sql.query(
      "update deal_alert_deliveries set sent_at=now(),claimed_at=now()-interval '6 minutes' where alert_id=$1",
      [alert],
    );
    expect(await claim()).toBe(false);
    await sql.query(
      "update deal_alert_deliveries set sent_at=null,first_attempt_at=now()-interval '24 hours' where alert_id=$1",
      [alert],
    );
    expect(await claim()).toBe(false);
  });

  it("counts actual click rows from the catalog migration, including zero clicks", async () => {
    const before = await scalar<{
      kitsCreated: number;
      clicks: number;
      clickTrackingAvailable: boolean;
      proConversions: number;
      activePro: number;
    }>("select retention_stats()");
    expect(before.kitsCreated).toBe(2);
    expect(before.clicks).toBe(0);
    expect(before.clickTrackingAvailable).toBe(true);
    expect(before.proConversions).toBe(1);
    expect(before.activePro).toBe(0);
    // Use the real catalog row and click foreign key, never a fake clicks table.
    await sql.query(
      "insert into products select * from jsonb_populate_record(null::products,$1::jsonb)",
      [JSON.stringify({ ...catalog[0], created_at: "2026-11-14T00:00:00Z" })],
    );
    await sql.query("insert into clicks(product_id) values($1),($1),($1)", [
      catalog[0].id,
    ]);
    const after = await scalar<{
      clicks: number;
      clickTrackingAvailable: boolean;
    }>("select retention_stats()");
    expect(after.clicks).toBe(3);
    expect(after.clickTrackingAvailable).toBe(true);
  });

  it("records checkout activation without a webhook and deduplicates repeat status reads", async () => {
    const checkout = await scalar<string>(
      "insert into pro_checkouts(email,token_hash) values('trial@example.com','hash-trial') returning id",
    );
    const apply = () =>
      sql.query(
        `select apply_stripe_subscription('checkout:cs_test_trial',500,'sub_trial',$1,
      'trial@example.com','trialing','cus_trial',false,now()+interval '30 days')`,
        [checkout],
      );
    await apply();
    await apply();
    expect(
      await scalar<number>(
        "select count(*)::int from stripe_events where id='checkout:cs_test_trial'",
      ),
    ).toBe(1);
    expect(
      await scalar<{ proConversions: number; activePro: number }>(
        "select retention_stats()",
      ),
    ).toMatchObject({ proConversions: 2, activePro: 1 });
  });

  it("runs the paste-ready setup after catalog migrations in one transaction", async () => {
    const setup = new PGlite();
    try {
      await setup.exec(
        "create role anon; create role authenticated; create role service_role bypassrls;",
      );
      for (const file of [
        "202611140001_catalog.sql",
        "202611140002_clicks.sql",
      ]) {
        await setup.exec(
          readFileSync(resolve("supabase/migrations", file), "utf8"),
        );
      }
      await setup.exec(
        readFileSync(resolve("supabase/retention-setup.sql"), "utf8"),
      );
      const result = await setup.query<{
        stats: { kitsCreated: number; clicks: number };
      }>("select retention_stats() as stats");
      expect(result.rows[0].stats).toMatchObject({ kitsCreated: 0, clicks: 0 });
    } finally {
      await setup.close();
    }
  });
});
