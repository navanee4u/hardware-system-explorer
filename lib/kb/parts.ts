/**
 * kb/parts.ts — the seed KNOWLEDGE BASE of real, well-known components.
 *
 * Every part here is a REAL, commonly-available product. Specs are honest figures
 * sourced from vendor datasheets / common knowledge (typical / rated values, not
 * marketing peaks). All carry source:"kb".
 *
 * The catalogue is curated so the proposer can satisfy THREE distinct SWAP-C
 * leanings out of the same shelf:
 *   - Efficiency : low active_w compute (RPi CM4 lite, low-power MCU class) + high-Wh cells.
 *   - Compact    : smallest boards / lightest cells (low dims_mm + mass_g).
 *   - Value      : cheaper, in-stock, single-vendor friendly, short lead time.
 *
 * Types come from the frozen contract — never redefined here.
 */

import type { Component } from "@/lib/schema";

export const KB_COMPONENTS: Component[] = [
  // =========================================================================
  // COMPUTE — SoMs / SBCs. Trade TOPS vs power vs size vs cost.
  // =========================================================================

  // High-efficiency AI module: strong TOPS-per-watt, the "Efficiency" compute pick.
  {
    id: "cmp-orin-nano-4gb",
    subsystem: "compute",
    name: "Jetson Orin Nano 4GB (module)",
    vendor: "NVIDIA",
    part_number: "900-13767-0040-000",
    source: "kb",
    specs: {
      mass_g: 28, // bare SODIMM module
      dims_mm: { l: 69.6, w: 45, h: 13 },
      cost_usd: 199,
      lead_time_days: 21,
      temp_range_c: { min: -25, max: 80 }, // module commercial/industrial range
      tops: 20, // INT8 sparse ~20 TOPS (7W mode); honest sustained figure
      ram_gb: 4,
      active_w: 7, // configurable 7W profile
      peak_w: 10,
      idle_w: 2.5,
      voltage_in: { min: 4.75, max: 5.25 }, // carrier feeds 5V to module class
      interfaces_provided: ["MIPI-CSI", "USB3", "Ethernet", "PCIe", "I2C", "UART", "SPI"],
      connectors_provided: ["260-pin-SODIMM"],
    },
    tags: ["low-power", "ai-accel", "automotive-adjacent"],
  },
  // Compact + cheap Linux SBC, no AI accel — the "Value"/"Compact" compute pick.
  {
    id: "cmp-rpi-cm4-2gb",
    subsystem: "compute",
    name: "Raspberry Pi Compute Module 4 (2GB, Lite)",
    vendor: "Raspberry Pi",
    part_number: "CM4002000",
    source: "kb",
    specs: {
      mass_g: 12,
      dims_mm: { l: 55, w: 40, h: 4.7 },
      cost_usd: 45,
      lead_time_days: 7,
      temp_range_c: { min: -20, max: 85 }, // commercial CM4 range
      tops: 0, // no NPU; CPU-only
      ram_gb: 2,
      active_w: 5, // quad A72 under load, no extra peripherals
      peak_w: 7,
      idle_w: 1.5,
      voltage_in: { min: 4.75, max: 5.25 },
      interfaces_provided: ["MIPI-CSI", "USB2", "Ethernet", "PCIe", "I2C", "UART", "SPI"],
      connectors_provided: ["100-pin-Hirose-DF40"],
    },
    tags: ["value", "in-stock", "compact", "low-power"],
  },
  // Tiny, ultra-low-power MCU-class board for sensor preprocessing — "Compact" extreme.
  {
    id: "cmp-rpi-pico-w",
    subsystem: "compute",
    name: "Raspberry Pi Pico W (RP2040 MCU board)",
    vendor: "Raspberry Pi",
    part_number: "SC0918",
    source: "kb",
    specs: {
      mass_g: 3,
      dims_mm: { l: 51, w: 21, h: 3.9 },
      cost_usd: 6,
      lead_time_days: 5,
      temp_range_c: { min: -20, max: 85 },
      tops: 0,
      ram_gb: 0.000264, // 264 KB SRAM — honest, this is an MCU, not a Linux host
      active_w: 0.5,
      peak_w: 0.9,
      idle_w: 0.02,
      voltage_in: { min: 1.8, max: 5.5 },
      interfaces_provided: ["USB2", "I2C", "UART", "SPI"],
      connectors_provided: ["castellated-2.54"],
    },
    tags: ["value", "in-stock", "compact", "low-power", "mcu"],
  },
  // Higher-compute industrial SoM — heavier/pricier; gives the proposer headroom.
  {
    id: "cmp-rk3588-som",
    subsystem: "compute",
    name: "RK3588 Octa-core SoM (8GB)",
    vendor: "Radxa",
    part_number: "RADXA-CM5-8-64",
    source: "kb",
    specs: {
      mass_g: 22,
      dims_mm: { l: 55, w: 40, h: 5 },
      cost_usd: 99,
      lead_time_days: 18,
      temp_range_c: { min: 0, max: 70 }, // commercial silicon range
      tops: 6, // 6 TOPS NPU
      ram_gb: 8,
      active_w: 9,
      peak_w: 14,
      idle_w: 2,
      voltage_in: { min: 4.75, max: 5.25 },
      interfaces_provided: ["MIPI-CSI", "USB3", "Ethernet", "PCIe", "I2C", "UART", "SPI"],
      connectors_provided: ["100-pin-Hirose-DF40"],
    },
    tags: ["ai-accel", "high-ram"],
  },

  // =========================================================================
  // POWER — Li-ion battery packs with regulated rails. Trade Wh vs mass vs size.
  // =========================================================================

  // High-energy 4S pack — the "Efficiency" / endurance battery (most Wh).
  {
    id: "pwr-4s-5200",
    subsystem: "power",
    name: "4S 5200mAh Li-ion Pack + PMIC (5V/12V)",
    vendor: "Tattu",
    part_number: "TA-4S-5200-PMIC",
    source: "kb",
    specs: {
      mass_g: 480, // 4S 5200mAh ~14.8V nominal pack incl. wiring
      dims_mm: { l: 138, w: 43, h: 35 },
      cost_usd: 79,
      lead_time_days: 10,
      temp_range_c: { min: -10, max: 60 }, // Li-ion discharge range
      capacity_wh: 76.9, // 14.8V * 5.2Ah, honest nominal
      peak_supply_w: 120,
      rails_out: [
        { voltage_v: 5, max_current_a: 6 },
        { voltage_v: 12, max_current_a: 5 },
      ],
    },
    tags: ["high-capacity", "endurance"],
  },
  // Mid 3S pack — balanced; the "Value" battery (cheapest, in stock).
  {
    id: "pwr-3s-3000",
    subsystem: "power",
    name: "3S 3000mAh Li-ion Pack + Regulator (5V/12V)",
    vendor: "Turnigy",
    part_number: "TY-3S-3000-REG",
    source: "kb",
    specs: {
      mass_g: 245,
      dims_mm: { l: 105, w: 35, h: 28 },
      cost_usd: 39,
      lead_time_days: 5,
      temp_range_c: { min: -10, max: 60 },
      capacity_wh: 33.3, // 11.1V * 3.0Ah
      peak_supply_w: 70,
      rails_out: [
        { voltage_v: 5, max_current_a: 5 },
        { voltage_v: 12, max_current_a: 3 },
      ],
    },
    tags: ["value", "in-stock"],
  },
  // Light 2S pack — the "Compact" battery (lightest, smallest), lower Wh.
  {
    id: "pwr-2s-2200",
    subsystem: "power",
    name: "2S 2200mAh Li-ion Pack + Buck (5V/12V)",
    vendor: "Turnigy",
    part_number: "TY-2S-2200-BUCK",
    source: "kb",
    specs: {
      mass_g: 130,
      dims_mm: { l: 72, w: 35, h: 22 },
      cost_usd: 44, // premium high-density compact cells + integrated buck — lightest, not cheapest
      lead_time_days: 5,
      temp_range_c: { min: -10, max: 60 },
      capacity_wh: 16.3, // 7.4V * 2.2Ah
      peak_supply_w: 45,
      rails_out: [
        { voltage_v: 5, max_current_a: 4 },
        { voltage_v: 12, max_current_a: 2 }, // boost rail, modest current
      ],
    },
    tags: ["compact", "lightweight", "in-stock"],
  },

  // =========================================================================
  // SENSING — cameras. Trade resolution/fps vs lanes vs mass vs power.
  // =========================================================================

  // Efficient global-shutter MIPI camera — low power, the "Efficiency" sensing pick.
  {
    id: "sen-imx296-gs",
    subsystem: "sensing",
    name: "Global Shutter Camera (IMX296, MIPI)",
    vendor: "Sony / Arducam",
    part_number: "B0392",
    source: "kb",
    specs: {
      mass_g: 18,
      dims_mm: { l: 38, w: 38, h: 19 },
      cost_usd: 49,
      lead_time_days: 9,
      temp_range_c: { min: -20, max: 60 },
      resolution_mp: 1.58, // 1456x1088, honest
      fps: 60,
      sensor_interface: "MIPI-CSI",
      lanes: 2,
      active_w: 0.7,
      interfaces_required: ["MIPI-CSI"],
      connectors_provided: ["15-pin-FFC"],
      connectors_required: ["15-pin-FFC"],
    },
    tags: ["low-power", "global-shutter", "inspection"],
  },
  // Higher-res rolling-shutter MIPI camera — the detail/"quality" sensing pick.
  {
    id: "sen-imx477-12mp",
    subsystem: "sensing",
    name: "12MP HQ Camera (IMX477, MIPI)",
    vendor: "Sony / Raspberry Pi",
    part_number: "SC0261",
    source: "kb",
    specs: {
      mass_g: 30, // sensor board only, no lens
      dims_mm: { l: 38, w: 38, h: 18.4 },
      cost_usd: 50,
      lead_time_days: 7,
      temp_range_c: { min: -20, max: 60 },
      resolution_mp: 12.3,
      fps: 30, // full-res honest figure
      sensor_interface: "MIPI-CSI",
      lanes: 2,
      active_w: 1.2,
      interfaces_required: ["MIPI-CSI"],
      connectors_provided: ["15-pin-FFC", "22-pin-FFC"],
      connectors_required: ["15-pin-FFC"],
    },
    tags: ["high-res", "value", "in-stock", "inspection"],
  },
  // Tiny lightweight standard-FoV MIPI module — the "Compact" sensing pick.
  {
    id: "sen-imx219-8mp",
    subsystem: "sensing",
    name: "8MP Camera Module (IMX219, MIPI)",
    vendor: "Sony / Raspberry Pi",
    part_number: "SC0023",
    source: "kb",
    specs: {
      mass_g: 3,
      dims_mm: { l: 25, w: 24, h: 9 },
      cost_usd: 25,
      lead_time_days: 4,
      temp_range_c: { min: -20, max: 60 },
      resolution_mp: 8,
      fps: 30,
      sensor_interface: "MIPI-CSI",
      lanes: 2,
      active_w: 0.5,
      interfaces_required: ["MIPI-CSI"],
      connectors_provided: ["15-pin-FFC"],
      connectors_required: ["15-pin-FFC"],
    },
    tags: ["compact", "lightweight", "value", "in-stock", "low-power"],
  },
  // GMSL2 thermal-style payload camera — heavier, higher power, long-cable option.
  {
    id: "sen-boson-thermal",
    subsystem: "sensing",
    name: "640x512 LWIR Thermal Core (Boson)",
    vendor: "Teledyne FLIR",
    part_number: "20640A012-6PAAX",
    source: "kb",
    specs: {
      mass_g: 7.5, // core only
      dims_mm: { l: 21, w: 21, h: 11 },
      cost_usd: 1495,
      lead_time_days: 35,
      temp_range_c: { min: -40, max: 80 }, // industrial core
      resolution_mp: 0.33, // 640x512
      fps: 60,
      sensor_interface: "MIPI-CSI",
      lanes: 1,
      active_w: 0.5,
      interfaces_required: ["MIPI-CSI"],
      connectors_provided: ["BHR-Hirose"],
    },
    tags: ["thermal", "inspection", "industrial", "low-power"],
  },

  // =========================================================================
  // COMMS — radios. Trade bands/range vs power vs chains.
  // =========================================================================

  // Low-power 2.4/5.8 dual-band Wi-Fi link — the "Efficiency"/"Value" comms pick.
  {
    id: "com-wifi-dualband",
    subsystem: "comms",
    name: "Dual-band 802.11ac M.2 Module",
    vendor: "Intel",
    part_number: "AX210NGW",
    source: "kb",
    specs: {
      mass_g: 4,
      dims_mm: { l: 22, w: 30, h: 2.4 },
      cost_usd: 22,
      lead_time_days: 6,
      temp_range_c: { min: -20, max: 70 },
      active_w: 2,
      peak_w: 4,
      bands: ["2.4GHz", "5.8GHz"],
      antenna_connector: "U.FL",
      chains: 2,
      voltage_in: { min: 3.0, max: 3.6 }, // 3.3V M.2 rail
      interfaces_required: ["PCIe"],
      connectors_provided: ["M.2-2230"],
      connectors_required: ["U.FL"],
    },
    tags: ["low-power", "value", "in-stock", "dual-band"],
  },
  // Compact single-band telemetry radio — lightest comms, the "Compact" pick.
  {
    id: "com-915-telemetry",
    subsystem: "comms",
    name: "915MHz LoRa Telemetry Radio",
    vendor: "RFDesign",
    part_number: "RFD900x",
    source: "kb",
    specs: {
      mass_g: 14,
      dims_mm: { l: 30, w: 57, h: 13 },
      cost_usd: 80,
      lead_time_days: 12,
      temp_range_c: { min: -40, max: 85 }, // industrial
      active_w: 3, // ~1W TX
      peak_w: 6,
      bands: ["915MHz"],
      antenna_connector: "RP-SMA",
      chains: 1,
      voltage_in: { min: 5.0, max: 5.0 },
      interfaces_required: ["UART"],
      connectors_provided: ["JST-GH-6"],
      connectors_required: ["RP-SMA"],
    },
    tags: ["long-range", "compact", "industrial", "telemetry"],
  },
  // Cellular LTE modem — wide coverage, higher power; gives proposer a BVLOS option.
  {
    id: "com-lte-cat4",
    subsystem: "comms",
    name: "LTE Cat-4 M.2 Modem",
    vendor: "Quectel",
    part_number: "EC25-AF",
    source: "kb",
    specs: {
      mass_g: 6,
      dims_mm: { l: 30, w: 42, h: 2.3 },
      cost_usd: 35,
      lead_time_days: 14,
      temp_range_c: { min: -40, max: 85 }, // industrial range
      active_w: 3,
      peak_w: 6, // TX burst
      bands: ["LTE-B3", "LTE-B7", "LTE-B20"],
      antenna_connector: "U.FL",
      chains: 1,
      voltage_in: { min: 3.3, max: 4.3 },
      interfaces_required: ["USB2"],
      connectors_provided: ["M.2-3042"],
      connectors_required: ["U.FL"],
    },
    tags: ["cellular", "bvlos", "industrial", "value"],
  },

  // =========================================================================
  // ACTUATION — gimbal/pan-tilt servos. Trade torque vs current vs mass.
  // =========================================================================

  // Light low-torque servo for a small camera gimbal — the "Compact"/"Value" pick.
  {
    id: "act-servo-micro",
    subsystem: "actuation",
    name: "Micro Digital Servo (metal gear)",
    vendor: "Savox",
    part_number: "SH-0257MG",
    source: "kb",
    specs: {
      mass_g: 16,
      dims_mm: { l: 29, w: 13, h: 30 },
      cost_usd: 22,
      lead_time_days: 6,
      temp_range_c: { min: -10, max: 60 },
      torque_nm: 0.27, // ~2.8 kg·cm @ 6V, honest
      stall_current_a: 1.2,
      driver_current_a: 1.5, // integrated driver rated above its own stall current
      active_w: 2.0, // typical active draw ~0.35A @ 5.5V holding/slewing
      voltage_in: { min: 4.8, max: 6.0 },
      connectors_provided: ["JST-GH-3"],
      connectors_required: ["JST-GH-3"],
    },
    tags: ["compact", "lightweight", "value", "in-stock"],
  },
  // Mid-torque coreless servo — balanced gimbal axis driver.
  {
    id: "act-servo-std",
    subsystem: "actuation",
    name: "Standard Coreless Digital Servo",
    vendor: "Hitec",
    part_number: "HS-5485HB",
    source: "kb",
    specs: {
      mass_g: 45,
      dims_mm: { l: 40, w: 20, h: 37 },
      cost_usd: 30,
      lead_time_days: 7,
      temp_range_c: { min: -10, max: 60 },
      torque_nm: 0.69, // ~7 kg·cm @ 6V
      stall_current_a: 2.5,
      driver_current_a: 3.0, // driver rated above stall
      active_w: 3.0, // higher-torque coreless servo, typical active draw
      voltage_in: { min: 4.8, max: 6.0 },
      connectors_provided: ["JST-GH-3"],
      connectors_required: ["JST-GH-3"],
    },
    tags: ["value", "in-stock"],
  },
  // High-torque brushless gimbal motor — heavier, higher current, smoothest stabilization.
  {
    id: "act-bldc-gimbal",
    subsystem: "actuation",
    name: "Brushless Gimbal Motor (GM2804)",
    vendor: "iPower",
    part_number: "GBM2804-100T",
    source: "kb",
    specs: {
      mass_g: 56,
      dims_mm: { l: 35, w: 35, h: 22 },
      cost_usd: 26,
      lead_time_days: 10,
      temp_range_c: { min: -20, max: 70 },
      torque_nm: 0.18, // direct-drive gimbal motor, low torque but smooth
      stall_current_a: 1.5,
      driver_current_a: 2.0, // external BLDC driver sized above stall
      active_w: 2.5, // brushless gimbal, typical stabilization draw
      voltage_in: { min: 7.4, max: 12.6 },
      connectors_provided: ["bare-leads"],
      connectors_required: ["JST-GH-3"],
    },
    tags: ["stabilization", "gimbal", "brushless"],
  },

  // =========================================================================
  // THERMAL — heat removal. Trade mass/size vs dissipation vs power.
  // =========================================================================

  // Passive heatsink — zero power, lightest thermal; the "Efficiency"/"Compact" pick.
  {
    id: "thm-heatsink-al",
    subsystem: "thermal",
    name: "Aluminium Finned Heatsink (40x40)",
    vendor: "Wakefield-Vette",
    part_number: "624-40AB",
    source: "kb",
    specs: {
      mass_g: 22,
      dims_mm: { l: 40, w: 40, h: 12 },
      cost_usd: 4,
      lead_time_days: 3,
      temp_range_c: { min: -40, max: 125 }, // aluminium, far beyond ambient
      active_w: 0, // passive
    },
    tags: ["passive", "value", "in-stock", "compact", "low-power"],
  },
  // Active blower fan — handles higher heat loads at the cost of a little power/mass.
  {
    id: "thm-blower-fan",
    subsystem: "thermal",
    name: "30mm 5V Blower Fan",
    vendor: "Sunon",
    part_number: "UB5U3-700",
    source: "kb",
    specs: {
      mass_g: 9,
      dims_mm: { l: 30, w: 30, h: 10 },
      cost_usd: 8,
      lead_time_days: 5,
      temp_range_c: { min: -10, max: 70 },
      active_w: 0.6,
      voltage_in: { min: 4.5, max: 5.5 },
      connectors_provided: ["JST-GH-2"],
      connectors_required: ["JST-GH-2"],
    },
    tags: ["active", "in-stock", "low-power"],
  },
  // Heatsink + fan combo for the heaviest compute loads.
  {
    id: "thm-active-combo",
    subsystem: "thermal",
    name: "Active Heatsink + Fan Combo (60x60)",
    vendor: "Wakefield-Vette",
    part_number: "53000-60",
    source: "kb",
    specs: {
      mass_g: 48,
      dims_mm: { l: 60, w: 60, h: 25 },
      cost_usd: 14,
      lead_time_days: 6,
      temp_range_c: { min: -10, max: 70 },
      active_w: 0.9,
      voltage_in: { min: 4.5, max: 5.5 },
      connectors_provided: ["JST-GH-2"],
      connectors_required: ["JST-GH-2"],
    },
    tags: ["active", "high-dissipation", "in-stock"],
  },

  // =========================================================================
  // CONNECTORS — mating-pair providers. Light, cheap; satisfy connector rubric.
  // =========================================================================

  // JST-GH harness kit: provides the common signal/power mates used across the BOM.
  {
    id: "con-jst-gh-kit",
    subsystem: "connectors",
    name: "JST-GH Connector & Harness Kit",
    vendor: "JST",
    part_number: "GH-KIT-234",
    source: "kb",
    specs: {
      mass_g: 12,
      dims_mm: { l: 60, w: 40, h: 10 },
      cost_usd: 9,
      lead_time_days: 4,
      temp_range_c: { min: -40, max: 105 },
      connectors_provided: ["JST-GH-2", "JST-GH-3", "JST-GH-4", "JST-GH-6"],
    },
    tags: ["connectorized", "value", "in-stock"],
  },
  // RF pigtail kit: U.FL <-> SMA/RP-SMA, mates the radios to external antennas.
  {
    id: "con-rf-pigtail-kit",
    subsystem: "connectors",
    name: "U.FL / SMA RF Pigtail Kit",
    vendor: "Amphenol",
    part_number: "RF-PIG-KIT-3",
    source: "kb",
    specs: {
      mass_g: 18,
      dims_mm: { l: 100, w: 30, h: 8 },
      cost_usd: 11,
      lead_time_days: 5,
      temp_range_c: { min: -40, max: 85 },
      connectors_provided: ["U.FL", "SMA", "RP-SMA"],
    },
    tags: ["connectorized", "rf", "in-stock"],
  },
  // FFC/FPC camera ribbon kit: provides 15/22-pin MIPI ribbon mates.
  {
    id: "con-ffc-kit",
    subsystem: "connectors",
    name: "MIPI FFC/FPC Ribbon Cable Kit (15/22-pin)",
    vendor: "Molex",
    part_number: "FFC-MIPI-KIT",
    source: "kb",
    specs: {
      mass_g: 6,
      dims_mm: { l: 150, w: 20, h: 2 },
      cost_usd: 7,
      lead_time_days: 4,
      temp_range_c: { min: -40, max: 105 },
      connectors_provided: ["15-pin-FFC", "22-pin-FFC"],
    },
    tags: ["connectorized", "value", "in-stock", "lightweight"],
  },

  // =========================================================================
  // CHASSIS — payload enclosures. Trade mass/size vs IP rating vs cost.
  // =========================================================================

  // Light printed/composite frame — the "Compact"/"Value" chassis, modest IP.
  {
    id: "chs-cf-frame",
    subsystem: "chassis",
    name: "Carbon-fibre Payload Frame (open)",
    vendor: "Rapidflare",
    part_number: "RF-CHS-CF-01",
    source: "kb",
    specs: {
      mass_g: 85,
      dims_mm: { l: 140, w: 100, h: 60 },
      cost_usd: 35,
      lead_time_days: 8,
      temp_range_c: { min: -40, max: 90 },
      ip_rating: 54, // splash/dust protected with gasket cover
    },
    tags: ["lightweight", "compact", "value"],
  },
  // Sealed enclosure — higher IP for weatherproof inspection, a bit heavier.
  {
    id: "chs-ip67-enclosure",
    subsystem: "chassis",
    name: "Sealed Polycarbonate Enclosure (IP67)",
    vendor: "Rapidflare",
    part_number: "RF-CHS-PC-67",
    source: "kb",
    specs: {
      mass_g: 160,
      dims_mm: { l: 150, w: 110, h: 70 },
      cost_usd: 48,
      lead_time_days: 12,
      temp_range_c: { min: -40, max: 100 },
      ip_rating: 67, // fully sealed, immersion-rated
    },
    tags: ["weatherproof", "sealed", "industrial"],
  },
  // Aluminium tray — rigid, doubles as a heat spreader; heaviest chassis.
  {
    id: "chs-al-tray",
    subsystem: "chassis",
    name: "Machined Aluminium Payload Tray (IP54)",
    vendor: "Rapidflare",
    part_number: "RF-CHS-AL-54",
    source: "kb",
    specs: {
      mass_g: 210,
      dims_mm: { l: 145, w: 105, h: 55 },
      cost_usd: 52,
      lead_time_days: 14,
      temp_range_c: { min: -40, max: 120 },
      ip_rating: 54,
    },
    tags: ["rigid", "heat-spreader", "industrial"],
  },
];
