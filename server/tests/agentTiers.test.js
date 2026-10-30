process.env.SUPABASE_URL = 'https://tiers.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-tier-test-key';
process.env.JWT_SECRET = 'isolated-tier-jwt-secret-over-32-characters';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path');
const { createTierDatabase } = require('./helpers/tierDatabase');
const { connectBillingDatabase } = require('./helpers/billingDatabase');
const { supabase } = require('../config/supabase');
const admin = require('../services/adminPlanService');
const { getSubscription, startFreeTrial } = require('../services/subscriptionService');
const { parseSearchFilters } = require('../services/propertySearchFilters');
const { assertListingCapacity, listingDatabaseError } = require('../services/listingEntitlements');
let db;
const rpc = async (name,args=[]) => (await db.query(`SELECT ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) data`,args)).rows[0].data;
const reserve = (code='LITE',user=9,id=randomUUID(),version=1) => rpc('reserve_agent_payment',[user,code,id,version]);
const settle = order => rpc('settle_agent_payment',[order.order_code,randomUUID().replaceAll('-',''),order.amount_vnd,new Date().toISOString(),'fixture']);
const listing = (user=9,type='Phòng Trọ',district='Thủ Đức') => db.query("INSERT INTO properties(owner_id,title,property_type,listing_type,district,ward,price,area,bedrooms) VALUES($1,'Test listing',$2,'RENT',$3,'Linh Trung',3000000,25,1) RETURNING *",[user,type,district]);
before(async()=> { db=await createTierDatabase(); });
beforeEach(async()=> {
  await db.exec(`TRUNCATE users CASCADE;
    INSERT INTO users(id,name,role,verification_status) VALUES(2,'Admin','ADMIN','VERIFIED'),(9,'Lite agent','AGENT','VERIFIED'),(10,'Plus agent','AGENT','VERIFIED'),(11,'Pro agent','AGENT','VERIFIED'),(12,'Customer','USER','VERIFIED');
    UPDATE agent_billing_plans SET version=1,active=code IN ('LITE','PLUS','PRO'),duration_months=1,
      amount_vnd=CASE code WHEN 'LITE' THEN 349000 WHEN 'PLUS' THEN 499000 WHEN 'PRO' THEN 999000 ELSE 1000000 END;`);
});
after(async()=>db?.close());

test('three real DB plans have exact prices, quotas, priority and support; rerunning migration preserves admin price',async()=>{
  const catalog=await rpc('agent_service_catalog');
  assert.deepEqual(catalog.plans.map(p=>[p.code,p.amount_vnd,p.listing_limit,p.priority_points,p.support_tier]),
    [['LITE',349000,10,100,'LITE'],['PLUS',499000,20,200,'PLUS'],['PRO',999000,50,300,'PRO']]);
  await db.exec("UPDATE agent_billing_plans SET amount_vnd=359000 WHERE code='LITE'");
  await db.exec(fs.readFileSync(path.join(__dirname,'../db-migration/018-agent-lite-plus-pro.sql'),'utf8'));
  assert.equal((await rpc('agent_service_catalog')).plans[0].amount_vnd,359000);
  await assert.rejects(reserve('PAID'),/Plan unavailable/);
  await assert.rejects(rpc('start_agent_free_trial',[9]),/retired/);
  await assert.rejects(startFreeTrial(9,'FREE_TRIAL'),error=>error.statusCode===409);
});

test('migration preserves a legacy paid subscription and an already issued Premium invoice',async()=>{
  const legacy=await createTierDatabase({migrate:false});
  try {
    await legacy.exec("INSERT INTO users(id,name,role,verification_status) VALUES(9,'Legacy agent','AGENT','VERIFIED'); INSERT INTO seller_subscriptions(user_id,plan_name,price_vnd,start_date,end_date,status) VALUES(9,'PAID',1000000,now() AT TIME ZONE 'UTC',(now()+interval '15 days') AT TIME ZONE 'UTC','ACTIVE')");
    const order=(await legacy.query('SELECT reserve_agent_payment(9,$1,$2,1) data',['PAID',randomUUID()])).rows[0].data;
    await legacy.exec(fs.readFileSync(path.join(__dirname,'../db-migration/018-agent-lite-plus-pro.sql'),'utf8'));
    const paid=(await legacy.query('SELECT settle_agent_payment($1,$2,$3,$4,NULL) data',[order.order_code,'a'.repeat(32),1000000,new Date().toISOString()])).rows[0].data;
    assert.equal(paid.amount_vnd,1000000);assert.equal(paid.plan_name,'Premium');assert.equal(paid.listing_limit,50);
    const current=(await legacy.query('SELECT agent_subscription_state(9) data')).rows[0].data;
    assert.equal(current.plan_name,'PAID');assert.equal(current.priority_points,300);assert.equal(current.upcoming.length,1);
  } finally {await legacy.close();}
});

test('all tiers enforce 10/20/50 public listings; hiding or ending releases a slot, editing does not consume one',async()=>{
  for(const [code,user,limit] of [['LITE',9,10],['PLUS',10,20],['PRO',11,50]]) {
    await settle(await reserve(code,user));
    for(let i=0;i<limit;i++)await listing(user);
    await assert.rejects(listing(user),/LISTING_QUOTA_EXCEEDED/);
    const id=(await db.query('SELECT min(id) id FROM properties WHERE owner_id=$1',[user])).rows[0].id;
    await db.query("UPDATE properties SET title='Changed title' WHERE id=$1",[id]);
    await db.query('UPDATE properties SET is_hidden=true WHERE id=$1',[id]);
    await listing(user);
    await assert.rejects(db.query('UPDATE properties SET is_hidden=false WHERE id=$1',[id]),/LISTING_QUOTA_EXCEEDED/);
    await db.query("UPDATE properties SET status='RENTED' WHERE id=(SELECT max(id) FROM properties WHERE owner_id=$1)",[user]);
    await db.query('UPDATE properties SET is_hidden=false WHERE id=$1',[id]);
  }
});

test('new public listings need an active verified eligible Agent subscription; hidden drafts do not consume quota',async()=>{
  await assert.rejects(listing(),/LISTING_SUBSCRIPTION_REQUIRED/);
  await db.exec("INSERT INTO properties(owner_id,title,is_hidden) VALUES(9,'Private draft',true)");
  await db.exec("INSERT INTO properties(owner_id,title,is_public) VALUES(9,'Agent private draft',false)");
  await settle(await reserve());
  await db.exec("UPDATE users SET trust_score=30 WHERE id=9");
  await assert.rejects(listing(),/LISTING_OWNER_INELIGIBLE/);
  await db.exec("UPDATE users SET trust_score=50,verification_status='UNVERIFIED' WHERE id=9");
  await assert.rejects(listing(),/LISTING_OWNER_INELIGIBLE/);
  await db.exec("UPDATE users SET verification_status='VERIFIED',is_active=false WHERE id=9");
  await assert.rejects(listing(),/LISTING_OWNER_INELIGIBLE/);
});

test('a queued downgrade caps public visibility when its period begins, preserves all records and never lifts moderation hides',async()=>{
  await settle(await reserve('PRO'));
  for(let i=0;i<15;i++)await listing();
  await settle(await reserve('LITE'));
  assert.equal((await db.query('SELECT count(*) n FROM ranked_properties WHERE owner_id=9')).rows[0].n,15);
  await db.exec("UPDATE seller_subscriptions SET end_date=(now()-interval '1 second') AT TIME ZONE 'UTC' WHERE plan_name='PRO'; UPDATE seller_subscriptions SET start_date=(now()-interval '1 second') AT TIME ZONE 'UTC' WHERE plan_name='LITE'");
  assert.equal((await db.query('SELECT count(*) n FROM ranked_properties WHERE owner_id=9')).rows[0].n,10);
  assert.equal((await db.query('SELECT count(*) n FROM properties WHERE owner_id=9')).rows[0].n,15);
  const state=await rpc('agent_subscription_state',[9]);assert.equal(state.visible_listing_count,10);assert.equal(state.public_listing_count,15);
  await assert.rejects(listing(),/LISTING_QUOTA_EXCEEDED/);
  const newest=(await db.query('SELECT max(id) id FROM properties')).rows[0].id;
  await db.query('UPDATE properties SET is_hidden=true WHERE id=$1',[newest]);
  await db.query('UPDATE properties SET is_public=false WHERE id=$1',[newest]);
  await db.query('UPDATE properties SET is_public=true WHERE id=$1',[newest]);
  assert.equal((await db.query('SELECT count(*) n FROM ranked_properties WHERE id=$1',[newest])).rows[0].n,0);
});

test('payment snapshots benefits, starts immediately without a plan and queues different tiers without granting Pro for Lite time',async()=>{
  const first=await reserve('PRO');
  await db.exec("UPDATE agent_billing_plans SET amount_vnd=1999000,listing_limit=99,priority_points=999 WHERE code='PRO'");
  const paid=await settle(first);
  assert.equal(paid.amount_vnd,999000); assert.equal(paid.listing_limit,50); assert.equal(paid.priority_points,300);
  const link=paid.payment_link_id;
  const again=await rpc('settle_agent_payment',[first.order_code,link,first.amount_vnd,new Date().toISOString(),'retry']);
  assert.equal(again.subscription_id,paid.subscription_id);
  const lower=await settle(await reserve('LITE'));
  assert.equal(lower.grant_start,paid.grant_end);
  let state=await rpc('agent_subscription_state',[9]);
  assert.equal(state.plan_name,'PRO');assert.equal(state.priority_points,300);assert.equal(state.upcoming[0].plan_name,'LITE');
  await db.exec("UPDATE seller_subscriptions SET end_date=(now()-interval '1 second') AT TIME ZONE 'UTC' WHERE plan_name='PRO'; UPDATE seller_subscriptions SET start_date=(now()-interval '1 second') AT TIME ZONE 'UTC' WHERE plan_name='LITE'; UPDATE agent_billing_plans SET listing_limit=50,priority_points=300 WHERE code='PRO'");
  state=await rpc('agent_subscription_state',[9]);assert.equal(state.plan_name,'LITE');assert.equal(state.priority_points,100);
});

test('priority ordering is applied after type/location constraints and before LIMIT; expiry and duplicate penalty take effect at read time',async()=>{
  for(const [code,user] of [['LITE',9],['PLUS',10],['PRO',11]])await settle(await reserve(code,user));
  await listing(11); await listing(10); await listing(9); await listing(11,'Căn Hộ'); await listing(11,'Phòng Trọ','Quận 7');
  const rows=await db.query("SELECT owner_id,display_priority FROM ranked_properties WHERE property_type_key='PHONG_TRO' AND district='Thủ Đức' ORDER BY display_priority DESC,id DESC LIMIT 3");
  assert.deepEqual(rows.rows.map(p=>[p.owner_id,p.display_priority]),[[11,300],[10,200],[9,100]]);
  await db.exec('UPDATE properties SET priority_score=-50 WHERE owner_id=11');
  assert.equal((await db.query('SELECT max(display_priority) score FROM ranked_properties WHERE owner_id=11')).rows[0].score,250);
  await db.exec("UPDATE seller_subscriptions SET end_date=(now()-interval '1 second') AT TIME ZONE 'UTC' WHERE user_id=11");
  assert.equal((await db.query('SELECT count(*) n FROM ranked_properties WHERE owner_id=11')).rows[0].n,0);
  await db.exec('UPDATE users SET is_active=false WHERE id=10');
  assert.equal((await db.query('SELECT count(*) n FROM ranked_properties WHERE owner_id=10')).rows[0].n,0);
});

test('reservation reuse cannot change plan; stale versions, bad amounts and anonymous/regular-user SQL access fail',async()=>{
  const id=randomUUID();const pending=await reserve('LITE',9,id);
  assert.equal((await reserve('LITE',9,id)).id,pending.id);
  await assert.rejects(reserve('PRO',9,id),/Request reused/);
  await assert.rejects(reserve('PLUS',10,randomUUID(),999),/Stale plan/);
  await assert.rejects(rpc('settle_agent_payment',[pending.order_code,'a'.repeat(32),1,new Date().toISOString(),null]),/mismatch/);
  for(const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(rpc('agent_service_catalog'),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM ranked_properties'),/permission denied/);
    await assert.rejects(rpc('agent_subscription_state',[9]),/permission denied/);
    await db.exec('RESET ROLE');
  }
});

test('backend reads truthful subscription usage and maps quota failures; Admin can change any selected tier only',async()=>{
  const restore=connectBillingDatabase(supabase,db);
  try {
    await settle(await reserve());await listing();
    const state=await getSubscription(9);assert.equal(state.effective_status,'ACTIVE');assert.equal(state.public_listing_count,1);assert.equal(state.listing_limit,10);
    assert.equal((await assertListingCapacity(9)).priority_points,100);
    assert.equal(listingDatabaseError({message:'LISTING_QUOTA_EXCEEDED'}).statusCode,409);
    const payload={planCode:'PLUS',action:'SAVE',requestId:randomUUID(),expectedVersion:1,amount:529000,durationMonths:1,active:true,reason:'Adjust Plus price',effectiveAt:null};
    const changed=await admin.change(2,payload);assert.equal(changed.plans.find(p=>p.code==='PLUS').amount_vnd,529000);assert.equal(changed.plans[0].amount_vnd,349000);
    await assert.rejects(admin.change(12,{...payload,requestId:randomUUID()}),e=>e.statusCode===403);
    assert.throws(()=>admin.parseChange({...payload,planCode:'PAID'}),e=>e.statusCode===400);
  } finally {restore();}
});

test('search API repository filters before priority ordering and LIMIT using the actual SQL RPC',async()=>{
  for(const [code,user] of [['LITE',9],['PLUS',10],['PRO',11]])await settle(await reserve(code,user));
  await listing(11);await listing(10);await listing(9);await listing(11,'Căn Hộ');await listing(11,'Phòng Trọ','Quận 7');
  const filters=parseSearchFilters(JSON.stringify({categories:['Phòng trọ'],district:'Thành phố Thủ Đức',wards:['Phường Linh Trung'],minPrice:'1000000',maxPrice:'5000000',bedrooms:['1','4+']}));
  const restore=connectBillingDatabase(supabase,db);
  try {
    const repo=require('../repositories/propertyRepository');
    const rows=await repo.fetchPublicProperties({filters,limit:2});
    assert.deepEqual(rows.map(r=>[r.owner_id,r.display_priority]),[[11,300],[10,200]]);
    const next=await repo.fetchPropertiesByIds([rows[1].id,rows[0].id],'RENT');assert.deepEqual(next.map(p=>p.owner_id),[10,11]);
    assert.equal(rows[0].owner.name,'Pro agent');assert.deepEqual(rows[0].property_images,[]);
  } finally {restore();}
  for(const value of ['[]','null','{"sort":"owner_secret"}','{"minPrice":-1}','{"bedrooms":["1),id.gt.0"]}','{"minPrice":9,"maxPrice":1}'])assert.throws(()=>parseSearchFilters(value),e=>e.statusCode===400);
});

test('personalized recommendations use plan priority first within the explicit room/Thu Duc filter',async()=>{
  for(const [code,user] of [['LITE',9],['PLUS',10],['PRO',11]])await settle(await reserve(code,user));
  await listing(11);await listing(10);await listing(9);await listing(11,'Căn Hộ');
  await db.exec('UPDATE properties SET price=1000000 WHERE owner_id=9');
  const repo=require('../repositories/propertyRepository');const preferences=require('../services/preferenceService');
  const recommendation=require('../services/recommendationService');
  const original={ favorites:repo.fetchFavoriteIds, events:repo.fetchRecentEvents, preference:preferences.getPreferences };
  const restore=connectBillingDatabase(supabase,db);
  repo.fetchFavoriteIds=async()=>[];repo.fetchRecentEvents=async()=>[];
  preferences.getPreferences=async()=>({...recommendation.DEFAULT_PREFERENCES,onboarding_completed:true,min_price:500000,max_price:1500000,updated_at:null});
  try {
    const result=await recommendation.getRecommendations(12,{category:'Phòng Trọ',filters:{district:'Thủ Đức'},limit:3});
    assert.deepEqual(result.properties.map(p=>p.owner_id),[11,10,9]);
    assert.ok(result.properties.every(p=>p.property_type==='Phòng Trọ'));
  } finally { restore();repo.fetchFavoriteIds=original.favorites;repo.fetchRecentEvents=original.events;preferences.getPreferences=original.preference; }
});

test('an older Pro listing is not lost behind the newest 500 lower-priority candidates',async()=>{
  await settle(await reserve('PRO',11));const old=(await listing(11)).rows[0];
  await db.exec(`INSERT INTO users(id,name,role,verification_status) SELECT n,'Lite fixture','AGENT','VERIFIED' FROM generate_series(100,159) n;
    INSERT INTO seller_subscriptions(user_id,plan_name,status,start_date,end_date,listing_limit,priority_points,support_tier)
      SELECT n,'LITE','ACTIVE',now() AT TIME ZONE 'UTC',(now()+interval '1 month') AT TIME ZONE 'UTC',10,100,'LITE' FROM generate_series(100,159) n;
    INSERT INTO properties(owner_id,title,property_type,listing_type,district) SELECT n,'Newer Lite fixture','Phòng Trọ','RENT','Thủ Đức' FROM generate_series(100,159) n CROSS JOIN generate_series(1,10) slot;`);
  const rows=await rpc('search_ranked_properties',[{district:'Thủ Đức'},'RENT','Phòng Trọ',500,null]);
  assert.equal(rows.length,500);assert.equal(rows[0].id,old.id);assert.equal(rows[0].display_priority,300);
});
