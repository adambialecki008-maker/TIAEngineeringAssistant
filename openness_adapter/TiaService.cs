using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

using Siemens.Engineering;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.Tags;

namespace TiaOpennessAdapter
{
    internal static class TiaService
    {
        public static int ListProcesses()
        {
            IList<TiaPortalProcess> processes =
                TiaPortal.GetProcesses();


            if (processes.Count == 0)
            {
                Console.WriteLine(
                    "NO_TIA_PROCESS"
                );

                return 0;
            }


            foreach (
                TiaPortalProcess process
                in processes
            )
            {
                Console.WriteLine(
                    $"TIA_PROCESS|{process.Id}"
                );
            }


            return 0;
        }


        public static int InspectProcess(
            int processId
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                if (
                    portal.Projects.Count == 0
                )
                {
                    Console.WriteLine(
                        "NO_OPEN_PROJECT"
                    );

                    return 0;
                }


                foreach (
                    Project project
                    in portal.Projects
                )
                {
                    Console.WriteLine(
                        "PROJECT|" +
                        SanitizeOutput(
                            project.Name
                        )
                    );


                    List<PlcTarget> targets =
                        EnumeratePlcTargets(
                            project
                        )
                        .ToList();


                    if (
                        targets.Count == 0
                    )
                    {
                        Console.WriteLine(
                            "NO_PLC_FOUND"
                        );

                        continue;
                    }


                    foreach (
                        PlcTarget target
                        in targets
                    )
                    {
                        WritePlc(
                            target
                        );
                    }
                }
            }


            return 0;
        }


        public static int ListProjectPlcs(
            int processId
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (
                    project == null
                )
                {
                    return errorCode;
                }


                Console.WriteLine(
                    "PROJECT|" +
                    SanitizeOutput(
                        project.Name
                    )
                );


                List<PlcTarget> targets =
                    EnumeratePlcTargets(
                        project
                    )
                    .OrderBy(
                        target =>
                            target.Device.Name,
                        StringComparer
                            .OrdinalIgnoreCase
                    )
                    .ThenBy(
                        target =>
                            target.DeviceItem.Name,
                        StringComparer
                            .OrdinalIgnoreCase
                    )
                    .ToList();


                if (
                    targets.Count == 0
                )
                {
                    Console.WriteLine(
                        "NO_PLC_FOUND"
                    );

                    return 0;
                }


                foreach (
                    PlcTarget target
                    in targets
                )
                {
                    WritePlc(
                        target
                    );
                }
            }


            return 0;
        }


        public static int ListProjectIo(
            int processId
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (project == null)
                {
                    return errorCode;
                }


                Console.WriteLine(
                    "PROJECT|" +
                    SanitizeOutput(
                        project.Name
                    )
                );


                int addressCount = 0;
                int channelCount = 0;


                foreach (
                    Device device
                    in EnumerateDevices(
                        project
                    )
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
                )
                {
                    foreach (
                        DeviceItemPath itemPath
                        in EnumerateDeviceItems(
                            device
                        )
                    )
                    {
                        DeviceItem item =
                            itemPath.Item;


                        Console.WriteLine(
                            "HW_ITEM|" +
                            SanitizeOutput(
                                device.Name
                            ) +
                            "|" +
                            SanitizeOutput(
                                itemPath.Path
                            ) +
                            "|" +
                            SanitizeOutput(
                                item.Name
                            ) +
                            "|" +
                            SanitizeOutput(
                                item.TypeIdentifier
                                ?? ""
                            ) +
                            "|" +
                            item.IsPlugged +
                            "|" +
                            item.Addresses.Count +
                            "|" +
                            item.Channels.Count
                        );


                        foreach (
                            Address address
                            in item.Addresses
                        )
                        {
                            if (
                                address.IoType
                                != AddressIoType.Input
                                &&
                                address.IoType
                                != AddressIoType.Output
                            )
                            {
                                continue;
                            }


                            if (
                                address.StartAddress
                                < 0
                            )
                            {
                                continue;
                            }


                            Console.WriteLine(
                                "IO_ADDRESS|" +
                                SanitizeOutput(
                                    device.Name
                                ) +
                                "|" +
                                SanitizeOutput(
                                    itemPath.Path
                                ) +
                                "|" +
                                SanitizeOutput(
                                    item.Name
                                ) +
                                "|" +
                                SanitizeOutput(
                                    item.TypeIdentifier
                                    ?? ""
                                ) +
                                "|" +
                                address.IoType +
                                "|" +
                                address.StartAddress +
                                "|" +
                                address.Length
                            );


                            addressCount += 1;
                        }


                        foreach (
                            Channel channel
                            in item.Channels
                        )
                        {
                            string ioType =
                                channel.IoType
                                    .ToString();


                            if (
                                !string.Equals(
                                    ioType,
                                    "Input",
                                    StringComparison.OrdinalIgnoreCase
                                )
                                &&
                                !string.Equals(
                                    ioType,
                                    "Output",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                            {
                                continue;
                            }


                            if (
                                !TryGetIntAttribute(
                                    channel,
                                    "ChannelAddress",
                                    out int channelAddress
                                )
                            )
                            {
                                continue;
                            }


                            if (
                                channelAddress < 0
                            )
                            {
                                continue;
                            }


                            if (
                                !TryGetIntAttribute(
                                    channel,
                                    "ChannelWidth",
                                    out int channelWidth
                                )
                            )
                            {
                                channelWidth = 0;
                            }


                            Console.WriteLine(
                                "IO_CHANNEL|" +
                                SanitizeOutput(
                                    device.Name
                                ) +
                                "|" +
                                SanitizeOutput(
                                    itemPath.Path
                                ) +
                                "|" +
                                SanitizeOutput(
                                    item.Name
                                ) +
                                "|" +
                                SanitizeOutput(
                                    item.TypeIdentifier
                                    ?? ""
                                ) +
                                "|" +
                                channel.Number +
                                "|" +
                                SanitizeOutput(
                                    ioType
                                ) +
                                "|" +
                                SanitizeOutput(
                                    channel.Type
                                        .ToString()
                                ) +
                                "|" +
                                channelAddress +
                                "|" +
                                channelWidth
                            );


                            channelCount += 1;
                        }
                    }
                }


                if (
                    addressCount == 0
                    &&
                    channelCount == 0
                )
                {
                    Console.WriteLine(
                        "NO_IO_FOUND"
                    );
                }
            }


            return 0;
        }


        public static int ListPlcTags(
            int processId,
            string deviceName,
            string plcName
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (project == null)
                {
                    return errorCode;
                }


                PlcTarget target =
                    FindPlcTarget(
                        project,
                        deviceName,
                        plcName
                    );


                if (target == null)
                {
                    Console.Error.WriteLine(
                        "PLC_NOT_FOUND|" +
                        SanitizeOutput(
                            deviceName
                        ) +
                        "|" +
                        SanitizeOutput(
                            plcName
                        )
                    );

                    return 7;
                }


                int tagCount = 0;


                foreach (
                    PlcTagTable table
                    in target
                        .Software
                        .TagTableGroup
                        .TagTables
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    tagCount +=
                        WritePlcTagTable(
                            table,
                            table.Name
                        );
                }


                foreach (
                    PlcTagTableUserGroup group
                    in target
                        .Software
                        .TagTableGroup
                        .Groups
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    tagCount +=
                        WritePlcTagGroup(
                            group,
                            group.Name
                        );
                }


                if (tagCount == 0)
                {
                    Console.WriteLine(
                        "NO_PLC_TAGS"
                    );
                }
            }


            return 0;
        }


        public static int CreatePlcTags(
            int processId,
            string deviceName,
            string plcName,
            string tagTableName,
            string tagFilePath
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            if (
                string.IsNullOrWhiteSpace(
                    tagTableName
                )
            )
            {
                Console.Error.WriteLine(
                    "TAG_TABLE_NAME_REQUIRED"
                );

                return 3;
            }


            if (
                string.IsNullOrWhiteSpace(
                    tagFilePath
                )
                ||
                !File.Exists(
                    tagFilePath
                )
            )
            {
                Console.Error.WriteLine(
                    "TAG_FILE_NOT_FOUND|" +
                    SanitizeOutput(
                        tagFilePath
                    )
                );

                return 3;
            }


            List<PlcTagDefinition> definitions =
                ReadTagDefinitions(
                    tagFilePath
                );


            if (
                definitions.Count == 0
            )
            {
                Console.Error.WriteLine(
                    "NO_TAGS_TO_CREATE"
                );

                return 3;
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (project == null)
                {
                    return errorCode;
                }


                PlcTarget target =
                    FindPlcTarget(
                        project,
                        deviceName,
                        plcName
                    );


                if (target == null)
                {
                    Console.Error.WriteLine(
                        "PLC_NOT_FOUND|" +
                        SanitizeOutput(
                            deviceName
                        ) +
                        "|" +
                        SanitizeOutput(
                            plcName
                        )
                    );

                    return 7;
                }


                foreach (
                    PlcTagDefinition definition
                    in definitions
                )
                {
                    if (
                        PlcTagNameExists(
                            target.Software,
                            definition.Name
                        )
                    )
                    {
                        Console.Error.WriteLine(
                            "TAG_NAME_EXISTS|" +
                            SanitizeOutput(
                                definition.Name
                            )
                        );

                        return 9;
                    }


                    if (
                        PlcTagAddressExists(
                            target.Software,
                            definition.LogicalAddress
                        )
                    )
                    {
                        Console.Error.WriteLine(
                            "TAG_ADDRESS_EXISTS|" +
                            SanitizeOutput(
                                definition.LogicalAddress
                            )
                        );

                        return 9;
                    }
                }


                using (
                    ExclusiveAccess exclusiveAccess =
                        portal.ExclusiveAccess(
                            "TIA Engineering Assistant is creating PLC tags..."
                        )
                )
                {
                    PlcTagTableComposition tables =
                        target
                            .Software
                            .TagTableGroup
                            .TagTables;


                    PlcTagTable table =
                        tables.Find(
                            tagTableName
                        );


                    if (table == null)
                    {
                        table =
                            tables.Create(
                                tagTableName
                            );
                    }


                    foreach (
                        PlcTagDefinition definition
                        in definitions
                    )
                    {
                        table.Tags.Create(
                            definition.Name,
                            definition.DataType,
                            definition.LogicalAddress
                        );


                        Console.WriteLine(
                            "TAG_CREATED|" +
                            SanitizeOutput(
                                definition.Name
                            ) +
                            "|" +
                            SanitizeOutput(
                                definition.DataType
                            ) +
                            "|" +
                            SanitizeOutput(
                                definition.LogicalAddress
                            )
                        );
                    }


                    Console.WriteLine(
                        "TAG_TABLE|" +
                        SanitizeOutput(
                            table.Name
                        )
                    );


                    SaveProject(
                        project
                    );
                }
            }


            return 0;
        }


        public static int ListPlcModels(
            int processId,
            string plcFamily
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            string normalizedFamily =
                NormalizeFamily(
                    plcFamily
                );


            if (
                normalizedFamily == null
            )
            {
                Console.Error.WriteLine(
                    $"Unsupported PLC family: {plcFamily}"
                );

                return 3;
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                string searchText =
                    GetCatalogSearchText(
                        normalizedFamily
                    );


                var catalogItems =
                    portal
                        .HardwareCatalog
                        .Find(
                            searchText
                        );


                Dictionary<
                    string,
                    PlcCatalogEntry
                > models =
                    new Dictionary<
                        string,
                        PlcCatalogEntry
                    >(
                        StringComparer
                            .OrdinalIgnoreCase
                    );


                foreach (
                    var item
                    in catalogItems
                )
                {
                    string typeName =
                        item.TypeName
                        ?? "";

                    string articleNumber =
                        item.ArticleNumber
                        ?? "";

                    string version =
                        item.Version
                        ?? "";

                    string typeIdentifier =
                        item.TypeIdentifier
                        ?? "";

                    string catalogPath =
                        item.CatalogPath
                        ?? "";


                    if (
                        string.IsNullOrWhiteSpace(
                            typeName
                        )
                        ||
                        string.IsNullOrWhiteSpace(
                            typeIdentifier
                        )
                    )
                    {
                        continue;
                    }


                    if (
                        !MatchesFamily(
                            normalizedFamily,
                            typeName,
                            catalogPath
                        )
                    )
                    {
                        continue;
                    }


                    PlcCatalogEntry candidate =
                        new PlcCatalogEntry(
                            typeName,
                            articleNumber,
                            version,
                            typeIdentifier
                        );


                    PlcCatalogEntry current;


                    if (
                        !models.TryGetValue(
                            typeName,
                            out current
                        )
                    )
                    {
                        models[typeName] =
                            candidate;

                        continue;
                    }


                    if (
                        IsNewer(
                            candidate,
                            current
                        )
                    )
                    {
                        models[typeName] =
                            candidate;
                    }
                }


                List<PlcCatalogEntry> result =
                    models
                        .Values
                        .OrderBy(
                            item =>
                                item.TypeName,
                            StringComparer
                                .OrdinalIgnoreCase
                        )
                        .ToList();


                if (
                    result.Count == 0
                )
                {
                    Console.WriteLine(
                        "NO_PLC_MODELS"
                    );

                    return 0;
                }


                foreach (
                    PlcCatalogEntry model
                    in result
                )
                {
                    Console.WriteLine(
                        "PLC_MODEL|" +
                        normalizedFamily +
                        "|" +
                        SanitizeOutput(
                            model.TypeName
                        ) +
                        "|" +
                        SanitizeOutput(
                            model.ArticleNumber
                        ) +
                        "|" +
                        SanitizeOutput(
                            model.Version
                        ) +
                        "|" +
                        SanitizeOutput(
                            model.TypeIdentifier
                        )
                    );
                }
            }


            return 0;
        }


        public static int CreatePlc(
            int processId,
            string selection,
            string plcName,
            string deviceName
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            plcName =
                (
                    plcName
                    ?? ""
                )
                .Trim();

            deviceName =
                (
                    deviceName
                    ?? ""
                )
                .Trim();


            if (
                string.IsNullOrWhiteSpace(
                    selection
                )
            )
            {
                Console.Error.WriteLine(
                    "PLC selection is required."
                );

                return 3;
            }


            if (
                string.IsNullOrWhiteSpace(
                    plcName
                )
            )
            {
                Console.Error.WriteLine(
                    "PLC name is required."
                );

                return 3;
            }


            if (
                string.IsNullOrWhiteSpace(
                    deviceName
                )
            )
            {
                Console.Error.WriteLine(
                    "Device name is required."
                );

                return 3;
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (
                    project == null
                )
                {
                    return errorCode;
                }


                if (
                    DeviceNameExists(
                        project,
                        deviceName
                    )
                )
                {
                    Console.Error.WriteLine(
                        "DEVICE_NAME_EXISTS|" +
                        SanitizeOutput(
                            deviceName
                        )
                    );

                    return 6;
                }


                if (
                    PlcNameExists(
                        project,
                        plcName
                    )
                )
                {
                    Console.Error.WriteLine(
                        "PLC_NAME_EXISTS|" +
                        SanitizeOutput(
                            plcName
                        )
                    );

                    return 6;
                }


                string typeIdentifier =
                    ResolveTypeIdentifier(
                        portal,
                        selection
                    );


                if (
                    typeIdentifier == null
                )
                {
                    Console.Error.WriteLine(
                        "PLC_TYPE_NOT_FOUND|" +
                        SanitizeOutput(
                            selection
                        )
                    );

                    return 7;
                }


                Console.WriteLine(
                    "PLC_TYPE|" +
                    SanitizeOutput(
                        typeIdentifier
                    )
                );


                using (
                    ExclusiveAccess exclusiveAccess =
                        portal.ExclusiveAccess(
                            "TIA Engineering Assistant is creating a PLC..."
                        )
                )
                {
                    Device device =
                        project
                            .Devices
                            .CreateWithItem(
                                typeIdentifier,
                                plcName,
                                deviceName
                            );


                    PlcTarget target =
                        GetPlcTarget(
                            device
                        );


                    if (
                        target == null
                    )
                    {
                        Console.Error.WriteLine(
                            "PLC_CREATED_BUT_SOFTWARE_NOT_FOUND"
                        );

                        return 8;
                    }


                    Console.WriteLine(
                        "PLC_CREATED|" +
                        SanitizeOutput(
                            target.Device.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            target.DeviceItem.Name
                        )
                    );


                    SaveProject(
                        project
                    );
                }
            }


            return 0;
        }


        public static int RenamePlc(
            int processId,
            string currentDeviceName,
            string currentPlcName,
            string newDeviceName,
            string newPlcName
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            currentDeviceName =
                (
                    currentDeviceName
                    ?? ""
                )
                .Trim();

            currentPlcName =
                (
                    currentPlcName
                    ?? ""
                )
                .Trim();

            newDeviceName =
                (
                    newDeviceName
                    ?? ""
                )
                .Trim();

            newPlcName =
                (
                    newPlcName
                    ?? ""
                )
                .Trim();


            if (
                string.IsNullOrWhiteSpace(
                    newDeviceName
                )
                ||
                string.IsNullOrWhiteSpace(
                    newPlcName
                )
            )
            {
                Console.Error.WriteLine(
                    "New device name and PLC name are required."
                );

                return 3;
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (
                    project == null
                )
                {
                    return errorCode;
                }


                PlcTarget target =
                    FindPlcTarget(
                        project,
                        currentDeviceName,
                        currentPlcName
                    );


                if (
                    target == null
                )
                {
                    Console.Error.WriteLine(
                        "PLC_NOT_FOUND|" +
                        SanitizeOutput(
                            currentDeviceName
                        ) +
                        "|" +
                        SanitizeOutput(
                            currentPlcName
                        )
                    );

                    return 7;
                }


                if (
                    !string.Equals(
                        target.Device.Name,
                        newDeviceName,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
                    &&
                    DeviceNameExists(
                        project,
                        newDeviceName,
                        target.Device
                    )
                )
                {
                    Console.Error.WriteLine(
                        "DEVICE_NAME_EXISTS|" +
                        SanitizeOutput(
                            newDeviceName
                        )
                    );

                    return 6;
                }


                if (
                    !string.Equals(
                        target.DeviceItem.Name,
                        newPlcName,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
                    &&
                    PlcNameExists(
                        project,
                        newPlcName,
                        target.DeviceItem
                    )
                )
                {
                    Console.Error.WriteLine(
                        "PLC_NAME_EXISTS|" +
                        SanitizeOutput(
                            newPlcName
                        )
                    );

                    return 6;
                }


                using (
                    ExclusiveAccess exclusiveAccess =
                        portal.ExclusiveAccess(
                            "TIA Engineering Assistant is renaming a PLC..."
                        )
                )
                {
                    target.Device.Name =
                        newDeviceName;

                    target.DeviceItem.Name =
                        newPlcName;


                    Console.WriteLine(
                        "PLC_RENAMED|" +
                        SanitizeOutput(
                            target.Device.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            target.DeviceItem.Name
                        )
                    );


                    SaveProject(
                        project
                    );
                }
            }


            return 0;
        }


        public static int DeletePlc(
            int processId,
            string deviceName,
            string plcName
        )
        {
            TiaPortalProcess process =
                FindProcess(
                    processId
                );


            if (process == null)
            {
                return WriteProcessNotFound(
                    processId
                );
            }


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                Project project =
                    GetSingleOpenProject(
                        portal,
                        out int errorCode
                    );


                if (
                    project == null
                )
                {
                    return errorCode;
                }


                PlcTarget target =
                    FindPlcTarget(
                        project,
                        deviceName,
                        plcName
                    );


                if (
                    target == null
                )
                {
                    Console.Error.WriteLine(
                        "PLC_NOT_FOUND|" +
                        SanitizeOutput(
                            deviceName
                        ) +
                        "|" +
                        SanitizeOutput(
                            plcName
                        )
                    );

                    return 7;
                }


                string oldDeviceName =
                    target.Device.Name;

                string oldPlcName =
                    target.DeviceItem.Name;


                using (
                    ExclusiveAccess exclusiveAccess =
                        portal.ExclusiveAccess(
                            "TIA Engineering Assistant is deleting a PLC..."
                        )
                )
                {
                    target.Device.Delete();


                    Console.WriteLine(
                        "PLC_DELETED|" +
                        SanitizeOutput(
                            oldDeviceName
                        ) +
                        "|" +
                        SanitizeOutput(
                            oldPlcName
                        )
                    );


                    SaveProject(
                        project
                    );
                }
            }


            return 0;
        }


        private static void WritePlc(
            PlcTarget target
        )
        {
            Console.WriteLine(
                "PLC|" +
                SanitizeOutput(
                    target.Device.Name
                ) +
                "|" +
                SanitizeOutput(
                    target.DeviceItem.Name
                ) +
                "|" +
                SanitizeOutput(
                    target.Device.TypeIdentifier
                    ?? ""
                ) +
                "|" +
                SanitizeOutput(
                    target.DeviceItem.TypeIdentifier
                    ?? ""
                )
            );
        }


        private static void SaveProject(
            Project project
        )
        {
            project.Save();


            Console.WriteLine(
                "PROJECT_SAVED|" +
                SanitizeOutput(
                    project.Name
                )
            );
        }


        private static Project GetSingleOpenProject(
            TiaPortal portal,
            out int errorCode
        )
        {
            errorCode = 0;


            if (
                portal.Projects.Count == 0
            )
            {
                Console.Error.WriteLine(
                    "NO_OPEN_PROJECT"
                );

                errorCode = 4;

                return null;
            }


            if (
                portal.Projects.Count > 1
            )
            {
                Console.Error.WriteLine(
                    "MORE_THAN_ONE_PROJECT"
                );

                errorCode = 5;

                return null;
            }


            return portal.Projects[0];
        }


        private static int WriteProcessNotFound(
            int processId
        )
        {
            Console.Error.WriteLine(
                $"TIA process {processId} not found."
            );

            return 2;
        }


        private static string ResolveTypeIdentifier(
            TiaPortal portal,
            string selection
        )
        {
            string value =
                selection
                    .Trim();


            if (
                value.StartsWith(
                    "OrderNumber:",
                    StringComparison
                        .OrdinalIgnoreCase
                )
            )
            {
                value =
                    value
                        .Substring(
                            "OrderNumber:"
                                .Length
                        )
                        .Trim();
            }


            int versionIndex =
                value.LastIndexOf(
                    "/V",
                    StringComparison
                        .OrdinalIgnoreCase
                );


            string requestedVersion =
                null;


            if (
                versionIndex >= 0
            )
            {
                requestedVersion =
                    value
                        .Substring(
                            versionIndex + 2
                        )
                        .Trim();

                value =
                    value
                        .Substring(
                            0,
                            versionIndex
                        )
                        .Trim();
            }


            string normalizedRequested =
                NormalizeOrderNumber(
                    value
                );


            if (
                string.IsNullOrWhiteSpace(
                    normalizedRequested
                )
            )
            {
                return null;
            }


            string searchValue =
                FormatCatalogSearchCode(
                    value
                );


            var catalogItems =
                portal
                    .HardwareCatalog
                    .Find(
                        searchValue
                    );


            List<PlcCatalogEntry> matches =
                new List<
                    PlcCatalogEntry
                >();


            foreach (
                var item
                in catalogItems
            )
            {
                string articleNumber =
                    item.ArticleNumber
                    ?? "";


                if (
                    !string.Equals(
                        NormalizeOrderNumber(
                            articleNumber
                        ),
                        normalizedRequested,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
                )
                {
                    continue;
                }


                string version =
                    item.Version
                    ?? "";


                if (
                    requestedVersion != null
                    &&
                    !VersionsEqual(
                        version,
                        requestedVersion
                    )
                )
                {
                    continue;
                }


                string typeIdentifier =
                    item.TypeIdentifier
                    ?? "";


                if (
                    string.IsNullOrWhiteSpace(
                        typeIdentifier
                    )
                )
                {
                    continue;
                }


                matches.Add(
                    new PlcCatalogEntry(
                        item.TypeName
                            ?? "",
                        articleNumber,
                        version,
                        typeIdentifier
                    )
                );
            }


            if (
                matches.Count == 0
            )
            {
                return null;
            }


            return matches
                .OrderByDescending(
                    item =>
                        ParseVersion(
                            item.Version
                        )
                )
                .ThenByDescending(
                    item =>
                        item.ArticleNumber,
                    StringComparer
                        .OrdinalIgnoreCase
                )
                .ThenByDescending(
                    item =>
                        item.TypeIdentifier,
                    StringComparer
                        .OrdinalIgnoreCase
                )
                .First()
                .TypeIdentifier;
        }


        private static string FormatCatalogSearchCode(
            string value
        )
        {
            string trimmed =
                value
                    .Trim()
                    .ToUpperInvariant();


            if (
                !trimmed.Contains(" ")
                &&
                trimmed.Length > 4
            )
            {
                return (
                    trimmed.Substring(
                        0,
                        4
                    )
                    +
                    " "
                    +
                    trimmed.Substring(
                        4
                    )
                );
            }


            return trimmed;
        }


        private static string NormalizeOrderNumber(
            string value
        )
        {
            if (
                value == null
            )
            {
                return "";
            }


            StringBuilder builder =
                new StringBuilder();


            foreach (
                char character
                in value.ToUpperInvariant()
            )
            {
                if (
                    char.IsLetterOrDigit(
                        character
                    )
                )
                {
                    builder.Append(
                        character
                    );
                }
            }


            return builder.ToString();
        }


        private static bool IsNewer(
            PlcCatalogEntry candidate,
            PlcCatalogEntry current
        )
        {
            Version candidateVersion =
                ParseVersion(
                    candidate.Version
                );

            Version currentVersion =
                ParseVersion(
                    current.Version
                );


            int versionComparison =
                candidateVersion
                    .CompareTo(
                        currentVersion
                    );


            if (
                versionComparison != 0
            )
            {
                return (
                    versionComparison > 0
                );
            }


            int articleComparison =
                string.Compare(
                    candidate.ArticleNumber,
                    current.ArticleNumber,
                    StringComparison
                        .OrdinalIgnoreCase
                );


            if (
                articleComparison != 0
            )
            {
                return (
                    articleComparison > 0
                );
            }


            return string.Compare(
                candidate.TypeIdentifier,
                current.TypeIdentifier,
                StringComparison
                    .OrdinalIgnoreCase
            ) > 0;
        }


        private static Version ParseVersion(
            string value
        )
        {
            if (
                string.IsNullOrWhiteSpace(
                    value
                )
            )
            {
                return new Version(
                    0,
                    0
                );
            }


            string cleaned =
                value
                    .Trim()
                    .TrimStart(
                        'V',
                        'v'
                    );


            Version version;


            if (
                Version.TryParse(
                    cleaned,
                    out version
                )
            )
            {
                return version;
            }


            return new Version(
                0,
                0
            );
        }


        private static bool VersionsEqual(
            string first,
            string second
        )
        {
            return ParseVersion(
                first
            ).Equals(
                ParseVersion(
                    second
                )
            );
        }


        private static string NormalizeFamily(
            string family
        )
        {
            if (
                string.IsNullOrWhiteSpace(
                    family
                )
            )
            {
                return null;
            }


            switch (
                family
                    .Trim()
                    .ToLowerInvariant()
            )
            {
                case "s7-1200":
                    return "s7-1200";


                case "s7-1200-g2":
                    return "s7-1200-g2";


                case "s7-1500":
                    return "s7-1500";


                default:
                    return null;
            }
        }


        private static string GetCatalogSearchText(
            string family
        )
        {
            switch (
                family
            )
            {
                case "s7-1200":
                case "s7-1200-g2":
                    return "12";


                case "s7-1500":
                    return "15";


                default:
                    return "CPU";
            }
        }


        private static bool MatchesFamily(
            string family,
            string typeName,
            string catalogPath
        )
        {
            if (
                string.IsNullOrWhiteSpace(
                    typeName
                )
            )
            {
                return false;
            }


            string normalizedName =
                typeName
                    .Trim()
                    .ToLowerInvariant();


            string normalizedPath =
                (
                    catalogPath
                    ?? ""
                )
                .ToLowerInvariant();


            switch (
                family
            )
            {
                case "s7-1500":
                    return normalizedName
                        .StartsWith(
                            "cpu 15"
                        );


                case "s7-1200-g2":
                    return (
                        normalizedName
                            .StartsWith(
                                "cpu 12"
                            )
                        &&
                        (
                            normalizedName
                                .Contains(
                                    "g2"
                                )
                            ||
                            normalizedPath
                                .Contains(
                                    "g2"
                                )
                        )
                    );


                case "s7-1200":
                    return (
                        normalizedName
                            .StartsWith(
                                "cpu 12"
                            )
                        &&
                        !normalizedName
                            .Contains(
                                "g2"
                            )
                        &&
                        !normalizedPath
                            .Contains(
                                "g2"
                            )
                    );


                default:
                    return false;
            }
        }


        private static bool TryGetIntAttribute(
            IEngineeringObject engineeringObject,
            string attributeName,
            out int value
        )
        {
            value = 0;


            try
            {
                object rawValue =
                    engineeringObject
                        .GetAttribute(
                            attributeName
                        );


                if (rawValue == null)
                {
                    return false;
                }


                value =
                    Convert.ToInt32(
                        rawValue
                    );


                return true;
            }
            catch
            {
                return false;
            }
        }


        private static IEnumerable<DeviceItemPath> EnumerateDeviceItems(
            Device device
        )
        {
            foreach (
                DeviceItem item
                in device.Items
            )
            {
                foreach (
                    DeviceItemPath child
                    in EnumerateDeviceItems(
                        item,
                        device.Name
                    )
                )
                {
                    yield return child;
                }
            }
        }


        private static IEnumerable<DeviceItemPath> EnumerateDeviceItems(
            DeviceItem item,
            string parentPath
        )
        {
            /*
             * Do not prune the hardware tree based on IsPlugged.
             * Rack/head/system items may still contain real child modules
             * that expose addresses and channels. In particular, ET200SP
             * configurations are nested DeviceItem hierarchies.
             */
            string path =
                parentPath +
                "/" +
                item.Name;


            yield return new DeviceItemPath(
                item,
                path
            );


            foreach (
                DeviceItem child
                in item.Items
            )
            {
                foreach (
                    DeviceItemPath childPath
                    in EnumerateDeviceItems(
                        child,
                        path
                    )
                )
                {
                    yield return childPath;
                }
            }
        }


        private static List<PlcTagDefinition> ReadTagDefinitions(
            string filePath
        )
        {
            List<PlcTagDefinition> definitions =
                new List<PlcTagDefinition>();


            foreach (
                string rawLine
                in File.ReadAllLines(
                    filePath,
                    Encoding.UTF8
                )
            )
            {
                if (
                    string.IsNullOrWhiteSpace(
                        rawLine
                    )
                )
                {
                    continue;
                }


                string[] parts =
                    rawLine.Split(
                        new[] { '\t' },
                        3
                    );


                if (
                    parts.Length != 3
                )
                {
                    throw new InvalidDataException(
                        "Invalid tag definition line: " +
                        rawLine
                    );
                }


                definitions.Add(
                    new PlcTagDefinition(
                        parts[0].Trim(),
                        parts[1].Trim(),
                        parts[2].Trim()
                    )
                );
            }


            return definitions;
        }


        private static int WritePlcTagTable(
            PlcTagTable table,
            string tablePath
        )
        {
            int count = 0;


            foreach (
                PlcTag tag
                in table
                    .Tags
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                Console.WriteLine(
                    "PLC_TAG|" +
                    SanitizeOutput(
                        tablePath
                    ) +
                    "|" +
                    SanitizeOutput(
                        tag.Name
                    ) +
                    "|" +
                    SanitizeOutput(
                        tag.DataTypeName
                    ) +
                    "|" +
                    SanitizeOutput(
                        tag.LogicalAddress
                    )
                );


                count += 1;
            }


            return count;
        }


        private static int WritePlcTagGroup(
            PlcTagTableUserGroup group,
            string groupPath
        )
        {
            int count = 0;


            foreach (
                PlcTagTable table
                in group
                    .TagTables
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                count +=
                    WritePlcTagTable(
                        table,
                        groupPath +
                        "/" +
                        table.Name
                    );
            }


            foreach (
                PlcTagTableUserGroup child
                in group
                    .Groups
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                count +=
                    WritePlcTagGroup(
                        child,
                        groupPath +
                        "/" +
                        child.Name
                    );
            }


            return count;
        }


        private static bool PlcTagNameExists(
            PlcSoftware software,
            string name
        )
        {
            return EnumeratePlcTags(
                software
            )
            .Any(
                tag =>
                    string.Equals(
                        tag.Name,
                        name,
                        StringComparison.OrdinalIgnoreCase
                    )
            );
        }


        private static bool PlcTagAddressExists(
            PlcSoftware software,
            string logicalAddress
        )
        {
            return EnumeratePlcTags(
                software
            )
            .Any(
                tag =>
                    string.Equals(
                        tag.LogicalAddress,
                        logicalAddress,
                        StringComparison.OrdinalIgnoreCase
                    )
            );
        }


        private static IEnumerable<PlcTag> EnumeratePlcTags(
            PlcSoftware software
        )
        {
            foreach (
                PlcTagTable table
                in software
                    .TagTableGroup
                    .TagTables
            )
            {
                foreach (
                    PlcTag tag
                    in table.Tags
                )
                {
                    yield return tag;
                }
            }


            foreach (
                PlcTagTableUserGroup group
                in software
                    .TagTableGroup
                    .Groups
            )
            {
                foreach (
                    PlcTag tag
                    in EnumeratePlcTags(
                        group
                    )
                )
                {
                    yield return tag;
                }
            }
        }


        private static IEnumerable<PlcTag> EnumeratePlcTags(
            PlcTagTableUserGroup group
        )
        {
            foreach (
                PlcTagTable table
                in group.TagTables
            )
            {
                foreach (
                    PlcTag tag
                    in table.Tags
                )
                {
                    yield return tag;
                }
            }


            foreach (
                PlcTagTableUserGroup child
                in group.Groups
            )
            {
                foreach (
                    PlcTag tag
                    in EnumeratePlcTags(
                        child
                    )
                )
                {
                    yield return tag;
                }
            }
        }


        private static TiaPortalProcess FindProcess(
            int processId
        )
        {
            return TiaPortal
                .GetProcesses()
                .FirstOrDefault(
                    process =>
                        process.Id
                        ==
                        processId
                );
        }


        private static PlcTarget FindPlcTarget(
            Project project,
            string deviceName,
            string plcName
        )
        {
            return EnumeratePlcTargets(
                project
            )
            .FirstOrDefault(
                target =>
                    string.Equals(
                        target.Device.Name,
                        deviceName,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
                    &&
                    (
                        string.Equals(
                            target.DeviceItem.Name,
                            plcName,
                            StringComparison
                                .OrdinalIgnoreCase
                        )
                        ||
                        string.Equals(
                            target.Software.Name,
                            plcName,
                            StringComparison
                                .OrdinalIgnoreCase
                        )
                    )
            );
        }


        private static bool DeviceNameExists(
            Project project,
            string name,
            Device excludedDevice = null
        )
        {
            return EnumerateDevices(
                project
            )
            .Any(
                device =>
                    !object.ReferenceEquals(
                        device,
                        excludedDevice
                    )
                    &&
                    string.Equals(
                        device.Name,
                        name,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
            );
        }


        private static bool PlcNameExists(
            Project project,
            string name,
            DeviceItem excludedDeviceItem = null
        )
        {
            return EnumeratePlcTargets(
                project
            )
            .Any(
                target =>
                    !object.ReferenceEquals(
                        target.DeviceItem,
                        excludedDeviceItem
                    )
                    &&
                    (
                        string.Equals(
                            target.DeviceItem.Name,
                            name,
                            StringComparison
                                .OrdinalIgnoreCase
                        )
                        ||
                        string.Equals(
                            target.Software.Name,
                            name,
                            StringComparison
                                .OrdinalIgnoreCase
                        )
                    )
            );
        }


        private static IEnumerable<PlcTarget> EnumeratePlcTargets(
            Project project
        )
        {
            foreach (
                Device device
                in EnumerateDevices(
                    project
                )
            )
            {
                PlcTarget target =
                    GetPlcTarget(
                        device
                    );


                if (
                    target != null
                )
                {
                    yield return target;
                }
            }
        }


        private static IEnumerable<Device> EnumerateDevices(
            Project project
        )
        {
            HashSet<string> yieldedNames =
                new HashSet<string>(
                    StringComparer.OrdinalIgnoreCase
                );


            foreach (
                Device device
                in project.Devices
            )
            {
                if (
                    yieldedNames.Add(
                        device.Name
                    )
                )
                {
                    yield return device;
                }
            }


            foreach (
                DeviceUserGroup group
                in project.DeviceGroups
            )
            {
                foreach (
                    Device device
                    in EnumerateDevices(
                        group
                    )
                )
                {
                    if (
                        yieldedNames.Add(
                            device.Name
                        )
                    )
                    {
                        yield return device;
                    }
                }
            }


            if (
                project.UngroupedDevicesGroup
                != null
            )
            {
                foreach (
                    Device device
                    in project
                        .UngroupedDevicesGroup
                        .Devices
                )
                {
                    if (
                        yieldedNames.Add(
                            device.Name
                        )
                    )
                    {
                        yield return device;
                    }
                }
            }
        }


        private static IEnumerable<Device> EnumerateDevices(
            DeviceUserGroup group
        )
        {
            foreach (
                Device device
                in group.Devices
            )
            {
                yield return device;
            }


            foreach (
                DeviceUserGroup child
                in group.Groups
            )
            {
                foreach (
                    Device device
                    in EnumerateDevices(
                        child
                    )
                )
                {
                    yield return device;
                }
            }
        }


        private static PlcTarget GetPlcTarget(
            Device device
        )
        {
            Queue<HardwareObject> queue =
                new Queue<
                    HardwareObject
                >();


            queue.Enqueue(
                device
            );


            while (
                queue.Count > 0
            )
            {
                HardwareObject current =
                    queue.Dequeue();


                foreach (
                    DeviceItem item
                    in current.Items
                )
                {
                    if (
                        !item.IsPlugged
                    )
                    {
                        continue;
                    }


                    SoftwareContainer container =
                        item.GetService<
                            SoftwareContainer
                        >();


                    if (
                        container?.Software
                        is PlcSoftware plc
                    )
                    {
                        return new PlcTarget(
                            device,
                            item,
                            plc
                        );
                    }


                    queue.Enqueue(
                        item
                    );
                }
            }


            return null;
        }


        private static string SanitizeOutput(
            string value
        )
        {
            if (
                value == null
            )
            {
                return "";
            }


            return value
                .Replace(
                    "|",
                    "/"
                )
                .Replace(
                    "\r",
                    " "
                )
                .Replace(
                    "\n",
                    " "
                );
        }


        private sealed class DeviceItemPath
        {
            public DeviceItem Item {
                get;
            }

            public string Path {
                get;
            }


            public DeviceItemPath(
                DeviceItem item,
                string path
            )
            {
                Item = item;
                Path = path;
            }
        }


        private sealed class PlcTagDefinition
        {
            public string Name {
                get;
            }

            public string DataType {
                get;
            }

            public string LogicalAddress {
                get;
            }


            public PlcTagDefinition(
                string name,
                string dataType,
                string logicalAddress
            )
            {
                Name = name;
                DataType = dataType;
                LogicalAddress = logicalAddress;
            }
        }


        private sealed class PlcTarget
        {
            public Device Device {
                get;
            }

            public DeviceItem DeviceItem {
                get;
            }

            public PlcSoftware Software {
                get;
            }


            public PlcTarget(
                Device device,
                DeviceItem deviceItem,
                PlcSoftware software
            )
            {
                Device =
                    device;

                DeviceItem =
                    deviceItem;

                Software =
                    software;
            }
        }


        private sealed class PlcCatalogEntry
        {
            public string TypeName {
                get;
            }

            public string ArticleNumber {
                get;
            }

            public string Version {
                get;
            }

            public string TypeIdentifier {
                get;
            }


            public PlcCatalogEntry(
                string typeName,
                string articleNumber,
                string version,
                string typeIdentifier
            )
            {
                TypeName =
                    typeName;

                ArticleNumber =
                    articleNumber;

                Version =
                    version;

                TypeIdentifier =
                    typeIdentifier;
            }
        }
    }
}
