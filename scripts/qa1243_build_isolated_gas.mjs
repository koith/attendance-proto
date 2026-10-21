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
  // Replace the entire operating _annualBook(): NO DriveApp/rename/move,
  // NO active spreadsheet adoption; only QA-tagged workbook IDs.
  const begin='function _annualBook(storeKey, year){';
  const end='function _ensureMonthTabs(ss){';
  const from=gs.indexOf(begin),to=gs.indexOf(end,from);
  assert.ok(from>=0&&to>from,'Annual writer anchors changed; abort');
  const qaAnnual=[
    'function _annualBook(storeKey, year){',
    '  if(!/^QA1243_SBX_[A-Za-z0-9]{8,24}$/.test(storeKey)) throw new Error("QA1243_STORE_KEY_REQUIRED");',
    "  var title = 'QA1243 ' + storeKey + ' ' + year + ' 근태';",
    '  var props = PropertiesService.getScriptProperties();',
    "  var key = 'QA1243_ATTENDANCE_BOOK_' + storeKey + '_' + year;",
    '  var known = props.getProperty(key);',
    '  var ss;',
    '  if(known){',
    "    try{ ss = SpreadsheetApp.openById(known); }catch(_err){throw new Error('QA1243_MAPPED_WORKBOOK_UNAVAILABLE');}",
    "    if(!ss || ss.getId()!==known || ss.getName()!==title) throw new Error('QA1243_MAPPED_WORKBOOK_FOREIGN');",
    '  }else{',
    '    ss = SpreadsheetApp.create(title);',
    "    if(!ss || ss.getName()!==title) throw new Error('QA1243_CREATED_WORKBOOK_MISMATCH');",
    '    props.setProperty(key,ss.getId());',
    '  }',
    '  _ensureMonthTabs(ss);',
    '  return ss;',
    '}',
    ''
  ].join('\n');
  gs=gs.slice(0,from)+qaAnnual+gs.slice(to);
  // QA writer preserves all extra sheets, even historical automated tabs.
  const delStart='  // Only remove tabs created by the old automated three-section layout.';
  const delEnd='  for(var i=1;i<=12;i++){';
  const ds=gs.indexOf(delStart),de=gs.indexOf(delEnd,ds);
  assert.ok(ds>=0&&de>ds,'Dangerous legacy tab deletion anchors changed');
  gs=gs.slice(0,ds)+'  // QA: no sheet deletion.\n'+gs.slice(de);
  assert.ok(!/\b(?:DriveApp|UrlFetchApp|ScriptApp)\s*\./.test(gs),'QA source must not use broad Google services');
  assert.ok(!/\b(?:deleteSheet|setTrashed|moveTo)\s*\(/.test(gs),'QA source must not delete or move');
  assert.ok(!gs.includes('getActiveSpreadsheet()'),'QA must not adopt active workbook');
  assert.ok(!gs.includes("ss = SpreadsheetApp.create(year + ' 근태');"));
  assert.ok(!gs.includes("setName(year + ' 근태');"));
  // Publication-only probe: no shared secret, payroll payload, locks, Drive
  // access or sheet creation. Diagnoses Google /exec permission separately
  // from POST dispatch. Only this synthetic standalone QA project receives it.
  assert.ok(!/function\s+doGet\s*\(/.test(source),'QA writer unexpectedly gained doGet');
  gs+='\nfunction doGet(){return _json({ok:true,probe:"QA1243_PUBLICATION_GET_ONLY"}); }\n';
  // The owner must authorize this isolated project once; this function has
  // no account, store, attendance or Sheet writer side effects.
  gs+='\nfunction qa1243AuthorizeServices(){'+
    'PropertiesService.getScriptProperties().getKeys();'+
    'LockService.getScriptLock();'+
    'return "QA1243_AUTH_SCOPE_CHECK_ONLY";}\n';
  return gs;
}

// Explicit isolated runtime OAuth scopes; operating appsscript.json stays untouched.
export const QA1243_SCRIPT_SCOPES=Object.freeze([
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.storage'
]);
export function buildQa1243Manifest(original){
  const manifest=JSON.parse(original);
  assert.equal(manifest.webapp?.access,'ANYONE_ANONYMOUS');
  assert.equal(manifest.webapp?.executeAs,'USER_DEPLOYING');
  assert.ok(!manifest.executionApi);
  assert.deepEqual(manifest.dependencies||{},{});
  return JSON.stringify({
    timeZone:'Asia/Seoul',runtimeVersion:'V8',exceptionLogging:'STACKDRIVER',
    oauthScopes:[...QA1243_SCRIPT_SCOPES],
    webapp:{access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}
  });
}
