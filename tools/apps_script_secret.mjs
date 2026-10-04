const assignmentPattern=/^([ \t]*(?:(?:var|let|const)[ \t]+)?SHARED_SECRET[ \t]*=[ \t]*)([^\r\n;]+?)([ \t]*;?[ \t]*(?:\/\/[^\r\n]*)?)$/gm;
const emptyLiterals=new Set(["''",'""']);

function findAssignment(source,label){
  const matches=[...source.matchAll(assignmentPattern)];
  if(matches.length!==1)throw new Error(label+' must contain exactly one SHARED_SECRET assignment');
  return {full:matches[0][0],prefix:matches[0][1],rhs:matches[0][2].trim(),suffix:matches[0][3]};
}

function isUnsafePlaceholder(rhs){
  return !rhs || rhs.includes('REPLACE_WITH_LONG_RANDOM_SECRET') || emptyLiterals.has(rhs);
}

export function mergeSharedSecret(localSource,deployedSource){
  const live=findAssignment(deployedSource,'deployed source');
  if(isUnsafePlaceholder(live.rhs))
    throw new Error('deployed SHARED_SECRET is empty or still a placeholder; refusing deployment');
  const local=findAssignment(localSource,'repository source');
  if(!local.rhs)
    throw new Error('repository SHARED_SECRET is empty; refusing deployment');
  if(local.rhs.includes('REPLACE_WITH_LONG_RANDOM_SECRET')){
    return localSource.replace(local.full,local.prefix+live.rhs+local.suffix);
  }
  if(local.rhs!==live.rhs)
    throw new Error('repository SHARED_SECRET differs from deployed value; refusing deployment');
  return localSource;
}
