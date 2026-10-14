using System;
using System.IO;
using System.Linq;

using Siemens.Engineering;
using Siemens.Engineering.Compiler;
using Siemens.Engineering.SW.Blocks;
using Siemens.Engineering.SW.Types;

namespace TiaOpennessAdapter
{
    internal static partial class TiaService
    {
        // Pilot is deliberately limited to one UDT followed by one global DB.
        // GenerateBlocksFromSource can overwrite existing objects. Therefore
        // name collisions are checked again under ExclusiveAccess, immediately
        // before either source is registered.
        public static int ImportPlcStructures(
            int processId,
            string deviceName,
            string plcName,
            string expectedProjectName,
            string udtName,
            string dbName,
            string udtPath,
            string dbPath)
        {
            if (!File.Exists(udtPath) || !File.Exists(dbPath)
                || string.Equals(udtName, dbName,
                    StringComparison.OrdinalIgnoreCase))
            {
                Console.Error.WriteLine("INVALID_PLC_STRUCTURE_IMPORT");
                return 8;
            }

            TiaPortalProcess process = FindProcess(processId);
            if (process == null)
            {
                return WriteProcessNotFound(processId);
            }

            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(portal, out int errorCode);
                if (project == null)
                {
                    return errorCode;
                }

                if (!string.Equals(project.Name, expectedProjectName,
                        StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("PROJECT_CHANGED|"
                        + SanitizeOutput(project.Name));
                    return 9;
                }

                using (ExclusiveAccess access = portal.ExclusiveAccess(
                    "TIA Engineering Assistant: create one UDT and one DB "
                    + "in the selected backup project"))
                {
                    // Do NOT rely on the Python preflight: this is the final
                    // guard against overriding an object elsewhere in folders.
                    PlcTarget target = FindPlcTarget(
                        project, deviceName, plcName);
                    if (target == null)
                    {
                        Console.Error.WriteLine("PLC_NOT_FOUND|"
                            + SanitizeOutput(deviceName) + "|"
                            + SanitizeOutput(plcName));
                        return 7;
                    }

                    bool collision = EnumeratePlcTypes(target.Software)
                        .Any(type =>
                            string.Equals(type.Name, udtName,
                                StringComparison.OrdinalIgnoreCase)
                            || string.Equals(type.Name, dbName,
                                StringComparison.OrdinalIgnoreCase))
                        || EnumeratePlcBlocks(target.Software)
                        .Any(block =>
                            string.Equals(block.Name, dbName,
                                StringComparison.OrdinalIgnoreCase)
                            || string.Equals(block.Name, udtName,
                                StringComparison.OrdinalIgnoreCase));

                    if (collision)
                    {
                        Console.Error.WriteLine("PLC_STRUCTURE_NAME_EXISTS|"
                            + SanitizeOutput(udtName) + "|"
                            + SanitizeOutput(dbName));
                        return 9;
                    }

                    // Separate sources preserve dependency order (UDT -> DB).
                    // Unique source names protect user-owned external sources.
                    GenerateSingleStructureSource(
                        target, udtPath, ".udt");
                    if (!EnumeratePlcTypes(target.Software).Any(type =>
                            string.Equals(type.Name, udtName,
                                StringComparison.OrdinalIgnoreCase)))
                    {
                        Console.Error.WriteLine(
                            "PLC_UDT_NOT_CREATED|" + SanitizeOutput(udtName));
                        return 10;
                    }
                    Console.WriteLine("STRUCTURE_IMPORTED|UDT|"
                        + SanitizeOutput(udtName));

                    GenerateSingleStructureSource(
                        target, dbPath, ".db");
                    if (!EnumeratePlcBlocks(target.Software)
                        .OfType<DataBlock>()
                        .Any(block => string.Equals(
                            block.Name, dbName,
                            StringComparison.OrdinalIgnoreCase)))
                    {
                        Console.Error.WriteLine(
                            "PLC_DB_NOT_CREATED|" + SanitizeOutput(dbName));
                        return 10;
                    }
                    if (!CompileGeneratedDataBlock(EnumeratePlcBlocks(target.Software)
                            .OfType<DataBlock>().Single(block => string.Equals(
                                block.Name, dbName, StringComparison.OrdinalIgnoreCase))))
                        return 10;
                    Console.WriteLine("STRUCTURE_IMPORTED|DB|"
                        + SanitizeOutput(dbName));

                    // Save only after both objects are present.
                    // A generation error can still leave an UNSAVED partial
                    // state in the open project; callers must report this.
                    SaveProject(project);
                }
            }

            return 0;
        }

        // Multi-object create-only import. Preflight checks EVERY selected
        // object under one ExclusiveAccess before generating any SCL source.
        // The manifest is written only by the trusted FastAPI backend:
        // KIND|NAME|ABSOLUTE_PATH (UDTs in dependency order, followed by DBs).
        public static int ImportPlcStructureBatch(
            int processId, string deviceName, string plcName,
            string expectedProjectName, string manifestPath)
        {
            if (!File.Exists(manifestPath))
            {
                Console.Error.WriteLine("STRUCTURE_MANIFEST_MISSING");
                return 8;
            }
            string[][] entries = File.ReadAllLines(manifestPath)
                .Where(line => !string.IsNullOrWhiteSpace(line))
                .Select(line => line.Split(new[] { '|' }, 3))
                .ToArray();
            if (entries.Length == 0
                || entries.Any(e => e.Length != 3
                    || (e[0] != "UDT" && e[0] != "DB")
                    || string.IsNullOrWhiteSpace(e[1])
                    || !File.Exists(e[2]))
                || entries.Select(e => e[1]).Distinct(
                    StringComparer.OrdinalIgnoreCase).Count() != entries.Length)
            {
                Console.Error.WriteLine("INVALID_STRUCTURE_MANIFEST");
                return 8;
            }

            TiaPortalProcess process = FindProcess(processId);
            if (process == null) return WriteProcessNotFound(processId);
            using (TiaPortal portal = process.Attach())
            {
                Project project = GetSingleOpenProject(
                    portal, out int errorCode);
                if (project == null) return errorCode;
                if (!string.Equals(project.Name, expectedProjectName,
                        StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("PROJECT_CHANGED|"
                        + SanitizeOutput(project.Name));
                    return 9;
                }
                using (ExclusiveAccess access = portal.ExclusiveAccess(
                    "TIA Engineering Assistant: verified create-only batch "
                    + "UDT/DB import in a backup project"))
                {
                    PlcTarget target = FindPlcTarget(
                        project, deviceName, plcName);
                    if (target == null)
                    {
                        Console.Error.WriteLine("PLC_NOT_FOUND|"
                            + SanitizeOutput(deviceName) + "|"
                            + SanitizeOutput(plcName));
                        return 7;
                    }
                    // Repeat ALL collision checks inside the final write lock.
                    var present = new System.Collections.Generic.HashSet<string>(
                        StringComparer.OrdinalIgnoreCase);
                    foreach (PlcType t in EnumeratePlcTypes(target.Software))
                        present.Add(t.Name);
                    foreach (PlcBlock b in EnumeratePlcBlocks(target.Software))
                        present.Add(b.Name);
                    foreach (string[] entry in entries)
                    {
                        if (present.Contains(entry[1]))
                        {
                            Console.Error.WriteLine("PLC_STRUCTURE_NAME_EXISTS|"
                                + SanitizeOutput(entry[0]) + "|"
                                + SanitizeOutput(entry[1]));
                            return 9;
                        }
                    }

                    // Error during generation may leave partial UNSAVED changes;
                    // never claim an atomic rollback and never overwrite.
                    foreach (string[] entry in entries)
                    {
                        bool udt = entry[0] == "UDT";
                        GenerateSingleStructureSource(target, entry[2],
                            udt ? ".udt" : ".db");
                        bool created = udt
                            ? EnumeratePlcTypes(target.Software).Any(t =>
                                string.Equals(t.Name, entry[1],
                                    StringComparison.OrdinalIgnoreCase))
                            : EnumeratePlcBlocks(target.Software)
                                .OfType<DataBlock>().Any(b =>
                                string.Equals(b.Name, entry[1],
                                    StringComparison.OrdinalIgnoreCase));
                        if (!created)
                        {
                            Console.Error.WriteLine("PLC_STRUCTURE_NOT_CREATED|"
                                + SanitizeOutput(entry[0]) + "|"
                                + SanitizeOutput(entry[1]));
                            return 10;
                        }
                        if (!udt && !CompileGeneratedDataBlock(
                                EnumeratePlcBlocks(target.Software).OfType<DataBlock>()
                                    .Single(block => string.Equals(block.Name, entry[1],
                                        StringComparison.OrdinalIgnoreCase))))
                            return 10;
                        Console.WriteLine("STRUCTURE_IMPORTED|"
                            + entry[0] + "|" + SanitizeOutput(entry[1]));
                    }
                    SaveProject(project);
                }
            }
            return 0;
        }

        private static bool CompileGeneratedDataBlock(DataBlock block)
        {
            ICompilable compiler = block.GetService<ICompilable>();
            if (compiler == null)
            {
                Console.Error.WriteLine("PLC_DB_COMPILE_UNAVAILABLE|"
                    + SanitizeOutput(block.Name));
                return false;
            }
            CompilerResult result = compiler.Compile();
            WriteStructureCompilerMessages(result.Messages);
            if (result.ErrorCount != 0
                || (result.State != CompilerResultState.Success
                    && result.State != CompilerResultState.Warning))
            {
                Console.Error.WriteLine("PLC_DB_COMPILE_FAILED|"
                    + SanitizeOutput(block.Name) + "|" + result.State
                    + "|" + result.ErrorCount);
                return false;
            }
            Console.WriteLine("STRUCTURE_COMPILED|DB|" + SanitizeOutput(block.Name));
            return true;
        }

        private static void WriteStructureCompilerMessages(
            CompilerResultMessageComposition messages)
        {
            foreach (CompilerResultMessage message in messages)
            {
                Console.WriteLine("STRUCTURE_COMPILE_MESSAGE|" + message.State
                    + "|" + SanitizeOutput(message.Path)
                    + "|" + SanitizeOutput(message.Description));
                WriteStructureCompilerMessages(message.Messages);
            }
        }

        private static void GenerateSingleStructureSource(
            PlcTarget target,
            string sourcePath,
            string extension)
        {
            string sourceName = "TEA_"
                + Guid.NewGuid().ToString("N") + extension;
            var source = target.Software.ExternalSourceGroup
                .ExternalSources.CreateFromFile(sourceName, sourcePath);
            try
            {
                // Default API overload throws on source-generation errors.
                // Never use KeepOnError for this first pilot.
                source.GenerateBlocksFromSource();
            }
            finally
            {
                try
                {
                    source.Delete();
                }
                catch (Exception error)
                {
                    Console.Error.WriteLine("SOURCE_CLEANUP_WARNING|"
                        + SanitizeOutput(error.Message));
                }
            }
        }
    }
}
