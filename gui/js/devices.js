import {
    projectConfig,
    saveProjectConfig,
} from "./state.js";

import {
    getJson,
    postJson,
} from "./api.js";


const DATA_TYPES = [
    "Bool",
    "Byte",
    "SInt",
    "USInt",
    "Char",
    "Word",
    "Int",
    "UInt",
    "Date",
    "WChar",
    "DWord",
    "DInt",
    "UDInt",
    "Real",
    "Time",
    "TOD",
];


function createId(prefix) {
    if (
        globalThis.crypto
        &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return (
        `${prefix}-${Date.now()}-`
        +
        Math.random()
            .toString(16)
            .slice(2)
    );
}


function normalizeInteger(
    value,
    fallback,
    minimum,
    maximum
) {
    const parsed =
        Number.parseInt(
            value,
            10
        );

    if (
        !Number.isInteger(parsed)
        ||
        parsed < minimum
        ||
        parsed > maximum
    ) {
        return fallback;
    }

    return parsed;
}


function replaceTagPattern(
    pattern,
    deviceName,
    prefix,
    index,
    digits
) {
    const padded =
        String(index)
            .padStart(
                digits,
                "0"
            );

    return pattern
        .replaceAll(
            "{device}",
            deviceName
        )
        .replaceAll(
            "{prefix}",
            prefix
        )
        .replaceAll(
            "{index}",
            String(index)
        )
        .replaceAll(
            "{n}",
            padded
        )
        .replace(
            /\{n:(\d+)\}/g,
            (
                _match,
                widthText
            ) => {
                const width =
                    normalizeInteger(
                        widthText,
                        digits,
                        1,
                        12
                    );

                return String(index)
                    .padStart(
                        width,
                        "0"
                    );
            }
        );
}


function buildDeviceName(
    group,
    offset
) {
    const index =
        group.start_index
        +
        offset;

    return {
        index,

        name:
            group.prefix
            +
            String(index)
                .padStart(
                    group.digits,
                    "0"
                ),
    };
}


function buildTagName(
    group,
    signal,
    offset
) {
    const device =
        buildDeviceName(
            group,
            offset
        );

    return replaceTagPattern(
        signal.tag_pattern,
        device.name,
        group.prefix,
        device.index,
        group.digits
    );
}


function channelKey(channel) {
    return [
        channel.device_name,
        channel.item_path,
        channel.channel_number,
        channel.io_type,
        channel.channel_address_bits,
    ].join("::");
}


function dataTypeWidthBits(
    dataType
) {
    const normalized =
        String(dataType)
            .toLowerCase();

    if (normalized === "bool") {
        return 1;
    }

    if (
        [
            "byte",
            "sint",
            "usint",
            "char",
        ].includes(
            normalized
        )
    ) {
        return 8;
    }

    if (
        [
            "word",
            "int",
            "uint",
            "date",
            "wchar",
        ].includes(
            normalized
        )
    ) {
        return 16;
    }

    if (
        [
            "dword",
            "dint",
            "udint",
            "real",
            "time",
            "tod",
        ].includes(
            normalized
        )
    ) {
        return 32;
    }

    return null;
}


function formatLogicalAddress(
    channel,
    dataType
) {
    const width =
        dataTypeWidthBits(
            dataType
        );

    if (width === null) {
        return null;
    }

    const prefix =
        channel.io_type
        ===
        "Input"
            ? "I"
            : "Q";

    const byteAddress =
        Math.floor(
            channel.channel_address_bits
            /
            8
        );

    const bitAddress =
        channel.channel_address_bits
        %
        8;

    if (width === 1) {
        return (
            `%${prefix}`
            +
            `${byteAddress}.`
            +
            `${bitAddress}`
        );
    }

    if (bitAddress !== 0) {
        return null;
    }

    if (width === 8) {
        return `%${prefix}B${byteAddress}`;
    }

    if (width === 16) {
        return `%${prefix}W${byteAddress}`;
    }

    if (width === 32) {
        return `%${prefix}D${byteAddress}`;
    }

    return null;
}


function channelCompatible(
    channel,
    signal
) {
    if (
        signal.io_type
        !==
        channel.io_type
    ) {
        return false;
    }

    const requiredWidth =
        dataTypeWidthBits(
            signal.data_type
        );

    if (requiredWidth === null) {
        return false;
    }

    if (
        channel.channel_width_bits > 0
        &&
        channel.channel_width_bits
        <
        requiredWidth
    ) {
        return false;
    }

    if (
        requiredWidth > 1
        &&
        channel.channel_address_bits
        %
        8
        !==
        0
    ) {
        return false;
    }

    return (
        formatLogicalAddress(
            channel,
            signal.data_type
        )
        !==
        null
    );
}


function sortChannels(
    channels
) {
    return [
        ...channels,
    ].sort(
        (first, second) =>
            first.channel_address_bits
            -
            second.channel_address_bits

            ||

            first.device_name.localeCompare(
                second.device_name
            )

            ||

            first.item_path.localeCompare(
                second.item_path
            )

            ||

            first.channel_number
            -
            second.channel_number
    );
}


function hardwareModuleKey(
    item
) {
    return [
        item.device_name ?? "",
        item.item_name ?? "",
    ].join("::");
}


function formatRawChannelAddress(
    channel
) {
    const prefix =
        channel.io_type === "Input"
            ? "I"
            : "Q";

    const byteAddress =
        Math.floor(
            channel.channel_address_bits
            /
            8
        );

    const bitAddress =
        channel.channel_address_bits
        %
        8;

    return (
        `%${prefix}`
        +
        `${byteAddress}.`
        +
        `${bitAddress}`
    );
}


function formatAddressRecord(
    address
) {
    const prefix =
        address.io_type === "Input"
            ? "I"
            : "Q";

    const start =
        Number(
            address.start_address
        );

    const length =
        Number(
            address.length
        );

    if (
        Number.isFinite(length)
        &&
        length > 1
    ) {
        const end =
            start
            +
            length
            -
            1;

        return (
            `%${prefix}${start}`
            +
            `–`
            +
            `%${prefix}${end}`
        );
    }

    return `%${prefix}${start}`;
}


function formatModuleAddressRange(
    module,
    ioType
) {
    const channels =
        sortChannels(
            module.channels.filter(
                (channel) =>
                    channel.io_type
                    ===
                    ioType
            )
        );

    if (channels.length > 0) {
        const first =
            formatRawChannelAddress(
                channels[0]
            );

        const last =
            formatRawChannelAddress(
                channels[
                    channels.length - 1
                ]
            );

        if (first === last) {
            return first;
        }

        return `${first}–${last}`;
    }

    const addresses =
        module.addresses
            .filter(
                (address) =>
                    address.io_type
                    ===
                    ioType
            )
            .sort(
                (first, second) =>
                    first.start_address
                    -
                    second.start_address
            );

    if (addresses.length === 0) {
        return "—";
    }

    return addresses
        .map(
            formatAddressRecord
        )
        .join(", ");
}


function buildIoModuleSummaries(
    hardwareInventory
) {
    const modules =
        new Map();


    function getOrCreate(
        record
    ) {
        const key =
            hardwareModuleKey(
                record
            );

        if (!modules.has(key)) {
            modules.set(
                key,
                {
                    device_name:
                        record.device_name
                        ?? "",

                    item_name:
                        record.item_name
                        ?? "",

                    type_identifier: "",

                    is_plugged: true,

                    raw_items: [],

                    addresses: [],

                    channels: [],
                }
            );
        }

        return modules.get(
            key
        );
    }


    for (
        const item
        of hardwareInventory.items
        ?? []
    ) {
        const module =
            getOrCreate(
                item
            );

        module.raw_items.push(
            item
        );

        module.is_plugged =
            module.is_plugged
            &&
            Boolean(
                item.is_plugged
            );

        if (
            item.type_identifier
            &&
            (
                !module.type_identifier
                ||
                item.type_identifier
                    .startsWith(
                        "OrderNumber:"
                    )
            )
        ) {
            module.type_identifier =
                item.type_identifier;
        }
    }


    for (
        const address
        of hardwareInventory.addresses
        ?? []
    ) {
        const module =
            getOrCreate(
                address
            );

        module.addresses.push(
            address
        );

        if (
            !module.type_identifier
            &&
            address.type_identifier
        ) {
            module.type_identifier =
                address.type_identifier;
        }
    }


    for (
        const channel
        of hardwareInventory.channels
        ?? []
    ) {
        const module =
            getOrCreate(
                channel
            );

        module.channels.push(
            channel
        );

        if (
            !module.type_identifier
            &&
            channel.type_identifier
        ) {
            module.type_identifier =
                channel.type_identifier;
        }
    }


    return [
        ...modules.values(),
    ]
        .filter(
            (module) =>
                module.channels.length
                >
                0
                ||
                module.addresses.length
                >
                0
        )
        .map(
            (module) => {
                const ioTypes =
                    new Set();

                for (
                    const address
                    of module.addresses
                ) {
                    if (
                        address.io_type
                        ===
                        "Input"
                        ||
                        address.io_type
                        ===
                        "Output"
                    ) {
                        ioTypes.add(
                            address.io_type
                        );
                    }
                }

                for (
                    const channel
                    of module.channels
                ) {
                    if (
                        channel.io_type
                        ===
                        "Input"
                        ||
                        channel.io_type
                        ===
                        "Output"
                    ) {
                        ioTypes.add(
                            channel.io_type
                        );
                    }
                }

                const orderedIoTypes =
                    [
                        "Input",
                        "Output",
                    ].filter(
                        (ioType) =>
                            ioTypes.has(
                                ioType
                            )
                    );

                const uniqueChannels =
                    new Set(
                        module.channels.map(
                            channelKey
                        )
                    );

                const addressText =
                    orderedIoTypes
                        .map(
                            (ioType) => {
                                const range =
                                    formatModuleAddressRange(
                                        module,
                                        ioType
                                    );

                                if (
                                    orderedIoTypes.length
                                    >
                                    1
                                ) {
                                    return (
                                        `${ioType}: `
                                        +
                                        range
                                    );
                                }

                                return range;
                            }
                        )
                        .join(" · ");

                return {
                    ...module,

                    io_type:
                        orderedIoTypes.length
                        >
                        0
                            ? orderedIoTypes
                                .join(" / ")
                            : "—",

                    channel_count:
                        uniqueChannels.size,

                    address_text:
                        addressText
                        ||
                        "—",
                };
            }
        )
        .sort(
            (first, second) =>
                first.device_name
                    .localeCompare(
                        second.device_name
                    )

                ||

                first.item_name
                    .localeCompare(
                        second.item_name
                    )
        );
}


function getTemplate(
    templateId
) {
    return projectConfig
        .device_config
        .templates
        .find(
            (template) =>
                template.id
                ===
                templateId
        );
}


function getMapping(
    groupId,
    signalId
) {
    return projectConfig
        .device_config
        .mappings
        .find(
            (mapping) =>
                mapping.group_id
                ===
                groupId
                &&
                mapping.signal_id
                ===
                signalId
        );
}


function setMapping(
    groupId,
    signalId,
    startChannelKey
) {
    projectConfig.device_config.mappings =
        projectConfig
            .device_config
            .mappings
            .filter(
                (mapping) =>
                    !(
                        mapping.group_id
                        ===
                        groupId
                        &&
                        mapping.signal_id
                        ===
                        signalId
                    )
            );

    if (startChannelKey) {
        projectConfig
            .device_config
            .mappings
            .push({
                group_id:
                    groupId,

                signal_id:
                    signalId,

                start_channel_key:
                    startChannelKey,
            });
    }

    saveProjectConfig();
}


function buildDeviceConfig() {
    const config = {};

    const rows = [];

    const errors = [];


    for (
        const group
        of projectConfig.device_config.groups
    ) {
        const template =
            getTemplate(
                group.template_id
            );

        if (!template) {
            errors.push(
                `Group ${group.prefix}: template not found.`
            );

            continue;
        }


        for (
            let offset = 0;
            offset < group.quantity;
            offset += 1
        ) {
            const device =
                buildDeviceName(
                    group,
                    offset
                );

            if (
                Object.hasOwn(
                    config,
                    device.name
                )
            ) {
                errors.push(
                    `Duplicate generated device name: ${device.name}.`
                );

                continue;
            }

            config[
                device.name
            ] = {};

            const keys =
                new Set();


            for (
                const signal
                of template.signals
            ) {
                const key =
                    signal.key.trim();

                const pattern =
                    signal.tag_pattern.trim();

                if (
                    !key
                    ||
                    !pattern
                ) {
                    continue;
                }

                const normalizedKey =
                    key.toLowerCase();

                if (
                    keys.has(
                        normalizedKey
                    )
                ) {
                    errors.push(
                        `${template.name}: duplicate config key "${key}".`
                    );

                    continue;
                }

                keys.add(
                    normalizedKey
                );

                const tag =
                    buildTagName(
                        group,
                        signal,
                        offset
                    );

                config[
                    device.name
                ][
                    key
                ] =
                    tag;

                rows.push({
                    device_name:
                        device.name,

                    template_name:
                        template.name,

                    key,

                    tag,

                    io_type:
                        signal.io_type,

                    data_type:
                        signal.data_type,
                });
            }
        }
    }


    return {
        config,
        rows,
        errors,
    };
}


function buildPhysicalTags(
    hardwareInventory
) {
    const rows = [];

    const errors = [];

    const usedChannels =
        new Set();

    const usedTagNames =
        new Set();

    const allChannels =
        sortChannels(
            hardwareInventory.channels
            ?? []
        );


    for (
        const group
        of projectConfig.device_config.groups
    ) {
        const template =
            getTemplate(
                group.template_id
            );

        if (!template) {
            continue;
        }


        for (
            const signal
            of template.signals
        ) {
            if (
                signal.io_type
                !==
                "Input"
                &&
                signal.io_type
                !==
                "Output"
            ) {
                continue;
            }


            const compatible =
                allChannels.filter(
                    (channel) =>
                        channelCompatible(
                            channel,
                            signal
                        )
                );

            const mapping =
                getMapping(
                    group.id,
                    signal.id
                );

            if (!mapping) {
                errors.push(
                    `${group.prefix} / ${signal.key || "signal"}: select the first hardware channel.`
                );

                continue;
            }

            const startChannel =
                compatible.find(
                    (channel) =>
                        channelKey(
                            channel
                        )
                        ===
                        mapping.start_channel_key
                );

            if (!startChannel) {
                errors.push(
                    `${group.prefix} / ${signal.key || "signal"}: selected channel is no longer available.`
                );

                continue;
            }


            /*
             * Auto-mapping must stay inside the same physical module.
             *
             * Selecting DI_1 / channel 0 for four devices must map
             * channels 0..3 of DI_1. It must never continue into the
             * next compatible module when the current module runs out.
             */
            const moduleChannels =
                compatible.filter(
                    (channel) =>
                        channel.device_name
                        ===
                        startChannel.device_name
                        &&
                        channel.item_path
                        ===
                        startChannel.item_path
                );

            const startIndex =
                moduleChannels.findIndex(
                    (channel) =>
                        channelKey(
                            channel
                        )
                        ===
                        mapping.start_channel_key
                );

            const requiredWidth =
                dataTypeWidthBits(
                    signal.data_type
                );

            const availableChannels =
                Math.max(
                    0,
                    moduleChannels.length
                    -
                    startIndex
                );

            if (
                availableChannels
                <
                group.quantity
            ) {
                errors.push(
                    `${group.prefix} / ${signal.key || "signal"}: not enough I/O channels in module "${startChannel.item_name}". Required: ${group.quantity}, available from channel ${startChannel.channel_number}: ${availableChannels}.`
                );

                continue;
            }


            for (
                let offset = 0;
                offset < group.quantity;
                offset += 1
            ) {
                const channel =
                    moduleChannels[
                        startIndex
                        +
                        offset
                    ];


                if (
                    offset > 0
                    &&
                    requiredWidth !== null
                ) {
                    const previousChannel =
                        moduleChannels[
                            startIndex
                            +
                            offset
                            -
                            1
                        ];

                    const expectedAddress =
                        previousChannel
                            .channel_address_bits
                        +
                        requiredWidth;

                    if (
                        channel.channel_address_bits
                        !==
                        expectedAddress
                    ) {
                        errors.push(
                            `${group.prefix} / ${signal.key || "signal"}: channel sequence in module "${startChannel.item_name}" is not contiguous after ${formatRawChannelAddress(previousChannel)}.`
                        );

                        break;
                    }
                }

                const key =
                    channelKey(
                        channel
                    );

                if (
                    usedChannels.has(
                        key
                    )
                ) {
                    errors.push(
                        `Hardware channel already mapped: ${channel.item_path}, channel ${channel.channel_number}.`
                    );

                    continue;
                }

                usedChannels.add(
                    key
                );

                const tagName =
                    buildTagName(
                        group,
                        signal,
                        offset
                    );

                const normalizedTag =
                    tagName.toLowerCase();

                if (
                    usedTagNames.has(
                        normalizedTag
                    )
                ) {
                    errors.push(
                        `Duplicate generated tag name: ${tagName}.`
                    );

                    continue;
                }

                usedTagNames.add(
                    normalizedTag
                );

                const logicalAddress =
                    formatLogicalAddress(
                        channel,
                        signal.data_type
                    );

                if (!logicalAddress) {
                    errors.push(
                        `Cannot format address for ${tagName} (${signal.data_type}).`
                    );

                    continue;
                }

                const device =
                    buildDeviceName(
                        group,
                        offset
                    );

                rows.push({
                    device_name:
                        device.name,

                    signal_key:
                        signal.key,

                    tag_name:
                        tagName,

                    data_type:
                        signal.data_type,

                    logical_address:
                        logicalAddress,

                    channel,
                });
            }
        }
    }


    return {
        rows,
        errors,
    };
}


function createCell(
    text
) {
    const cell =
        document.createElement(
            "td"
        );

    cell.textContent =
        text;

    return cell;
}


export function initDevicesUi() {
    const newTemplateNameInput =
        document.getElementById(
            "new-device-template-name"
        );

    const addTemplateButton =
        document.getElementById(
            "add-device-template-button"
        );

    const templateContainer =
        document.getElementById(
            "device-template-container"
        );

    const groupTemplateSelect =
        document.getElementById(
            "device-group-template"
        );

    const groupPrefixInput =
        document.getElementById(
            "device-group-prefix"
        );

    const groupStartInput =
        document.getElementById(
            "device-group-start"
        );

    const groupQuantityInput =
        document.getElementById(
            "device-group-quantity"
        );

    const groupDigitsInput =
        document.getElementById(
            "device-group-digits"
        );

    const addGroupButton =
        document.getElementById(
            "add-device-group-button"
        );

    const groupsBody =
        document.getElementById(
            "device-groups-body"
        );

    const generatedBody =
        document.getElementById(
            "device-generated-body"
        );

    const configPreview =
        document.getElementById(
            "device-config-preview"
        );

    const configStatus =
        document.getElementById(
            "device-config-status"
        );

    const copyConfigButton =
        document.getElementById(
            "copy-device-config-button"
        );

    const refreshHardwareButton =
        document.getElementById(
            "refresh-hardware-button"
        );

    const hardwareStatus =
        document.getElementById(
            "hardware-status"
        );

    const hardwareItemsBody =
        document.getElementById(
            "hardware-items-body"
        );

    const hardwareBody =
        document.getElementById(
            "hardware-channels-body"
        );

    const mappingBody =
        document.getElementById(
            "device-io-mapping-body"
        );

    const plcTagsBody =
        document.getElementById(
            "generated-plc-tags-body"
        );

    const plcTagsStatus =
        document.getElementById(
            "generated-plc-tags-status"
        );

    const tagTableNameInput =
        document.getElementById(
            "plc-tag-table-name"
        );

    const createPlcTagsButton =
        document.getElementById(
            "create-plc-tags-button"
        );


    let hardwareInventory = {
        project_name: null,
        items: [],
        addresses: [],
        channels: [],
    };


    function persist() {
        saveProjectConfig();
    }


    function setStatus(
        element,
        message,
        kind = ""
    ) {
        if (!element) {
            return;
        }

        element.textContent =
            message;

        element.classList.remove(
            "error",
            "success"
        );

        if (kind) {
            element.classList.add(
                kind
            );
        }
    }


    function getProcessId() {
        const select =
            document.getElementById(
                "tia-process"
            );

        const value =
            Number.parseInt(
                select?.value
                ?? "",
                10
            );

        return Number.isInteger(value)
            ? value
            : null;
    }


    function renderTemplateSelect() {
        if (!groupTemplateSelect) {
            return;
        }

        const currentValue =
            groupTemplateSelect.value;

        groupTemplateSelect
            .replaceChildren();

        const placeholder =
            document.createElement(
                "option"
            );

        placeholder.value = "";

        placeholder.textContent =
            "Select template";

        groupTemplateSelect.appendChild(
            placeholder
        );


        for (
            const template
            of projectConfig.device_config.templates
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                template.id;

            option.textContent =
                template.name;

            groupTemplateSelect.appendChild(
                option
            );
        }


        if (
            Array.from(
                groupTemplateSelect.options
            ).some(
                (option) =>
                    option.value
                    ===
                    currentValue
            )
        ) {
            groupTemplateSelect.value =
                currentValue;
        }
    }


    function addTemplate() {
        const name =
            newTemplateNameInput
                ?.value
                .trim()
            ??
            "";

        if (!name) {
            return;
        }

        if (
            projectConfig
                .device_config
                .templates
                .some(
                    (template) =>
                        template.name
                            .toLowerCase()
                        ===
                        name.toLowerCase()
                )
        ) {
            alert(
                `Template "${name}" already exists.`
            );

            return;
        }

        projectConfig
            .device_config
            .templates
            .push({
                id:
                    createId(
                        "template"
                    ),

                name,

                signals: [],
            });

        newTemplateNameInput.value =
            "";

        persist();

        render();
    }


    function addSignal(
        template
    ) {
        template.signals.push({
            id:
                createId(
                    "signal"
                ),

            key: "",

            io_type:
                "Internal",

            data_type:
                "Bool",

            tag_pattern:
                "{device}_",
        });

        persist();

        render();
    }


    function deleteTemplate(
        template
    ) {
        const used =
            projectConfig
                .device_config
                .groups
                .some(
                    (group) =>
                        group.template_id
                        ===
                        template.id
                );

        if (used) {
            alert(
                "Delete device groups using this template first."
            );

            return;
        }

        if (
            !confirm(
                `Delete device template "${template.name}"?`
            )
        ) {
            return;
        }

        projectConfig.device_config.templates =
            projectConfig
                .device_config
                .templates
                .filter(
                    (item) =>
                        item.id
                        !==
                        template.id
                );

        persist();

        render();
    }


    function renderTemplates() {
        if (!templateContainer) {
            return;
        }

        templateContainer
            .replaceChildren();

        if (
            projectConfig
                .device_config
                .templates
                .length
            ===
            0
        ) {
            const empty =
                document.createElement(
                    "p"
                );

            empty.className =
                "empty-message";

            empty.textContent =
                "No device templates yet.";

            templateContainer.appendChild(
                empty
            );

            return;
        }


        for (
            const template
            of projectConfig.device_config.templates
        ) {
            const details =
                document.createElement(
                    "details"
                );

            const summary =
                document.createElement(
                    "summary"
                );

            summary.textContent =
                `${template.name} (${template.signals.length} signals)`;

            const content =
                document.createElement(
                    "div"
                );

            content.className =
                "details-content";

            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "action-row";

            const addButton =
                document.createElement(
                    "button"
                );

            addButton.type =
                "button";

            addButton.textContent =
                "Add signal";

            addButton.addEventListener(
                "click",
                () =>
                    addSignal(
                        template
                    )
            );

            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.className =
                "danger-button";

            deleteButton.textContent =
                "Delete template";

            deleteButton.addEventListener(
                "click",
                () =>
                    deleteTemplate(
                        template
                    )
            );

            actions.append(
                addButton,
                deleteButton
            );

            content.appendChild(
                actions
            );

            const wrapper =
                document.createElement(
                    "div"
                );

            wrapper.className =
                "table-wrapper";

            const table =
                document.createElement(
                    "table"
                );

            table.className =
                "management-table";

            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Config key</th>
                        <th>I/O</th>
                        <th>Data type</th>
                        <th>Tag name template</th>
                        <th>Actions</th>
                    </tr>
                </thead>
            `;

            const body =
                document.createElement(
                    "tbody"
                );


            if (
                template.signals.length
                ===
                0
            ) {
                const row =
                    document.createElement(
                        "tr"
                    );

                const cell =
                    createCell(
                        "Add signal definitions to this template."
                    );

                cell.colSpan =
                    5;

                cell.className =
                    "empty-table-cell";

                row.appendChild(
                    cell
                );

                body.appendChild(
                    row
                );
            }


            for (
                const signal
                of template.signals
            ) {
                const row =
                    document.createElement(
                        "tr"
                    );

                const keyCell =
                    document.createElement(
                        "td"
                    );

                const keyInput =
                    document.createElement(
                        "input"
                    );

                keyInput.type =
                    "text";

                keyInput.value =
                    signal.key;

                keyInput.placeholder =
                    "RunFb";

                keyInput.addEventListener(
                    "input",
                    markDirty
                );

                keyCell.appendChild(
                    keyInput
                );


                const ioCell =
                    document.createElement(
                        "td"
                    );

                const ioSelect =
                    document.createElement(
                        "select"
                    );

                for (
                    const value
                    of [
                        "Internal",
                        "Input",
                        "Output",
                    ]
                ) {
                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        value;

                    option.textContent =
                        value;

                    ioSelect.appendChild(
                        option
                    );
                }

                ioSelect.value =
                    signal.io_type;

                ioSelect.addEventListener(
                    "change",
                    markDirty
                );

                ioCell.appendChild(
                    ioSelect
                );


                const typeCell =
                    document.createElement(
                        "td"
                    );

                const typeSelect =
                    document.createElement(
                        "select"
                    );

                for (
                    const value
                    of DATA_TYPES
                ) {
                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        value;

                    option.textContent =
                        value;

                    typeSelect.appendChild(
                        option
                    );
                }

                typeSelect.value =
                    DATA_TYPES.includes(
                        signal.data_type
                    )
                        ? signal.data_type
                        : "Bool";

                typeSelect.addEventListener(
                    "change",
                    markDirty
                );

                typeCell.appendChild(
                    typeSelect
                );


                const patternCell =
                    document.createElement(
                        "td"
                    );

                const patternInput =
                    document.createElement(
                        "input"
                    );

                patternInput.type =
                    "text";

                patternInput.className =
                    "wide-input";

                patternInput.value =
                    signal.tag_pattern;

                patternInput.placeholder =
                    "e.g. {device}_RunFb";

                patternInput.title =
                    "{device} inserts the device name generated by Device group.";

                patternInput.addEventListener(
                    "input",
                    markDirty
                );


                const patternExample =
                    document.createElement(
                        "small"
                    );

                patternExample.textContent =
                    "{device} = device name generated by Device group "
                    +
                    "(for example Prefix M + number 01 = M01). "
                    +
                    "So {device}_RunFb becomes M01_RunFb.";

                patternCell.append(
                    patternInput,
                    patternExample
                );


                const actionsCell =
                    document.createElement(
                        "td"
                    );

                actionsCell.className =
                    "actions-cell";

                const saveButton =
                    document.createElement(
                        "button"
                    );

                saveButton.type =
                    "button";

                saveButton.textContent =
                    "Save";

                saveButton.disabled =
                    true;


                const saveStatus =
                    document.createElement(
                        "span"
                    );

                saveStatus.className =
                    "signal-save-status saved";

                saveStatus.textContent =
                    "Saved";


                function markDirty() {
                    saveButton.disabled =
                        false;

                    saveStatus.textContent =
                        "Unsaved";

                    saveStatus.classList.remove(
                        "saved"
                    );

                    saveStatus.classList.add(
                        "unsaved"
                    );
                }


                saveButton.addEventListener(
                    "click",
                    () => {
                        const mappingChanged =
                            signal.io_type
                            !==
                            ioSelect.value
                            ||
                            signal.data_type
                            !==
                            typeSelect.value;

                        signal.key =
                            keyInput.value
                                .trim();

                        signal.io_type =
                            ioSelect.value;

                        signal.data_type =
                            typeSelect.value;

                        signal.tag_pattern =
                            patternInput.value
                                .trim();


                        if (mappingChanged) {
                            projectConfig.device_config.mappings =
                                projectConfig
                                    .device_config
                                    .mappings
                                    .filter(
                                        (mapping) =>
                                            mapping.signal_id
                                            !==
                                            signal.id
                                    );
                        }


                        persist();

                        renderGenerated();

                        renderMappings();

                        renderPlcTags();

                        saveButton.disabled =
                            true;

                        saveStatus.textContent =
                            "Saved";

                        saveStatus.classList.remove(
                            "unsaved"
                        );

                        saveStatus.classList.add(
                            "saved"
                        );

                        setStatus(
                            configStatus,
                            `Signal "${signal.key || "(unnamed)"}" saved.`,
                            "success"
                        );
                    }
                );


                const removeButton =
                    document.createElement(
                        "button"
                    );

                removeButton.type =
                    "button";

                removeButton.className =
                    "danger-button";

                removeButton.textContent =
                    "Delete";

                removeButton.addEventListener(
                    "click",
                    () => {
                        template.signals =
                            template.signals
                                .filter(
                                    (item) =>
                                        item.id
                                        !==
                                        signal.id
                                );

                        projectConfig.device_config.mappings =
                            projectConfig
                                .device_config
                                .mappings
                                .filter(
                                    (mapping) =>
                                        mapping.signal_id
                                        !==
                                        signal.id
                                );

                        persist();

                        render();
                    }
                );

                actionsCell.append(
                    saveButton,
                    removeButton,
                    saveStatus
                );

                row.append(
                    keyCell,
                    ioCell,
                    typeCell,
                    patternCell,
                    actionsCell
                );

                body.appendChild(
                    row
                );
            }

            table.appendChild(
                body
            );

            wrapper.appendChild(
                table
            );

            content.appendChild(
                wrapper
            );


            details.append(
                summary,
                content
            );

            templateContainer.appendChild(
                details
            );
        }
    }


    function addGroup() {
        const templateId =
            groupTemplateSelect
                ?.value
            ??
            "";

        if (!templateId) {
            alert(
                "Select a device template first."
            );

            return;
        }

        const prefix =
            groupPrefixInput
                ?.value
                .trim()
            ??
            "";

        if (!prefix) {
            alert(
                "Prefix is required."
            );

            return;
        }

        projectConfig
            .device_config
            .groups
            .push({
                id:
                    createId(
                        "group"
                    ),

                template_id:
                    templateId,

                prefix,

                start_index:
                    normalizeInteger(
                        groupStartInput?.value,
                        1,
                        0,
                        999999
                    ),

                quantity:
                    normalizeInteger(
                        groupQuantityInput?.value,
                        1,
                        1,
                        10000
                    ),

                digits:
                    normalizeInteger(
                        groupDigitsInput?.value,
                        2,
                        1,
                        12
                    ),
            });

        persist();

        render();
    }


    function renderGroups() {
        if (!groupsBody) {
            return;
        }

        groupsBody.replaceChildren();

        if (
            projectConfig
                .device_config
                .groups
                .length
            ===
            0
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No device groups configured."
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            groupsBody.appendChild(
                row
            );

            return;
        }


        for (
            const group
            of projectConfig.device_config.groups
        ) {
            const template =
                getTemplate(
                    group.template_id
                );

            const row =
                document.createElement(
                    "tr"
                );

            for (
                const value
                of [
                    template?.name
                    ??
                    "Missing template",

                    group.prefix,

                    String(
                        group.start_index
                    ),

                    String(
                        group.quantity
                    ),

                    String(
                        group.digits
                    ),
                ]
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            const actionsCell =
                document.createElement(
                    "td"
                );

            actionsCell.className =
                "actions-cell";

            const deleteButton =
                document.createElement(
                    "button"
                );

            deleteButton.type =
                "button";

            deleteButton.className =
                "danger-button";

            deleteButton.textContent =
                "Delete";

            deleteButton.addEventListener(
                "click",
                () => {
                    projectConfig.device_config.groups =
                        projectConfig
                            .device_config
                            .groups
                            .filter(
                                (item) =>
                                    item.id
                                    !==
                                    group.id
                            );

                    projectConfig.device_config.mappings =
                        projectConfig
                            .device_config
                            .mappings
                            .filter(
                                (mapping) =>
                                    mapping.group_id
                                    !==
                                    group.id
                            );

                    persist();

                    render();
                }
            );

            actionsCell.appendChild(
                deleteButton
            );

            row.appendChild(
                actionsCell
            );

            groupsBody.appendChild(
                row
            );
        }
    }


    function renderGenerated() {
        if (
            !generatedBody
            ||
            !configPreview
        ) {
            return;
        }

        const generated =
            buildDeviceConfig();

        generatedBody.replaceChildren();

        if (
            generated.rows.length
            ===
            0
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "Nothing generated yet."
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            generatedBody.appendChild(
                row
            );
        }


        for (
            const item
            of generated.rows
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            for (
                const value
                of [
                    item.device_name,
                    item.template_name,
                    item.key,
                    item.io_type,
                    item.data_type,
                    item.tag,
                ]
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            generatedBody.appendChild(
                row
            );
        }


        configPreview.textContent =
            JSON.stringify(
                generated.config,
                null,
                2
            );


        if (
            generated.errors.length
            >
            0
        ) {
            setStatus(
                configStatus,
                generated.errors
                    .join("\n"),
                "error"
            );
        } else if (
            generated.rows.length
            >
            0
        ) {
            setStatus(
                configStatus,
                `${
                    Object.keys(
                        generated.config
                    ).length
                } device(s), ${
                    generated.rows.length
                } generated signal name(s).`,
                "success"
            );
        } else {
            setStatus(
                configStatus,
                "Nothing generated yet."
            );
        }
    }


    async function refreshHardware() {
        const processId =
            getProcessId();

        if (!processId) {
            setStatus(
                hardwareStatus,
                "Select a TIA process in the TIA Portal tab first.",
                "error"
            );

            return;
        }

        if (refreshHardwareButton) {
            refreshHardwareButton.disabled =
                true;
        }

        setStatus(
            hardwareStatus,
            "Reading configured hardware and I/O channels from TIA Portal..."
        );


        try {
            hardwareInventory =
                await getJson(
                    `/api/v1/tia/io?process_id=${encodeURIComponent(
                        processId
                    )}`
                );

            renderHardware();

            renderMappings();

            renderPlcTags();


            let plcList = [];

            try {
                plcList =
                    await getJson(
                        `/api/v1/tia/plcs?process_id=${encodeURIComponent(
                            processId
                        )}`
                    );
            } catch (error) {
                console.warn(
                    "Could not load PLC list while reading hardware:",
                    error
                );
            }


            const multiPlcWarning =
                plcList.length > 1
                    ? (
                        " WARNING: the open project contains "
                        +
                        "multiple PLCs; hardware inventory is "
                        +
                        "project-wide, so verify channel ownership "
                        +
                        "before creating tags."
                    )
                    : "";


            const ioModules =
                buildIoModuleSummaries(
                    hardwareInventory
                );


            setStatus(
                hardwareStatus,
                (
                    `Project: ${
                        hardwareInventory.project_name
                        ??
                        "unknown"
                    }. `
                    +
                    `${
                        ioModules.length
                    } I/O module(s), `
                    +
                    `${
                        hardwareInventory.channels?.length
                        ??
                        0
                    } addressable channel(s).`
                    +
                    multiPlcWarning
                ),
                multiPlcWarning
                    ? "error"
                    : "success"
            );

        } catch (error) {
            hardwareInventory = {
                project_name: null,
                items: [],
                addresses: [],
                channels: [],
            };

            renderHardware();

            renderMappings();

            renderPlcTags();

            setStatus(
                hardwareStatus,
                error.message,
                "error"
            );

        } finally {
            if (refreshHardwareButton) {
                refreshHardwareButton.disabled =
                    false;
            }
        }
    }


    function renderRawHardwareItems() {
        const rawHardwareItemsBody =
            document.getElementById(
                "hardware-raw-items-body"
            );

        if (!rawHardwareItemsBody) {
            return;
        }

        rawHardwareItemsBody
            .replaceChildren();

        const items =
            hardwareInventory.items
            ??
            [];

        if (items.length === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No raw hardware items loaded."
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            rawHardwareItemsBody.appendChild(
                row
            );

            return;
        }

        for (
            const item
            of items
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            for (
                const value
                of [
                    item.device_name,
                    item.item_name,

                    item.is_plugged
                        ? "yes"
                        : "no",

                    String(
                        item.address_count
                    ),

                    String(
                        item.channel_count
                    ),

                    item.type_identifier,
                ]
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            row.title =
                item.item_path;

            rawHardwareItemsBody.appendChild(
                row
            );
        }
    }


    function renderHardwareItems() {
        if (!hardwareItemsBody) {
            return;
        }

        hardwareItemsBody
            .replaceChildren();

        const modules =
            buildIoModuleSummaries(
                hardwareInventory
            );

        if (modules.length === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No addressable I/O modules loaded."
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            hardwareItemsBody.appendChild(
                row
            );

            renderRawHardwareItems();

            return;
        }

        for (
            const module
            of modules
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const values = [
                module.device_name,
                module.item_name,
                module.io_type,

                String(
                    module.channel_count
                ),

                module.address_text,

                module.type_identifier
                ||
                "—",
            ];

            for (
                const value
                of values
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            const rawPaths =
                module.raw_items
                    .map(
                        (item) =>
                            item.item_path
                    )
                    .filter(
                        Boolean
                    );

            if (
                rawPaths.length > 0
            ) {
                row.title =
                    rawPaths.join(
                        "\n"
                    );
            }

            hardwareItemsBody.appendChild(
                row
            );
        }

        renderRawHardwareItems();
    }


    function renderHardware() {
        renderHardwareItems();

        if (!hardwareBody) {
            return;
        }

        hardwareBody
            .replaceChildren();

        const channels =
            sortChannels(
                hardwareInventory.channels
                ??
                []
            );

        if (channels.length === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No channel metadata loaded."
                );

            cell.colSpan =
                7;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            hardwareBody.appendChild(
                row
            );

            return;
        }


        for (
            const channel
            of channels
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const rawAddress =
                formatRawChannelAddress(
                    channel
                );

            for (
                const value
                of [
                    channel.device_name,
                    channel.item_name,

                    String(
                        channel.channel_number
                    ),

                    channel.io_type,

                    channel.channel_type,

                    rawAddress,

                    `${channel.channel_width_bits} bit`,
                ]
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            row.title =
                channel.item_path;

            hardwareBody.appendChild(
                row
            );
        }
    }


    function renderMappings() {
        if (!mappingBody) {
            return;
        }

        mappingBody
            .replaceChildren();

        let rowCount =
            0;

        const channels =
            sortChannels(
                hardwareInventory.channels
                ??
                []
            );


        for (
            const group
            of projectConfig.device_config.groups
        ) {
            const template =
                getTemplate(
                    group.template_id
                );

            if (!template) {
                continue;
            }


            for (
                const signal
                of template.signals
            ) {
                if (
                    signal.io_type
                    !==
                    "Input"
                    &&
                    signal.io_type
                    !==
                    "Output"
                ) {
                    continue;
                }

                rowCount +=
                    1;

                const row =
                    document.createElement(
                        "tr"
                    );

                row.appendChild(
                    createCell(
                        `${template.name} / ${group.prefix}`
                    )
                );

                row.appendChild(
                    createCell(
                        signal.key
                        ||
                        "(unnamed)"
                    )
                );

                row.appendChild(
                    createCell(
                        signal.io_type
                    )
                );

                row.appendChild(
                    createCell(
                        signal.data_type
                    )
                );

                const mappingCell =
                    document.createElement(
                        "td"
                    );

                const select =
                    document.createElement(
                        "select"
                    );

                select.className =
                    "hardware-channel-select";

                const placeholder =
                    document.createElement(
                        "option"
                    );

                placeholder.value =
                    "";

                placeholder.textContent =
                    "Select first channel";

                select.appendChild(
                    placeholder
                );

                const compatible =
                    channels.filter(
                        (channel) =>
                            channelCompatible(
                                channel,
                                signal
                            )
                    );

                for (
                    const channel
                    of compatible
                ) {
                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        channelKey(
                            channel
                        );

                    const logicalAddress =
                        formatLogicalAddress(
                            channel,
                            signal.data_type
                        );

                    option.textContent =
                        `${logicalAddress} | `
                        +
                        `${channel.device_name} / `
                        +
                        `${channel.item_name} / `
                        +
                        `ch ${channel.channel_number}`;

                    select.appendChild(
                        option
                    );
                }

                const mapping =
                    getMapping(
                        group.id,
                        signal.id
                    );

                if (mapping) {
                    select.value =
                        mapping.start_channel_key;
                }

                select.addEventListener(
                    "change",
                    () => {
                        setMapping(
                            group.id,
                            signal.id,
                            select.value
                        );

                        renderPlcTags();
                    }
                );

                mappingCell.appendChild(
                    select
                );

                row.appendChild(
                    mappingCell
                );

                row.appendChild(
                    createCell(
                        `${group.quantity} device(s) from selected channel onward`
                    )
                );

                mappingBody.appendChild(
                    row
                );
            }
        }


        if (rowCount === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No physical Input/Output signals defined in device templates."
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            mappingBody.appendChild(
                row
            );
        }
    }


    function renderPlcTags() {
        if (!plcTagsBody) {
            return {
                rows: [],
                errors: [],
            };
        }

        const generated =
            buildPhysicalTags(
                hardwareInventory
            );

        plcTagsBody
            .replaceChildren();

        if (
            generated.rows.length
            ===
            0
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                createCell(
                    "No PLC tags generated yet."
                );

            cell.colSpan =
                7;

            cell.className =
                "empty-table-cell";

            row.appendChild(
                cell
            );

            plcTagsBody.appendChild(
                row
            );
        }


        for (
            const item
            of generated.rows
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            for (
                const value
                of [
                    item.device_name,
                    item.signal_key,
                    item.tag_name,
                    item.data_type,
                    item.logical_address,
                    item.channel.item_name,

                    String(
                        item.channel.channel_number
                    ),
                ]
            ) {
                row.appendChild(
                    createCell(
                        value
                    )
                );
            }

            row.title =
                item.channel.item_path;

            plcTagsBody.appendChild(
                row
            );
        }


        if (
            generated.errors.length
            >
            0
        ) {
            setStatus(
                plcTagsStatus,
                generated.errors
                    .join("\n"),
                "error"
            );

        } else if (
            generated.rows.length
            >
            0
        ) {
            setStatus(
                plcTagsStatus,
                `${generated.rows.length} physical PLC tag(s) ready for the active PLC.`,
                "success"
            );

        } else {
            setStatus(
                plcTagsStatus,
                "Load hardware and map physical signals to generate PLC tags."
            );
        }

        return generated;
    }


    async function createPlcTags() {
        const processId =
            getProcessId();

        if (!processId) {
            setStatus(
                plcTagsStatus,
                "Select a TIA process first.",
                "error"
            );

            return;
        }

        const target =
            projectConfig.tia_target;

        if (!target) {
            setStatus(
                plcTagsStatus,
                "Select Active PLC in the TIA Portal tab first.",
                "error"
            );

            return;
        }

        const generated =
            buildPhysicalTags(
                hardwareInventory
            );

        if (
            generated.errors.length
            >
            0
            ||
            generated.rows.length
            ===
            0
        ) {
            renderPlcTags();

            return;
        }

        const tableName =
            tagTableNameInput
                ?.value
                .trim()
            ||
            "TIAEngineeringAssistant";

        if (
            !confirm(
                `Create ${generated.rows.length} PLC tag(s) in ${target.plc_name}, table "${tableName}"?`
            )
        ) {
            return;
        }

        if (createPlcTagsButton) {
            createPlcTagsButton.disabled =
                true;
        }

        setStatus(
            plcTagsStatus,
            "Creating PLC tags in TIA Portal..."
        );


        try {
            const result =
                await postJson(
                    "/api/v1/tia/plc-tags",
                    {
                        process_id:
                            processId,

                        device_name:
                            target.device_name,

                        plc_name:
                            target.plc_name,

                        tag_table_name:
                            tableName,

                        tags:
                            generated.rows.map(
                                (item) => ({
                                    name:
                                        item.tag_name,

                                    data_type:
                                        item.data_type,

                                    logical_address:
                                        item.logical_address,
                                })
                            ),
                    }
                );

            setStatus(
                plcTagsStatus,
                (
                    `${result.created_count} PLC tag(s) `
                    +
                    `created in "${result.tag_table_name}". `
                    +
                    `Project saved: ${
                        result.project_saved
                        ??
                        "yes"
                    }.`
                ),
                "success"
            );

        } catch (error) {
            setStatus(
                plcTagsStatus,
                error.message,
                "error"
            );

        } finally {
            if (createPlcTagsButton) {
                createPlcTagsButton.disabled =
                    false;
            }
        }
    }


    async function copyConfig() {
        const generated =
            buildDeviceConfig();

        try {
            await navigator.clipboard
                .writeText(
                    JSON.stringify(
                        generated.config,
                        null,
                        2
                    )
                );

            setStatus(
                configStatus,
                "device_config copied to clipboard.",
                "success"
            );

        } catch {
            setStatus(
                configStatus,
                "Could not copy device_config to clipboard.",
                "error"
            );
        }
    }


    function render() {
        renderTemplateSelect();

        renderTemplates();

        renderGroups();

        renderGenerated();

        renderHardware();

        renderMappings();

        renderPlcTags();
    }


    if (addTemplateButton) {
        addTemplateButton.addEventListener(
            "click",
            addTemplate
        );
    }


    if (newTemplateNameInput) {
        newTemplateNameInput.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key
                    ===
                    "Enter"
                ) {
                    addTemplate();
                }
            }
        );
    }


    if (addGroupButton) {
        addGroupButton.addEventListener(
            "click",
            addGroup
        );
    }


    if (copyConfigButton) {
        copyConfigButton.addEventListener(
            "click",
            copyConfig
        );
    }


    if (refreshHardwareButton) {
        refreshHardwareButton.addEventListener(
            "click",
            refreshHardware
        );
    }


    if (createPlcTagsButton) {
        createPlcTagsButton.addEventListener(
            "click",
            createPlcTags
        );
    }


    render();


    return {
        refresh:
            render,

        refreshHardware,
    };
}