// Worker delivery is not parent verification or acceptance.
export function repairOutcome(report, findings) {
  const expected = findings.map(f => f.id).sort();
  const ids = report.finding_ids ?? (report.finding_id ? [report.finding_id] : []);
  if (!Array.isArray(ids) || JSON.stringify([...ids].sort()) !== JSON.stringify(expected))
    throw new Error('repair omitted, duplicated, or invented finding IDs');
  if (typeof report.summary !== 'string' || !report.summary.trim() || !Array.isArray(report.tests))
    throw new Error('repair requires a summary and test evidence');
  if (report.implementation !== undefined) {
    if (!['COMPLETE', 'PARTIAL', 'DISPUTED'].includes(report.implementation) ||
        !['PASSED', 'DEFERRED', 'FAILED'].includes(report.verification) ||
        !Array.isArray(report.remaining_work) ||
        report.remaining_work.some(x => typeof x !== 'string' || !x.trim()))
      throw new Error('invalid implementation/verification/remaining_work');
    if (report.implementation === 'COMPLETE' && report.remaining_work.length)
      throw new Error('complete implementation has remaining source work');
    if (report.implementation !== 'COMPLETE' && !report.remaining_work.length)
      throw new Error('incomplete implementation must explain remaining work');
    return report.implementation === 'COMPLETE' && report.verification !== 'FAILED'
      ? 'AWAITING_PARENT_VERIFICATION' : 'NEEDS_DIAGNOSIS';
  }
  // Legacy PARTIAL combines missing source work and missing host permissions.
  // Preserve it for parent inspection; never guess that its code is complete.
  if (!['COMPLETE', 'PARTIAL'].includes(report.status)) throw new Error('invalid legacy repair status');
  return report.status === 'COMPLETE' ? 'AWAITING_PARENT_VERIFICATION' : 'NEEDS_DIAGNOSIS';
}
