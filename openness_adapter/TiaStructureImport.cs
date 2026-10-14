using System;
using System.IO;
using System.Linq;

using Siemens.Engineering;
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
