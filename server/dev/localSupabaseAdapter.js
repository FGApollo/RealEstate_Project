const { createDevDatabase } = require('./localDevDatabase');

async function attachLocalSupabase(supabase) {
  const db = await createDevDatabase();

  supabase.rpc = async (name, args = {}) => {
    if (name === 'user_plus_state') {
      const activeSub = (await db.query(`
        SELECT * FROM user_subscriptions
        WHERE user_id = $1 AND status = 'ACTIVE' AND start_date <= now() AND end_date > now()
        ORDER BY end_date DESC LIMIT 1
      `, [args.p_user_id])).rows[0];

      if (activeSub) {
        const periods = (await db.query(`
          SELECT start_date, end_date, source FROM user_subscriptions
          WHERE user_id = $1 AND status = 'ACTIVE' AND end_date > now()
          ORDER BY start_date
        `, [args.p_user_id])).rows;
        return {
          data: {
            active: true,
            current_end: activeSub.end_date,
            periods: periods.map((p) => ({
              start_date: p.start_date,
              end_date: p.end_date,
              source: p.source
            }))
          },
          error: null
        };
      }
      return { data: { active: false, current_end: null, periods: [] }, error: null };
    }
    if (name === 'agent_service_catalog') {
      const plans = (await db.query('SELECT * FROM agent_billing_plans WHERE active = true ORDER BY amount_vnd')).rows;
      return { data: { plans }, error: null };
    }
    if (name === 'agent_subscription_state') {
      const sub = (await db.query(`SELECT * FROM seller_subscriptions WHERE user_id = $1 AND status = 'ACTIVE' LIMIT 1`, [args.p_user_id])).rows[0];
      if (!sub) return { data: null, error: null };
      return {
        data: {
          ...sub,
          start_date: new Date(sub.start_date).toISOString(),
          end_date: new Date(sub.end_date).toISOString(),
          public_listing_count: 10,
          visible_listing_count: 10,
          upcoming: []
        },
        error: null
      };
    }

    try {
      const keys = Object.keys(args);
      const sql = `SELECT public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(',')}) AS data`;
      const { rows } = await db.query(sql, Object.values(args));
      return { data: rows[0]?.data ?? null, error: null };
    } catch (err) {
      return { data: null, error: { code: err.code || '500', message: err.message } };
    }
  };

  supabase.from = (table) => {
    let projection = '*';
    const whereClauses = [];
    const values = [];
    let orderClause = '';
    let limitVal = null;
    let offsetVal = 0;

    const builder = {
      select(cols = '*') {
        projection = cols;
        return builder;
      },
      eq(col, val) {
        values.push(val);
        whereClauses.push(`"${col}" = $${values.length}`);
        return builder;
      },
      neq(col, val) {
        values.push(val);
        whereClauses.push(`"${col}" != $${values.length}`);
        return builder;
      },
      gt(col, val) {
        values.push(val);
        whereClauses.push(`"${col}" > $${values.length}`);
        return builder;
      },
      gte(col, val) {
        values.push(val);
        whereClauses.push(`"${col}" >= $${values.length}`);
        return builder;
      },
      lte(col, val) {
        values.push(val);
        whereClauses.push(`"${col}" <= $${values.length}`);
        return builder;
      },
      in(col, arr) {
        if (!arr || arr.length === 0) {
          whereClauses.push('1 = 0');
        } else {
          const placeholders = arr.map((item) => {
            values.push(item);
            return `$${values.length}`;
          }).join(',');
          whereClauses.push(`"${col}" IN (${placeholders})`);
        }
        return builder;
      },
      or(clause) {
        whereClauses.push('(is_hidden IS NULL OR is_hidden = false)');
        return builder;
      },
      order(col, options = {}) {
        const dir = options.ascending === false ? 'DESC' : 'ASC';
        orderClause = orderClause ? `${orderClause}, "${col}" ${dir}` : `ORDER BY "${col}" ${dir}`;
        return builder;
      },
      limit(n) {
        limitVal = n;
        return builder;
      },
      range(from, to) {
        offsetVal = from;
        limitVal = to - from + 1;
        return builder;
      },
      insert(rows) {
        const rowList = Array.isArray(rows) ? rows : [rows];
        let returnCols = '*';

        const execInsert = async () => {
          try {
            const inserted = [];
            for (const row of rowList) {
              const keys = Object.keys(row);
              const vals = Object.values(row);
              const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
              const sql = `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${placeholders}) RETURNING ${returnCols === '*' || !returnCols.includes('(') ? returnCols : '*'}`;
              const { rows: res } = await db.query(sql, vals);
              if (res[0]) inserted.push(res[0]);
            }
            return { data: Array.isArray(rows) ? inserted : inserted[0] || null, error: null };
          } catch (err) {
            return { data: null, error: { code: err.code || '500', message: err.message } };
          }
        };

        const insertBuilder = {
          select(cols = '*') {
            returnCols = cols;
            return insertBuilder;
          },
          async single() {
            const res = await execInsert();
            if (res.error) return res;
            const singleData = Array.isArray(res.data) ? res.data[0] : res.data;
            return { data: singleData || null, error: null };
          },
          then(resolve, reject) {
            return execInsert().then(resolve, reject);
          }
        };

        return insertBuilder;
      },
      update(updateFields) {
        const execUpdate = async () => {
          try {
            const keys = Object.keys(updateFields);
            const vals = Object.values(updateFields);
            const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(',');
            const whereOffset = vals.length;
            const whereParts = whereClauses.map(w => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + whereOffset}`));
            const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
            const allVals = [...vals, ...values];
            const sql = `UPDATE "${table}" SET ${sets} ${whereSql} RETURNING *`;
            const { rows: res } = await db.query(sql, allVals);
            return { data: res, error: null };
          } catch (err) {
            return { data: null, error: { code: err.code || '500', message: err.message } };
          }
        };

        const updateBuilder = {
          eq(col, val) {
            builder.eq(col, val);
            return updateBuilder;
          },
          then(resolve, reject) {
            return execUpdate().then(resolve, reject);
          }
        };

        return updateBuilder;
      },
      async run() {
        try {
          if (table === 'properties' && projection.includes('owner:users!owner_id')) {
            const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const propSql = `SELECT * FROM properties ${whereSql} ${orderClause} ${limitVal ? `LIMIT ${limitVal} OFFSET ${offsetVal}` : ''}`;
            const { rows: props } = await db.query(propSql, values);
            const enriched = await Promise.all(props.map(async (p) => {
              const features = (await db.query('SELECT feature_name FROM property_features WHERE property_id = $1', [p.id])).rows;
              const images = (await db.query('SELECT image_url FROM property_images WHERE property_id = $1', [p.id])).rows;
              const tags = (await db.query('SELECT tag_name FROM lifestyle_tags WHERE property_id = $1', [p.id])).rows;
              const ownerCols = projection.includes('is_official')
                ? 'name, role, avatar, trust_score, verification_status, is_official'
                : 'name, role, avatar, trust_score, verification_status';
              const owner = (await db.query(`SELECT ${ownerCols} FROM users WHERE id = $1`, [p.owner_id])).rows[0] || null;
              return {
                ...p,
                property_features: features,
                property_images: images,
                lifestyle_tags: tags,
                owner
              };
            }));
            return { data: enriched, count: enriched.length, error: null };
          }

          const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
          const sql = `SELECT ${projection === '*' || !projection.includes('(') ? projection : '*'} FROM "${table}" ${whereSql} ${orderClause} ${limitVal ? `LIMIT ${limitVal} OFFSET ${offsetVal}` : ''}`;
          const { rows } = await db.query(sql, values);
          const count = Number((await db.query(`SELECT count(*) n FROM "${table}" ${whereSql}`, values)).rows[0]?.n || 0);
          return { data: rows, count, error: null };
        } catch (err) {
          return { data: null, count: 0, error: { code: err.code || '42000', message: err.message } };
        }
      },
      async single() {
        limitVal = 1;
        const res = await builder.run();
        if (res.error) return res;
        if (!res.data || res.data.length === 0) return { data: null, error: { code: 'PGRST116', message: 'Row not found' } };
        return { data: res.data[0], error: null };
      },
      async maybeSingle() {
        limitVal = 1;
        const res = await builder.run();
        if (res.error) return res;
        return { data: res.data?.[0] || null, error: null };
      },
      then(resolve, reject) {
        return builder.run().then(resolve, reject);
      }
    };

    return builder;
  };

  return db;
}

module.exports = { attachLocalSupabase };
