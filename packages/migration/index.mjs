export function evaluateCutoverReadiness(input = {}) {
  const checks = [
    ['functionalParity', Boolean(input.functionalParity)],
    ['browserSmoke', Boolean(input.browserSmoke)],
    ['behavioralEvals', Boolean(input.behavioralEvals)],
    ['securityReview', Boolean(input.securityReview)],
    ['dataCompatibility', Boolean(input.dataCompatibility)],
    ['rollbackPlan', Boolean(input.rollbackPlan)],
    ['explicitHumanApproval', Boolean(input.explicitHumanApproval)]
  ];
  const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
  return Object.freeze({ ready: failed.length === 0, failed, checks: Object.fromEntries(checks), policy:'NO_CUTOVER_WITHOUT_ALL_GATES' });
}
