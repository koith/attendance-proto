const assignmentPattern=/^([ \t]*var[ \t]+SHARED_SECRET[ \t]*=[ \t]*)(("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'))([ \t]*;[ \t]*)$/gm;
const emptyLiterals=new Set(["''",'""']);

function findAssignment(source,label){
  const matches=[...source.matchAll(assignmentPattern)];
  if(matches.length!==1)throw new Error(label+' must contain exactly one literal SHARED_SECRET assignment');
  return {full:matches[0][0],prefix:matches[0][1],literal:matches[0][2],suffix:matches[0][4]};
}

export function mergeSharedSecret(localSource,deployedSource){
  const live=findAssignment(deployedSource,'deployed source');
  if(live.literal.includes('REPLACE_WITH_LONG_RANDOM_SECRET')||emptyLiterals.has(live.literal))
    throw new Error('deployed SHARED_SECRET is empty or still a placeholder; refusing deployment');
  const local=findAssignment(localSource,'repository source');
  if(emptyLiterals.has(local.literal))
    throw new Error('repository SHARED_SECRET is empty; refusing deployment');
  if(local.literal.includes('REPLACE_WITH_LONG_RANDOM_SECRET')){
    return localSource.replace(local.full,local.prefix+live.literal+local.suffix);
  }
  if(local.literal!==live.literal)
    throw new Error('repository SHARED_SECRET differs from deployed value; refusing deployment');
  return localSource;
}
