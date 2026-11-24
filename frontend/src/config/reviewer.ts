/**
 * Mock reviewer identity. There is no authentication in scope; the server accepts
 * any `reviewerId` and the audit log is honest about that (see README trade-offs).
 */
export const REVIEWER = {
  id: 'acct-nathan',
  name: 'Nathan Fletcher',
  label: 'Nathan Fletcher · acct-nathan',
} as const;
