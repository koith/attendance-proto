// Host-side environment boundary for the read-only model CLI.
// Treat every runner variable as secret unless explicitly approved.
const ALLOWED=new Set([
  'GITHUB_TOKEN','GITHUB_REPOSITORY','PATH','HOME','RUNNER_TEMP','TMPDIR',
  'LANG','LC_ALL','TERM','CI','GITHUB_ACTIONS','XDG_CONFIG_HOME',
  'XDG_CACHE_HOME','XDG_DATA_HOME'
]);
export function restrictedProviderEnv(source){
  if(!source||typeof source!=='object')throw Error('INVALID_PROVIDER_ENV');
  if(source.GITHUB_REPOSITORY!=='koith/attendance-proto'||
     typeof source.GITHUB_TOKEN!=='string'||!source.GITHUB_TOKEN)
    throw Error('READONLY_PROVIDER_CONTEXT_MISSING');
  const env=Object.create(null);
  for(const key of ALLOWED){
    const value=source[key];
    if(typeof value==='string'&&value&&!value.includes('\0'))env[key]=value;
  }
  return env;
}
