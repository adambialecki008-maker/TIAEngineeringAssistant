using System;
using System.Collections.Generic;

using Siemens.Engineering;

namespace TiaOpennessAdapter
{
    internal static partial class TiaService
    {
        // Use the installed TIA V21 hardware catalog as the source of truth.
        // TypeIdentifier contains the order number (and sometimes a /version);
        // CatalogEntry.TypeName is the human-readable device model.
        private static string ReadHmiModelName(
            TiaPortal portal,
            string typeIdentifier,
            IDictionary<string, string> cache)
        {
            if (string.IsNullOrWhiteSpace(typeIdentifier))
            {
                return "";
            }

            if (cache.TryGetValue(typeIdentifier, out string known))
            {
                return known;
            }

            string result = "";
            const string prefix = "OrderNumber:";
            if (typeIdentifier.StartsWith(
                prefix, StringComparison.OrdinalIgnoreCase))
            {
                string article = typeIdentifier.Substring(prefix.Length).Trim();
                int slashIndex = article.IndexOf('/');
                if (slashIndex >= 0)
                {
                    article = article.Substring(0, slashIndex).Trim();
                }

                string normalized = NormalizeOrderNumber(article);
                if (normalized.Length > 0)
                {
                    try
                    {
                        foreach (var entry in portal.HardwareCatalog.Find(
                            FormatCatalogSearchCode(article)))
                        {
                            if (string.Equals(
                                NormalizeOrderNumber(entry.ArticleNumber),
                                normalized,
                                StringComparison.OrdinalIgnoreCase)
                                && !string.IsNullOrWhiteSpace(entry.TypeName))
                            {
                                result = entry.TypeName.Trim();
                                break;
                            }
                        }
                    }
                    catch
                    {
                        // A project can contain an older/HSP device absent
                        // from the locally installed hardware catalog. Never
                        // guess the model from the HMI device or software name.
                    }

                    // Verified Siemens catalog designation, used only when
                    // the local TIA hardware catalog cannot return a name.
                    // Keep this exact-match fallback small and unambiguous.
                    if (string.IsNullOrWhiteSpace(result)
                        && string.Equals(normalized,
                            "6AV21240QC020AX1", StringComparison.Ordinal))
                    {
                        result = "TP1500 Comfort";
                    }
                }
            }

            cache[typeIdentifier] = result;
            return result;
        }
    }
}
