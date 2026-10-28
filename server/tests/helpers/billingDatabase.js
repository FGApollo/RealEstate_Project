const fs = require('node:fs');
const path = require('node:path');
const { createAnalyticsDatabase } = require('./analyticsDatabase');

async function createBillingDatabase() {
  const db = await createAnalyticsDatabase();
  await db.exec("SET timezone='UTC'");
  await db.exec("CREATE SEQUENCE test_billing_sub_id; ALTER TABLE seller_subscriptions ALTER COLUMN id SET DEFAULT nextval('test_billing_sub_id');");
  for (const file of ['014-agent-payos-payments.sql', '015-payos-revenue-analytics.sql', '017-admin-service-plans.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname, '../../db-migration', file), 'utf8'));
  }
  return db;
}

// Test-only PostgREST adapter. Production repositories execute the real SQL/RPC
// against an isolated PostgreSQL database; no configured Supabase is contacted.
function connectBillingDatabase(supabase, db) {
  const original = { from: supabase.from, rpc: supabase.rpc };
  supabase.rpc = async (name, args) => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('Unexpected test RPC');
    const keys = Object.keys(args);
    try {
      const { rows } = await db.query(`SELECT public.${name}(${keys.map((key, i) => {
        if (!/^p_[a-z_]+$/.test(key)) throw new Error('Unexpected test argument');
        return `${key}=>$${i + 1}`;
      }).join(',')}) AS data`, Object.values(args));
      return { data: rows[0].data, error: null };
    } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  };
  supabase.from = (table) => {
    if (!['users', 'auth_sessions', 'seller_subscriptions', 'agent_payment_orders', 'agent_billing_plans'].includes(table)) throw new Error('Unexpected test table');
    let columns = '*'; const values = []; const where = []; const orders = []; let offset = 0; let limit;
    const column = (value) => { if (!/^[a-z_]+$/.test(value)) throw new Error('Unexpected test column'); return value; };
    const predicate = (key, operator, value) => { values.push(value); where.push(`${column(key)}${operator}$${values.length}`); return builder; };
    const run = async () => {
      try {
        const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
        const sql = `SELECT ${columns} FROM ${table}${filter}${orders.length ? ` ORDER BY ${orders.join(',')}` : ''}${limit ? ` LIMIT ${limit} OFFSET ${offset}` : ''}`;
        const { rows } = await db.query(sql, values);
        const count = Number((await db.query(`SELECT count(*) n FROM ${table}${filter}`, values)).rows[0].n);
        return { data: rows, count, error: null };
      } catch (error) { return { data: null, error }; }
    };
    const builder = {
      select(value) { if (!/^(\*|[a-z_, ]+)$/.test(value)) throw new Error('Unexpected projection'); columns = value; return builder; },
      eq: (key, value) => predicate(key, '=', value), gt: (key, value) => predicate(key, '>', value),
      lte: (key, value) => predicate(key, '<=', value),
      order(key, options = {}) { orders.push(`${column(key)} ${options.ascending === false ? 'DESC' : 'ASC'} NULLS ${options.nullsFirst ? 'FIRST' : 'LAST'}`); return builder; },
      limit(value) { limit = value; return builder; },
      range(start, end) { offset = start; limit = end - start + 1; return builder; },
      async maybeSingle() { const result = await run(); return { ...result, data: result.data?.[0] || null }; },
      then(resolve, reject) { return run().then(resolve, reject); }
    };
    return builder;
  };
  return () => Object.assign(supabase, original);
}
module.exports = { createBillingDatabase, connectBillingDatabase };
