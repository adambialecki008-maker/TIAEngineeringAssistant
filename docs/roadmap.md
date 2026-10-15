# Engineering capability roadmap

This file records agreed future capabilities; it is **not an implementation
request**. Prioritize engineering functionality after baseline CI/browser
regressions are reliable. Preserve verified HMI translation workflows unless
a specific reproducible defect is agreed for repair.

## Planned later — Industrial network scanner

**Status: Planned only. Not implemented, not currently scheduled.**

Potential initial scope (to be designed and approved separately):
- User-selected local network interface and explicitly authorized IP/subnet.
- Read-only discovery and inventory for industrial networks, starting with
  device IP, MAC, vendor, device name/type when legitimately exposed.
- Candidate discovery methods to evaluate: ARP/ICMP, PROFINET DCP on the local
  layer-2 segment, and limited, opt-in service checks (S7 TCP/102, OPC UA
  TCP/4840, Modbus TCP/502, EtherNet/IP TCP/44818).
- Operator-friendly results: address, protocol, possible duplicates,
  reachability, comparison/export of a network inventory.
- Conservative defaults: explicit target scope, controlled rate and timeout,
  no broadcast storm, no configuration changes, no writes, no exploitation,
  no PLC downloads, and no probing outside the authorized network.
- Security, discovery fidelity, Windows interface privileges, packet libraries,
  and Siemens-specific support need design review before work starts.

**Before implementation:** agree on protocols, target devices, test network,
permissions and acceptance criteria. Add isolated tests using mocked traffic
before trying discovery on production equipment.

## Current near-term engineering direction

1. Improve regression coverage around the existing UDT/DB editor with
   Playwright/Chromium CI; do not rewrite application code to satisfy tests.
2. Resume engineering capability development after tests stabilize.
3. Leave network scanning as a separate future milestone until explicitly
   approved.
