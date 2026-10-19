// Retry only idempotent Google Script REST requests (GET/PUT).
// Never use for createVersion POST: an ambiguous 5xx may already have created
// a deployment version, and retrying would manufacture duplicates.
const TRANSIENT_GOOGLE_STATUS=new Set([429,500,502,503,504]);
export async function retryGoogleIdempotent(request,opts={}){
  const maxAttempts=opts.maxAttempts??4;
  const sleep=opts.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const onRetry=opts.onRetry??(()=>{});
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>6)
    throw new Error('BAD_GOOGLE_RETRY_ATTEMPTS');
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    // A failed fetch may be ambiguous (the server could have written already).
    // Only caller-approved GET/PUT operations belong here.
    let result;
    try{result=await request();}
    catch(error){
      if(attempt===maxAttempts)throw error;
      onRetry({attempt,status:'NETWORK_ERROR'});
      await sleep(Math.min(8000,1000*2**(attempt-1)));
      continue;
    }
    if(result.ok||!TRANSIENT_GOOGLE_STATUS.has(result.status)||attempt===maxAttempts)
      return result;
    onRetry({attempt,status:result.status});
    await sleep(Math.min(8000,1000*2**(attempt-1)));
  }
}
