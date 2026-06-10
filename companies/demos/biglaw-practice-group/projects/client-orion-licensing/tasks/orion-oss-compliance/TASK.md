---
name: Orion Firmware OSS Compliance Review
slug: orion-oss-compliance
assignee: chief-of-staff
project: client-orion-licensing
---

Open-source compliance review of the firmware dependency list for Orion Photonics' next lidar firmware release. Synthetic dependency list for this demo: liblumen-core 3.2 (GPL-3.0), beamtrace 1.8 (GPL-3.0), aperture-rt 4.0 (Apache-2.0), fictive-dsp 2.1 (Apache-2.0), microquat 0.9 (MIT), pellucid-json 5.4 (MIT), and one entry — vendorlib-x 1.0 — with no license metadata at all.

Assess each entry against Orion's intended distribution model: firmware shipped embedded in hardware, with no source distribution planned. The two GPL-3.0 entries are the pressure point — analyze copyleft exposure for embedded distribution and the available remediation paths (replace, isolate, or seek alternative licensing from the upstream project). The unidentified vendorlib-x license is a blocking operator follow-up before the release can be cleared.
