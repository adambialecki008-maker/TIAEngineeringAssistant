using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;

using Siemens.Engineering;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.Library;
using Siemens.Engineering.Library.MasterCopies;
using Siemens.Engineering.SW;

namespace TiaOpennessAdapter
{
    internal static partial class TiaService
    {
        // Same-model whole-device master copy only. This keeps the
        // original HMI's screen geometry instead of silently distorting it.
        // Different target hardware/resolution is NOT supported by this action.
        public static int CloneConfiguredHmi(
            int processId, string sourceDeviceName, string sourceHmiName,
            string targetDeviceName, string newIp, string plcDeviceName,
            string plcName, string connectionName)
        {
            TiaPortalProcess process = FindProcess(processId);
            if (process == null) return WriteProcessNotFound(processId);

            string[] names = { sourceDeviceName, sourceHmiName, targetDeviceName,
                plcDeviceName, plcName, connectionName };
            if (names.Any(string.IsNullOrWhiteSpace)
                || names.Any(x => x.Length > 128 || x.Contains("|")))
            {
                Console.Error.WriteLine("Invalid HMI clone device/PLC/connection name.");
                return 3;
            }
            if (!IPAddress.TryParse(newIp, out IPAddress address)
                || address.AddressFamily != AddressFamily.InterNetwork
                || newIp.StartsWith("0.") || newIp.StartsWith("127.")
                || newIp.StartsWith("224.") || newIp == "255.255.255.255")
            {
                Console.Error.WriteLine("Invalid target HMI IPv4 address.");
                return 3;
            }
            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(portal, out int errorCode);
                if (project == null) return errorCode;
                if (DeviceNameExists(project, targetDeviceName))
                {
                    Console.Error.WriteLine("HMI target device name already exists.");
                    return 6;
                }
                Device source = EnumerateDevices(project).FirstOrDefault(x =>
                    string.Equals(x.Name, sourceDeviceName,
                        StringComparison.OrdinalIgnoreCase));
                if (source == null)
                {
                    Console.Error.WriteLine("Source HMI device does not exist.");
                    return 4;
                }
                object sourceSoftware = FindHmiSoftwareForClone(source, sourceHmiName);
                if (sourceSoftware == null)
                {
                    Console.Error.WriteLine(
                        "Selected source HMI device/softwarename not found.");
                    return 4;
                }
                // V21 Classic HMI master copy: do not silently treat Unified
                // differently; its connections/tag APIs are not identical.
                if (!TypeIsOrDerivesFrom(sourceSoftware.GetType(),
                    "Siemens.Engineering.Hmi.HmiTarget"))
                {
                    Console.Error.WriteLine(
                        "Whole-device clone is validated for Classic WinCC HMI only. "
                        + "Unified requires separate import/tag mapping validation.");
                    return 7;
                }
                string sourceIp = ReadDeviceIpAddress(source);
                if (string.IsNullOrWhiteSpace(sourceIp))
                {
                    Console.Error.WriteLine(
                        "Source HMI has no readable configured IP address.");
                    return 7;
                }
                if (EnumerateDevices(project).Any(device =>
                    string.Equals(ReadDeviceIpAddress(device), newIp,
                        StringComparison.OrdinalIgnoreCase)))
                {
                    Console.Error.WriteLine(
                        "Target IP already exists on a project device.");
                    return 6;
                }
                PlcTarget plc = EnumeratePlcTargets(project).FirstOrDefault(x =>
                    string.Equals(x.Device.Name, plcDeviceName,
                        StringComparison.OrdinalIgnoreCase)
                    && string.Equals(x.DeviceItem.Name, plcName,
                        StringComparison.OrdinalIgnoreCase));
                if (plc == null)
                {
                    Console.Error.WriteLine(
                        "Selected existing PLC must be present in the project.");
                    return 4;
                }
                var sourceConnections = GetHmiConnectionPartners(sourceSoftware);
                if (!sourceConnections.TryGetValue(connectionName, out string partner)
                    || !(string.Equals(partner, plcName,
                            StringComparison.OrdinalIgnoreCase)
                        || string.Equals(partner, plcDeviceName,
                            StringComparison.OrdinalIgnoreCase)))
                {
                    Console.Error.WriteLine(
                        "Source HMI connection must already target the selected "
                        + "project PLC. No new unverified connections are created.");
                    return 7;
                }
                // Abort if tag tables cannot be inspected: never promise correct
                // PLC tag links based only on an existing connection name.
                List<string> sourceTags = ReadAllHmiTagConnectionNames(sourceSoftware);
                List<string> sourceTagLinks =
                    ReadAllHmiTagLinkFingerprints(sourceSoftware);
                if (sourceTags.Any(x => !sourceConnections.ContainsKey(x)))
                {
                    Console.Error.WriteLine(
                        "Some source HMI tags refer to missing connections.");
                    return 7;
                }

                Device created = null;
                MasterCopy temporaryMaster = null;
                using (ExclusiveAccess exclusive = portal.ExclusiveAccess(
                    "Cloning a configured HMI device from the project library"))
                {
                    try
                    {
                        temporaryMaster = project.ProjectLibrary
                            .MasterCopyFolder.MasterCopies.Create(
                                (IMasterCopySource)source);
                        created = project.Devices.CreateFrom(temporaryMaster);
                        if (!string.Equals(created.TypeIdentifier,
                            source.TypeIdentifier, StringComparison.OrdinalIgnoreCase))
                            throw new InvalidOperationException(
                                "Cloned HMI hardware type differs from the source.");
                        created.Name = targetDeviceName;

                        bool ipAssigned = false;
                        foreach (DeviceItemPath path in EnumerateDeviceItems(created))
                        {
                            NetworkInterface network = null;
                            try { network = path.Item.GetService<NetworkInterface>(); }
                            catch { continue; }
                            if (network == null) continue;
                            foreach (var node in network.Nodes)
                            {
                                try
                                {
                                    string old = Convert.ToString(
                                        node.GetAttribute("Address")) ?? "";
                                    if (!string.IsNullOrWhiteSpace(old)
                                        && IPAddress.TryParse(old, out IPAddress parsed)
                                        && parsed.AddressFamily ==
                                            AddressFamily.InterNetwork)
                                    {
                                        node.SetAttribute("Address", newIp);
                                        ipAssigned = true;
                                        break;
                                    }
                                }
                                catch
                                {
                                    // Keep searching interfaces; verification follows.
                                }
                            }
                            if (ipAssigned) break;
                        }
                        if (!ipAssigned || ReadDeviceIpAddress(created) != newIp)
                            throw new InvalidOperationException(
                                "Cloned device IP could not be set and verified.");

                        object clonedSoftware =
                            FindHmiSoftwareForClone(created, sourceHmiName)
                            ?? FindFirstHmiSoftwareForClone(created);
                        if (clonedSoftware == null)
                            throw new InvalidOperationException(
                                "Cloned HMI software not found.");

                        var clonedConnections =
                            GetHmiConnectionPartners(clonedSoftware);
                        if (!clonedConnections.TryGetValue(connectionName,
                            out string clonedPartner)
                            || !(string.Equals(clonedPartner, plcName,
                                    StringComparison.OrdinalIgnoreCase)
                                || string.Equals(clonedPartner, plcDeviceName,
                                    StringComparison.OrdinalIgnoreCase)))
                            throw new InvalidOperationException(
                                "Master copy did not preserve the existing PLC "
                                + "connection. HMI clone rolled back.");

                        List<string> clonedTags =
                            ReadAllHmiTagConnectionNames(clonedSoftware);
                        List<string> clonedTagLinks =
                            ReadAllHmiTagLinkFingerprints(clonedSoftware);
                        if (clonedTags.Count != sourceTags.Count
                            || clonedTags.Any(x => !clonedConnections.ContainsKey(x))
                            || !sourceTagLinks.OrderBy(x => x, StringComparer.Ordinal)
                                .SequenceEqual(clonedTagLinks.OrderBy(
                                    x => x, StringComparer.Ordinal)))
                            throw new InvalidOperationException(
                                "HMI tag names, PLC tag links or connection mapping "
                                + "changed during clone. Clone rolled back.");

                        // Remove the temporary library entry BEFORE saving the
                        // project so the clone leaves no hidden master copy.
                        temporaryMaster.Delete();
                        temporaryMaster = null;
                        SaveProject(project);
                        Console.WriteLine(
                            "HMI_CLONED|" + SanitizeOutput(source.Name)
                            + "|" + SanitizeOutput(created.Name)
                            + "|" + SanitizeOutput(newIp)
                            + "|" + SanitizeOutput(connectionName)
                            + "|" + clonedTags.Count);
                    }
                    catch (Exception ex)
                    {
                        if (created != null)
                        {
                            try { created.Delete(); } catch { /* report uncertainty */ }
                        }
                        Console.Error.WriteLine(
                            "HMI_CLONE_REJECTED|" + SanitizeOutput(ex.Message)
                            + ". Inspect TIA before retrying; no save issued.");
                        return 8;
                    }
                    finally
                    {
                        if (temporaryMaster != null)
                        {
                            try { temporaryMaster.Delete(); }
                            catch { Console.Error.WriteLine(
                                "Temporary project library master copy cleanup "
                                + "requires manual inspection."); }
                        }
                    }
                }
                return 0;
            }
        }

        private static object FindFirstHmiSoftwareForClone(Device device)
        {
            foreach (DeviceItemPath path in EnumerateDeviceItems(device))
            {
                try
                {
                    SoftwareContainer container =
                        path.Item.GetService<SoftwareContainer>();
                    object software = container?.Software;
                    if (software != null && TypeIsOrDerivesFrom(
                        software.GetType(), "Siemens.Engineering.Hmi.HmiTarget"))
                        return software;
                }
                catch { }
            }
            return null;
        }

        private static object FindHmiSoftwareForClone(Device device, string hmiName)
        {
            foreach (DeviceItemPath path in EnumerateDeviceItems(device))
            {
                if (!string.Equals(path.Item.Name, hmiName,
                        StringComparison.OrdinalIgnoreCase)) continue;
                try
                {
                    SoftwareContainer container =
                        path.Item.GetService<SoftwareContainer>();
                    return container?.Software;
                }
                catch { }
            }
            return null;
        }

        private static Dictionary<string, string> GetHmiConnectionPartners(
            object software)
        {
            var result = new Dictionary<string, string>(
                StringComparer.OrdinalIgnoreCase);
            object collection = software.GetType()
                .GetProperty("Connections")?.GetValue(software, null);
            if (!(collection is IEnumerable enumerable))
                throw new InvalidOperationException(
                    "HMI connection collection unavailable.");
            foreach (object connection in enumerable)
            {
                Type t = connection.GetType();
                string name = Convert.ToString(
                    t.GetProperty("Name")?.GetValue(connection, null)) ?? "";
                string partner = Convert.ToString(
                    t.GetProperty("Partner")?.GetValue(connection, null)) ?? "";
                if (!string.IsNullOrWhiteSpace(name)) result[name] = partner;
            }
            return result;
        }

        // Cross-check both the selected HMI connection and the PLC tag link,
        // not only the number of copied tags.
        private static List<string> ReadAllHmiTagLinkFingerprints(object software)
        {
            var names = new List<string>();
            object folder = software.GetType()
                .GetProperty("TagFolder")?.GetValue(software, null);
            if (folder == null)
                throw new InvalidOperationException("HMI tag folder unavailable.");
            CollectHmiTagLinkFingerprints(folder, names, 0);
            return names;
        }

        private static void CollectHmiTagLinkFingerprints(
            object folder, List<string> names, int depth)
        {
            if (depth > 20) throw new InvalidOperationException(
                "HMI tag group nesting is too deep.");
            object tables = folder.GetType().GetProperty("TagTables")
                ?.GetValue(folder, null);
            if (!(tables is IEnumerable collection))
                throw new InvalidOperationException("HMI tag tables unavailable.");
            foreach (object table in collection)
            {
                object tags = table.GetType().GetProperty("Tags")
                    ?.GetValue(table, null);
                if (!(tags is IEnumerable rows)) continue;
                foreach (object tag in rows)
                {
                    Type t = tag.GetType();
                    string name = Convert.ToString(
                        t.GetProperty("Name")?.GetValue(tag, null)) ?? "";
                    string connection = Convert.ToString(
                        t.GetProperty("Connection")?.GetValue(tag, null)) ?? "";
                    string plcTag = Convert.ToString(
                        t.GetProperty("PlcTag")?.GetValue(tag, null)) ?? "";
                    string plcName = Convert.ToString(
                        t.GetProperty("PlcName")?.GetValue(tag, null)) ?? "";
                    names.Add(name + "|" + connection + "|" + plcTag
                        + "|" + plcName);
                }
            }
            object folders = folder.GetType().GetProperty("Folders")
                ?.GetValue(folder, null);
            if (folders is IEnumerable children)
                foreach (object child in children)
                    CollectHmiTagLinkFingerprints(child, names, depth + 1);
        }

        private static List<string> ReadAllHmiTagConnectionNames(object software)
        {
            object folder = software.GetType()
                .GetProperty("TagFolder")?.GetValue(software, null);
            if (folder == null) throw new InvalidOperationException(
                "HMI tag folder could not be inspected.");
            List<string> names = new List<string>();
            ReadHmiTagConnectionsFromFolder(folder, names, 0);
            return names;
        }

        private static void ReadHmiTagConnectionsFromFolder(
            object folder, List<string> names, int depth)
        {
            if (depth > 20) throw new InvalidOperationException(
                "HMI tag folder nesting too deep.");
            object tables = folder.GetType()
                .GetProperty("TagTables")?.GetValue(folder, null);
            if (!(tables is IEnumerable tableList))
                throw new InvalidOperationException(
                    "HMI tag table collection unavailable.");
            foreach (object table in tableList)
            {
                object tags = table.GetType()
                    .GetProperty("Tags")?.GetValue(table, null);
                if (!(tags is IEnumerable tagList)) continue;
                foreach (object tag in tagList)
                {
                    string name = Convert.ToString(tag.GetType()
                        .GetProperty("Connection")?.GetValue(tag, null)) ?? "";
                    if (!string.IsNullOrWhiteSpace(name))
                        names.Add(name);
                }
            }
            object folders = folder.GetType()
                .GetProperty("Folders")?.GetValue(folder, null);
            if (folders is IEnumerable subfolders)
                foreach (object subfolder in subfolders)
                    ReadHmiTagConnectionsFromFolder(subfolder, names, depth + 1);
        }
    }
}
