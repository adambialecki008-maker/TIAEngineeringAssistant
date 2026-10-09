using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

using Siemens.Engineering;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.SW;

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
                Console.Error.WriteLine(
                    $"TIA process {processId} not found."
                );

                return 2;
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
                        $"PROJECT|{project.Name}"
                    );


                    bool plcFound =
                        false;


                    foreach (
                        Device device
                        in EnumerateDevices(
                            project
                        )
                    )
                    {
                        PlcSoftware plcSoftware =
                            GetPlcSoftware(
                                device
                            );


                        if (
                            plcSoftware == null
                        )
                        {
                            continue;
                        }


                        Console.WriteLine(
                            "PLC|" +
                            SanitizeOutput(
                                device.Name
                            ) +
                            "|" +
                            SanitizeOutput(
                                plcSoftware.Name
                            )
                        );


                        plcFound =
                            true;
                    }


                    if (!plcFound)
                    {
                        Console.WriteLine(
                            "NO_PLC_FOUND"
                        );
                    }
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
                Console.Error.WriteLine(
                    $"TIA process {processId} not found."
                );

                return 2;
            }


            string normalizedFamily =
                NormalizeFamily(
                    plcFamily
                );


            if (normalizedFamily == null)
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
                                item.TypeName
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
                Console.Error.WriteLine(
                    $"TIA process {processId} not found."
                );

                return 2;
            }


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


            using (
                TiaPortal portal =
                    process.Attach()
            )
            {
                if (
                    portal.Projects.Count == 0
                )
                {
                    Console.Error.WriteLine(
                        "NO_OPEN_PROJECT"
                    );

                    return 4;
                }


                if (
                    portal.Projects.Count > 1
                )
                {
                    Console.Error.WriteLine(
                        "MORE_THAN_ONE_PROJECT"
                    );

                    return 5;
                }


                Project project =
                    portal.Projects[0];


                if (
                    DeviceNameExists(
                        project,
                        deviceName
                    )
                )
                {
                    Console.Error.WriteLine(
                        "DEVICE_NAME_EXISTS|" +
                        deviceName
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


                    PlcSoftware software =
                        GetPlcSoftware(
                            device
                        );


                    if (
                        software == null
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
                            device.Name
                        ) +
                        "|" +
                        SanitizeOutput(
                            software.Name
                        )
                    );


                    project.Save();


                    Console.WriteLine(
                        "PROJECT_SAVED|" +
                        SanitizeOutput(
                            project.Name
                        )
                    );
                }
            }


            return 0;
        }


        private static string ResolveTypeIdentifier(
            TiaPortal portal,
            string selection
        )
        {
            string value =
                selection.Trim();


            /*
             * Full TypeIdentifier:
             *
             * OrderNumber:6ES7 511-1AL03-0AB0/V4.1
             */
            if (
                value.StartsWith(
                    "OrderNumber:",
                    StringComparison
                        .OrdinalIgnoreCase
                )
                &&
                value.IndexOf(
                    "/V",
                    StringComparison
                        .OrdinalIgnoreCase
                ) >= 0
            )
            {
                return value;
            }


            if (
                value.StartsWith(
                    "OrderNumber:",
                    StringComparison
                        .OrdinalIgnoreCase
                )
            )
            {
                value =
                    value.Substring(
                        "OrderNumber:".Length
                    );
            }


            int versionIndex =
                value.IndexOf(
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
                    value.Substring(
                        versionIndex + 2
                    );

                value =
                    value.Substring(
                        0,
                        versionIndex
                    );
            }


            string searchValue =
                FormatCatalogSearchCode(
                    value
                );


            string normalizedRequested =
                NormalizeOrderNumber(
                    value
                );


            var catalogItems =
                portal
                    .HardwareCatalog
                    .Find(
                        searchValue
                    );


            List<PlcCatalogEntry> matches =
                new List<PlcCatalogEntry>();


            foreach (
                var item
                in catalogItems
            )
            {
                string articleNumber =
                    item.ArticleNumber
                    ?? "";


                if (
                    NormalizeOrderNumber(
                        articleNumber
                    )
                    != normalizedRequested
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


                matches.Add(
                    new PlcCatalogEntry(
                        item.TypeName
                            ?? "",
                        articleNumber,
                        version,
                        item.TypeIdentifier
                            ?? ""
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
                        item.ArticleNumber
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
            if (value == null)
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


            int comparison =
                candidateVersion.CompareTo(
                    currentVersion
                );


            if (
                comparison != 0
            )
            {
                return comparison > 0;
            }


            return string.Compare(
                candidate.ArticleNumber,
                current.ArticleNumber,
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
            return (
                ParseVersion(first)
                ==
                ParseVersion(second)
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
            switch (family)
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


            switch (family)
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


        private static TiaPortalProcess FindProcess(
            int processId
        )
        {
            return TiaPortal
                .GetProcesses()
                .FirstOrDefault(
                    process =>
                        process.Id
                        == processId
                );
        }


        private static bool DeviceNameExists(
            Project project,
            string name
        )
        {
            return EnumerateDevices(
                project
            ).Any(
                device =>
                    string.Equals(
                        device.Name,
                        name,
                        StringComparison
                            .OrdinalIgnoreCase
                    )
            );
        }


        private static IEnumerable<Device> EnumerateDevices(
            Project project
        )
        {
            foreach (
                Device device
                in project.Devices
            )
            {
                yield return device;
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
                    yield return device;
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


        private static PlcSoftware GetPlcSoftware(
            HardwareObject hardwareObject
        )
        {
            Queue<HardwareObject> queue =
                new Queue<HardwareObject>();


            queue.Enqueue(
                hardwareObject
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
                        return plc;
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
            if (value == null)
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