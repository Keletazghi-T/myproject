// Run against an isolated database. Uses fake microphones but real WebRTC and API requests.
// PLAYWRIGHT_MODULE may point to an installed playwright-core package outside this repo.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const base = process.env.VOICE_TEST_URL || 'http://localhost:14200';
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const launch = () => chromium.launch({executablePath, headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
async function mutate(context,path,data) {
 const csrf = await context.request.get(base+'/api/auth/csrf');
 assert.equal(csrf.status(),200);
 const result=await context.request.post(base+path,{data,headers:{'X-CSRF-TOKEN':(await csrf.json()).token}});
 assert.ok(result.ok(),`${path}: ${result.status()} ${await result.text()}`);
 return result;
}
async function member(browser,name) {
 const context=await browser.newContext({permissions:['microphone']});
 await context.addInitScript(()=>{
   const Original=window.RTCPeerConnection;
   window.testPeers=[];window.testStreams=[];
   window.RTCPeerConnection=class extends Original {constructor(...args){super(...args);window.testPeers.push(this);}};
   const originalMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async constraints=>{
     if(window.denyMic)throw new DOMException('Denied','NotAllowedError');
     if(window.delayMic)await new Promise(resolve=>setTimeout(resolve,3000));
     const stream=await originalMedia(constraints);window.testStreams.push(stream);return stream;
   };
 });
 const email=`voice-${name.toLowerCase()}-${Date.now()}@example.com`;
 await mutate(context,'/api/auth/register',{name,email,password:'voice-test'});
 await mutate(context,'/api/auth/login',{email,password:'voice-test'});
 const page=await context.newPage();
 page.on('pageerror',e=>{throw e;});
 await page.goto(base+'/voice');
 await page.getByRole('status').filter({hasText:'Ready to receive calls'}).waitFor();
 return {context,page};
}
async function mediaStopped(page) {
 assert.equal(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);
 assert.equal(await page.evaluate(()=>window.testPeers.every(pc=>pc.connectionState==='closed')),true);
}
(async()=>{
 const browsers=await Promise.all([launch(),launch()]);
 try {
 const a=await member(browsers[0],'Alice'), b=await member(browsers[1],'Bob');
 await a.page.getByRole('button',{name:'Call Bob',exact:true}).waitFor();
 await a.page.getByRole('button',{name:'Call Bob',exact:true}).click();
 await b.page.getByRole('button',{name:'Accept',exact:true}).waitFor({timeout:30000});
 await b.page.getByRole('button',{name:'Accept',exact:true}).click();
 for(const member of [a,b])await member.page.getByRole('status').filter({hasText:'Connected — voice call'}).waitFor({timeout:45000});
 for(const member of [a,b]) {
   await member.page.waitForFunction(async()=>{
     const pc=window.testPeers.at(-1);const stats=await pc.getStats();
     return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0);
   },null,{timeout:15000});
 }
 await a.page.getByRole('button',{name:'Mute microphone',exact:true}).click();
 assert.equal(await a.page.evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),false);
 await a.page.getByRole('button',{name:'Unmute microphone',exact:true}).click();
 assert.equal(await a.page.evaluate(()=>window.testStreams.at(-1).getAudioTracks()[0].enabled),true);
 // Slow the end request to ensure stale polls do not resurrect a locally ended call.
 await a.page.route('**/api/voice/calls/*/end',async route=>{await new Promise(r=>setTimeout(r,3000));await route.continue();});
 await a.page.getByRole('button',{name:'Hang up',exact:true}).click();
 await new Promise(r=>setTimeout(r,1800));
 assert.equal(await a.page.locator('.call-panel').count(),0);
 await b.page.getByRole('status').filter({hasText:'Call ended'}).waitFor({timeout:10000});
 await mediaStopped(a.page);await mediaStopped(b.page);
 await a.page.unroute('**/api/voice/calls/*/end');
 await a.page.getByRole('button',{name:'Call Bob',exact:true}).click();
 await b.page.getByRole('button',{name:'Decline',exact:true}).waitFor({timeout:30000});
 await b.page.getByRole('button',{name:'Decline',exact:true}).click();
 await a.page.getByRole('status').filter({hasText:'Call ended'}).waitFor({timeout:10000});
 await mediaStopped(a.page);
 await a.page.evaluate(()=>{window.denyMic=true;});
 await a.page.getByRole('button',{name:'Call Bob',exact:true}).click();
 await a.page.getByRole('alert').filter({hasText:'Microphone permission was denied'}).waitFor();
 await a.page.evaluate(()=>{window.denyMic=false;window.delayMic=true;});
 await a.page.getByRole('button',{name:'Call Bob',exact:true}).click();
 await a.page.getByRole('button',{name:'Cancel call',exact:true}).click();
 await new Promise(r=>setTimeout(r,3500));
 await mediaStopped(a.page);
 assert.equal(await b.page.locator('.call-panel').count(),0);
 console.log('PASS: real two-browser call, bidirectional audio RTP, mute/unmute, hang-up, delayed-end race, decline, microphone denial and cancellation cleanup.');
 } finally {await Promise.all(browsers.map(b=>b.close()));}
})().catch(error=>{console.error(error);process.exitCode=1;});
