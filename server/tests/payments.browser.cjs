process.env.SUPABASE_URL='https://payments-browser.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test-key';
process.env.JWT_SECRET='isolated-payment-browser-test-secret-over-32-characters';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const express=require('express');
const {randomUUID}=require('node:crypto');
const {PayOS}=require('@payos/node');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const {connectBillingDatabase}=require('./helpers/billingDatabase');
const {createTierDatabase}=require('./helpers/tierDatabase');
const {supabase}=require('../config/supabase');
const jwt=require('jsonwebtoken');
const {getJwtConfig}=require('../services/authSessionService');
const paymentService=require('../services/paymentService');
const {createPayosService}=require('../services/payosService');

(async()=>{
  const db=await createTierDatabase(); const restore=connectBillingDatabase(supabase,db);
  let browser,vite,server; const checks=[],errors=[],remotes=new Map();
  const out=path.resolve(__dirname,'../../.local/payos-verification'); fs.mkdirSync(out,{recursive:true});
  const env={PAYOS_CLIENT_ID:'fixture-client',PAYOS_API_KEY:'fixture-api',PAYOS_CHECKSUM_KEY:'fixture-checksum',PAYOS_ENABLED:'true',FRONTEND_URL:'http://localhost'};
  const cryptoSdk=new PayOS({clientId:env.PAYOS_CLIENT_ID,apiKey:env.PAYOS_API_KEY,checksumKey:env.PAYOS_CHECKSUM_KEY});
  const provider=createPayosService(env,{fetch:async(input,init)=>{
    const url=String(input); let data;
    if(init.method==='POST'&&!url.endsWith('/cancel')){
      const request=JSON.parse(init.body); const code=request.orderCode;
      const link=code.toString(16).padStart(32,'0');
      if(!remotes.has(code))remotes.set(code,{id:link,orderCode:code,amount:request.amount,status:'PENDING',amountPaid:0,amountRemaining:request.amount,transactions:[]});
      const remote=remotes.get(code);
      data={...remote,paymentLinkId:remote.id,currency:'VND',checkoutUrl:`https://pay.payos.vn/web/${remote.id}`};
    }else{
      const code=Number(url.split('/').filter(Boolean).at(url.endsWith('/cancel')?-2:-1));
      data=remotes.get(code); assert.ok(data,'Provider order exists');
      if(url.endsWith('/cancel')&&data.status!=='PAID')data.status='CANCELLED';
    }
    const signature=await cryptoSdk.crypto.createSignatureFromObj(data,env.PAYOS_CHECKSUM_KEY);
    return new Response(JSON.stringify({code:'00',desc:'success',data,signature}),{headers:{'Content-Type':'application/json'}});
  }});
  Object.assign(paymentService,paymentService.createPaymentService(undefined,provider));
  try{
    await db.exec("INSERT INTO users(id,name,role) VALUES(9,'Billing Agent','AGENT'),(10,'Other Agent','AGENT'),(99,'Billing Admin','ADMIN');");
    const sessions={};
    for(const id of [9,10,99]){
      const sid=randomUUID();await db.query('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,$3)',[sid,id,new Date(Date.now()+3600000).toISOString()]);
      const {secret,issuer,audience}=getJwtConfig();
      sessions[id]=jwt.sign({token_use:'access',sid},secret,{algorithm:'HS256',subject:String(id),issuer,audience,expiresIn:'1h'});
    }
    let loginId=9,loggedIn=true;
    const user=async()=> (await db.query('SELECT * FROM users WHERE id=$1',[loginId])).rows[0];
    const app=express();app.use(express.json());
    app.post('/api/auth/refresh',async(_req,res)=>loggedIn?res.json({user:await user(),accessToken:sessions[loginId]}):res.status(401).json({error:'Guest'}));
    app.post('/api/login',async(_req,res)=>{loggedIn=true;res.json({user:await user(),accessToken:sessions[loginId]});});
    app.use('/api/payments',require('../routes/paymentRoutes'));
    app.use('/api/subscriptions',require('../routes/subscriptionRoutes'));
    app.use('/api/admin',require('../routes/adminRoutes'));
    app.get('/api/agent/overview',async(_req,res)=>res.json({agent:await user(),activeListings:[],totalProperties:0,totalViews:0,totalFavorites:0}));
    app.use('/api',(_req,res)=>res.json({properties:[],stats:{},violations:[],conversations:[]}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;process.env.VITE_API_URL=base;env.FRONTEND_URL=base;
    const {createServer}=await import('vite');vite=await createServer({root:path.resolve(__dirname,'../..'),server:{middlewareMode:true,hmr:false},appType:'custom'});
    app.use(vite.middlewares);app.use(async(_req,res)=>res.type('html').send(await vite.transformIndexHtml('/','<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/server/tests/fixtures/sessionPreview.jsx"></script></body></html>')));
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',err=>errors.push(err.message));
    // Checkout is a local page fixture at the official URL. No gateway network or real transfer.
    await page.route('https://pay.payos.vn/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Isolated payOS checkout fixture</h1>'}));
    await page.goto(`${base}/sale/overview?tab=pricing`);
    await page.getByRole('heading',{name:'Gói dịch vụ & thanh toán',exact:true}).waitFor();
    await page.locator('[data-plan-code="PRO"]').waitFor();
    assert.equal(await page.locator('.pricing-card').count(),3);
    for(const [code,name,amount,limit,points] of [['LITE','Lite','349.000',10,100],['PLUS','Plus','499.000',20,200],['PRO','Pro','999.000',50,300]]) {
      const card=page.locator(`[data-plan-code="${code}"]`);const text=await card.textContent();
      assert.ok(text.includes(amount)&&text.includes(`${limit} tin`)&&text.includes(`${points} điểm`)&&text.includes(`Support ${name}`));
      await card.getByRole('button',{name:'Thanh toán bằng payOS',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'Xác nhận thanh toán',exact:true});await dialog.waitFor();
      assert.ok((await dialog.textContent()).includes(amount));
      await dialog.getByRole('button',{name:'Quay lại',exact:true}).click();
    }
    await page.locator('.popular-plan').getByRole('button',{name:'Thanh toán bằng payOS',exact:true}).waitFor();
    await page.locator('.popular-plan').getByRole('button',{name:'Thanh toán bằng payOS',exact:true}).click();
    await page.getByRole('button',{name:'Xác nhận và tiếp tục',exact:true}).click();
    await page.waitForURL('https://pay.payos.vn/**');
    const first=(await db.query('SELECT * FROM agent_payment_orders ORDER BY created_at LIMIT 1')).rows[0];
    assert.equal(first.amount_vnd,999000);assert.equal(first.status,'PENDING');
    checks.push('Real Agent UI → authenticated route → DB price/order → signed SDK response → hosted checkout');
    await page.goto(`${base}/sale/payment/${first.id}?status=PAID&code=00&cancel=false`);
    await page.getByRole('heading',{name:'Chờ thanh toán',exact:true}).waitFor();
    assert.equal(Number((await db.query('SELECT count(*) n FROM seller_subscriptions')).rows[0].n),0);
    await page.screenshot({path:path.join(out,'payment-pending.png'),fullPage:true});
    checks.push('Forged return URL status does not activate; owned status API verifies provider');
    const remote=remotes.get(Number(first.order_code));remote.status='PAID';remote.amountPaid=999000;remote.amountRemaining=0;
    const data={orderCode:Number(first.order_code),paymentLinkId:remote.id,amount:999000,currency:'VND',code:'00'};
    const signature=await cryptoSdk.crypto.createSignatureFromObj(data,env.PAYOS_CHECKSUM_KEY);
    for(let i=0;i<2;i++)assert.equal((await fetch(`${base}/api/payments/payos/webhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,signature})})).status,200);
    await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();
    await page.getByRole('heading',{name:'Đã thanh toán',exact:true}).waitFor();
    const subscription=(await db.query('SELECT * FROM seller_subscriptions WHERE user_id=9')).rows[0];
    await page.screenshot({path:path.join(out,'payment-success.png'),fullPage:true});
    checks.push('Signed webhook twice → one atomic activation → success result and expiry');
    await page.getByRole('link',{name:'← Gói dịch vụ & thanh toán'}).click();
    await page.getByRole('button',{name:'Gia hạn bằng payOS',exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'pricing-desktop.png'),fullPage:true});
    assert.equal(await page.getByRole('cell',{name:'Đã thanh toán',exact:true}).count(),1);
    await page.getByRole('button',{name:'Gia hạn bằng payOS',exact:true}).click();
    await page.getByRole('button',{name:'Xác nhận và tiếp tục',exact:true}).click();await page.waitForURL('https://pay.payos.vn/**');
    const second=(await db.query('SELECT * FROM agent_payment_orders WHERE id<>$1 ORDER BY created_at DESC LIMIT 1',[first.id])).rows[0];
    await page.goto(`${base}/sale/payment/${second.id}`);
    await page.getByRole('button',{name:'Hủy đơn',exact:true}).click();await page.getByRole('button',{name:'Xác nhận hủy đơn',exact:true}).click();
    await page.getByRole('heading',{name:'Đã hủy',exact:true}).waitFor();
    assert.equal((await db.query('SELECT end_date FROM seller_subscriptions WHERE id=$1',[subscription.id])).rows[0].end_date.toISOString(),subscription.end_date.toISOString());
    checks.push('Renewal checkout and explicit cancellation do not alter paid entitlement');
    loginId=10;await page.goto(`${base}/sale/payment/${first.id}`);await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').textContent()).includes('Không tìm thấy'));
    checks.push('Other Agent cannot read another order');
    loginId=9;loggedIn=false;await page.goto(`${base}/sale/payment/${first.id}?status=PAID`);await page.waitForURL(`${base}/login/agent`);
    await page.getByPlaceholder('email@example.com').fill('agent@example.test');await page.locator('input[type=password]').fill('Strong-password-123!');await page.getByRole('button',{name:'Đăng nhập Môi giới',exact:true}).click();
    await page.waitForURL(`${base}/sale/payment/${first.id}`);await page.getByRole('heading',{name:'Đã thanh toán',exact:true}).waitFor();
    checks.push('Expired browser session → Agent login → owned payment page with untrusted query stripped');
    await db.exec("INSERT INTO agent_payment_orders(user_id,request_id,plan_code,plan_name,amount_vnd,duration_months,status,created_at) SELECT 9,gen_random_uuid(),'PAID','Premium',999000,1,'CANCELLED',now()-interval '1 day' FROM generate_series(1,10)");
    env.PAYOS_ENABLED='false';await page.goto(`${base}/sale/overview?tab=pricing`);await page.getByText('Thanh toán payOS chưa sẵn sàng. Vui lòng quay lại sau.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Gia hạn bằng payOS',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Sau',exact:true}).click();await page.getByText('Trang 2 · 12 đơn',{exact:true}).waitFor();
    assert.equal(await page.locator('.billing-history tbody tr').count(),2);
    await page.getByRole('button',{name:'Trước',exact:true}).click();await page.getByText('Trang 1 · 12 đơn',{exact:true}).waitFor();
    checks.push('Agent history pagination reads bounded DB pages');
    for(const viewport of [{width:768,height:1024},{width:390,height:844}]){
      await page.setViewportSize(viewport);const size=await page.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth}));
      assert.ok(size.content<=size.width,`Pricing overflow ${JSON.stringify(size)}`);
      assert.ok(await page.locator('.pricing-panel-container').evaluate(element=>element.getBoundingClientRect().width>=320),'Pricing must remain readable, not clipped behind a desktop sidebar');
      await page.screenshot({path:path.join(out,`pricing-${viewport.width}.png`),fullPage:true});
      await page.goto(`${base}/sale/payment/${first.id}`);await page.getByRole('heading',{name:'Đã thanh toán',exact:true}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.goto(`${base}/sale/overview?tab=pricing`);await page.getByRole('heading',{name:'Gói dịch vụ & thanh toán',exact:true}).waitFor();
    }
    checks.push('Disabled gateway state, tablet/mobile pricing, history and payment result layouts');
    loginId=99;await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/admin`);
    await page.getByRole('button',{name:'Thống kê & Báo cáo',exact:true}).first().click();await page.getByRole('tab',{name:'Doanh thu',exact:true}).click();
    await page.getByText('Doanh thu đã xác minh qua payOS',{exact:true}).waitFor();
    assert.ok((await page.locator('.analytics-kpi').filter({hasText:'Doanh thu trong kỳ'}).textContent()).includes('999.000'));
    assert.equal(await page.locator('.analytics-trend-chart .recharts-line').count(),1);
    await page.screenshot({path:path.join(out,'admin-revenue.png'),fullPage:true});
    await page.getByRole('tab',{name:'Giao dịch',exact:true}).click();await page.getByRole('cell',{name:'Billing Agent',exact:true}).first().waitFor();
    assert.equal(await page.getByRole('cell',{name:'Đã thanh toán',exact:true}).count(),1);
    assert.ok(await page.getByRole('cell',{name:'Đã hủy',exact:true}).count()>=1);
    await page.screenshot({path:path.join(out,'admin-transactions.png'),fullPage:true});
    checks.push('Admin revenue line = verified 999,000 VND only; real paginated ledger shows paid/cancelled separately');
    assert.deepEqual(errors,[]);const report={checks,errors,database:'isolated PostgreSQL; official SDK with signed fixture responses; no live gateway'};
    fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }catch(error){
    const page=browser?.contexts()[0]?.pages()[0];
    if(page){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error('Page state:',page.url(),await page.locator('body').innerText());}
    throw error;
  }finally{await browser?.close();await vite?.close();if(server)await new Promise(resolve=>server.close(resolve));restore();await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
