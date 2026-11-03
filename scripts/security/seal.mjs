import {readFileSync,createReadStream,createWriteStream,openSync,writeSync,closeSync,unlinkSync} from 'node:fs';
import {randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
const [,,src,pub,out]=process.argv;
if(!src||!pub||!out)throw Error('Use: node seal.mjs archive.tar.gz public.pem archive.sealed');
const key=randomBytes(32),nonce=randomBytes(12);
const recipient=readFileSync(pub,'utf8');
const wrapped=publicEncrypt({key:recipient,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
const header=Buffer.from(JSON.stringify({version:1,nonce:nonce.toString('base64'),wrapped:wrapped.toString('base64')}));
const prefix=Buffer.from('BACKUP-SEALED-1\n');
const len=Buffer.alloc(4);len.writeUInt32BE(header.length);
const fd=openSync(out,'wx',0o600);
try{
 writeSync(fd,prefix);writeSync(fd,len);writeSync(fd,header);
 const encryptor=createCipheriv('aes-256-gcm',key,nonce);encryptor.setAAD(header);
 await pipeline(createReadStream(src),encryptor,createWriteStream(out,{fd,autoClose:false,flags:'a'}));
 writeSync(fd,encryptor.getAuthTag());
 closeSync(fd);
 console.log('SEALED_OK');
}catch(err){closeSync(fd);unlinkSync(out);throw err}
