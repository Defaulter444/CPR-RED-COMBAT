export function isTargetAware(interfaceTotal: number, willTotal: number) {
  return interfaceTotal <= willTotal;
}

export function isWithinJackInRange(distanceInSquares: number, maximumSquares = 25) {
  return Number.isFinite(distanceInSquares) && distanceInSquares <= maximumSquares;
}

export function isNetrunnerEjected(defenderTotal: number, interfaceTotal: number) {
  return defenderTotal > interfaceTotal;
}

export function isQuickhackSuccessful(interfaceTotal: number, difficultyValue: number) {
  return interfaceTotal > difficultyValue;
}

export function isQuickhackTargetAlerted({ success, silentOnSuccess, targetIsPlayer }: { success: boolean; silentOnSuccess?: boolean; targetIsPlayer: boolean }) {
  return targetIsPlayer || (success && !silentOnSuccess);
}
