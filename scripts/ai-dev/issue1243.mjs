// Historical GitHub evidence observation, not a new operational Auth probe.
export function classify1243(s) {
 if(s.version!==1||s.issue!==1243||s.source_url!=='https://github.com/koith/attendance-proto/issues/1243')throw Error('INVALID_1243_OBSERVATION');
 const qa=s.runs.find(r=>r.id===39962969106),gate=s.runs.find(r=>r.id===39963164952);
 const code=s.pr.number===1328&&s.pr.merged===true&&qa?.head_sha===s.pr.merge_commit_sha&&qa.status==='completed'&&qa.conclusion==='success';
 const authUnapplied=s.quotes.some(q=>q.includes('운영 미적용')&&q.includes('미실행'));
 const authFailure=s.quotes.some(q=>q.includes('HOSTED_AUTH_READ만FAIL'))&&gate?.conclusion==='failure'&&gate.head_sha===s.pr.merge_commit_sha;
 return {issue:1243,source:s.source_url,as_of:s.observed_at,provenance:'historical-github-observation',
  code_qa:code?'PASS':'CANNOT_VERIFY',pr_merge:s.pr.merged?'PASS':'CANNOT_VERIFY',
  reported_hosted_auth:authFailure?'FAIL':'CANNOT_VERIFY',
  reported_auth_application:authUnapplied?'NOT_APPLIED':'CANNOT_VERIFY',
  acceptance:'CANNOT_VERIFY',owner_issue:1243,issue_close_permitted:false,
  reason:'Merged code/isolated QA does not apply production Auth settings. Only #1243 owns actual invitation resolution.',
  production_writes:0,live_auth_probe:false};
}
