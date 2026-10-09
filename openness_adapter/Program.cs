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


                    case "list-plcs":
                        return ListPlcs(args);


                    case "create-plc":
                        return CreatePlc(args);


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
            if (args.Length < 2)
            {
                Console.Error.WriteLine(
                    "TIA process PID is required."
                );

                return 1;
            }


            if (
                !int.TryParse(
                    args[1],
                    out int processId
                )
            )
            {
                Console.Error.WriteLine(
                    "PID must be an integer."
                );

                return 1;
            }


            return TiaService.InspectProcess(
                processId
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


            if (
                !int.TryParse(
                    args[1],
                    out int processId
                )
            )
            {
                Console.Error.WriteLine(
                    "PID must be an integer."
                );

                return 1;
            }


            return TiaService.ListPlcModels(
                processId,
                args[2]
            );
        }


        private static int CreatePlc(
            string[] args
        )
        {
            if (args.Length < 3)
            {
                Console.Error.WriteLine(
                    "PID and PLC selection are required."
                );

                return 1;
            }


            if (
                !int.TryParse(
                    args[1],
                    out int processId
                )
            )
            {
                Console.Error.WriteLine(
                    "PID must be an integer."
                );

                return 1;
            }


            string selection =
                args[2];


            string plcName =
                args.Length >= 4
                    ? args[3]
                    : "PLC_1";


            string deviceName =
                args.Length >= 5
                    ? args[4]
                    : plcName;


            return TiaService.CreatePlc(
                processId,
                selection,
                plcName,
                deviceName
            );
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
                "  list-plcs <PID> <PLC_FAMILY>"
            );

            Console.WriteLine(
                "  create-plc <PID> <TYPE_IDENTIFIER_OR_ORDER_NUMBER> [PLC_NAME] [DEVICE_NAME]"
            );
        }
    }
}