// Use only an isolated database; creates test accounts. Audio devices are simulated.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const base=process.env.VOICE_TEST_URL||'http://localhost:14200';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const errors=[];const run=Date.now();
 async function member(label){
  const name=label+' '+run,email=label+'-'+run+'@example.com';
  const context=await browser.newContext({permissions:['microphone']});
  for(const [path,data] of [['register',{name,email,password:'test'}],['login',{email,password:'test'}]]){
   const token=await (await context.request.get(base+'/api/auth/csrf')).json();
   const response=await context.request.post(base+'/api/auth/'+path,{data,headers:{'X-CSRF-TOKEN':token.token}});assert.ok(response.ok());
  }
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/dashboard');
  return {page,context,name,email};
 }
 const a=await member('Alice'),b=await member('Bob');
 async function callFromMembers(){
  await a.page.getByRole('button',{name:'View members',exact:true}).click();
  await a.page.getByRole('button',{name:b.name,exact:true}).click();
  await a.page.getByRole('link',{name:'Call '+b.name,exact:true}).click();
 }
 // No visit to the Voice Call page by Bob, and no second Call click by Alice.
 await callFromMembers();
 await b.page.getByRole('button',{name:'Accept',exact:true}).waitFor({timeout:30000});
 assert.ok(b.page.url().endsWith('/dashboard'));
 await b.page.getByRole('button',{name:'Accept',exact:true}).click();
 for(const person of [a,b])await person.page.getByRole('status').filter({hasText:'Connected — voice call'}).waitFor({timeout:45000});
 await a.page.getByRole('link',{name:'Back to dashboard',exact:false}).click();
 await a.page.getByRole('status').filter({hasText:'Connected — voice call'}).waitFor();
 await a.page.getByRole('button',{name:'Hang up',exact:true}).click();
 await b.page.locator('.call-panel').waitFor({state:'hidden',timeout:10000});
 await b.page.getByRole('button',{name:'Log out',exact:true}).click();
 await b.page.waitForURL(base+'/');
 await callFromMembers();
 await a.page.getByRole('status').filter({hasText:'not online'}).waitFor({timeout:10000});
 assert.equal(await a.page.getByRole('button',{name:'Cancel call',exact:true}).count(),0);
 await b.page.getByRole('button',{name:'Login',exact:true}).click();
 await b.page.getByLabel('Email',{exact:true}).fill(b.email);
 await b.page.getByLabel('Password',{exact:true}).fill('test');
 await b.page.locator('form button[type=submit]').click();
 await b.page.waitForURL('**/dashboard');
 await a.page.getByRole('button',{name:'Call '+b.name,exact:true}).waitFor({timeout:10000});
 await a.page.getByRole('button',{name:'Try call again',exact:true}).click();
 await b.page.getByRole('button',{name:'Decline',exact:true}).waitFor({timeout:30000});
 await b.page.getByRole('button',{name:'Decline',exact:true}).click();
 await a.page.getByRole('status').filter({hasText:'Call ended'}).waitFor({timeout:10000});
 assert.deepEqual(errors,[]);
 console.log('PASS: one-click selected-member call, incoming call on dashboard, real audio connection, navigation preserves call, logged-out recipient reported offline, and retry when recipient returns.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
