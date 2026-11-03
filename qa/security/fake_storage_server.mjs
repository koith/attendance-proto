import {createServer} from 'node:http';
// Loopback-only synthetic endpoint. No production credentials or real user data.
const storageToken='synthetic-storage-only';
const managementToken='synthetic-management-only';
const managementPath='/v1/projects/waluhdgqhwjjwmflhrle/config/auth';
createServer((req,res)=>{
 if(req.method==='GET' && req.url===managementPath){
  if(req.headers.authorization!=='Bearer '+managementToken){
   res.writeHead(403);res.end();return;
  }
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({site_url:'https://fixture.invalid',external_email_enabled:true,mailer_autoconfirm:false,disable_signup:true}));
  return;
 }
 if(req.headers.authorization!=='Bearer '+storageToken||req.headers.apikey!==storageToken){res.writeHead(401);res.end();return}
 if(req.method==='GET'&&req.url==='/storage/v1/object/authenticated/fixture/one.txt'){
  res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-only');return;
 }
 res.writeHead(404);res.end();
}).listen(4100,'127.0.0.1',()=>console.log('SYNTHETIC_STORAGE_AUTH_READY'));
