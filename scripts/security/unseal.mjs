import {readFileSync,openSync,readSync,closeSync,statSync,createReadStream,createWriteStream,renameSync,unlinkSync,existsSync} from 'node:fs';
import {createDecipheriv,privateDecrypt,constants} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
const [,,src,secret,out]=process.argv;
if(!src||!secret||!out||existsSync(out))throw Error('Use fresh destination: node unseal.mjs archive.sealed private.pem archive.tar.gz');
const fd=openSync(src,'r');
let header,offset,size,tag;
try {
 const prefix=Buffer.alloc(16);readSync(fd,prefix,0,16,0);
 if(prefix.toString('utf8')!=='BACKUP-SEALED-1\n')throw Error('BAD_FORMAT');
 const length=Buffer.alloc(4);readSync(fd,length,0,4,16);
 const n=length.readUInt32BE(0);if(n<10||n>4096)throw Error('BAD_HEADER_LENGTH');
 header=Buffer.alloc(n);readSync(fd,header,0,n,20);
 offset=20+n;size=statSync(src).size;if(size<offset+16)throw Error('TRUNCATED');
 tag=Buffer.alloc(16);readSync(fd,tag,0,16,size-16);
}finally{closeSync(fd)}
const h=JSON.parse(header.toString());
if(h.version!==1)throw Error('UNKNOWN_FORMAT_VERSION');
const key=privateDecrypt({key:readFileSync(secret,'utf8'),padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(h.wrapped,'base64'));
const decoder=createDecipheriv('aes-256-gcm',key,Buffer.from(h.nonce,'base64'));
decoder.setAAD(header);decoder.setAuthTag(tag);
const temp=out+'.partial';if(existsSync(temp))throw Error('TEMP_EXISTS');
try{
 await pipeline(createReadStream(src,{start:offset,end:size-17}),decoder,createWriteStream(temp,{flags:'wx',mode:0o600}));
 renameSync(temp,out);console.log('AUTHENTICATED_DECRYPT_OK');
}catch(err){if(existsSync(temp))unlinkSync(temp);throw err}
