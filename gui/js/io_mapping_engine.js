// Read-only allocation for a template's devices in the exact order defined
// by the electrical schematic. Never auto-search for a different free start.
export function templateIoLanes(signals, widthOf) {
    const lanes = [];
    for (const signal of signals) {
        if (!["Input", "Output"].includes(signal.io_type)) continue;
        const width = widthOf(signal.data_type);
        const laneId = signal.io_type + ":" + width;
        let lane = lanes.find(item => item.id === laneId);
        if (!lane) {
            lane = {id: laneId, io_type: signal.io_type, width, signals: []};
            lanes.push(lane);
        }
        lane.signals.push(signal);
    }
    return lanes;
}

// All channels are manually anchored to an exact station, module and first
// address. Reject gaps, cross-station rollovers and overlapping bit ranges.
export function allocateTemplateByDevice({
    groups, templates, mappings, channels,
    widthOf, compatible, keyOf, addressOf, tagNameOf, deviceNameOf,
}) {
    const rows = [], errors = [];
    const usedBits = new Map(), usedTags = new Set();
    const ordered = [...channels].sort((a,b) =>
        a.channel_address_bits - b.channel_address_bits
        || a.device_name.localeCompare(b.device_name)
        || a.item_path.localeCompare(b.item_path)
        || a.channel_number - b.channel_number
    );
    for (const group of groups) {
        const template = templates.find(t => t.id === group.template_id);
        if (!template) {
            errors.push(group.prefix + ": template not found.");
            continue;
        }
        if (!Number.isSafeInteger(group.quantity) || group.quantity < 1) {
            errors.push(group.prefix + ": invalid device quantity.");
            continue;
        }
        for (const lane of templateIoLanes(template.signals, widthOf)) {
            const label = group.prefix + " / " + lane.id;
            if (!Number.isInteger(lane.width) || lane.width < 1) {
                errors.push(label + ": unsupported data type/width.");
                continue;
            }
            const startMapping = mappings.find(m =>
                m.group_id === group.id && m.signal_id === "@lane:" + lane.id);
            if (!startMapping?.start_channel_key) {
                errors.push(label + ": select the first physical channel from the schematic.");
                continue;
            }
            // Never silently choose a substitute address or use unknown
            // channel widths that could alias DI/DO to AI/AQ.
            const candidates = ordered.filter(ch =>
                ch.io_type === lane.io_type
                && ch.channel_width_bits === lane.width
                && compatible(ch, lane.signals[0])
            );
            const startIndex = candidates.findIndex(ch =>
                keyOf(ch) === startMapping.start_channel_key);
            if (startIndex < 0) {
                errors.push(label + ": selected channel is missing or incompatible.");
                continue;
            }
            const start = candidates[startIndex];
            const needed = group.quantity * lane.signals.length;
            if (!Number.isSafeInteger(needed) || needed < 1) {
                errors.push(label + ": invalid required channel count.");
                continue;
            }
            const station = candidates.filter(ch =>
                ch.device_name === start.device_name);
            const from = station.findIndex(ch => keyOf(ch) === keyOf(start));
            if (from < 0 || from + needed > station.length) {
                errors.push(label + ": not enough consecutive channels in station "
                    + start.device_name + ". Required: " + needed + ".");
                continue;
            }
            let previous = null;
            for (let offset = 0; offset < group.quantity; offset++) {
                for (let index = 0; index < lane.signals.length; index++) {
                    const signal = lane.signals[index];
                    const slot = from + offset * lane.signals.length + index;
                    const ch = station[slot];
                    if (previous && ch.channel_address_bits !==
                        previous.channel_address_bits + lane.width) {
                        errors.push(label + ": non-contiguous physical addresses after "
                            + addressOf(previous, signal.data_type) + ".");
                        // No skipping to another free module/channel.
                        return {rows, errors};
                    }
                    previous = ch;
                    const address = addressOf(ch, signal.data_type);
                    if (!address || !compatible(ch, signal)) {
                        errors.push(label + ": incompatible channel at slot " + slot + ".");
                        continue;
                    }
                    const tagName = tagNameOf(group, signal, offset);
                    const normalized = tagName.toLowerCase();
                    if (usedTags.has(normalized)) {
                        errors.push("Duplicate generated tag name: " + tagName + ".");
                        continue;
                    }
                    usedTags.add(normalized);
                    let overlap = false;
                    for (let bit = ch.channel_address_bits;
                         bit < ch.channel_address_bits + lane.width; bit++) {
                        const k = ch.io_type + ":" + bit;
                        if (usedBits.has(k)) {
                            errors.push("Hardware address already mapped: " + address
                                + " (also " + usedBits.get(k) + ").");
                            overlap = true;
                            break;
                        }
                    }
                    if (overlap) continue;
                    for (let bit = ch.channel_address_bits;
                         bit < ch.channel_address_bits + lane.width; bit++) {
                        usedBits.set(ch.io_type + ":" + bit, tagName);
                    }
                    rows.push({
                        device_name: deviceNameOf(group, offset).name,
                        signal_key: signal.key,
                        tag_name: tagName,
                        data_type: signal.data_type,
                        logical_address: address,
                        channel: ch,
                    });
                }
            }
        }
    }
    return {rows, errors};
}
