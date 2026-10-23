// Evidence from the same CI run, not an arbitrary historical green check.
export function validateAuthRoleEvidence(report,sha){
 const required=[
 'Actual SMTP, owner acceptance, password and login JWT',
 'HQ READY requires accepted password-ready primary owner',
 'Owner JWT cannot activate or read another branch',
 'Actual SMTP assistant acceptance, password and login JWT',
 'Same assistant JWT observes immediate grant/revoke and cross-branch denial',
 'Revoked unexpired real Auth JWT still authenticates but loses RPC access',
 'Verified existing account reconnect resets all delegated permissions',
 'Protected branch, HQ3, staff10, Beta and payroll rows unchanged'];
 if(!/^[a-f0-9]{40}$/.test(String(sha||''))||report?.commit!==sha||
    report.scope!=='ISOLATED_REAL_AUTH_SMTP_POSTGREST'||report.hostedAuthTested!==false||
    report.googleE2ERepeated!==false||!Array.isArray(report.results)||report.results.length!==required.length||
    new Set(report.results.map(r=>r?.name)).size!==required.length||
    required.some(name=>!report.results.some(r=>r?.name===name&&r.result==='PASS')))
  throw Error('AUTH_ROLE_EVIDENCE_UNVERIFIED');
 return {id:'ADMIN-SESSION',label:'실제 발급 JWT 권한 변경·해임·재연결 서버 경계',
  file:'qa-results/auth-role-journey-1243.json',result:'PASS',exitCode:0,
  evidence:'Same-run official GoTrue/Mailpit/PostgREST 8/8, commit '+sha,
  scope:report.scope,hostedAuthTested:false};
}
