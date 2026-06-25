export function calculatePriorityScore(inputs: {
  severity: string;
  trafficRisk: boolean;
  nearbySchool: boolean;
  nearbyHospital: boolean;
  locationRisk: boolean;
}): number {
  let score = 0;

  // Severity base score
  switch (inputs.severity.toLowerCase()) {
    case "low":
      score += 10;
      break;
    case "medium":
      score += 30;
      break;
    case "high":
      score += 60;
      break;
    case "critical":
      score += 90;
      break;
    default:
      score += 20; // Default fallback
      break;
  }

  // Risk modifiers
  if (inputs.trafficRisk) {
    score += 15;
  }
  if (inputs.nearbySchool) {
    score += 15;
  }
  if (inputs.nearbyHospital) {
    score += 20;
  }
  if (inputs.locationRisk) {
    score += 10;
  }

  return score;
}
