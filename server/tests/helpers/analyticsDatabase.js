const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

async function createAnalyticsDatabase() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE users (
      id integer PRIMARY KEY, name text, email text, avatar text, role varchar(20) DEFAULT 'USER', phone text, phone_verified boolean DEFAULT false,
      email_verified_at timestamptz DEFAULT now(), verification_status text DEFAULT 'UNVERIFIED',
      trust_score integer DEFAULT 50, is_active boolean DEFAULT true,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE seller_subscriptions (
      id integer PRIMARY KEY, user_id integer REFERENCES users(id) ON DELETE CASCADE,
      plan_name varchar(50) DEFAULT 'PRO_SELLER', price_vnd numeric DEFAULT 129000,
      start_date timestamp DEFAULT CURRENT_TIMESTAMP, end_date timestamp,
      status varchar(20) DEFAULT 'ACTIVE', created_at timestamp DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE user_billing_plans (
      code text PRIMARY KEY, name text NOT NULL,
      amount_vnd integer NOT NULL, duration_months integer NOT NULL,
      active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE user_subscriptions (
      id bigint PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_code text NOT NULL DEFAULT 'USER_PLUS', price_vnd integer NOT NULL DEFAULT 20000,
      start_date timestamptz NOT NULL, end_date timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'ACTIVE', source text NOT NULL DEFAULT 'PAYOS',
      ended_reason text, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE auth_sessions (
      id uuid PRIMARY KEY, user_id integer REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz, revoked_at timestamptz
    );
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT ON users, seller_subscriptions, user_billing_plans, user_subscriptions TO service_role;
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../../db-migration/010-admin-analytics.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../db-migration/016-admin-active-subscription-agents.sql'), 'utf8'));
  return db;
}

async function seedAnalyticsDatabase(db) {
  await db.exec(`
    TRUNCATE users, user_billing_plans CASCADE;
    INSERT INTO user_billing_plans (code, name, amount_vnd, duration_months)
    VALUES ('USER_PLUS', 'Swipe Nest Plus', 20000, 1);
    INSERT INTO users (id, name, email, role, created_at)
    SELECT n, 'Fixture ' || n, 'fixture' || n || '@example.test',
      CASE WHEN n <= 8 THEN 'USER' ELSE 'AGENT' END,
      CASE WHEN n <= 4 OR n IN (10,12) THEN timestamp '2026-10-10 04:00:00'
           WHEN n <= 8 THEN timestamp '2026-09-20 04:00:00'
           ELSE timestamp '2026-08-01 04:00:00' END
    FROM generate_series(1,12) n;
    UPDATE users SET is_active=false WHERE id=10;
    INSERT INTO seller_subscriptions (id,user_id,plan_name,price_vnd,status,start_date,end_date,created_at) VALUES
      (1,9,'DB_PLAN_A',100000,'EXPIRED','2026-08-01','2026-09-01','2026-08-01'),
      (2,9,'DB_PLAN_A',200000,'ACTIVE','2026-10-10','2026-11-10','2026-10-10'),
      (3,9,'DB_PLAN_B',500000,'ACTIVE','2026-10-11','2026-11-11','2026-10-11'),
      (4,10,'DB_PLAN_A',100000,'ACTIVE','2026-10-10','2026-11-10','2026-10-10'),
      (5,11,'DB_PLAN_B',500000,'CANCELLED','2026-08-01','2026-11-01','2026-08-01');
    INSERT INTO user_subscriptions (id,user_id,plan_code,price_vnd,start_date,end_date,status,source,created_at) VALUES
      (101,1,'USER_PLUS',20000,'2026-10-10T04:00:00Z','2026-11-10T04:00:00Z','ACTIVE','PAYOS','2026-10-10T04:00:00Z'),
      (102,1,'USER_PLUS',20000,'2026-11-10T04:00:00Z','2026-12-10T04:00:00Z','ACTIVE','PAYOS','2026-10-12T04:00:00Z'),
      (103,2,'USER_PLUS',0,'2026-10-11T04:00:00Z','2026-11-05T04:00:00Z','ACTIVE','ADMIN','2026-10-11T04:00:00Z'),
      (104,5,'USER_PLUS',20000,'2026-08-01T04:00:00Z','2026-09-01T04:00:00Z','ACTIVE','PAYOS','2026-08-01T04:00:00Z'),
      (105,6,'USER_PLUS',0,'2026-09-20T04:00:00Z','2026-10-20T04:00:00Z','CANCELLED','ADMIN','2026-09-20T04:00:00Z');
  `);
}

async function queryDashboard(db, start = '2026-10-10', end = '2026-10-16', bucket = 'day', asOf = '2026-10-16T12:00:00Z') {
  const result = await db.query('SELECT public.admin_analytics_dashboard($1::date,$2::date,$3::text,$4::timestamptz) AS data', [start, end, bucket, asOf]);
  return result.rows[0].data;
}

// Test-only bridge: real PostgreSQL executes the production RPC. Authentication
// and Plus/transaction analytics read the isolated local tables, never any remote database.
function connectTestDatabase(supabase, db) {
  const original = { from: supabase.from, rpc: supabase.rpc };
  supabase.rpc = async (name, args) => {
    if (['admin_payment_revenue','admin_payment_transactions'].includes(name)) return { data: null, error: { code: 'PGRST202' } };
    if (name === 'admin_analytics_active_agents') {
      try {
        const result = await db.query('SELECT public.admin_analytics_active_agents($1::timestamptz,$2::integer,$3::integer) AS data',
          [args.p_snapshot_at,args.p_page,args.p_limit]);
        return { data: result.rows[0].data, error: null };
      } catch (error) { return { data: null, error }; }
    }
    if (name !== 'admin_analytics_dashboard') throw new Error(`Unexpected test RPC ${name}`);
    try { return { data: await queryDashboard(db, args.p_start, args.p_end, args.p_bucket, args.p_as_of), error: null }; }
    catch (error) { return { data: null, error }; }
  };
  supabase.from = (table) => {
    if (!['users', 'auth_sessions', 'user_subscriptions', 'user_billing_plans', 'agent_payment_orders'].includes(table)) {
      throw new Error(`Unexpected test table ${table}`);
    }
    let columns = '*';
    let selectOptions = {};
    const predicates = [];
    const values = [];
    const orderClauses = [];
    let rangeBounds = null;

    const execute = async () => {
      if (!/^[a-z_, *]+$/.test(columns)) throw new Error('Invalid test columns');
      const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
      const orderSql = orderClauses.length ? ` ORDER BY ${orderClauses.join(', ')}` : '';
      const limit = rangeBounds ? ` LIMIT ${rangeBounds[1] - rangeBounds[0] + 1} OFFSET ${rangeBounds[0]}` : '';
      try {
        let count = null;
        if (selectOptions.count === 'exact') {
          const countRes = await db.query(`SELECT count(*)::integer AS total FROM ${table}${where}`, values);
          count = countRes.rows[0]?.total ?? 0;
        }
        if (selectOptions.head) return { data: null, count, error: null };
        const { rows } = await db.query(`SELECT ${columns} FROM ${table}${where}${orderSql}${limit}`, values);
        return { data: rows, count, error: null };
      } catch (error) {
        return { data: null, count: null, error };
      }
    };

    const builder = {
      select(value, options = {}) { columns = value; selectOptions = options || {}; return builder; },
      eq(column, value) {
        if (!/^[a-z_]+$/.test(column)) throw new Error('Invalid test column');
        values.push(value); predicates.push(`${column}=$${values.length}`); return builder;
      },
      gte(column, value) {
        if (!/^[a-z_]+$/.test(column)) throw new Error('Invalid test column');
        values.push(value); predicates.push(`${column}>=$${values.length}`); return builder;
      },
      lt(column, value) {
        if (!/^[a-z_]+$/.test(column)) throw new Error('Invalid test column');
        values.push(value); predicates.push(`${column}<$${values.length}`); return builder;
      },
      in(column, list) {
        if (!/^[a-z_]+$/.test(column)) throw new Error('Invalid test column');
        if (!Array.isArray(list) || !list.length) {
          predicates.push('FALSE');
          return builder;
        }
        const placeholders = list.map((item) => {
          values.push(item);
          return `$${values.length}`;
        });
        predicates.push(`${column} IN (${placeholders.join(',')})`);
        return builder;
      },
      order(column, options = {}) {
        if (!/^[a-z_]+$/.test(column)) throw new Error('Invalid test order column');
        orderClauses.push(`${column} ${options.ascending === false ? 'DESC' : 'ASC'}`);
        return builder;
      },
      range(from, to) {
        rangeBounds = [Number(from), Number(to)];
        return builder;
      },
      async maybeSingle() {
        const result = await execute();
        return { data: result.data?.[0] || null, error: result.error };
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      }
    };
    return builder;
  };
  return () => Object.assign(supabase, original);
}

module.exports = { createAnalyticsDatabase, seedAnalyticsDatabase, queryDashboard, connectTestDatabase };
