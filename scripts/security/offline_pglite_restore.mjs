// Isolated PostgreSQL logical-escrow data replay. No live connections or credentials.
// Accepts DECRYPTED escrow JSON on stdin. Never writes source plaintext to a file.
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
const buffers=[];
for await(const b of process.stdin)buffers.push(b);
const input=JSON.parse(Buffer.concat(buffers).toString('utf8'));
if(input.format!=='attendance-privileged-data-escrow-v1'||!Number.isSafeInteger(input.table_count))
 throw Error('INVALID_SOURCE_FORMAT_OR_COUNT');
const tables=Object.entries(input.data||{});
if(!tables.length||tables.length!==input.table_count)throw Error('BACKUP_TABLE_MANIFEST_MISMATCH');
const columns=new Map();
for(const c of input.column_metadata||[]){
 const id=c.table_schema+'.'+c.table_name;
 const group=columns.get(id)||[];group.push(c);columns.set(id,group);
}
const q=x=>'"'+String(x).replaceAll('"','""')+'"';
const types={bigint:'bigint',integer:'integer','smallint':'smallint',boolean:'boolean',
 text:'text','character varying':'text',character:'text',uuid:'uuid',
 numeric:'numeric','double precision':'double precision',real:'real',
 date:'date','timestamp with time zone':'timestamptz','timestamp without time zone':'timestamp',
 'time without time zone':'time','time with time zone':'timetz',
 json:'json',jsonb:'jsonb',bytea:'bytea',interval:'interval',
 ARRAY:'text[]'};
function columnType(col){
 if(col.data_type==='ARRAY'){
  const inner=col.udt_name.startsWith('_')?col.udt_name.slice(1):'text';
  return ({int8:'bigint',int4:'integer',int2:'smallint',uuid:'uuid',
     bool:'boolean',text:'text',varchar:'text',jsonb:'jsonb',
     numeric:'numeric',timestamptz:'timestamptz'}[inner]||'text')+'[]';
 }
 return types[col.data_type]||'text';
}
function canon(v){if(Array.isArray(v))return '['+v.map(canon).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';return JSON.stringify(v)}
function normalize(row,attrs){const result={};for(const [key,value] of Object.entries(row)){const meta=attrs.get(key);if(value!==null&&meta?.data_type==='timestamp with time zone'){const time=Date.parse(String(value));result[key]=Number.isFinite(time)?new Date(time).toISOString():value}else if(value!==null&&meta?.data_type==='timestamp without time zone')result[key]=String(value).replace(' ','T').replace(/(\\.\\d*?)0+$/,'$1').replace(/\\.$/,'');else result[key]=value}return result}
function rowHash(records,attrs){const list=records.map(v=>canon(normalize(v,attrs))).sort();const h=createHash('sha256');for(const t of list){h.update(String(t.length)+':');h.update(t)}return h.digest('hex')}
const db=new PGlite();
try{
 await db.waitReady;
 await db.exec('CREATE SCHEMA IF NOT EXISTS auth;CREATE SCHEMA IF NOT EXISTS storage;');
 let total=0;
 const summary={};
 const contentHashes={};
 for(const [id,records] of tables){
  const [schema,...rest]=id.split('.');
  const name=rest.join('.');
  if(!['auth','storage','public'].includes(schema)||!name||!Array.isArray(records))
   throw Error('INVALID_TABLE_OR_ROWS');
  const cols=(columns.get(id)||[]).sort((a,b)=>Number(a.ordinal_position)-Number(b.ordinal_position));
  if(!cols.length)throw Error('MISSING_TABLE_SCHEMA:'+id);
  const table=q(schema)+'.'+q(name);
  await db.exec('CREATE TABLE '+table+' ('+cols.map(c=>q(c.column_name)+' '+columnType(c)).join(',')+');');
  for(let i=0;i<records.length;i+=250){
   const data=JSON.stringify(records.slice(i,i+250));
   await db.query('INSERT INTO '+table+' SELECT * FROM jsonb_populate_recordset(NULL::'+table+',$1::jsonb)',[data]);
  }
  const ret=await db.query('SELECT count(*)::integer AS n FROM '+table);
  const count=Number(ret.rows[0].n);
  if(count!==records.length)throw Error('POSTGRES_ROW_COUNT_MISMATCH:'+id);
  summary[schema]=(summary[schema]||0)+count;
  total+=count;
 }
 const countOf=id=>tables.find(x=>x[0]===id)?.[1]?.length??null;
 console.log(JSON.stringify({result:'PASS_PGLITE_POSTGRES_LOGICAL_REPLAY',table_count:tables.length,row_count:total,schemas:summary,auth_users:countOf('auth.users'),attendance_events:countOf('public.attendance_events'),storage_metadata_objects:countOf('storage.objects'),note:'Not full DDL/privileges, GoTrue login, or Storage object bytes restoration'}));
}finally{await db.close();}
