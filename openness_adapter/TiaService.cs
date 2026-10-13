using System;
using System.Collections.Generic;
using System.IO;
using System.Globalization;
using System.Linq;
using System.Text;

using Siemens.Engineering;
using Siemens.Engineering.CrossReference;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.Online;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.Blocks;
using Siemens.Engineering.SW.Tags;
using Siemens.Engineering.SW.Types;

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

                        WritePlcMetrics(
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
                }


                foreach (
                    PlcTarget target
                    in targets
                )
                {
                    WritePlc(
                        target
                    );

                    WritePlcMetrics(
                        target
                    );
                }


                WriteProjectHmis(
                    project
                );
            }


            return 0;
        }


        public static int ListProjectLanguages(
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


                var settings =
                    project.LanguageSettings;

                var activeLanguages =
                    settings.ActiveLanguages;

                string editingCulture =
                    settings.EditingLanguage
                    != null
                        ? settings
                            .EditingLanguage
                            .Culture
                            .Name
                        : "";

                string referenceCulture =
                    settings.ReferenceLanguage
                    != null
                        ? settings
                            .ReferenceLanguage
                            .Culture
                            .Name
                        : "";


                foreach (
                    var language
                    in settings.Languages
                )
                {
                    CultureInfo culture =
                        language.Culture;

                    bool isActive =
                        activeLanguages.Find(
                            culture
                        )
                        != null;


                    Console.WriteLine(
                        "PROJECT_LANGUAGE|" +
                        SanitizeOutput(
                            culture.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            culture.EnglishName
                        ) +
                        "|" +
                        SanitizeOutput(
                            culture.NativeName
                        ) +
                        "|" +
                        isActive +
                        "|" +
                        string.Equals(
                            culture.Name,
                            editingCulture,
                            StringComparison.OrdinalIgnoreCase
                        ) +
                        "|" +
                        string.Equals(
                            culture.Name,
                            referenceCulture,
                            StringComparison.OrdinalIgnoreCase
                        )
                    );
                }
            }


            return 0;
        }


        public static int AddProjectLanguage(
            int processId,
            string cultureName
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


            CultureInfo culture;


            try
            {
                culture =
                    CultureInfo.GetCultureInfo(
                        cultureName
                    );
            }
            catch
            {
                Console.Error.WriteLine(
                    "INVALID_CULTURE|" +
                    SanitizeOutput(
                        cultureName
                    )
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


                var settings =
                    project.LanguageSettings;

                var language =
                    settings
                        .Languages
                        .Find(
                            culture
                        );


                if (language == null)
                {
                    Console.Error.WriteLine(
                        "LANGUAGE_NOT_SUPPORTED|" +
                        SanitizeOutput(
                            culture.Name
                        )
                    );

                    return 7;
                }


                if (
                    settings
                        .ActiveLanguages
                        .Find(
                            culture
                        )
                    ==
                    null
                )
                {
                    settings
                        .ActiveLanguages
                        .Add(
                            language
                        );

                    SaveProject(
                        project
                    );
                }


                Console.WriteLine(
                    "LANGUAGE_ADDED|" +
                    SanitizeOutput(
                        culture.Name
                    )
                );
            }


            return 0;
        }


        public static int ExportProjectTexts(
            int processId,
            string sourceCultureName,
            string targetCultureName,
            string outputFilePath
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


            CultureInfo sourceCulture;
            CultureInfo targetCulture;


            try
            {
                sourceCulture =
                    CultureInfo.GetCultureInfo(
                        sourceCultureName
                    );

                targetCulture =
                    CultureInfo.GetCultureInfo(
                        targetCultureName
                    );
            }
            catch
            {
                Console.Error.WriteLine(
                    "INVALID_PROJECT_TEXT_CULTURE"
                );

                return 3;
            }


            if (
                string.Equals(
                    sourceCulture.Name,
                    targetCulture.Name,
                    StringComparison.OrdinalIgnoreCase
                )
            )
            {
                Console.Error.WriteLine(
                    "PROJECT_TEXT_LANGUAGES_MUST_DIFFER"
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


                FileInfo outputFile =
                    new FileInfo(
                        outputFilePath
                    );


                if (
                    outputFile.Directory
                    != null
                    &&
                    !outputFile.Directory.Exists
                )
                {
                    outputFile
                        .Directory
                        .Create();
                }


                if (outputFile.Exists)
                {
                    outputFile.Delete();
                }


                project.ExportProjectTexts(
                    outputFile,
                    sourceCulture,
                    targetCulture
                );


                Console.WriteLine(
                    "PROJECT_TEXTS_EXPORTED|" +
                    SanitizeOutput(
                        outputFile.FullName
                    )
                );
            }


            return 0;
        }


        /// <summary>
        /// Read-only, Classic WinCC HMI text-list export. Siemens Openness V21
        /// exposes HmiTarget.TextLists separately from Project.ExportProjectTexts.
        /// NEVER export or import GraphicLists here.
        /// </summary>
        public static int ExportHmiTextLists(
            int processId,
            string deviceName,
            string hmiName,
            string destinationDirectory
        )
        {
            TiaPortalProcess process = FindProcess(processId);
            if (process == null)
            {
                return WriteProcessNotFound(processId);
            }

            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(
                    portal, out int errorCode
                );
                if (project == null)
                {
                    return errorCode;
                }

                Siemens.Engineering.Hmi.HmiTarget selected = null;
                bool unifiedFound = false;
                int matches = 0;
                foreach (Device device in EnumerateDevices(project))
                {
                    if (!string.Equals(
                        device.Name, deviceName,
                        StringComparison.OrdinalIgnoreCase
                    ))
                    {
                        continue;
                    }

                    foreach (DeviceItemPath itemPath in EnumerateDeviceItems(device))
                    {
                        DeviceItem item = itemPath.Item;
                        SoftwareContainer container;
                        try
                        {
                            container = item.GetService<SoftwareContainer>();
                        }
                        catch
                        {
                            continue;
                        }
                        var software = container?.Software;
                        if (software == null)
                        {
                            continue;
                        }
                        string softwareName = ReadObjectName(software);
                        if (!string.Equals(
                                item.Name, hmiName, StringComparison.OrdinalIgnoreCase)
                            && !string.Equals(
                                softwareName, hmiName, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        bool classic = TypeIsOrDerivesFrom(
                            software.GetType(),
                            "Siemens.Engineering.Hmi.HmiTarget"
                        );
                        bool unified = TypeIsOrDerivesFrom(
                            software.GetType(),
                            "Siemens.Engineering.HmiUnified.HmiSoftware"
                        );
                        if (!classic && !unified)
                        {
                            continue;
                        }
                        matches++;
                        if (classic)
                        {
                            selected = software as Siemens.Engineering.Hmi.HmiTarget;
                        }
                        else
                        {
                            unifiedFound = true;
                        }
                    }
                }

                if (matches != 1)
                {
                    Console.Error.WriteLine(
                        matches == 0
                            ? "HMI_TEXT_LIST_DEVICE_NOT_FOUND"
                            : "HMI_TEXT_LIST_SELECTION_AMBIGUOUS"
                    );
                    return matches == 0 ? 7 : 9;
                }

                if (unifiedFound)
                {
                    // Unified uses HmiTextLists.Export(... .hmi.yml),
                    // not the Classic XML format.
                    Console.Error.WriteLine(
                        "HMI_TEXT_LIST_UNIFIED_REQUIRES_YML_EXPORT"
                    );
                    return 10;
                }

                if (selected == null)
                {
                    Console.Error.WriteLine("HMI_TEXT_LIST_CLASSIC_TARGET_UNAVAILABLE");
                    return 10;
                }

                DirectoryInfo destination = new DirectoryInfo(
                    destinationDirectory
                );
                destination.Create();

                int count = 0;
                foreach (Siemens.Engineering.Hmi.TextGraphicList.TextList textList
                    in selected.TextLists)
                {
                    // Safe filenames independent of HMI text-list names.
                    // The caller supplies an isolated temporary directory.
                    string filename = string.Format(
                        CultureInfo.InvariantCulture,
                        "text_list_{0:D5}.xml", count + 1
                    );
                    FileInfo output = new FileInfo(
                        Path.Combine(destination.FullName, filename)
                    );
                    textList.Export(output, ExportOptions.WithDefaults);
                    string encodedName = Convert.ToBase64String(
                        Encoding.UTF8.GetBytes(textList.Name ?? "")
                    );
                    Console.WriteLine(
                        "HMI_TEXT_LIST_EXPORTED|" + filename + "|" + encodedName
                    );
                    count++;
                }

                Console.WriteLine("HMI_TEXT_LIST_COUNT|" + count);
            }
            return 0;
        }


        /// <summary>
        /// Import one pre-reviewed Classic HMI TextList XML with Override.
        /// The Python review handler owns the whitelist, snapshot checks,
        /// and post-import re-export verification. GraphicLists are excluded.
        /// </summary>
        public static int ImportHmiTextList(
            int processId, string deviceName, string hmiName,
            string listName, string inputFilePath
        )
        {
            FileInfo sourceFile = new FileInfo(inputFilePath);
            if (!sourceFile.Exists)
            {
                Console.Error.WriteLine("HMI_TEXT_LIST_FILE_NOT_FOUND");
                return 3;
            }
            // Refuse XML containing any non-TextList engineering objects.
            System.Xml.XmlDocument document = new System.Xml.XmlDocument();
            document.XmlResolver = null;
            using (System.Xml.XmlReader reader = System.Xml.XmlReader.Create(
                sourceFile.FullName, new System.Xml.XmlReaderSettings {
                    DtdProcessing = System.Xml.DtdProcessing.Prohibit,
                    XmlResolver = null
                }))
            {
                document.Load(reader);
            }
            var roots = document.GetElementsByTagName(
                "Hmi.TextGraphicList.TextList"
            );
            if (roots.Count != 1 ||
                document.GetElementsByTagName(
                    "Hmi.TextGraphicList.GraphicList").Count != 0)
            {
                Console.Error.WriteLine("HMI_TEXT_LIST_XML_SCOPE_INVALID");
                return 3;
            }
            System.Xml.XmlNode nameNode = roots[0].SelectSingleNode(
                "./AttributeList/Name"
            );
            if (nameNode == null || !string.Equals(
                nameNode.InnerText, listName, StringComparison.Ordinal))
            {
                Console.Error.WriteLine("HMI_TEXT_LIST_XML_NAME_MISMATCH");
                return 3;
            }

            TiaPortalProcess process = FindProcess(processId);
            if (process == null) return WriteProcessNotFound(processId);
            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(
                    portal, out int errorCode
                );
                if (project == null) return errorCode;

                Siemens.Engineering.Hmi.HmiTarget selected = null;
                int matches = 0;
                foreach (Device device in EnumerateDevices(project))
                {
                    if (!string.Equals(
                        device.Name, deviceName,
                        StringComparison.OrdinalIgnoreCase
                    )) continue;
                    foreach (DeviceItemPath path in EnumerateDeviceItems(device))
                    {
                        SoftwareContainer container;
                        try
                        {
                            container = path.Item.GetService<SoftwareContainer>();
                        }
                        catch { continue; }
                        var software = container?.Software;
                        if (software == null ||
                            !TypeIsOrDerivesFrom(software.GetType(),
                                "Siemens.Engineering.Hmi.HmiTarget"))
                            continue;
                        if (!string.Equals(
                                path.Item.Name, hmiName,
                                StringComparison.OrdinalIgnoreCase)
                            && !string.Equals(
                                ReadObjectName(software), hmiName,
                                StringComparison.OrdinalIgnoreCase))
                            continue;
                        matches++;
                        selected = software as Siemens.Engineering.Hmi.HmiTarget;
                    }
                }
                if (matches != 1 || selected == null)
                {
                    Console.Error.WriteLine("HMI_TEXT_LIST_SELECTION_INVALID");
                    return 7;
                }
                if (selected.TextLists.Find(listName) == null)
                {
                    Console.Error.WriteLine("HMI_TEXT_LIST_NOT_FOUND");
                    return 7;
                }
                using (ExclusiveAccess access = portal.ExclusiveAccess(
                    "TIA Engineering Assistant: reviewed HMI text list import"
                ))
                {
                    var imported = selected.TextLists.Import(
                        sourceFile, ImportOptions.Override
                    );
                    if (imported == null || imported.Count != 1 ||
                        !string.Equals(imported[0].Name, listName,
                            StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException(
                            "Unexpected HMI text-list import result. "
                            + "Inspect TIA before any retry."
                        );
                    }
                    SaveProject(project);
                    Console.WriteLine(
                        "HMI_TEXT_LIST_IMPORTED|" +
                        Convert.ToBase64String(
                            Encoding.UTF8.GetBytes(listName))
                    );
                }
            }
            return 0;
        }


        public static int ImportProjectTexts(
            int processId,
            string inputFilePath,
            bool updateSourceLanguage
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


            FileInfo inputFile =
                new FileInfo(
                    inputFilePath
                );


            if (!inputFile.Exists)
            {
                Console.Error.WriteLine(
                    "PROJECT_TEXT_FILE_NOT_FOUND|" +
                    SanitizeOutput(
                        inputFilePath
                    )
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


                using (
                    ExclusiveAccess exclusiveAccess =
                        portal.ExclusiveAccess(
                            "TIA Engineering Assistant is importing HMI translations..."
                        )
                )
                {
                    var result =
                        project.ImportProjectTexts(
                            inputFile,
                            updateSourceLanguage
                        );


                    Console.WriteLine(
                        "PROJECT_TEXTS_IMPORTED|" +
                        SanitizeOutput(
                            result.State.ToString()
                        ) +
                        "|" +
                        SanitizeOutput(
                            result.Path
                            != null
                                ? result.Path.FullName
                                : ""
                        )
                    );


                    SaveProject(
                        project
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


        public static int ListPlcStructures(
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


                int databaseCount = 0;
                int typeCount = 0;


                foreach (
                    PlcBlock block
                    in target
                        .Software
                        .BlockGroup
                        .Blocks
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    if (
                        block
                        is DataBlock dataBlock
                    )
                    {
                        WriteDataBlock(
                            dataBlock,
                            ""
                        );

                        databaseCount += 1;
                    }
                }


                foreach (
                    PlcBlockUserGroup group
                    in target
                        .Software
                        .BlockGroup
                        .Groups
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    databaseCount +=
                        WriteDataBlockGroup(
                            group,
                            group.Name
                        );
                }


                foreach (
                    PlcType type
                    in target
                        .Software
                        .TypeGroup
                        .Types
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    WritePlcType(
                        type,
                        ""
                    );

                    typeCount += 1;
                }


                foreach (
                    PlcTypeUserGroup group
                    in target
                        .Software
                        .TypeGroup
                        .Groups
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    typeCount +=
                        WritePlcTypeGroup(
                            group,
                            group.Name
                        );
                }


                if (
                    databaseCount == 0
                    &&
                    typeCount == 0
                )
                {
                    Console.WriteLine(
                        "NO_PLC_STRUCTURES"
                    );
                }
            }


            return 0;
        }


        public static int ListPlcProgramBlocks(
            int processId,
            string deviceName,
            string plcName,
            bool programOnly = false
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


                int count = 0;


                foreach (
                    PlcBlock block
                    in target
                        .Software
                        .BlockGroup
                        .Blocks
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    if (programOnly && block is DataBlock)
                    {
                        continue;
                    }
                    WriteProgramBlock(
                        block,
                        ""
                    );

                    count += 1;
                }


                foreach (
                    PlcBlockUserGroup group
                    in target
                        .Software
                        .BlockGroup
                        .Groups
                        .OrderBy(
                            item => item.Name,
                            StringComparer.OrdinalIgnoreCase
                        )
                )
                {
                    count +=
                        WriteProgramBlockGroup(
                            group,
                            group.Name,
                            programOnly
                        );
                }


                if (count == 0)
                {
                    Console.WriteLine(
                        "NO_PLC_PROGRAM_BLOCKS"
                    );
                }
            }


            return 0;
        }



        // Read-only Step7 V21 CrossReferenceService, scoped to ONE selected
        // block or UDT. No full-project export or approximate XML matching.
        public static int GetPlcCrossReferences(
            int processId, string deviceName, string plcName,
            string kind, string groupPath, string name, string memberPath)
        {
            TiaPortalProcess process = FindProcess(processId);
            if (process == null) return WriteProcessNotFound(processId);

            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(portal, out int errorCode);
                if (project == null) return errorCode;
                PlcTarget target = FindPlcTarget(project, deviceName, plcName);
                if (target == null)
                {
                    Console.Error.WriteLine("PLC_NOT_FOUND");
                    return 7;
                }

                CrossReferenceService service;
                if (string.Equals(kind, "udt", StringComparison.OrdinalIgnoreCase))
                {
                    PlcType type = FindPlcType(target.Software, groupPath, name);
                    if (type == null)
                    {
                        Console.Error.WriteLine("PLC_TYPE_NOT_FOUND");
                        return 7;
                    }
                    service = type.GetService<CrossReferenceService>();
                }
                else
                {
                    PlcBlock block = FindPlcBlock(target.Software, groupPath, name);
                    if (block == null)
                    {
                        Console.Error.WriteLine("PLC_BLOCK_NOT_FOUND");
                        return 7;
                    }
                    service = block.GetService<CrossReferenceService>();
                }

                if (service == null)
                {
                    Console.Error.WriteLine("CROSS_REFERENCE_SERVICE_NOT_SUPPORTED");
                    return 8;
                }

                CrossReferenceResult results =
                    service.GetCrossReferences(CrossReferenceFilter.AllObjects);
                int count = 0;
                bool truncated = false;
                if (results != null && results.Sources != null)
                {
                    foreach (SourceObject source in results.Sources)
                    {
                        WritePlcCrossRefSource(
                            source, memberPath ?? "", "", ref count, ref truncated);
                        if (truncated) break;
                    }
                }
                Console.WriteLine(
                    "PLC_CROSS_REFERENCE_TOTAL|" + count + "|" +
                    (truncated ? "true" : "false"));
                return 0;
            }
        }

        private static string CrossRefEncoded(object value)
        {
            string text = Convert.ToString(
                value, CultureInfo.InvariantCulture) ?? "";
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(text));
        }

        private static string NormalizeCrossRefPath(string path)
        {
            return (path ?? "").Trim().Trim('"')
                .Replace('\\', '.').Replace('/', '.').Trim('.');
        }

        private static bool CrossRefPathMatches(string candidate, string wanted)
        {
            string path = NormalizeCrossRefPath(candidate);
            string search = NormalizeCrossRefPath(wanted);
            return path.Equals(search, StringComparison.OrdinalIgnoreCase)
                || path.EndsWith("." + search, StringComparison.OrdinalIgnoreCase)
                || path.StartsWith(search + ".", StringComparison.OrdinalIgnoreCase)
                || path.IndexOf("." + search + ".",
                    StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static void WritePlcCrossRefSource(
            SourceObject source, string memberPath, string ancestry,
            ref int count, ref bool truncated)
        {
            string sourceName = source.Name ?? "";
            string current = string.IsNullOrEmpty(ancestry)
                ? sourceName : ancestry + "." + sourceName;
            bool selected = string.IsNullOrWhiteSpace(memberPath)
                || CrossRefPathMatches(source.Path, memberPath)
                || CrossRefPathMatches(current, memberPath);
            if (selected && source.References != null)
            {
                foreach (ReferenceObject reference in source.References)
                {
                    if (reference.Locations == null) continue;
                    foreach (Location location in reference.Locations)
                    {
                        if (count >= 200)
                        {
                            truncated = true;
                            return;
                        }
                        string[] fields = {
                            sourceName, source.Path, reference.Name,
                            reference.Path, location.Name,
                            location.ReferenceLocation,
                            location.ReferenceType.ToString(),
                            location.Access.ToString(),
                        };
                        Console.WriteLine("PLC_CROSS_REFERENCE|" +
                            string.Join("|", fields.Select(CrossRefEncoded)));
                        count++;
                    }
                }
            }
            if (source.Children == null) return;
            foreach (SourceObject child in source.Children)
            {
                WritePlcCrossRefSource(child, memberPath, current,
                    ref count, ref truncated);
                if (truncated) return;
            }
        }

        public static int ExportPlcProgramBlock(
            int processId,
            string deviceName,
            string plcName,
            string groupPath,
            string blockName,
            string outputFilePath
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
                    blockName
                )
                ||
                string.IsNullOrWhiteSpace(
                    outputFilePath
                )
            )
            {
                Console.Error.WriteLine(
                    "PROGRAM_BLOCK_EXPORT_ARGUMENT_REQUIRED"
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


                PlcBlock block =
                    FindPlcBlock(
                        target.Software,
                        groupPath,
                        blockName
                    );


                if (block == null)
                {
                    Console.Error.WriteLine(
                        "PLC_PROGRAM_BLOCK_NOT_FOUND|" +
                        SanitizeOutput(
                            groupPath
                        ) +
                        "|" +
                        SanitizeOutput(
                            blockName
                        )
                    );

                    return 7;
                }


                FileInfo outputFile =
                    new FileInfo(
                        outputFilePath
                    );


                if (
                    outputFile.Directory
                    != null
                    &&
                    !outputFile.Directory.Exists
                )
                {
                    outputFile
                        .Directory
                        .Create();
                }


                if (outputFile.Exists)
                {
                    outputFile.Delete();
                }


                block.Export(
                    outputFile,
                    ExportOptions.WithDefaults
                );


                Console.WriteLine(
                    "PROGRAM_BLOCK_EXPORTED|" +
                    SanitizeOutput(
                        groupPath
                    ) +
                    "|" +
                    SanitizeOutput(
                        block.Name
                    ) +
                    "|" +
                    SanitizeOutput(
                        GetResourceObjectType(
                            block
                        )
                    ) +
                    "|" +
                    SanitizeOutput(
                        ReadPropertyText(
                            block,
                            "Number"
                        )
                    ) +
                    "|" +
                    SanitizeOutput(
                        ReadPropertyText(
                            block,
                            "ProgrammingLanguage"
                        )
                    ) +
                    "|" +
                    SanitizeOutput(
                        ReadPropertyText(
                            block,
                            "IsConsistent"
                        )
                    ) +
                    "|" +
                    ReadBlockLoadMemory(
                        block
                    ) +
                    "|" +
                    ReadBlockWorkMemory(
                        block
                    )
                );
            }


            return 0;
        }


        public static int ExportPlcStructure(
            int processId,
            string deviceName,
            string plcName,
            string structureKind,
            string groupPath,
            string structureName,
            string outputFilePath
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
                    structureName
                )
                ||
                string.IsNullOrWhiteSpace(
                    outputFilePath
                )
            )
            {
                Console.Error.WriteLine(
                    "STRUCTURE_EXPORT_ARGUMENT_REQUIRED"
                );

                return 3;
            }


            string normalizedKind =
                (
                    structureKind
                    ??
                    ""
                )
                .Trim()
                .ToLowerInvariant();


            if (
                normalizedKind != "db"
                &&
                normalizedKind != "udt"
            )
            {
                Console.Error.WriteLine(
                    "UNSUPPORTED_STRUCTURE_KIND|" +
                    SanitizeOutput(
                        structureKind
                    )
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


                FileInfo outputFile =
                    new FileInfo(
                        outputFilePath
                    );


                if (
                    outputFile.Directory
                    != null
                    &&
                    !outputFile.Directory.Exists
                )
                {
                    outputFile
                        .Directory
                        .Create();
                }


                if (outputFile.Exists)
                {
                    outputFile.Delete();
                }


                if (normalizedKind == "db")
                {
                    DataBlock dataBlock =
                        FindDataBlock(
                            target.Software,
                            groupPath,
                            structureName
                        );


                    if (dataBlock == null)
                    {
                        Console.Error.WriteLine(
                            "PLC_STRUCTURE_NOT_FOUND|db|" +
                            SanitizeOutput(
                                groupPath
                            ) +
                            "|" +
                            SanitizeOutput(
                                structureName
                            )
                        );

                        return 7;
                    }


                    dataBlock.Export(
                        outputFile,
                        ExportOptions.WithDefaults
                    );

                } else {
                    PlcType plcType =
                        FindPlcType(
                            target.Software,
                            groupPath,
                            structureName
                        );


                    if (plcType == null)
                    {
                        Console.Error.WriteLine(
                            "PLC_STRUCTURE_NOT_FOUND|udt|" +
                            SanitizeOutput(
                                groupPath
                            ) +
                            "|" +
                            SanitizeOutput(
                                structureName
                            )
                        );

                        return 7;
                    }


                    plcType.Export(
                        outputFile,
                        ExportOptions.WithDefaults
                    );
                }


                Console.WriteLine(
                    "STRUCTURE_EXPORTED|" +
                    normalizedKind +
                    "|" +
                    SanitizeOutput(
                        groupPath
                    ) +
                    "|" +
                    SanitizeOutput(
                        structureName
                    ) +
                    "|" +
                    SanitizeOutput(
                        outputFile.FullName
                    )
                );
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


        private static void WriteProjectHmis(
            Project project
        )
        {
            HashSet<string> yielded =
                new HashSet<string>(
                    StringComparer.OrdinalIgnoreCase
                );


            foreach (
                Device device
                in EnumerateDevices(
                    project
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

                    SoftwareContainer container;


                    try
                    {
                        container =
                            item.GetService<
                                SoftwareContainer
                            >();
                    }
                    catch
                    {
                        continue;
                    }


                    var software =
                        container?.Software;


                    if (
                        software == null
                        ||
                        software
                        is PlcSoftware
                    )
                    {
                        continue;
                    }


                    Type softwareType =
                        software.GetType();

                    bool isClassicHmi =
                        TypeIsOrDerivesFrom(
                            softwareType,
                            "Siemens.Engineering.Hmi.HmiTarget"
                        );

                    bool isUnifiedHmi =
                        TypeIsOrDerivesFrom(
                            softwareType,
                            "Siemens.Engineering.HmiUnified.HmiSoftware"
                        );


                    if (
                        !isClassicHmi
                        &&
                        !isUnifiedHmi
                    )
                    {
                        continue;
                    }


                    string softwareTypeName =
                        softwareType.FullName
                        ??
                        softwareType.Name;

                    string key =
                        device.Name
                        +
                        "|"
                        +
                        item.Name
                        +
                        "|"
                        +
                        softwareTypeName;


                    if (!yielded.Add(
                        key
                    ))
                    {
                        continue;
                    }


                    string softwareName =
                        ReadObjectName(
                            software
                        );


                    Console.WriteLine(
                        "HMI|" +
                        SanitizeOutput(
                            device.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            item.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            device.TypeIdentifier
                            ??
                            ""
                        ) +
                        "|" +
                        SanitizeOutput(
                            item.TypeIdentifier
                            ??
                            ""
                        ) +
                        "|" +
                        SanitizeOutput(
                            softwareTypeName
                        ) +
                        "|" +
                        SanitizeOutput(
                            softwareName
                        )
                    );
                }
            }
        }


        private static bool TypeIsOrDerivesFrom(
            Type type,
            string expectedFullName
        )
        {
            Type current =
                type;


            while (
                current != null
            )
            {
                if (
                    string.Equals(
                        current.FullName,
                        expectedFullName,
                        StringComparison.Ordinal
                    )
                )
                {
                    return true;
                }


                current =
                    current.BaseType;
            }


            return false;
        }


        private static string ReadObjectName(
            object value
        )
        {
            try
            {
                var nameProperty =
                    value
                        .GetType()
                        .GetProperty(
                            "Name"
                        );


                if (
                    nameProperty == null
                )
                {
                    return "";
                }


                object nameValue =
                    nameProperty.GetValue(
                        value,
                        null
                    );


                return (
                    nameValue
                    != null
                        ? nameValue.ToString()
                        : ""
                );
            }
            catch
            {
                return "";
            }
        }


        private static void WritePlcMetrics(
            PlcTarget target
        )
        {
            PlcSoftware software =
                target.Software;

            List<PlcBlock> blocks =
                EnumeratePlcBlocks(
                    software
                )
                .ToList();


            int blockCount =
                blocks.Count;

            int dataBlockCount =
                blocks
                .OfType<DataBlock>()
                .Count();

            int udtCount =
                EnumeratePlcTypes(
                    software
                )
                .Count();

            int tagCount =
                EnumeratePlcTags(
                    software
                )
                .Count();


            string onlineState =
                "Unavailable";


            try
            {
                OnlineProvider onlineProvider =
                    target
                        .DeviceItem
                        .GetService<
                            OnlineProvider
                        >();


                if (onlineProvider != null)
                {
                    onlineState =
                        onlineProvider
                            .State
                            .ToString();
                }
            }
            catch
            {
                onlineState =
                    "Unavailable";
            }


            Console.WriteLine(
                "PLC_METRICS|" +
                SanitizeOutput(
                    target.Device.Name
                ) +
                "|" +
                SanitizeOutput(
                    target.DeviceItem.Name
                ) +
                "|" +
                SanitizeOutput(
                    onlineState
                ) +
                "|" +
                blockCount +
                "|" +
                dataBlockCount +
                "|" +
                udtCount +
                "|" +
                tagCount
            );


            long totalLoadMemory =
                0;

            long totalCodeWorkMemory =
                0;

            long totalDataWorkMemory =
                0;

            Dictionary<
                string,
                long[]
            > resourceByType =
                new Dictionary<
                    string,
                    long[]
                >(
                    StringComparer.OrdinalIgnoreCase
                );


            foreach (
                PlcBlock block
                in blocks
            )
            {
                long loadMemory =
                    ReadBlockLoadMemory(
                        block
                    );

                long workMemory =
                    ReadBlockWorkMemory(
                        block
                    );

                bool isDataBlock =
                    block
                    is DataBlock;

                string objectType =
                    GetResourceObjectType(
                        block
                    );


                totalLoadMemory +=
                    loadMemory;


                if (isDataBlock)
                {
                    totalDataWorkMemory +=
                        workMemory;
                }
                else
                {
                    totalCodeWorkMemory +=
                        workMemory;
                }


                if (
                    !resourceByType
                        .TryGetValue(
                            objectType,
                            out long[] values
                        )
                )
                {
                    values =
                        new long[3];

                    resourceByType[
                        objectType
                    ] =
                        values;
                }


                values[0] +=
                    loadMemory;


                if (isDataBlock)
                {
                    values[2] +=
                        workMemory;
                }
                else
                {
                    values[1] +=
                        workMemory;
                }
            }


            WritePlcResource(
                target,
                "Used",
                totalLoadMemory,
                totalCodeWorkMemory,
                totalDataWorkMemory
            );


            WriteResourceAttributes(
                target
            );


            foreach (
                string objectType
                in new[]
                {
                    "OB",
                    "FC",
                    "FB",
                    "DB",
                    "Other",
                }
            )
            {
                if (
                    !resourceByType
                        .TryGetValue(
                            objectType,
                            out long[] values
                        )
                )
                {
                    continue;
                }


                WritePlcResource(
                    target,
                    objectType,
                    values[0],
                    values[1],
                    values[2]
                );
            }
        }


        private static void WriteResourceAttributes(
            PlcTarget target
        )
        {
            WriteResourceAttributes(
                target,
                "DeviceItem",
                target.DeviceItem
            );

            WriteResourceAttributes(
                target,
                "Device",
                target.Device
            );

            WriteResourceAttributes(
                target,
                "PlcSoftware",
                target.Software
            );
        }


        private static void WriteResourceAttributes(
            PlcTarget target,
            string source,
            object value
        )
        {
            IEngineeringObject engineeringObject =
                value
                as IEngineeringObject;


            if (engineeringObject == null)
            {
                return;
            }


            IList<EngineeringAttributeInfo> infos;


            try
            {
                infos =
                    engineeringObject
                        .GetAttributeInfos();
            }
            catch
            {
                return;
            }


            foreach (
                EngineeringAttributeInfo info
                in infos
            )
            {
                string name =
                    info.Name
                    ??
                    "";

                string normalized =
                    name
                        .ToLowerInvariant();


                if (
                    !normalized.Contains(
                        "memory"
                    )
                    &&
                    !normalized.Contains(
                        "retain"
                    )
                    &&
                    !normalized.Contains(
                        "resource"
                    )
                )
                {
                    continue;
                }


                string attributeValue =
                    "";


                try
                {
                    object rawValue =
                        engineeringObject
                            .GetAttribute(
                                name
                            );


                    attributeValue =
                        rawValue
                        != null
                            ? rawValue.ToString()
                            : "";
                }
                catch
                {
                    continue;
                }


                Console.WriteLine(
                    "PLC_RESOURCE_ATTR|" +
                    SanitizeOutput(
                        target.Device.Name
                    ) +
                    "|" +
                    SanitizeOutput(
                        target.DeviceItem.Name
                    ) +
                    "|" +
                    SanitizeOutput(
                        source
                    ) +
                    "|" +
                    SanitizeOutput(
                        name
                    ) +
                    "|" +
                    SanitizeOutput(
                        attributeValue
                    )
                );
            }
        }


        private static void WritePlcResource(
            PlcTarget target,
            string objectType,
            long loadMemory,
            long codeWorkMemory,
            long dataWorkMemory
        )
        {
            Console.WriteLine(
                "PLC_RESOURCE|" +
                SanitizeOutput(
                    target.Device.Name
                ) +
                "|" +
                SanitizeOutput(
                    target.DeviceItem.Name
                ) +
                "|" +
                SanitizeOutput(
                    objectType
                ) +
                "|" +
                loadMemory +
                "|" +
                codeWorkMemory +
                "|" +
                dataWorkMemory +
                "|"
            );
        }


        private static long ReadBlockLoadMemory(
            PlcBlock block
        )
        {
            try
            {
                return Math.Max(
                    0L,
                    Convert.ToInt64(
                        block.LoadMemoryLength
                    )
                );
            }
            catch
            {
                return 0L;
            }
        }


        private static long ReadBlockWorkMemory(
            PlcBlock block
        )
        {
            try
            {
                return Math.Max(
                    0L,
                    Convert.ToInt64(
                        block.WorkMemoryLength
                    )
                );
            }
            catch
            {
                return 0L;
            }
        }


        private static string GetResourceObjectType(
            PlcBlock block
        )
        {
            if (
                block
                is DataBlock
            )
            {
                return "DB";
            }


            string typeName =
                block
                    .GetType()
                    .Name
                    .ToUpperInvariant();


            if (
                typeName == "OB"
                ||
                typeName.Contains(
                    "ORGANIZATION"
                )
            )
            {
                return "OB";
            }


            if (
                typeName == "FB"
                ||
                typeName.Contains(
                    "FUNCTIONBLOCK"
                )
            )
            {
                return "FB";
            }


            if (
                typeName == "FC"
                ||
                typeName.Contains(
                    "FUNCTION"
                )
            )
            {
                return "FC";
            }


            return "Other";
        }


        private static IEnumerable<PlcBlock> EnumeratePlcBlocks(
            PlcSoftware software
        )
        {
            foreach (
                PlcBlock block
                in software
                    .BlockGroup
                    .Blocks
            )
            {
                yield return block;
            }


            foreach (
                PlcBlockUserGroup group
                in software
                    .BlockGroup
                    .Groups
            )
            {
                foreach (
                    PlcBlock block
                    in EnumeratePlcBlocks(
                        group
                    )
                )
                {
                    yield return block;
                }
            }
        }


        private static IEnumerable<PlcBlock> EnumeratePlcBlocks(
            PlcBlockUserGroup group
        )
        {
            foreach (
                PlcBlock block
                in group.Blocks
            )
            {
                yield return block;
            }


            foreach (
                PlcBlockUserGroup child
                in group.Groups
            )
            {
                foreach (
                    PlcBlock block
                    in EnumeratePlcBlocks(
                        child
                    )
                )
                {
                    yield return block;
                }
            }
        }


        private static IEnumerable<PlcType> EnumeratePlcTypes(
            PlcSoftware software
        )
        {
            foreach (
                PlcType type
                in software
                    .TypeGroup
                    .Types
            )
            {
                yield return type;
            }


            foreach (
                PlcTypeUserGroup group
                in software
                    .TypeGroup
                    .Groups
            )
            {
                foreach (
                    PlcType type
                    in EnumeratePlcTypes(
                        group
                    )
                )
                {
                    yield return type;
                }
            }
        }


        private static IEnumerable<PlcType> EnumeratePlcTypes(
            PlcTypeUserGroup group
        )
        {
            foreach (
                PlcType type
                in group.Types
            )
            {
                yield return type;
            }


            foreach (
                PlcTypeUserGroup child
                in group.Groups
            )
            {
                foreach (
                    PlcType type
                    in EnumeratePlcTypes(
                        child
                    )
                )
                {
                    yield return type;
                }
            }
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


        private static string NormalizeGroupPath(
            string groupPath
        )
        {
            return (
                groupPath
                ??
                ""
            )
            .Trim()
            .Trim('/');
        }


        private static PlcBlock FindPlcBlock(
            PlcSoftware software,
            string groupPath,
            string name
        )
        {
            string targetPath =
                NormalizeGroupPath(
                    groupPath
                );


            if (targetPath.Length == 0)
            {
                return software
                    .BlockGroup
                    .Blocks
                    .FirstOrDefault(
                        block =>
                            string.Equals(
                                block.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcBlockUserGroup group
                in software
                    .BlockGroup
                    .Groups
            )
            {
                PlcBlock result =
                    FindPlcBlock(
                        group,
                        group.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static PlcBlock FindPlcBlock(
            PlcBlockUserGroup group,
            string currentPath,
            string targetPath,
            string name
        )
        {
            if (
                string.Equals(
                    currentPath,
                    targetPath,
                    StringComparison
                        .OrdinalIgnoreCase
                )
            )
            {
                return group
                    .Blocks
                    .FirstOrDefault(
                        block =>
                            string.Equals(
                                block.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcBlockUserGroup child
                in group.Groups
            )
            {
                PlcBlock result =
                    FindPlcBlock(
                        child,
                        currentPath +
                        "/" +
                        child.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static DataBlock FindDataBlock(
            PlcSoftware software,
            string groupPath,
            string name
        )
        {
            string targetPath =
                NormalizeGroupPath(
                    groupPath
                );


            if (targetPath.Length == 0)
            {
                return software
                    .BlockGroup
                    .Blocks
                    .OfType<DataBlock>()
                    .FirstOrDefault(
                        block =>
                            string.Equals(
                                block.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcBlockUserGroup group
                in software
                    .BlockGroup
                    .Groups
            )
            {
                DataBlock result =
                    FindDataBlock(
                        group,
                        group.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static DataBlock FindDataBlock(
            PlcBlockUserGroup group,
            string currentPath,
            string targetPath,
            string name
        )
        {
            if (
                string.Equals(
                    currentPath,
                    targetPath,
                    StringComparison
                        .OrdinalIgnoreCase
                )
            )
            {
                return group
                    .Blocks
                    .OfType<DataBlock>()
                    .FirstOrDefault(
                        block =>
                            string.Equals(
                                block.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcBlockUserGroup child
                in group.Groups
            )
            {
                DataBlock result =
                    FindDataBlock(
                        child,
                        currentPath +
                        "/" +
                        child.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static PlcType FindPlcType(
            PlcSoftware software,
            string groupPath,
            string name
        )
        {
            string targetPath =
                NormalizeGroupPath(
                    groupPath
                );


            if (targetPath.Length == 0)
            {
                return software
                    .TypeGroup
                    .Types
                    .FirstOrDefault(
                        type =>
                            string.Equals(
                                type.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcTypeUserGroup group
                in software
                    .TypeGroup
                    .Groups
            )
            {
                PlcType result =
                    FindPlcType(
                        group,
                        group.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static PlcType FindPlcType(
            PlcTypeUserGroup group,
            string currentPath,
            string targetPath,
            string name
        )
        {
            if (
                string.Equals(
                    currentPath,
                    targetPath,
                    StringComparison
                        .OrdinalIgnoreCase
                )
            )
            {
                return group
                    .Types
                    .FirstOrDefault(
                        type =>
                            string.Equals(
                                type.Name,
                                name,
                                StringComparison
                                    .OrdinalIgnoreCase
                            )
                    );
            }


            foreach (
                PlcTypeUserGroup child
                in group.Groups
            )
            {
                PlcType result =
                    FindPlcType(
                        child,
                        currentPath +
                        "/" +
                        child.Name,
                        targetPath,
                        name
                    );


                if (result != null)
                {
                    return result;
                }
            }


            return null;
        }


        private static int WriteProgramBlockGroup(
            PlcBlockUserGroup group,
            string groupPath,
            bool programOnly = false
        )
        {
            int count = 0;


            foreach (
                PlcBlock block
                in group
                    .Blocks
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                if (programOnly && block is DataBlock)
                {
                    continue;
                }
                WriteProgramBlock(
                    block,
                    groupPath
                );

                count += 1;
            }


            foreach (
                PlcBlockUserGroup child
                in group
                    .Groups
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                count +=
                    WriteProgramBlockGroup(
                        child,
                        groupPath +
                        "/" +
                        child.Name,
                        programOnly
                    );
            }


            return count;
        }


        private static void WriteProgramBlock(
            PlcBlock block,
            string groupPath
        )
        {
            string kind =
                GetResourceObjectType(
                    block
                );


            if (
                string.Equals(
                    kind,
                    "Other",
                    StringComparison.OrdinalIgnoreCase
                )
            )
            {
                kind =
                    block
                        .GetType()
                        .Name;
            }


            Console.WriteLine(
                "PLC_PROGRAM_BLOCK|" +
                SanitizeOutput(
                    groupPath
                ) +
                "|" +
                SanitizeOutput(
                    block.Name
                ) +
                "|" +
                SanitizeOutput(
                    kind
                ) +
                "|" +
                SanitizeOutput(
                    ReadPropertyText(
                        block,
                        "Number"
                    )
                ) +
                "|" +
                SanitizeOutput(
                    ReadPropertyText(
                        block,
                        "ProgrammingLanguage"
                    )
                ) +
                "|" +
                SanitizeOutput(
                    ReadPropertyText(
                        block,
                        "IsConsistent"
                    )
                ) +
                "|" +
                ReadBlockLoadMemory(
                    block
                ) +
                "|" +
                ReadBlockWorkMemory(
                    block
                )
            );
        }


        private static string ReadPropertyText(
            object value,
            string propertyName
        )
        {
            try
            {
                var property =
                    value
                        .GetType()
                        .GetProperty(
                            propertyName
                        );


                if (property == null)
                {
                    return "";
                }


                object rawValue =
                    property.GetValue(
                        value,
                        null
                    );


                return (
                    rawValue
                    != null
                        ? rawValue.ToString()
                        : ""
                );
            }
            catch
            {
                return "";
            }
        }


        private static void WriteDataBlock(
            DataBlock dataBlock,
            string groupPath
        )
        {
            Console.WriteLine(
                "PLC_DB|" +
                SanitizeOutput(
                    groupPath
                ) +
                "|" +
                SanitizeOutput(
                    dataBlock.Name
                ) +
                "|" +
                dataBlock.Number +
                "|" +
                SanitizeOutput(
                    dataBlock
                        .GetType()
                        .Name
                ) +
                "|" +
                dataBlock.IsConsistent
            );
        }


        private static int WriteDataBlockGroup(
            PlcBlockUserGroup group,
            string groupPath
        )
        {
            int count = 0;


            foreach (
                PlcBlock block
                in group
                    .Blocks
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                if (
                    block
                    is DataBlock dataBlock
                )
                {
                    WriteDataBlock(
                        dataBlock,
                        groupPath
                    );

                    count += 1;
                }
            }


            foreach (
                PlcBlockUserGroup child
                in group
                    .Groups
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                count +=
                    WriteDataBlockGroup(
                        child,
                        groupPath +
                        "/" +
                        child.Name
                    );
            }


            return count;
        }


        private static void WritePlcType(
            PlcType type,
            string groupPath
        )
        {
            Console.WriteLine(
                "PLC_UDT|" +
                SanitizeOutput(
                    groupPath
                ) +
                "|" +
                SanitizeOutput(
                    type.Name
                ) +
                "|" +
                SanitizeOutput(
                    type
                        .GetType()
                        .Name
                ) +
                "|" +
                type.IsConsistent
            );
        }


        private static int WritePlcTypeGroup(
            PlcTypeUserGroup group,
            string groupPath
        )
        {
            int count = 0;


            foreach (
                PlcType type
                in group
                    .Types
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                WritePlcType(
                    type,
                    groupPath
                );

                count += 1;
            }


            foreach (
                PlcTypeUserGroup child
                in group
                    .Groups
                    .OrderBy(
                        item => item.Name,
                        StringComparer.OrdinalIgnoreCase
                    )
            )
            {
                count +=
                    WritePlcTypeGroup(
                        child,
                        groupPath +
                        "/" +
                        child.Name
                    );
            }


            return count;
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
