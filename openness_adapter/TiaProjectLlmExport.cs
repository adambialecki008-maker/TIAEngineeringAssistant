using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using Siemens.Engineering;
using Siemens.Engineering.HW;
using Siemens.Engineering.HW.Features;
using Siemens.Engineering.SW;
using Siemens.Engineering.SW.Blocks;
using Siemens.Engineering.SW.Tags;
using Siemens.Engineering.SW.Types;

namespace TiaOpennessAdapter
{
    // One read-only TIA attachment; one traversal of the WHOLE open project,
    // not the selected controller or cached browser state.
    internal static partial class TiaService
    {
        public static int ExportEntireProjectForLlm(int processId, string directory)
        {
            TiaPortalProcess process = FindProcess(processId);
            if (process == null) return WriteProcessNotFound(processId);
            if (string.IsNullOrWhiteSpace(directory))
            {
                Console.Error.WriteLine("LLM_EXPORT_DIRECTORY_REQUIRED");
                return 3;
            }
            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(portal, out int code);
                if (project == null) return code;
                Directory.CreateDirectory(directory);
                var report = new ProjectLlmExport(directory);
                report.Record("PROJECT", project.Name, "", "open project", "");
                var seenPlcs = new HashSet<object>(ReferenceEqualityComparer.Instance);
                var seenHmi = new HashSet<object>(ReferenceEqualityComparer.Instance);
                int deviceIndex = 0;
                foreach (Device device in EnumerateDevices(project))
                {
                    deviceIndex++;
                    report.Record("DEVICE", device.Name, "",
                        device.TypeIdentifier ?? "", "");
                    string pnName = ReadProfinetDeviceName(device);
                    if (!string.IsNullOrWhiteSpace(pnName))
                        report.Record("PROFINET_DEVICE_NAME", device.Name, "",
                            pnName, "");
                    try
                    {
                        foreach (DeviceItemPath itemPath in EnumerateDeviceItems(device))
                        {
                            DeviceItem item = itemPath.Item;
                            report.Record("HARDWARE", device.Name, itemPath.Path,
                                (item.TypeIdentifier ?? "") + " | plugged=" +
                                item.IsPlugged + " | addresses=" + item.Addresses.Count
                                + " | channels=" + item.Channels.Count, "");
                            foreach (Address address in item.Addresses)
                            {
                                if ((address.IoType == AddressIoType.Input ||
                                     address.IoType == AddressIoType.Output) &&
                                     address.StartAddress >= 0)
                                    report.Record("IO_ADDRESS", device.Name, itemPath.Path,
                                        address.IoType + " start=" + address.StartAddress
                                        + " length=" + address.Length, "");
                            }
                            foreach (Channel channel in item.Channels)
                            {
                                string type = channel.IoType.ToString();
                                if (type != "Input" && type != "Output") continue;
                                if (!TryGetIntAttribute(channel, "ChannelAddress",
                                                        out int channelAddress)
                                    || channelAddress < 0)
                                    continue;
                                if (!TryGetIntAttribute(channel, "ChannelWidth",
                                                        out int channelWidth))
                                    channelWidth = 0;
                                report.Record("IO_CHANNEL", device.Name, itemPath.Path,
                                    "channel=" + channel.Number + " type=" + channel.Type
                                    + " direction=" + type + " address=" + channelAddress
                                    + " width=" + channelWidth, "");
                            }
                            SoftwareContainer container = null;
                            try { container = item.GetService<SoftwareContainer>(); }
                            catch (Exception e) {
                                report.Failure("SOFTWARE_SERVICE", itemPath.Path, e.Message);
                            }
                            if (container == null || container.Software == null) continue;
                            object software = container.Software;
                            if (software is PlcSoftware plc)
                            {
                                if (seenPlcs.Add(plc))
                                {
                                    string folder = "plc/" +
                                        ProjectLlmExport.SafeName(device.Name) + "_" +
                                        deviceIndex + "/" +
                                        ProjectLlmExport.SafeName(plc.Name);
                                    ExportController(report, plc, folder,
                                        device.Name + "/" + plc.Name);
                                }
                            }
                            else if (seenHmi.Add(software))
                            {
                                string softwareName = ReadObjectName(software);
                                string folder = "hmi/" +
                                    ProjectLlmExport.SafeName(device.Name) + "_" +
                                    deviceIndex + "/" +
                                    ProjectLlmExport.SafeName(softwareName);
                                report.Record("SOFTWARE", device.Name,
                                    itemPath.Path, software.GetType().FullName, "");
                                ExportHmiSoftware(report, software, folder,
                                    device.Name + "/" + softwareName);
                            }
                        }
                    }
                    catch (Exception e) {
                        report.Failure("DEVICE_TRAVERSAL", device.Name, e.Message);
                    }
                }
                report.Record("COVERAGE", "Entire opened TIA project", "",
                    "All enumerated devices and Openness-supported objects. "
                    + "Unavailable/protected HMI and hardware data is logged as missing.", "");
                report.Close();
                Console.WriteLine("LLM_PROJECT_EXPORTED|" +
                    SanitizeOutput(project.Name) + "|" +
                    report.Succeeded + "|" + report.Failed);
                return 0;
            }
        }

        private static void ExportController(
            ProjectLlmExport report, PlcSoftware plc, string folder, string owner)
        {
            ExportBlockGroup(report, plc.BlockGroup, folder + "/blocks", owner, "", 0);
            ExportTypeGroup(report, plc.TypeGroup, folder + "/types", owner, "", 0);
            ExportTagGroup(report, plc.TagTableGroup, folder + "/tags", owner, "", 0);
        }

        private static void ExportBlockGroup(
            ProjectLlmExport report, PlcBlockGroup group, string folder,
            string owner, string path, int depth)
        {
            if (depth > 40) { report.Failure("BLOCK_GROUP", owner + "/" + path, "Depth limit"); return; }
            foreach (PlcBlock block in group.Blocks)
            {
                string name = string.IsNullOrEmpty(path) ? block.Name : path + "/" + block.Name;
                report.ExportKnown(block, "PLC_BLOCK", owner + "/" + name,
                    folder + "/" + ProjectLlmExport.SafeName(path) + "/" +
                    ProjectLlmExport.SafeName(block.Name) + ".xml",
                    file => block.Export(file, ExportOptions.WithDefaults));
            }
            foreach (PlcBlockUserGroup child in group.Groups)
                ExportBlockGroup(report, child, folder, owner,
                    string.IsNullOrEmpty(path) ? child.Name : path + "/" + child.Name,
                    depth + 1);
        }

        private static void ExportTypeGroup(
            ProjectLlmExport report, PlcTypeGroup group, string folder,
            string owner, string path, int depth)
        {
            if (depth > 40) { report.Failure("TYPE_GROUP", owner + "/" + path, "Depth limit"); return; }
            foreach (PlcType type in group.Types)
            {
                string name = string.IsNullOrEmpty(path) ? type.Name : path + "/" + type.Name;
                report.ExportKnown(type, "PLC_TYPE", owner + "/" + name,
                    folder + "/" + ProjectLlmExport.SafeName(path) + "/" +
                    ProjectLlmExport.SafeName(type.Name) + ".xml",
                    file => type.Export(file, ExportOptions.WithDefaults));
            }
            foreach (PlcTypeUserGroup child in group.Groups)
                ExportTypeGroup(report, child, folder, owner,
                    string.IsNullOrEmpty(path) ? child.Name : path + "/" + child.Name,
                    depth + 1);
        }

        private static void ExportTagGroup(
            ProjectLlmExport report, PlcTagTableGroup group, string folder,
            string owner, string path, int depth)
        {
            if (depth > 40) { report.Failure("TAG_GROUP", owner + "/" + path, "Depth limit"); return; }
            foreach (PlcTagTable table in group.TagTables)
            {
                string name = string.IsNullOrEmpty(path) ? table.Name : path + "/" + table.Name;
                string filename = folder + "/" + ProjectLlmExport.SafeName(path) + "/" +
                                  ProjectLlmExport.SafeName(table.Name) + ".tsv";
                report.WriteTagTable(filename, owner + "/" + name, table);
            }
            foreach (PlcTagTableUserGroup child in group.Groups)
                ExportTagGroup(report, child, folder, owner,
                    string.IsNullOrEmpty(path) ? child.Name : path + "/" + child.Name,
                    depth + 1);
        }

        private static void ExportHmiSoftware(
            ProjectLlmExport report, object software, string folder, string owner)
        {
            // V21 Classic and Unified expose different object models; reflection
            // prevents loading HMI namespaces that may be absent on a machine.
            // A read-only export is attempted for each object and failures are
            // always recorded. Unrecognized roots remain visible in missing.tsv.
            string[] roots = {
                "ScreenFolder", "Screens", "ScreenTemplates", "PopupScreens",
                "TagFolder", "TagTableFolder", "TagTables", "TextLists",
                "Connections", "ConnectionFolder", "Scripts", "ScriptFolder",
                "GlobalScripts", "Alarms", "AlarmClasses", "Recipes",
                "GraphicLists", "HmiTextLists", "ScreensGroup"
            };
            var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
            bool foundRoot = false;
            foreach (string root in roots)
            {
                object value = ProjectLlmExport.ReadProperty(software, root);
                if (value == null) continue;
                foundRoot = true;
                ExportReflectiveTree(report, value, folder + "/" +
                    ProjectLlmExport.SafeName(root), owner + "/" + root, seen, 0);
            }
            if (!foundRoot)
                report.Failure("HMI_EXPORT", owner,
                    "No supported Classic/Unified export collection was accessible");
        }

        private static readonly string[] HmiChildren = {
            "Groups", "Screens", "ScreenTemplates", "PopupScreens",
            "TagTables", "Tags", "TextLists", "Connections", "Scripts",
            "GlobalScripts", "Functions", "Items", "Alarms", "Recipes",
            "GraphicLists", "Folders", "ScreenFolders", "TagsGroup"
        };

        private static void ExportReflectiveTree(
            ProjectLlmExport report, object value, string folder,
            string description, HashSet<object> seen, int depth)
        {
            if (value == null) return;
            if (depth > 20) { report.Failure("HMI_DEPTH", description, "Depth limit"); return; }
            if (value is string) return;
            if (value is IEnumerable enumerable)
            {
                int index = 0;
                try
                {
                    foreach (object item in enumerable)
                    {
                        if (index++ >= 5000) {
                            report.Failure("HMI_ITEMS", description, "5000 item limit");
                            break;
                        }
                        ExportReflectiveTree(report, item, folder, description, seen, depth + 1);
                    }
                }
                catch (Exception e) { report.Failure("HMI_ENUM", description, e.Message); }
                return;
            }
            if (!seen.Add(value)) return;
            string name = ProjectLlmExport.ReadProperty(value, "Name") as string
                          ?? value.GetType().Name;
            string objectPath = description + "/" + name;
            bool children = false;
            foreach (string key in HmiChildren)
            {
                object child = ProjectLlmExport.ReadProperty(value, key);
                if (child == null || ReferenceEquals(child, value)) continue;
                children = true;
                ExportReflectiveTree(report, child,
                    folder + "/" + ProjectLlmExport.SafeName(name),
                    objectPath + "/" + key, seen, depth + 1);
            }
            if (ProjectLlmExport.HasExportMethod(value))
                report.ExportReflective(value, "HMI_OBJECT", objectPath,
                    folder + "/" + ProjectLlmExport.SafeName(name) + ".xml");
            else if (!children)
                report.Failure("HMI_UNSUPPORTED", objectPath,
                    "Openness object has no supported XML Export method");
        }

        private sealed class ProjectLlmExport
        {
            private readonly string root;
            private readonly StreamWriter inventory;
            private readonly StreamWriter missing;
            private int index;
            public int Succeeded { get; private set; }
            public int Failed { get; private set; }

            public ProjectLlmExport(string folder)
            {
                root = Path.GetFullPath(folder);
                inventory = new StreamWriter(Path.Combine(root, "TIA_OBJECTS.tsv"),
                    false, new UTF8Encoding(false));
                missing = new StreamWriter(Path.Combine(root, "TIA_MISSING.tsv"),
                    false, new UTF8Encoding(false));
                inventory.WriteLine("Kind\tObject\tPath\tMetadata\tFile");
                missing.WriteLine("Kind\tObject\tReason");
            }

            public static string SafeName(string input)
            {
                if (string.IsNullOrWhiteSpace(input)) return "root";
                string value = new string(input.Select(c =>
                    char.IsLetterOrDigit(c) && c < 128 || c == '-' || c == '_' || c == '.'
                        ? c : '_').ToArray()).Trim('.', '_');
                return value.Length > 72 ? value.Substring(0, 72) :
                    (value.Length == 0 ? "unnamed" : value);
            }

            private static string Field(string value)
            {
                return (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
            }

            public void Record(string kind, string name, string path, string meta, string file)
            {
                inventory.WriteLine(string.Join("\t", new[] {
                    Field(kind), Field(name), Field(path), Field(meta), Field(file)
                }));
            }

            public void Failure(string kind, string name, string reason)
            {
                Failed++;
                missing.WriteLine(string.Join("\t", new[] {
                    Field(kind), Field(name), Field(reason)
                }));
            }

            private string Allocate(string relativePath)
            {
                index++;
                string folder = Path.GetDirectoryName(relativePath) ?? "";
                string name = Path.GetFileNameWithoutExtension(relativePath);
                string ext = Path.GetExtension(relativePath);
                string unique = Path.Combine(folder, index.ToString("D6") + "_" + name + ext);
                string absolute = Path.GetFullPath(Path.Combine(root, unique));
                if (!absolute.StartsWith(root + Path.DirectorySeparatorChar,
                        StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Unsafe export path");
                Directory.CreateDirectory(Path.GetDirectoryName(absolute));
                return absolute;
            }

            public void ExportKnown(object item, string kind, string name,
                string path, Action<FileInfo> export)
            {
                string file = "";
                try
                {
                    string absolute = Allocate(path);
                    export(new FileInfo(absolute));
                    if (!File.Exists(absolute) || new FileInfo(absolute).Length == 0)
                        throw new InvalidDataException("Export returned no XML");
                    file = absolute.Substring(root.Length + 1).Replace('\\', '/');
                    Succeeded++;
                }
                catch (Exception e) { Failure(kind, name, e.GetBaseException().Message); }
                Record(kind, name, "", item.GetType().Name, file);
            }

            public void WriteTagTable(string path, string name, PlcTagTable table)
            {
                string file = "";
                try
                {
                    string absolute = Allocate(path);
                    using (var output = new StreamWriter(absolute, false, new UTF8Encoding(false)))
                    {
                        output.WriteLine("Name\tType\tAddress");
                        foreach (PlcTag tag in table.Tags)
                        {
                            output.WriteLine(string.Join("\t", new[] {
                                Field(tag.Name), Field(tag.DataTypeName),
                                Field(tag.LogicalAddress)
                            }));
                        }
                    }
                    file = absolute.Substring(root.Length + 1).Replace('\\', '/');
                    Succeeded++;
                }
                catch (Exception e) { Failure("PLC_TAG_TABLE", name, e.Message); }
                Record("PLC_TAG_TABLE", name, "", "tab-separated tags", file);
            }

            public static object ReadProperty(object item, string name)
            {
                try { return item.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
                    ?.GetValue(item, null); }
                catch { return null; }
            }

            public static bool HasExportMethod(object item)
            {
                return item.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
                    .Any(m => m.Name == "Export" && m.GetParameters().Length >= 1);
            }

            public void ExportReflective(object item, string kind, string name, string path)
            {
                try
                {
                    string absolute = Allocate(path);
                    var methods = item.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Where(m => m.Name == "Export").OrderBy(m => m.GetParameters().Length);
                    bool invoked = false;
                    foreach (MethodInfo method in methods)
                    {
                        ParameterInfo[] args = method.GetParameters();
                        object first = null;
                        if (args.Length == 0 || args.Length > 2) continue;
                        if (args[0].ParameterType == typeof(FileInfo))
                            first = new FileInfo(absolute);
                        else if (args[0].ParameterType == typeof(string))
                            first = absolute;
                        else continue;
                        object[] arguments;
                        if (args.Length == 1) arguments = new[] { first };
                        else if (args[1].ParameterType == typeof(ExportOptions))
                            arguments = new[] { first, (object)ExportOptions.WithDefaults };
                        else continue;
                        method.Invoke(item, arguments);
                        invoked = true;
                        break;
                    }
                    if (!invoked || !File.Exists(absolute))
                        throw new NotSupportedException("No compatible Export overload or output");
                    Succeeded++;
                    Record(kind, name, "", item.GetType().FullName,
                        absolute.Substring(root.Length + 1).Replace('\\', '/'));
                }
                catch (Exception e) { Failure(kind, name, e.GetBaseException().Message); }
            }

            public void Close()
            {
                inventory.Flush();
                missing.Flush();
                inventory.Dispose();
                missing.Dispose();
            }
        }

        private sealed class ReferenceEqualityComparer : IEqualityComparer<object>
        {
            public static readonly ReferenceEqualityComparer Instance = new ReferenceEqualityComparer();
            public new bool Equals(object a, object b) { return ReferenceEquals(a, b); }
            public int GetHashCode(object a) {
                return System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(a);
            }
        }
    }
}
