// Native Supabase deployment attestation for CI-01.
// Called from actions/github-script, never grants or mints a Supabase token.
module.exports = async function waitForNativeSupabase({github, context, core, sleep, maxAttempts = 36}) {
  const wait = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const projectUrl = 'https://supabase.com/dashboard/project/waluhdgqhwjjwmflhrle';
  for (let i = 1; i <= maxAttempts; i++) {
    const {data} = await github.rest.checks.listForRef({
      ...context.repo, ref:context.sha, per_page:100
    });
    if (data.total_count > (data.check_runs || []).length) {
      throw Error('Native Supabase check list was truncated');
    }
    const matches = (data.check_runs || []).filter(check =>
      check.name === 'Supabase Preview' &&
      check.app?.slug === 'supabase' &&
      check.app?.id === 330661 &&
      check.head_sha === context.sha &&
      check.details_url?.startsWith(projectUrl));
    if (matches.length > 1) throw Error('Ambiguous official Supabase check');
    const receipt = matches[0];
    if (receipt?.status === 'completed') {
      if (receipt.conclusion !== 'success') {
        throw Error('Native Supabase deployment failed: '+String(receipt.conclusion));
      }
      core.info('Official Supabase GitHub App release confirmed: '+receipt.details_url);
      return receipt;
    }
    if (i < maxAttempts) await wait(10000);
  }
  throw Error('Official Supabase deployment receipt missing for '+context.sha);
};
