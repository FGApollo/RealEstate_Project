process.env.SUPABASE_URL='https://visibility.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-visibility-key';
process.env.JWT_SECRET='isolated-visibility-jwt-secret-at-least-32-characters';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'); const path=require('node:path');
const { createTierDatabase }=require('./helpers/tierDatabase');
const { connectBillingDatabase }=require('./helpers/billingDatabase');
const { supabase }=require('../config/supabase');
const apply=(db,file)=>db.exec(fs.readFileSync(path.join(__dirname,'../db-migration',file),'utf8'));

test('019 restores existing no-plan, expired and future-only listings while retaining private/moderation/account protections',async()=>{
  const db=await createTierDatabase({migrate:false});
  try {
    await db.exec(`INSERT INTO users(id,role,verification_status,trust_score,is_active) VALUES
      (9,'AGENT','VERIFIED',50,true),(10,'AGENT','VERIFIED',50,true),(11,'AGENT','VERIFIED',50,true),
      (13,'AGENT','VERIFIED',50,false),(14,'AGENT','VERIFIED',30,true),(15,'AGENT','UNVERIFIED',50,true),(16,'USER','VERIFIED',50,true);
      INSERT INTO properties(id,owner_id,status,is_hidden,priority_score,property_type,listing_type) VALUES
      (101,9,'AVAILABLE',false,0,'Phòng Trọ','RENT'),(102,9,'AVAILABLE',false,0,'Phòng Trọ','RENT'),
      (103,10,'AVAILABLE',false,-50,'Phòng Trọ','RENT'),(104,11,'AVAILABLE',false,0,'Phòng Trọ','RENT'),
      (105,13,'AVAILABLE',false,0,'Phòng Trọ','RENT'),(106,14,'AVAILABLE',false,0,'Phòng Trọ','RENT'),
      (107,15,'AVAILABLE',false,0,'Phòng Trọ','RENT'),(108,16,'AVAILABLE',false,0,'Phòng Trọ','RENT'),
      (109,9,'AVAILABLE',true,0,'Phòng Trọ','RENT'),(110,9,'AVAILABLE',false,0,'Phòng Trọ','RENT'),(111,9,'SOLD',false,0,'Phòng Trọ','RENT');
      INSERT INTO seller_subscriptions(user_id,plan_name,status,start_date,end_date) VALUES
      (10,'PAID','ACTIVE',(now()-interval '2 months') AT TIME ZONE 'UTC',(now()-interval '1 month') AT TIME ZONE 'UTC'),
      (11,'PRO','ACTIVE',(now()+interval '1 month') AT TIME ZONE 'UTC',(now()+interval '2 months') AT TIME ZONE 'UTC');`);
    await apply(db,'018-agent-lite-plus-pro.sql');
    await db.exec('UPDATE properties SET is_public=false WHERE id=110');
    assert.equal((await db.query('SELECT count(*) n FROM ranked_properties')).rows[0].n,0);
    const before=(await db.query('SELECT row_to_json(p) data FROM properties p ORDER BY id')).rows;
    await apply(db,'019-restore-unsubscribed-listing-visibility.sql');
    await apply(db,'019-restore-unsubscribed-listing-visibility.sql');
    assert.deepEqual((await db.query('SELECT id,display_priority FROM ranked_properties ORDER BY id')).rows,
      [{id:101,display_priority:0},{id:102,display_priority:0},{id:103,display_priority:-50},{id:104,display_priority:0}]);
    const search=(await db.query("SELECT search_ranked_properties('{}','RENT','Phòng Trọ',24,NULL) data")).rows[0].data;
    assert.deepEqual(new Set(search.map(p=>p.id)),new Set([101,102,103,104]));
    assert.deepEqual((await db.query('SELECT row_to_json(p) data FROM properties p ORDER BY id')).rows,before);
    const state=(await db.query('SELECT agent_subscription_state(10) data')).rows[0].data;
    assert.equal(state.visible_listing_count,1);assert.equal(state.public_listing_count,1);
    await assert.rejects(db.exec("INSERT INTO properties(owner_id,status,is_public) VALUES(9,'AVAILABLE',true)"),/LISTING_SUBSCRIPTION_REQUIRED/);
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT id FROM ranked_properties'),/permission denied/);
      await db.exec('RESET ROLE');
    }
  } finally {await db.close();}
});

test('active tier cap and priority remain, expiry removes only the boost and cap rather than already published listings',async()=>{
  const db=await createTierDatabase();
  try {
    await db.exec(`INSERT INTO users(id,role,verification_status) VALUES(9,'AGENT','VERIFIED');
      INSERT INTO seller_subscriptions(user_id,plan_name,status,start_date,end_date,listing_limit,priority_points,support_tier)
        VALUES(9,'PRO','ACTIVE',(now()-interval '1 day') AT TIME ZONE 'UTC',(now()+interval '1 month') AT TIME ZONE 'UTC',50,300,'PRO');
      INSERT INTO properties(owner_id,status,is_public,priority_score) SELECT 9,'AVAILABLE',true,0 FROM generate_series(1,15);
      UPDATE seller_subscriptions SET plan_name='LITE',listing_limit=10,priority_points=100,support_tier='LITE';`);
    assert.equal((await db.query('SELECT count(*) n FROM ranked_properties')).rows[0].n,10);
    assert.equal((await db.query('SELECT min(display_priority) score FROM ranked_properties')).rows[0].score,100);
    await db.exec("UPDATE seller_subscriptions SET end_date=(now()-interval '1 second') AT TIME ZONE 'UTC'");
    assert.equal((await db.query('SELECT count(*) n FROM ranked_properties')).rows[0].n,15);
    assert.equal((await db.query('SELECT max(display_priority) score FROM ranked_properties')).rows[0].score,0);
    const state=(await db.query('SELECT agent_subscription_state(9) data')).rows[0].data;
    assert.equal(state.visible_listing_count,15);
    await assert.rejects(db.exec("INSERT INTO properties(owner_id,status,is_public) VALUES(9,'AVAILABLE',true)"),/LISTING_SUBSCRIPTION_REQUIRED/);
  } finally {await db.close();}
});

test('public homepage API returns an eligible existing room without a plan, with explicit filters and public-only fields',async()=>{
  const db=await createTierDatabase({migrate:false});let server;let restore;
  try {
    await db.exec(`INSERT INTO users(id,name,role,verification_status) VALUES(9,'Agent fixture','AGENT','VERIFIED');
      INSERT INTO properties(id,owner_id,title,property_type,listing_type,district,status) VALUES
      (101,9,'Existing room','Phòng Trọ','RENT','Thủ Đức','AVAILABLE'),
      (102,9,'Different district','Phòng Trọ','RENT','Quận 7','AVAILABLE');`);
    await apply(db,'018-agent-lite-plus-pro.sql');await apply(db,'019-restore-unsubscribed-listing-visibility.sql');
    restore=connectBillingDatabase(supabase,db);
    const express=require('express');const app=express();app.use('/api/properties',require('../routes/propertyRoutes'));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const query=new URLSearchParams({limit:'12',filters:JSON.stringify({categories:['Phòng trọ'],district:'Thủ Đức'})});
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/properties?${query}`);
    assert.equal(response.status,200);const body=await response.json();
    assert.deepEqual(body.properties.map(p=>p.id),[101]);assert.equal(body.properties[0].owner.name,'Agent fixture');
    assert.equal('owner_id' in body.properties[0],false);assert.equal('trust_score' in body.properties[0].owner,false);
  } finally {if(server)await new Promise(resolve=>server.close(resolve));restore?.();await db.close();}
});
