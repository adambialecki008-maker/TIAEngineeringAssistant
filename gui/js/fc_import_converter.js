import {convertTiaFbDetail} from "./fb_import_converter.js";

// FC and FB share the lossless interface conversion. FC has no Static
// section: if TIA exports one, retain the source XML but mark the interface
// unverified rather than silently treating it as an editable FC declaration.
export function convertTiaFcDetail(detail) {
    if (!detail || String(detail.kind || "").toUpperCase() !== "FC") {
        throw Error("TIA did not export usable Function declarations.");
    }
    const converted = convertTiaFbDetail({...detail, kind: "FB"});
    if (converted.static?.members?.length) {
        converted.interface_verified = false;
        converted.unverified_reasons.push("Static: FC declarations cannot contain Static members.");
    }
    delete converted.static;
    return converted;
}
