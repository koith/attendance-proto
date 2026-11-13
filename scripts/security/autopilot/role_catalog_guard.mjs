export function summarizeRoleCatalog(rows, options){
  if(!Array.isArray(rows)) throw Error('CATALOG_INVALID');
  if(options===undefined) return {count:rows.length};
  if(!options||typeof options!=='object'||Array.isArray(options)||!Array.isArray(options.expectedRoleIds)) throw Error('CATALOG_INVALID');
  const {expectedRoleIds}=options;
  const requiredPrivilegeMetadata=options.requiredPrivilegeMetadata??['privileges'];
  if(!expectedRoleIds.length||!expectedRoleIds.every(id=>typeof id==='string'&&id.length>0&&id.trim()===id)||new Set(expectedRoleIds).size!==expectedRoleIds.length||!Array.isArray(requiredPrivilegeMetadata)||!requiredPrivilegeMetadata.every(key=>typeof key==='string'&&key.length>0&&key.trim()===key)||new Set(requiredPrivilegeMetadata).size!==requiredPrivilegeMetadata.length) throw Error('CATALOG_INVALID');
  const expected=new Set(expectedRoleIds);
  const expectedFolded=new Set(expectedRoleIds.map(id=>id.toLowerCase()));
  if(expectedFolded.size!==expected.size) throw Error('CATALOG_INVALID');
  const seen=new Set();
  const seenFolded=new Set();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||row.id.length===0||row.id.trim()!==row.id) throw Error('ROLE_ID_INVALID');
    const foldedId=row.id.toLowerCase();
    if(seenFolded.has(foldedId)) throw Error('ROLE_ID_DUPLICATE');
    if(!expected.has(row.id)) throw Error('ROLE_ID_UNEXPECTED');
    seen.add(row.id);
    seenFolded.add(foldedId);
    if(typeof row.name==='string'){
      const foldedName=row.name.trim().toLowerCase();
      if(expectedFolded.has(foldedName)&&foldedName!==foldedId) throw Error('ROLE_NAME_CONFUSION');
    }
    for(const key of requiredPrivilegeMetadata){
      if(!Object.hasOwn(row,key)) throw Error('PRIVILEGE_METADATA_MISSING');
      const value=row[key];
      const validArray=Array.isArray(value)&&value.length>0&&value.every(item=>typeof item==='string'&&item.length>0&&item.trim()===item);
      const validObject=value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0&&Object.entries(value).every(([name,item])=>name.trim()===name&&name.length>0&&item!=null);
      if(!validArray&&!validObject) throw Error('PRIVILEGE_METADATA_MISSING');
    }
  }
  if(seen.size!==expected.size) throw Error('ROLE_ID_MISSING');
  return {count:rows.length};
}
