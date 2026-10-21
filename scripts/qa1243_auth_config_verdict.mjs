// #1243 strict Hosted Auth proof: public auth/settings alone is not mail configuration.
export function assessHostedInviteConfig(s){
  const checks=[
    ['MANAGEMENT_CONFIG_READABLE',s?.configReadable===true],
    ['HOSTED_KOREAN_INVITE_HTML_MATCH',s?.remoteTemplateMatch===true],
    ['HOSTED_KOREAN_INVITE_SUBJECT_MATCH',s?.remoteInviteSubjectMatch===true],
    ['HOSTED_EMAIL_PROVIDER_ENABLED',s?.emailProviderEnabled===true],
    ['HOSTED_SMTP_HOST_CONFIGURED',s?.smtpHostConfigured===true],
    ['HOSTED_SMTP_SENDER_CONFIGURED',s?.smtpSenderConfigured===true]
  ];
  return {ready:checks.every(([,ok])=>ok),passed:checks.filter(([,ok])=>ok).length,
    required:checks.length,failed:checks.filter(([,ok])=>!ok).map(([id])=>id),
    externalMailboxDeliveryVerified:false};
}
