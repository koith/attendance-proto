// Isolated #1243 GAS project transform. NEVER import into the operating
// Apps Script deployment. Only QA-marked synthetic workbook keys are accepted.
import assert from 'node:assert/strict';

export function buildQa1243GAS(source,secret){
  assert.ok(typeof secret==='string'&&secret.length>=64&&/^[A-Za-z0-9_-]+$/.test(secret),
    'Dedicated random QA-only shared secret required');
  let gs=source;
  function replaceOnce(needle,replacement){
    assert.equal(gs.split(needle).length,2,'QA source contract changed; abort before publishing: '+needle.slice(0,65));
    gs=gs.replace(needle,replacement);
  }
  replaceOnce("var SHARED_SECRET = 'REPLACE_WITH_LONG_RANDOM_SECRET';",
    "var SHARED_SECRET = '"+secret+"';");
  // Direct clients cannot write even a synthetic payload under the operating
  // INHA / 1 store name if a QA script endpoint and secret are ever exposed.
  const storeAnchor="    var storeKey = String(body.store_key==null?'INHA':body.store_key);";
  replaceOnce(storeAnchor,storeAnchor+"\n"+
    "    if(!/^QA1243_SBX_[A-Za-z0-9]{8,24}$/.test(storeKey))\n"+
    "      return _json({ok:false,error:'QA1243_STORE_KEY_REQUIRED'});");
  replaceOnce("ss = SpreadsheetApp.create(year + ' 근태');",
    "ss = SpreadsheetApp.create('QA1243 ' + storeKey + ' ' + year + ' 근태');");
  replaceOnce("if(ss.getName() !== year + ' 근태') DriveApp.getFileById(ss.getId()).setName(year + ' 근태');",
    "if(ss.getName() !== 'QA1243 ' + storeKey + ' ' + year + ' 근태') "+
    "DriveApp.getFileById(ss.getId()).setName('QA1243 ' + storeKey + ' ' + year + ' 근태');");
  // The existing production writer trusts a ScriptProperties workbook ID.
  // In a QA copy, a stale/forged mapping could point to an accessible real
  // operating workbook. Reject it BEFORE rename/month tab/clear/write.
  const mappedAnchor="  if(!ss){\n    var active = SpreadsheetApp.getActiveSpreadsheet();";
  replaceOnce(mappedAnchor,
    "  if(known && ss && ss.getName() !== 'QA1243 ' + storeKey + ' ' + year + ' 근태')\n"+
    "    throw new Error('QA1243_MAPPED_WORKBOOK_FOREIGN');\n"+
    mappedAnchor);
  assert.ok(!gs.includes("ss = SpreadsheetApp.create(year + ' 근태');"));
  assert.ok(!gs.includes("setName(year + ' 근태');"));
  // Publication-only probe: no shared secret, payroll payload, locks, Drive
  // access or sheet creation. Diagnoses Google /exec permission separately
  // from POST dispatch. Only this synthetic standalone QA project receives it.
  assert.ok(!/function\\s+doGet\\s*\\(/.test(source),'QA writer unexpectedly gained doGet');
  gs+='\\nfunction doGet(){return _json({ok:true,probe:"QA1243_PUBLICATION_GET_ONLY"}); }\\n';
  // The owner must authorize this isolated project once; this function has
  // no account, store, attendance or Sheet writer side effects.
  gs+='\nfunction qa1243AuthorizeServices(){'+
    'SpreadsheetApp.getActiveSpreadsheet();'+
    'DriveApp.getRootFolder().getName();'+
    'PropertiesService.getScriptProperties().getKeys();'+
    'LockService.getScriptLock();'+
    'return "QA1243_AUTH_SCOPE_CHECK_ONLY";}\n';
  return gs;
}
