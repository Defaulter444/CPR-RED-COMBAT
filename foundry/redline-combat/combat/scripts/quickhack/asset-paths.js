import { getQuickhack } from "./catalog.js";
import { MODULE, LEGACY_MODULE } from "./availability.js";
/** Map standalone QuickHack artwork to the actual Combat Tools package layout. */
export function quickhackAssetPath(path) {
    if (!path)
        return undefined;
    const prefix = `modules/${LEGACY_MODULE}/icons/`;
    const relative = path.replace(/^\//, "");
    if (!relative.startsWith(prefix))
        return path;
    const asset = relative.slice(prefix.length);
    if (asset === "quickhack-gray.png")
        return `modules/${MODULE}/combat/styles/${asset}`;
    const match = /^quickhacks\/(.+)-gray\.png$/.exec(asset);
    return match && getQuickhack(match[1]) ? `modules/${MODULE}/combat/styles/${asset}` : path;
}
