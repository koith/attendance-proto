export function auditEnvDescriptor(rows) {
  if (!Array.isArray(rows)) throw Error('DESCRIPTOR_INVALID');
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) throw Error('DESCRIPTOR_INVALID');
    const nameDescriptor = Object.getOwnPropertyDescriptor(row, 'name');
    if (!nameDescriptor || typeof nameDescriptor.value !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(nameDescriptor.value)) {
      throw Error('DESCRIPTOR_INVALID');
    }
    if (/(?:^|_)(?:ACCESS_KEY|API_KEY|AUTH_TOKEN|BEARER_TOKEN|CLIENT_SECRET|CREDENTIALS|PASSWORD|PASSWD|PRIVATE_KEY|ROOT_KEY|SECRET|SECRET_ACCESS_KEY|SECRET_KEY|SERVICE_ACCOUNT_KEY|SERVICE_ROLE|SERVICE_ROLE_KEY|SESSION_TOKEN|SIGNING_KEY|TOKEN)(?:_|$)/i.test(nameDescriptor.value)) {
      throw Error('ENV_NAME_DENIED');
    }
  }
  return {count: rows.length};
}
