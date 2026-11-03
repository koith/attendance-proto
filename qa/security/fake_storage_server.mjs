import {createServer} from 'node:http';
const token='synthetic-storage-only';
createServer((req,res)=>{
 if(req.headers.authorization!=='Bearer '+token||req.headers.apikey!==token){res.writeHead(401);res.end();return}
 if(req.method==='GET'&&req.url==='/storage/v1/object/authenticated/fixture/one.txt'){
  res.writeHead(200,{'content-type':'text/plain'});res.end('synthetic-only');return;
 }
 res.writeHead(404);res.end();
}).listen(4100,'127.0.0.1',()=>console.log('SYNTHETIC_STORAGE_READY'));
