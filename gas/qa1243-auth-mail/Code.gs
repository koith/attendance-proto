/** QA1243: Deploy as a NEW isolated Apps Script web app. Never merge into payroll Sheets script.
 * Execute as deploying user; access anonymous (signed HMAC payload only).
 * Script Properties: QA1243_GMAIL_BRIDGE_SECRET (>=32 chars), never commit its value.
 */
function doPost(e) {
  var response;
  try { response = qa1243HandleMail_(e); }
  catch (error) { response={ok:false,code:'DELIVERY_UNAVAILABLE'}; }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
function qa1243HandleMail_(e) {
  if (!e || !e.postData || typeof e.postData.contents!=='string' || e.postData.contents.length>50000)
    return {ok:false,code:'BAD_REQUEST'};
  var obj;
  try {obj=JSON.parse(e.postData.contents);}catch(error){return {ok:false,code:'BAD_JSON'};}
  var secret=PropertiesService.getScriptProperties().getProperty('QA1243_GMAIL_BRIDGE_SECRET');
  if (typeof secret!=='string'||secret.length<32) return {ok:false,code:'NOT_CONFIGURED'};
  if (!obj||!Number.isSafeInteger(obj.sent_at)||Math.abs(Math.floor(Date.now()/1000)-obj.sent_at)>300||
      typeof obj.nonce!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(obj.nonce)||
      !obj.data||typeof obj.signature!=='string')return {ok:false,code:'BAD_ENVELOPE'};
  var data=obj.data;
  if(typeof data.to!=='string'||data.to.length>254||!(/^[^@\s<>,]+@[^@\s<>,]+\.[^@\s<>,]+$/).test(data.to)||
     typeof data.subject!=='string'||data.subject.length>150||data.subject.indexOf('[백억커피] ')!==0||
     typeof data.body!=='string'||data.body.length>10000||
     typeof data.html!=='string'||data.html.length>20000||
     data.html.indexOf('https://waluhdgqhwjjwmflhrle.supabase.co/auth/v1/verify?')<0||
     /<script\b|<iframe\b|<form\b|onerror\s*=|onload\s*=/i.test(data.html)) return {ok:false,code:'BAD_MAIL'};
  var material=obj.sent_at+'.'+obj.nonce+'.'+JSON.stringify(data);
  var computed=Utilities.base64Encode(Utilities.computeHmacSha256Signature(material,secret));
  if (!qa1243Equal_(computed,obj.signature)) return {ok:false,code:'UNAUTHORIZED'};
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(6000))return {ok:false,code:'BUSY'};
  try {
    var cache=CacheService.getScriptCache();
    var receipt='qa1243_mail_'+obj.nonce;
    if (cache.get(receipt)==='sent')return {ok:true,duplicate:true};
    if (MailApp.getRemainingDailyQuota()<1)return {ok:false,code:'QUOTA_EXHAUSTED'};
    // Only mark success AFTER MailApp returns without error.
    MailApp.sendEmail({to:data.to,subject:data.subject,body:data.body,htmlBody:data.html,name:'백억커피'});
    cache.put(receipt,'sent',600);
    return {ok:true};
  } finally {lock.releaseLock();}
}
function qa1243Equal_(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  var mismatch=a.length^b.length;
  for(var i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return mismatch===0;
}
