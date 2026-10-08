// Historical focused-v1 artifact validation only. New runs use focused-v2.
const focusedStages = ['semantics', 'implementation', 'verification'];

export function discoverySchema(schema) {
  const result = structuredClone(schema);
  result.title = 'Candidate review comments';
  const finding = result.properties.findings.items;
  delete finding.properties.followUps;
  finding.required = finding.required.filter((name) => name !== 'followUps');
  return result;
}

export function verificationSchema(schema) {
  const text = { type: 'string', minLength: 1, pattern: '\\S' };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['report', 'dispositions'],
    properties: {
      report: schema,
      dispositions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidateId', 'status', 'reason', 'findingId'],
          properties: {
            candidateId: text,
            status: {
              type: 'string',
              enum: ['supported', 'disproved', 'unresolved'],
            },
            reason: text,
            findingId: { anyOf: [text, { type: 'null' }] },
          },
        },
      },
    },
  };
}

export function collectCandidates(reports) {
  return focusedStages.slice(0, 2).flatMap((stage) => {
    const report = reports[stage];
    return [
      ...report.findings.map((value, index) => ({
        id: `${stage}:F${index + 1}`,
        kind: 'finding',
        value,
      })),
      ...report.requirementsQuestions.map((value, index) => ({
        id: `${stage}:Q${index + 1}`,
        kind: 'requirements_question',
        value,
      })),
    ];
  });
}

// Check correspondence, not semantic truth. The engineer still assesses the evidence.
export function finalizeVerification(candidates, verification) {
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set();
  const report = structuredClone(verification.report);
  const findings = new Set(report.findings.map((finding) => finding.id));
  const supported = new Set();
  for (const disposition of verification.dispositions) {
    const { candidateId, status, findingId, reason } = disposition;
    if (!ids.has(candidateId) || seen.has(candidateId))
      throw new Error(`Unknown or duplicate candidate disposition: ${candidateId}`);
    seen.add(candidateId);
    if (status === 'supported') {
      if (!findings.has(findingId))
        throw new Error(`Supported candidate ${candidateId} has no final finding.`);
      supported.add(findingId);
    } else {
      if (findingId !== null) throw new Error(`${candidateId}: unsupported finding link.`);
      if (status === 'unresolved') {
        const candidate = candidates.find((item) => item.id === candidateId);
        if (candidate.kind === 'requirements_question') {
          if (
            !report.requirementsQuestions.some((item) => item.question === candidate.value.question)
          )
            report.requirementsQuestions.push(candidate.value);
        } else report.limitations.push(`Unresolved candidate ${candidateId}: ${reason}`);
      }
    }
  }
  if (seen.size !== ids.size) throw new Error('Every candidate requires a disposition.');
  if ([...findings].some((id) => !supported.has(id)))
    throw new Error('Every final finding requires a supported candidate.');
  return report;
}
