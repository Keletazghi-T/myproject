// Use only an isolated test database: this creates three test accounts.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const assert=require('node:assert/strict');
const base=process.env.MESSAGE_TEST_URL||'http://localhost:14200';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const errors=[];
 const run=Date.now();
 async function member(name){
  name=name+' '+run;
  const context=await browser.newContext({permissions:['microphone']});
  const email=`message-${name.replaceAll(' ', '-')}-${Date.now()}@example.com`;
  for(const [path,data] of [['register',{name,email,password:'test'}],['login',{email,password:'test'}]]){
   const token=await (await context.request.get(base+'/api/auth/csrf')).json();
   const response=await context.request.post(base+'/api/auth/'+path,{data,headers:{'X-CSRF-TOKEN':token.token}});
   assert.ok(response.ok(),await response.text());
  }
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/dashboard');
  return {context,page};
 }
 const a=await member('Alice'),b=await member('Bob'),c=await member('Carol');
 async function select(person,name){
  name=name+' '+run;
  await person.page.getByRole('button',{name:'View members',exact:true}).click();
  await person.page.getByRole('button',{name,exact:true}).click();
  await person.page.getByRole('link',{name:'Text '+name,exact:true}).waitFor();
  await person.page.getByRole('link',{name:'Call '+name,exact:true}).waitFor();
 }
 await select(a,'Bob');await a.page.getByRole('link',{name:'Text Bob '+run,exact:true}).click();
 await a.page.getByLabel('Your message',{exact:true}).fill('Hello Bob');
 await a.page.getByRole('button',{name:'Send message',exact:true}).click();
 await a.page.locator('article').filter({hasText:'Hello Bob'}).waitFor();
 await select(b,'Alice');await b.page.getByRole('link',{name:'Text Alice '+run,exact:true}).click();
 await b.page.locator('article').filter({hasText:'Hello Bob'}).waitFor();
 await a.page.getByLabel('Your message',{exact:true}).fill('Draft stays here');
 await b.page.getByLabel('Your message',{exact:true}).fill('Hi Alice');
 await b.page.getByRole('button',{name:'Send message',exact:true}).click();
 await a.page.locator('article').filter({hasText:'Hi Alice'}).waitFor({timeout:8000});
 assert.equal(await a.page.getByLabel('Your message',{exact:true}).inputValue(),'Draft stays here');
 await select(c,'Bob');await c.page.getByRole('link',{name:'Text Bob '+run,exact:true}).click();
 await c.page.getByText('No messages yet. Say hello.').waitFor();
 await a.page.reload();await a.page.locator('article').filter({hasText:'Hi Alice'}).waitFor();
 await a.page.getByRole('link',{name:'Call Bob '+run,exact:true}).click();
 await a.page.getByRole('heading',{name:'Call Bob '+run,exact:true}).waitFor();
 await b.page.getByRole('button',{name:'Accept',exact:true}).waitFor({timeout:30000});
 assert.ok(b.page.url().includes('/messages/'));
 await b.page.getByRole('button',{name:'Accept',exact:true}).click();
 for(const person of [a,b])await person.page.getByRole('status').filter({hasText:'Connected — voice call'}).waitFor({timeout:45000});
 await a.page.getByRole('button',{name:'Hang up',exact:true}).click();
 await b.page.getByRole('status').filter({hasText:'Call ended'}).waitFor({timeout:10000});
 assert.deepEqual(errors,[]);
 console.log('PASS: member Text/Call options, two-way private messaging, live updates, draft preservation, persistence, third-party isolation, incoming-call delivery on the message page and a real selected-member voice connection.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
