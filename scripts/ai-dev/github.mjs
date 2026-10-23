// GitHub-only bounded transport. No production endpoint or credential discovery.
export class Blocked extends Error {
  constructor(reason, action){super(reason);this.state='BLOCKED';this.required_action=action;}
}
export function githubClient(repo,{token=process.env.GITHUB_TOKEN,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  if(!/^[-\w.]+\/[-\w.]+$/.test(repo))throw Error('INVALID_REPOSITORY');
  const api=async(path,{method='GET',body}={})=>{
    if(!path.startsWith('/')||path.includes('..')||path.includes('://'))throw Error('INVALID_GITHUB_PATH');
    for(let attempt=0;attempt<3;attempt++){
      let response;
      try {response=await fetchImpl(`https://api.github.com/repos/${repo}${path}`,{method,
        signal:AbortSignal.timeout(15000),redirect:'error',
        headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
          ...(token?{Authorization:`Bearer ${token}`}:{ }),'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{})});}
      catch {
        // Unknown write outcome is read back on a later invocation, never blindly retried.
        if(method!=='GET')throw new Blocked('WRITE_OUTCOME_UNKNOWN','Resume issue and check event_id before retrying the same checkpoint.');
        if(attempt<2){await sleep(250*(attempt+1));continue;}
        throw new Blocked('EXTERNAL_SERVICE_UNAVAILABLE','Retry this read later; independent local QA can continue.');
      }
      if(response.ok)return response.status===204?null:response.json();
      const retryAfter=response.headers.get('retry-after');
      const rate=response.status===429||(response.status===403&&(retryAfter||response.headers.get('x-ratelimit-remaining')==='0'));
      if(response.status===403&&response.headers.get('x-github-sso')?.startsWith('required'))
        throw new Blocked('CONSENT_REQUIRED','Complete the required SSO consent for the existing connection; do not create a token or expand scope.');
      if(!rate&&[401,403].includes(response.status))throw new Blocked(response.status===401?'AUTHENTICATION_FAILED':'PERMISSION_DENIED','Use an existing authorized GitHub connection for this operation; do not create tokens or expand privileges.');
      if(rate&&Number(retryAfter)>3)throw new Blocked('RATE_LIMIT_DEFERRED','Retry after the server requested delay; continue independent local QA.');
      if(response.status===404)throw new Blocked('NOT_FOUND_OR_NOT_VISIBLE','Confirm issue/ref/evidence identity and existing read access.');
      if(method==='GET'&&(rate||[502,503,504].includes(response.status))&&attempt<2){
        await sleep(Math.min(3000,Math.max(250,Number(retryAfter)*1000||250*(attempt+1))));continue;
      }
      throw new Blocked(`GITHUB_HTTP_${response.status}`,method==='GET'?'Inspect failed read; no success evidence available.':'Read issue back before retrying the identical event_id.');
    }
  };
  api.list=async(path)=>{
    const output=[];
    for(let page=1;page<=100;page++){
      const rows=await api(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`);
      if(!Array.isArray(rows))throw Error('INVALID_PAGINATION');output.push(...rows);
      if(rows.length<100)return output;
    }
    throw Error('PAGINATION_LIMIT_CANNOT_VERIFY');
  };
  return api;
}
