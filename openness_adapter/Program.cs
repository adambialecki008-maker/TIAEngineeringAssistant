using System;
using System.IO;
using System.Reflection;
using System.Text;

namespace TiaOpennessAdapter
{
    internal static class Program
    {
        private static readonly string PublicApiPath =
            @"C:\Program Files\Siemens\Automation\Portal V21\PublicAPI\V21\net48";


        private static int Main(
            string[] args
        )
        {
            Console.OutputEncoding =
                new UTF8Encoding(false);

            Console.InputEncoding =
                Encoding.UTF8;


            AppDomain.CurrentDomain.AssemblyResolve +=
                ResolveSiemensAssembly;


            try
            {
                if (args.Length == 0)
                {
                    PrintUsage();
                    return 1;
                }


                string command =
                    args[0]
                        .Trim()
                        .ToLowerInvariant();


                switch (command)
                {
                    case "list":
                        return TiaService.ListProcesses();


                    case "inspect":
                        return Inspect(args);


                    case "list-project-plcs":
                        return ListProjectPlcs(args);


                    case "list-project-languages":
                        return ListProjectLanguages(args);


                    case "add-project-language":
                        return AddProjectLanguage(args);


                    case "export-project-texts":
                        return ExportProjectTexts(args);

                    case "export-hmi-text-lists":
                        return ExportHmiTextLists(args);

                    case "import-hmi-text-list":
                        return ImportHmiTextList(args);


                    case "import-project-texts":
                        return ImportProjectTexts(args);


                    case "list-plcs":
                        return ListPlcs(args);


                    case "list-io":
                        return ListIo(args);


                    case "list-tags":
                        return ListTags(args);


                    case "list-structures":
                        return ListStructures(args);


                    case "list-program-blocks":
                        return ListProgramBlocks(args);


                    case "export-structure":
                        return ExportStructure(args);


                    case "export-program-block":
                        return ExportProgramBlock(args);

                    case "plc-cross-references":
                        return PlcCrossReferences(args);


                    case "create-tags":
                        return CreateTags(args);


                    case "create-plc":
                        return CreatePlc(args);


                    case "rename-plc":
                        return RenamePlc(args);


                    case "delete-plc":
                        return DeletePlc(args);


                    default:
                        Console.Error.WriteLine(
                            $"Unknown command: {command}"
                        );

                        PrintUsage();

                        return 1;
                }
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(
                    exception.ToString()
                );

                return 10;
            }
        }


        private static int Inspect(
            string[] args
        )
        {
            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.InspectProcess(
                processId
            );
        }


        private static int ListProjectPlcs(
            string[] args
        )
        {
            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListProjectPlcs(
                processId
            );
        }


        private static int ListProjectLanguages(
            string[] args
        )
        {
            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListProjectLanguages(
                processId
            );
        }


        private static int AddProjectLanguage(
            string[] args
        )
        {
            if (args.Length < 3)
            {
                Console.Error.WriteLine(
                    "PID and culture name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.AddProjectLanguage(
                processId,
                args[2]
            );
        }


        private static int ImportHmiTextList(string[] args)
        {
            if (args.Length != 6)
            {
                Console.Error.WriteLine(
                    "PID, DEVICE_NAME, HMI_NAME, LIST_NAME, XML_FILE are required."
                );
                return 1;
            }
            if (!TryReadProcessId(args, out int processId)) return 1;
            return TiaService.ImportHmiTextList(
                processId, args[2], args[3], args[4], args[5]
            );
        }

        private static int ExportHmiTextLists(string[] args)
        {
            if (args.Length != 5)
            {
                Console.Error.WriteLine(
                    "PID, DEVICE_NAME, HMI_NAME, OUTPUT_DIRECTORY are required."
                );
                return 1;
            }
            if (!TryReadProcessId(args, out int processId))
            {
                return 1;
            }
            return TiaService.ExportHmiTextLists(
                processId, args[2], args[3], args[4]
            );
        }

        private static int ExportProjectTexts(
            string[] args
        )
        {
            if (args.Length < 5)
            {
                Console.Error.WriteLine(
                    "PID, source culture, target culture and output file are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ExportProjectTexts(
                processId,
                args[2],
                args[3],
                args[4]
            );
        }


        private static int ImportProjectTexts(
            string[] args
        )
        {
            if (args.Length < 4)
            {
                Console.Error.WriteLine(
                    "PID, input file and update-source flag are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            if (
                !bool.TryParse(
                    args[3],
                    out bool updateSourceLanguage
                )
            )
            {
                Console.Error.WriteLine(
                    "Update-source flag must be true or false."
                );

                return 1;
            }


            return TiaService.ImportProjectTexts(
                processId,
                args[2],
                updateSourceLanguage
            );
        }


        private static int ListPlcs(
            string[] args
        )
        {
            if (args.Length < 3)
            {
                Console.Error.WriteLine(
                    "PID and PLC family are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListPlcModels(
                processId,
                args[2]
            );
        }


        private static int ListIo(
            string[] args
        )
        {
            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListProjectIo(
                processId
            );
        }


        private static int ListTags(
            string[] args
        )
        {
            if (args.Length < 4)
            {
                Console.Error.WriteLine(
                    "PID, device name and PLC name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListPlcTags(
                processId,
                args[2],
                args[3]
            );
        }


        private static int ListStructures(
            string[] args
        )
        {
            if (args.Length < 4)
            {
                Console.Error.WriteLine(
                    "PID, device name and PLC name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ListPlcStructures(
                processId,
                args[2],
                args[3]
            );
        }


        private static int ListProgramBlocks(
            string[] args
        )
        {
            if (args.Length < 4)
            {
                Console.Error.WriteLine(
                    "PID, device name and PLC name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            bool programOnly =
                args.Length >= 5
                && string.Equals(
                    args[4], "program-only",
                    StringComparison.OrdinalIgnoreCase
                );

            return TiaService.ListPlcProgramBlocks(
                processId,
                args[2],
                args[3],
                programOnly
            );
        }


        private static int ExportStructure(
            string[] args
        )
        {
            if (args.Length < 8)
            {
                Console.Error.WriteLine(
                    "PID, device name, PLC name, structure kind, group path, name and output file are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ExportPlcStructure(
                processId,
                args[2],
                args[3],
                args[4],
                args[5],
                args[6],
                args[7]
            );
        }


        private static int ExportProgramBlock(
            string[] args
        )
        {
            if (args.Length < 7)
            {
                Console.Error.WriteLine(
                    "PID, device name, PLC name, group path, block name and output file are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.ExportPlcProgramBlock(
                processId,
                args[2],
                args[3],
                args[4],
                args[5],
                args[6]
            );
        }


        private static int PlcCrossReferences(string[] args)
        {
            if (args.Length < 8)
            {
                Console.Error.WriteLine(
                    "PID, device, PLC, kind, group, block name and member path are required.");
                return 1;
            }
            if (!TryReadProcessId(args, out int processId)) return 1;
            return TiaService.GetPlcCrossReferences(
                processId, args[2], args[3], args[4], args[5], args[6], args[7]);
        }

        private static int CreateTags(
            string[] args
        )
        {
            if (args.Length < 6)
            {
                Console.Error.WriteLine(
                    "PID, device name, PLC name, tag table name and tag file are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.CreatePlcTags(
                processId,
                args[2],
                args[3],
                args[4],
                args[5]
            );
        }


        private static int CreatePlc(
            string[] args
        )
        {
            if (args.Length < 5)
            {
                Console.Error.WriteLine(
                    "PID, PLC selection, PLC name and device name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.CreatePlc(
                processId,
                args[2],
                args[3],
                args[4]
            );
        }


        private static int RenamePlc(
            string[] args
        )
        {
            if (args.Length < 6)
            {
                Console.Error.WriteLine(
                    "PID, current device name, current PLC name, "
                    +
                    "new device name and new PLC name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.RenamePlc(
                processId,
                args[2],
                args[3],
                args[4],
                args[5]
            );
        }


        private static int DeletePlc(
            string[] args
        )
        {
            if (args.Length < 4)
            {
                Console.Error.WriteLine(
                    "PID, device name and PLC name are required."
                );

                return 1;
            }


            if (!TryReadProcessId(
                args,
                out int processId
            ))
            {
                return 1;
            }


            return TiaService.DeletePlc(
                processId,
                args[2],
                args[3]
            );
        }


        private static bool TryReadProcessId(
            string[] args,
            out int processId
        )
        {
            processId = 0;


            if (args.Length < 2)
            {
                Console.Error.WriteLine(
                    "TIA process PID is required."
                );

                return false;
            }


            if (
                !int.TryParse(
                    args[1],
                    out processId
                )
            )
            {
                Console.Error.WriteLine(
                    "PID must be an integer."
                );

                return false;
            }


            return true;
        }


        private static Assembly ResolveSiemensAssembly(
            object sender,
            ResolveEventArgs args
        )
        {
            AssemblyName requestedAssembly =
                new AssemblyName(
                    args.Name
                );


            string filePath =
                Path.Combine(
                    PublicApiPath,
                    requestedAssembly.Name
                    + ".dll"
                );


            if (
                !File.Exists(
                    filePath
                )
            )
            {
                return null;
            }


            return Assembly.LoadFrom(
                filePath
            );
        }


        private static void PrintUsage()
        {
            Console.WriteLine(
                "TIA Openness Adapter"
            );

            Console.WriteLine();

            Console.WriteLine(
                "Commands:"
            );

            Console.WriteLine(
                "  list"
            );

            Console.WriteLine(
                "  inspect <PID>"
            );

            Console.WriteLine(
                "  list-project-plcs <PID>"
            );

            Console.WriteLine(
                "  list-project-languages <PID>"
            );

            Console.WriteLine(
                "  add-project-language <PID> <CULTURE>"
            );

            Console.WriteLine(
                "  export-project-texts <PID> <SOURCE_CULTURE> <TARGET_CULTURE> <OUTPUT_FILE>"
            );

            Console.WriteLine(
                "  export-hmi-text-lists <PID> <DEVICE_NAME> <HMI_NAME> <OUTPUT_DIRECTORY> (read-only Classic XML)"
            );
            Console.WriteLine(
                "  import-hmi-text-list <PID> <DEVICE_NAME> <HMI_NAME> <LIST_NAME> <XML_FILE> (reviewed only)"
            );

            Console.WriteLine(
                "  import-project-texts <PID> <INPUT_FILE> <UPDATE_SOURCE:true|false>"
            );

            Console.WriteLine(
                "  list-plcs <PID> <PLC_FAMILY>"
            );

            Console.WriteLine(
                "  list-io <PID>"
            );

            Console.WriteLine(
                "  list-tags <PID> <DEVICE_NAME> <PLC_NAME>"
            );

            Console.WriteLine(
                "  list-structures <PID> <DEVICE_NAME> <PLC_NAME>"
            );

            Console.WriteLine(
                "  list-program-blocks <PID> <DEVICE_NAME> <PLC_NAME>"
            );

            Console.WriteLine(
                "  export-structure <PID> <DEVICE_NAME> <PLC_NAME> <db|udt> <GROUP_PATH> <NAME> <OUTPUT_FILE>"
            );

            Console.WriteLine(
                "  export-program-block <PID> <DEVICE_NAME> <PLC_NAME> <GROUP_PATH> <BLOCK_NAME> <OUTPUT_FILE>"
            );
            Console.WriteLine(
                "  plc-cross-references <PID> <DEVICE_NAME> <PLC_NAME> <OB|FB|FC|DB|UDT> <GROUP_PATH> <NAME> <MEMBER_PATH>"
            );

            Console.WriteLine(
                "  create-tags <PID> <DEVICE_NAME> <PLC_NAME> <TAG_TABLE_NAME> <TAG_FILE>"
            );

            Console.WriteLine(
                "  create-plc <PID> <TYPE_IDENTIFIER_OR_ORDER_NUMBER> <PLC_NAME> <DEVICE_NAME>"
            );

            Console.WriteLine(
                "  rename-plc <PID> <CURRENT_DEVICE_NAME> <CURRENT_PLC_NAME> <NEW_DEVICE_NAME> <NEW_PLC_NAME>"
            );

            Console.WriteLine(
                "  delete-plc <PID> <DEVICE_NAME> <PLC_NAME>"
            );
        }
    }
}
