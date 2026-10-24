export function isTargetAware(interfaceTotal, willTotal) {
    return interfaceTotal <= willTotal;
}
export function isWithinJackInRange(distanceInSquares, maximumSquares = 25) {
    return Number.isFinite(distanceInSquares) && distanceInSquares <= maximumSquares;
}
export function isNetrunnerEjected(defenderTotal, interfaceTotal) {
    return defenderTotal > interfaceTotal;
}
export function isQuickhackSuccessful(interfaceTotal, difficultyValue) {
    return interfaceTotal > difficultyValue;
}
export function isQuickhackTargetAlerted({ success, silentOnSuccess, targetIsPlayer }) {
    return targetIsPlayer || (success && !silentOnSuccess);
}
