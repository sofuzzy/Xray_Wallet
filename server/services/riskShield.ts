import { assessTokenRisk, type TokenRiskAssessment, type RiskLevel } from "./tokenRiskEngine";

export interface RiskShieldPolicy {
  blockLevel: RiskLevel;            // tokens at or above this level are blocked
  requireAckLevel: RiskLevel;       // tokens at or above this level require acknowledgement
  allowOverrideCritical: boolean;   // if true, critical may be bypassed with acknowledgement (not recommended)
  denylist: string[];               // always blocked
  allowlist: string[];              // always allowed (bypass)
}

export interface RiskShieldDecision {
  mint: string;
  action: string;
  allowed: boolean;
  blocked: boolean;
  requiresAcknowledgement: boolean;
  policy: RiskShieldPolicy;
  assessment?: TokenRiskAssessment;
  reason?: string;
}

function normalizeMint(m: string): string {
  return (m || "").trim();
}

function parseListEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  // Supports comma-separated or JSON array
  try {
    const maybe = JSON.parse(raw);
    if (Array.isArray(maybe)) return maybe.map(String).map(normalizeMint).filter(Boolean);
  } catch {}
  return raw.split(",").map(normalizeMint).filter(Boolean);
}

function levelRank(l: RiskLevel): number {
  // increasing severity
  switch (l) {
    case "low": return 0;
    case "medium": return 1;
    case "high": return 2;
    case "critical": return 3;
    default: return 0;
  }
}

function atOrAbove(a: RiskLevel, b: RiskLevel): boolean {
  return levelRank(a) >= levelRank(b);
}

export function getRiskShieldPolicy(): RiskShieldPolicy {
  const blockLevel = (process.env.XRAY_RISK_BLOCK_LEVEL as RiskLevel) || "critical";
  const requireAckLevel = (process.env.XRAY_RISK_REQUIRE_ACK_LEVEL as RiskLevel) || "high";
  const allowOverrideCritical = (process.env.XRAY_RISK_ALLOW_OVERRIDE_CRITICAL || "false").toLowerCase() === "true";

  const denylist = parseListEnv("XRAY_TOKEN_DENYLIST");
  const allowlist = parseListEnv("XRAY_TOKEN_ALLOWLIST");

  return { blockLevel, requireAckLevel, allowOverrideCritical, denylist, allowlist };
}

export async function decideTokenAction(opts: {
  mint: string;
  action: string;
  acknowledge?: boolean;
  includeAssessment?: boolean;
}): Promise<RiskShieldDecision> {
  const policy = getRiskShieldPolicy();
  const mint = normalizeMint(opts.mint);

  if (!mint) {
    return {
      mint,
      action: opts.action,
      allowed: false,
      blocked: true,
      requiresAcknowledgement: false,
      policy,
      reason: "Missing mint",
    };
  }

  if (policy.allowlist.includes(mint)) {
    return {
      mint,
      action: opts.action,
      allowed: true,
      blocked: false,
      requiresAcknowledgement: false,
      policy,
      reason: "Allowlisted token",
    };
  }

  if (policy.denylist.includes(mint)) {
    return {
      mint,
      action: opts.action,
      allowed: false,
      blocked: true,
      requiresAcknowledgement: false,
      policy,
      reason: "Denylisted token",
    };
  }

  const assessment = await assessTokenRisk(mint);

  const requiresAcknowledgement = atOrAbove(assessment.level, policy.requireAckLevel);

  const atBlock = atOrAbove(assessment.level, policy.blockLevel);

  // default behavior:
  // - blocked if at/above blockLevel (usually critical)
  // - unless allowOverrideCritical and acknowledged
  if (atBlock) {
    if (assessment.level === "critical" && policy.allowOverrideCritical && opts.acknowledge) {
      return {
        mint,
        action: opts.action,
        allowed: true,
        blocked: false,
        requiresAcknowledgement: true,
        policy,
        assessment: opts.includeAssessment ? assessment : undefined,
        reason: "Critical override acknowledged",
      };
    }

    return {
      mint,
      action: opts.action,
      allowed: false,
      blocked: true,
      requiresAcknowledgement,
      policy,
      assessment: opts.includeAssessment ? assessment : undefined,
      reason: `Token risk level '${assessment.level}' is blocked by policy`,
    };
  }

  // Not blocked, but may require acknowledgement
  if (requiresAcknowledgement && !opts.acknowledge) {
    return {
      mint,
      action: opts.action,
      allowed: false,
      blocked: false,
      requiresAcknowledgement: true,
      policy,
      assessment: opts.includeAssessment ? assessment : undefined,
      reason: `Token risk level '${assessment.level}' requires acknowledgement`,
    };
  }

  return {
    mint,
    action: opts.action,
    allowed: true,
    blocked: false,
    requiresAcknowledgement,
    policy,
    assessment: opts.includeAssessment ? assessment : undefined,
    reason: "Allowed by policy",
  };
}
