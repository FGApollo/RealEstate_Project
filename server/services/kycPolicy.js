// Demo identity decisions are an explicit local/test fixture only. Never let a
// missing real provider silently turn into an approximate identity approval.
const isKycDemoAllowed = () => ['development', 'test'].includes(process.env.NODE_ENV)
  && process.env.KYC_ALLOW_DEMO === 'true';

module.exports = { isKycDemoAllowed };
