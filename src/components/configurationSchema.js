/**
 * Configuration Schema for Mesh Radio Device
 * 
 * This file defines the complete configuration structure for a mesh radio device,
 * including tabs, sections, fields, display mappings, and fallback values.
 * 
 * The schema is organized by functional areas (RF, Network, Data, Audio, Security, GPS)
 * and supports various field types including toggles, selects, text inputs, numbers,
 * sliders, and specialized managers for complex data structures.
 */

// Main navigation tabs for the configuration UI
export const TABS = [
  { id: "rf", label: "RF", description: "Radio, frequency, power", icon: "RF" },
  { id: "network", label: "Network", description: "IP, DHCP, routing", icon: "IP" },
  { id: "data", label: "Data", description: "Serial interfaces", icon: "IO" },
  { id: "audio", label: "Audio", description: "Voice and PTT", icon: "PT" },
  { id: "security", label: "Security", description: "Encryption settings", icon: "LK" },
  { id: "gps", label: "GPS", description: "Positioning settings", icon: "GPS" },
  { id: "global", label: "Global", description: "All update-all-node settings", icon: "GL" },
];

// Set of configuration keys that are considered global/shared across multiple sections
// Used for quick lookups and validation
export const GLOBAL_CONFIG_KEYS = new Set([
  "audioAppMode",
  "audioCodecType",
  "dataCompressionMode",
  "dataEncryptionKey",
  "dataEncryptionMode",
  "dataTransferMode",
  "enableBurstAggregation",
  "enableDualSpan",
  "enableHeterogeneousNetwork",
  "enableRangeAdaptive",
  "enableRssiCtrl",
  "enduserName",
  "freqDefault",
  "freqList",
  "freqMode",
  "ipMulticastFilterMode",
  "mcMode",
  "meshName",
  "minTF",
  "multicastPreferred",
  "networkMode",
  "ocl",
  "rangeMode",
  "span",
  "stdmaMode",
  "userName",
]);

export const CHIP_LEVEL_BANDWIDTH_OPTIONS = {
  0: ["1.25MHz", "2.5MHz", "5MHz", "10MHz"],
  0.5: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz"],
  1: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz"],
  1.5: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz", "40MHz"],
  2: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz", "40MHz"],
};

// RF (Radio Frequency) configuration sections
// Organized into Basic, Advance, and Expert categories
export const RF_SECTIONS = [
  {
    title: "RF Basic",
    className: "configuration-card-rf-basic",
    gridClassName: "configuration-grid-wide",
    layoutGroups: [
      {
        title: "Core Parameters",
        fields: ["freqMode", "freqDefault", "span", "rangeMode"],
      },
      {
        title: "Dual Settings",
        fields: ["enableDualFreq", "enableDualSpan", "freqDefaultTx", "spanTx"],
      },
    ],
    fields: [
      { key: "enableDualFreq", label: "Dual RF Mode", type: "toggle", hint: "Show TX Frequency when enabled" },
      { key: "enableDualSpan", label: "Dual Bandwidth Mode", type: "toggle", hint: "Show TX Bandwidth when enabled" },
      {
        key: "freqMode",
        label: "RF Mode",
        type: "select",
        options: ["Fixed", "Roam", "Fast Frequency Hop (FFH)", "Intelligent Avoidance (IA)", "Enhanced Intelligent Avoidance (EIA)", "Dynamic Frequency Hopping (DFH)"],
        optionLicenses: {
          "Fast Frequency Hop (FFH)": "licenseFreqHopping",
          "Intelligent Avoidance (IA)": "licenseFreqSmart",
          "Enhanced Intelligent Avoidance (EIA)": "licenseFreqSmartAdvanced",
          "Dynamic Frequency Hopping (DFH)": "licenseAdaptiveFreqHopping",
        },
      },
      { key: "freqDefault", label: "Frequency", type: "frequency", listKey: "freqList", defaultKey: "freqDefault" },
      { id: "freqDefaultTx", key: "freqDefault", label: "TX Frequency", type: "frequency", listKey: "freqListTx", defaultKey: "freqDefault", visibleWhen: { key: "enableDualFreq", values: ["true", "on"] } },
      { key: "span", label: "Bandwidth", type: "select", options: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz", "40MHz"], chipLevelOptions: true },
      { key: "spanTx", label: "TX Bandwidth", type: "select", options: ["1.25MHz", "2.5MHz", "5MHz", "10MHz", "20MHz", "40MHz"], chipLevelOptions: true, visibleWhen: { key: "enableDualSpan", values: ["true", "on"] } },
      { key: "rangeMode", label: "Range", type: "select", options: ["10Km", "25Km", "70Km", "100Km"] },
    ],
  },
  {
    title: "RF Advance",
    fields: [
      { key: "enableRssiCtrl", label: "RSSI Control", type: "toggle", hint: "Transmission power control" },
      { key: "stdmaMode", label: "STDMA", type: "toggle", visibleWhen: { key: "licenseSdma", values: ["true", "on"] } },
      { key: "enableRangeAdaptive", label: "Adaptive Range Mode", type: "toggle", visibleWhen: { key: "licenseRangeAdaptive", values: ["true", "on"] } },
      { key: "enableBurstAggregation", label: "Burst Aggregation Mode", type: "toggle", visibleWhen: { key: "licenseBurstAggregation", values: ["true", "on"] } },
      { key: "enableFEC", label: "Interference Resistance Mode", type: "toggle", visibleWhen: { key: "licenseAntiInterference", values: ["true", "on"] } },
      { key: "powerOutput", label: "Power Output", type: "antennaPower" },
      { key: "transmissionMode", label: "Transmission Mode", type: "select", options: ["Auto", "Diversity", "MIMO"] },
    ],
  },
  {
    title: "RF Expert",
    fields: [
      { key: "silence", label: "Silence", type: "toggle", visibleWhen: { key: "licenseSilence", values: ["true", "on"] } },
      { key: "wakeupNodes", label: "Awake Nodes", type: "nodeList", hint: "Comma-separated node IDs. Use 255 to wake all.", visibleWhen: { key: "licenseSilence", values: ["true", "on"] } },
      { key: "forbiddenFreqBands", label: "Restricted Frequencies", type: "restrictedFrequencyManager", hint: "Manage restricted frequency ranges" },
      { key: "linkSnrThreshold", label: "SNR Threshold (dB)", type: "number", min: -10, max: 30, step: 1, hint: "Links below this SNR are filtered" },
      { key: "minTF", label: "Minimum Modulation Format", type: "select", options: ["QPSK 1/16FEC", "QPSK 1/6FEC", "QPSK 1/3FEC", "QPSK 2/3FEC", "16QAM 1/3FEC", "16QAM 2/3FEC", "64QAM 1/3FEC", "64QAM 2/3FEC", "256QAM 1/3FEC", "256QAM 2/3FEC", "1024QAM 1/2FEC", "1024QAM 2/3FEC", "1024QAM 3/4FEC", "Only for lab testing"] },
      { key: "mcFormats", label: "Custom Modulation", type: "modulationManager", hint: "Manage node-specific modulation codes" },
      { key: "disableNodeId", label: "Disconnect Nodes", type: "nodeListManager", hint: "Manage node IDs, 0 to 252" },
      { key: "sendToSilenceNodes", label: "Broadcast to Silent", type: "toggle" },
      { key: "rfDisable", label: "RF Switch", type: "select", options: ["All RF Enable", "RF 1 Disable", "RF 2 Disable", "All RF Disable"] },
    ],
  },
];

// Network configuration sections
// Covers identity, addressing, DHCP, advanced networking, SNMP, routing, interfaces, and filtering
export const NETWORK_SECTIONS = [
  {
    title: "Network Identity",
    fields: [
      { key: "meshName", label: "Mesh ID", type: "text" },
      { key: "name", label: "Node Name", type: "text" },
      { key: "id", label: "Node ID", type: "number" },
    ],
  },
  {
    title: "Addressing",
    fields: [
      { key: "ip", label: "IP Address (IP)", type: "text" },
      { key: "nwMask", label: "Netmask", type: "text" },
      { key: "gateway", label: "Gateway", type: "text" },
    ],
  },
  {
    title: "DHCP Server",
    fields: [
      { key: "dhcpServerEnable", label: "DHCP Server", type: "toggle" },
      { key: "dhcpForwardEnable", label: "DHCP Forward", type: "toggle" },
      { key: "wifiDhcpAddressStart", label: "DHCP Start", type: "text" },
      { key: "wifiDhcpAddressEnd", label: "DHCP End", type: "text" },
      { key: "dhcpAddressMask", label: "DHCP Netmask", type: "text" },
      { key: "dhcpServerGateway", label: "DHCP Gateway", type: "text" },
      { key: "dhcpServerDns", label: "DHCP DNS", type: "text" },
    ],
  },
  {
    title: "Network Optimization",
    fields: [
      { key: "dataCompressionMode", label: "Data Compression", type: "select", options: ["Disable", "Enable"] },
      { key: "enableHeterogeneousNetwork", label: "Heterogeneous Network", type: "toggle" },
      { key: "disableDSCP", label: "Disable DSCP", type: "toggle", hint: "Controls DSCP/TOS IP packet prioritization." },
      { key: "ethDisable", label: "Disable Ethernet Port", type: "select", options: ["Enable Both", "Disable eth0", "Disable eth1", "Disable Both"], minDeviceVersion: "2.13" },
      { key: "maxResRatio", label: "Maximum Resources Ratio", type: "number", min: 0, max: 100, step: 1, minDeviceVersion: "2.13" },
      { key: "ocl", label: "OCL", type: "networkListManager", hint: "Manage ordered telemetry and control chain node IDs." },
    ],
  },
  {
    title: "SNMP",
    fields: [
      { key: "enableSnmpAgent", label: "SNMP Agent", type: "toggle" },
      { key: "snmpPort", label: "SNMP Port", type: "number", min: 1, max: 65535, step: 1 },
      { key: "trapTargetIP", label: "Trap Target IP", type: "text" },
      { key: "trapTargetPort", label: "Trap Target Port", type: "number", min: 1, max: 65535, step: 1 },
      { key: "trapKey", label: "Trap Key", type: "networkListManager", hint: "Manage SNMP trap keys." },
      { key: "trapInterval", label: "Trap Interval", type: "number", min: 1, step: 1 },
    ],
  },
  {
    title: "Routing And Priority",
    fields: [
      { key: "routes", label: "Static Routes", type: "networkListManager", hint: "Manage route node paths." },
      { key: "ipPrioritylist", label: "IP Priority List", type: "networkListManager", hint: "Manage address priority rules." },
      { key: "servicePrioritylist", label: "Service Priority List", type: "networkListManager", hint: "Manage TCP/UDP service priority rules." },
      { key: "dscpPrioritylist", label: "DSCP Priority List", type: "networkListManager", hint: "Manage DSCP priority rules." },
      { key: "arpDefendList", label: "ARP Defence List", type: "networkListManager", hint: "Manage ARP request protection rules." },
    ],
  },
  {
    title: "Network Interfaces",
    fields: [
      { key: "netIfConfig", label: "Network Port", type: "networkListManager", hint: "Manage interface mode and addressing." },
    ],
  },
  {
    title: "Broadcast Filtering",
    fields: [
      { key: "ipBroadcastFilterMode", label: "Broadcast Filtering Mode", type: "select", options: ["Whitelist Mode", "Blacklist Mode"] },
      { key: "ipBroadcastWhitelist", label: "Whitelist Broadcast IP", type: "networkListManager", hint: "Manage allowed broadcast ports." },
      { key: "ipBroadcastBlacklist", label: "Blacklist Broadcast IP", type: "networkListManager", hint: "Manage blocked broadcast ports." },
    ],
  },
  {
    title: "Multicast Filtering",
    fields: [
      { key: "ipMulticastFilterMode", label: "Multicast Filtering Mode", type: "select", options: ["Whitelist Mode", "Blacklist Mode", "IGMP Mode"] },
      { key: "ipMulticastWhitelist", label: "Whitelist Multicast IP", type: "networkListManager", hint: "Manage allowed multicast services." },
      { key: "ipMulticastBlacklist", label: "Blacklist Multicast IP", type: "networkListManager", hint: "Manage blocked multicast addresses." },
      { key: "ipMulticastIncomingWhitelist", label: "Whitelist Incoming Multicast IP", type: "networkListManager", hint: "Manage allowed incoming multicast addresses." },
      { key: "ipMulticastIncomingBlacklist", label: "Blacklist Incoming Multicast IP", type: "networkListManager", hint: "Manage blocked incoming multicast addresses." },
    ],
  },
];

// Data configuration sections
// Covers UART serial interface settings
export const DATA_SECTIONS = [
  {
    title: "RS232",
    fields: [
      {
        key: "uartMode0",
        label: "RS232 Mode",
        type: "select",
        options: [
          "Disable",
          "GPS",
          "UDP",
          "TCP Server",
          "TCP Client",
          "Management",
          "Battery State of Charge",
          "External Voice",
          "1.2Kbps Voice",
          "2.4Kbps Voice",
        ],
      },
      { key: "uartBaudrate0", label: "RS232 Baudrate", type: "number", min: 400, max: 460800, step: 1 },
      { key: "uartParitybits0", label: "RS232 Parity Bits", type: "select", options: ["No Parity", "Odd Parity", "Even Parity"] },
      { key: "uartFrameInterval0", label: "RS232 Frame Interval", type: "number", min: 0, max: 1000, step: 0.01, hint: "Milliseconds. 0 means real-time serial data." },
      { key: "uartIp0", label: "RS232 IP Destination", type: "text" },
      { key: "uartPort0", label: "RS232 Port", type: "number", min: 1024, max: 65535, step: 1 },
      { key: "uartPortB0", label: "RS232 Port B", type: "number", min: 0, max: 65535, step: 1, hint: "Use 0 or 1024-65535." },
    ],
  },
  {
    title: "TTL",
    fields: [
      {
        key: "uartMode1",
        label: "TTL Mode",
        type: "select",
        options: [
          "Disable",
          "GPS",
          "UDP",
          "TCP Server",
          "TCP Client",
          "Management",
          "Battery State of Charge",
          "External Voice",
          "1.2Kbps Voice",
          "2.4Kbps Voice",
        ],
      },
      { key: "uartBaudrate1", label: "TTL Baudrate", type: "number", min: 400, max: 460800, step: 1 },
      { key: "uartParitybits1", label: "TTL Parity Bits", type: "select", options: ["No Parity", "Odd Parity", "Even Parity"] },
      { key: "uartFrameInterval1", label: "TTL Frame Interval", type: "number", min: 0, max: 1000, step: 0.01, hint: "Milliseconds. 0 means real-time serial data." },
      { key: "uartIp1", label: "TTL IP Destination", type: "text" },
      { key: "uartPort1", label: "TTL Port", type: "number", min: 1024, max: 65535, step: 1 },
      { key: "uartPortB1", label: "TTL Port B", type: "number", min: 0, max: 65535, step: 1, hint: "Use 0 or 1024-65535." },
    ],
  },
  {
    title: "RS485",
    fields: [
      {
        key: "uartMode2",
        label: "RS485 Mode",
        type: "select",
        options: [
          "Disable",
          "GPS",
          "UDP",
          "TCP Server",
          "TCP Client",
          "Management",
          "Battery State of Charge",
          "External Voice",
          "1.2Kbps Voice",
          "2.4Kbps Voice",
        ],
      },
      { key: "uartBaudrate2", label: "RS485 Baudrate", type: "number", min: 400, max: 460800, step: 1 },
      { key: "uartParitybits2", label: "RS485 Parity Bits", type: "select", options: ["No Parity", "Odd Parity", "Even Parity"] },
      { key: "uartFrameInterval2", label: "RS485 Frame Interval", type: "number", min: 0, max: 1000, step: 0.01, hint: "Milliseconds. 0 means real-time serial data." },
      { key: "uartIp2", label: "RS485 IP Destination", type: "text" },
      { key: "uartPort2", label: "RS485 Port", type: "number", min: 1024, max: 65535, step: 1 },
      { key: "uartPortB2", label: "RS485 Port B", type: "number", min: 0, max: 65535, step: 1, hint: "Use 0 or 1024-65535." },
    ],
  },
];

// GPS configuration sections
// Covers positioning module selection and fixed fallback coordinates
export const GPS_SECTIONS = [
  {
    title: "GPS",
    fields: [
      {
        key: "positionModuleMode",
        label: "Position Module Mode",
        type: "select",
        options: ["GNSS Multi-System", "GPS", "BDS", "GLONASS", "Galileo"],
      },
      { key: "presetLatitude", label: "Preset Latitude", type: "number", min: -90, max: 90, step: 0.000001 },
      { key: "presetLongitude", label: "Preset Longitude", type: "number", min: -180, max: 180, step: 0.000001 },
      { key: "presetAltitude", label: "Preset Altitude", type: "number", min: -9999.9, max: 9999.9, step: 0.1 },
    ],
  },
];

// Audio configuration sections
// Covers voice settings, codecs, and PTT (Push-to-Talk) functionality
export const AUDIO_SECTIONS = [
  {
    title: "Audio",
    fields: [
      { key: "enableCrossNetworkAudio", label: "Cross Network Audio", type: "toggle" },
      { key: "audioAppMode", label: "Audio Mode", type: "select", options: ["Conference", "PTT"] },
      {
        key: "audioCodecType",
        label: "Audio Codec",
        type: "select",
        options: [
          "Built-in AMR 4.8Kbps",
          "External serial audio",
          "External 1.2K serial audio",
          "External 2.4K serial audio",
        ],
      },
      { key: "audioMicGain", label: "Audio Mic Gain", type: "slider", min: 0, max: 100, step: 1 },
      { key: "audioHeadGain", label: "Audio Headset Gain", type: "slider", min: 0, max: 100, step: 1 },
      { key: "audioMuteLevel", label: "Audio Detection Threshold", type: "slider", min: 0, max: 100, step: 1 },
      { key: "talkPTTGroupId", label: "Audio PTT Talk Group", type: "number", min: 0, max: 15, step: 1 },
      { key: "listenPTTGroupId", label: "Audio PTT Listen Group", type: "nodeList", hint: "Comma-separated groups, 0 to 15. Leave empty to use talk group." },
    ],
  },
];

// Security configuration sections
// Covers encryption settings and authentication
export const SECURITY_SECTIONS = [
  {
    title: "Security",
    fields: [
      {
        key: "dataEncryptionMode",
        label: "Encryption Mode",
        type: "select",
        options: ["AES256", "AES128", "DES", "Disable"],
        optionLicenses: {
          AES256: "licenseDataEncryptionAES256",
          AES128: "licenseDataEncryptionAES128",
        },
      },
      { key: "dataEncryptionKey", label: "Password", type: "password" },
    ],
  },
];

// Master configuration sections mapping
// Maps tab IDs to their respective section definitions
export const CONFIG_SECTIONS = {
  rf: RF_SECTIONS,
  network: NETWORK_SECTIONS,
  data: DATA_SECTIONS,
  audio: AUDIO_SECTIONS,
  security: SECURITY_SECTIONS,
  gps: GPS_SECTIONS,
};

function getFieldGlobalKeys(field) {
  if (field.type === "frequency") {
    return [field.defaultKey || field.key, field.listKey || "freqList"];
  }

  return [field.key];
}

function buildGlobalConfigSections() {
  return Object.entries(CONFIG_SECTIONS)
    .filter(([tabId]) => tabId !== "global")
    .flatMap(([tabId, sections]) =>
      sections
        .map((section) => {
          const seenFields = new Set();
          const fields = section.fields
            .filter((field) =>
              getFieldGlobalKeys(field).some((key) => GLOBAL_CONFIG_KEYS.has(key)),
            )
            .filter((field) => {
              const fieldId = field.id || field.key;
              if (seenFields.has(fieldId)) return false;
              seenFields.add(fieldId);
              return true;
            })
            .map((field) => ({ ...field }));

          if (!fields.length) return null;

          const tab = TABS.find((item) => item.id === tabId);
          return {
            sourceTabId: tabId,
            title: `${tab?.label || tabId} / ${section.title}`,
            className: section.className,
            gridClassName: section.gridClassName,
            description: section.description || tab?.description,
            fields,
          };
        })
        .filter(Boolean),
    );
}

CONFIG_SECTIONS.global = buildGlobalConfigSections();

/**
 * DISPLAY_VALUE: Maps numeric or string values to human-readable display labels
 * 
 * This mapping is used to convert raw configuration values (often numeric codes)
 * into user-friendly display strings in the UI.
 * 
 * Each key corresponds to a configuration field, and its value is a mapping
 * from raw values to display strings.
 */
export const DISPLAY_VALUE = {
  freqMode: {
    single: "Fixed",
    roaming: "Roam",
    hop: "Fast Frequency Hop (FFH)",
    hop2: "Slow Frequency Hop (SFH)",
    smart: "Intelligent Avoidance (IA)",
    smartAdvanced: "Enhanced Intelligent Avoidance (EIA)",
    smartadvanced: "Enhanced Intelligent Avoidance (EIA)",
    adaptiveHopping: "Dynamic Frequency Hopping (DFH)",
  },
  span: {
    0: "2.5MHz",
    1: "5MHz",
    2: "10MHz",
    3: "20MHz",
    4: "10/20MHz",
    5: "40MHz",
    6: "300KHz",
    7: "30MHz",
    8: "1.25MHz",
    9: "250KHz",
    10: "500KHz",
    11: "1MHz",
    12: "80MHz",
  },
  spanTx: {
    0: "2.5MHz",
    1: "5MHz",
    2: "10MHz",
    3: "20MHz",
    4: "10/20MHz",
    5: "40MHz",
    6: "300KHz",
    7: "30MHz",
    8: "1.25MHz",
    9: "250KHz",
    10: "500KHz",
    11: "1MHz",
    12: "80MHz",
  },
  rangeMode: {
    10: "10Km",
    25: "25Km",
    70: "70Km",
    100: "100Km",
  },
  dataEncryptionMode: {
    0: "Disable",
    1: "AES256",
    2: "AES128",
    3: "DES",
  },
  dataCompressionMode: {
    0: "Disable",
    1: "Enable",
  },
  ethDisable: {
    0: "Enable Both",
    1: "Disable eth0",
    2: "Disable eth1",
    3: "Disable Both",
  },
  ipBroadcastFilterMode: {
    0: "Whitelist Mode",
    1: "Blacklist Mode",
  },
  ipMulticastFilterMode: {
    0: "Whitelist Mode",
    1: "Blacklist Mode",
    2: "IGMP Mode",
  },
  uartMode0: {
    "-1": "Disable",
    0: "GPS",
    1: "UDP",
    2: "TCP Server",
    3: "TCP Client",
    4: "Management",
    5: "Battery State of Charge",
    6: "External Voice",
    7: "1.2Kbps Voice",
    8: "2.4Kbps Voice",
  },
  uartMode1: {
    "-1": "Disable",
    0: "GPS",
    1: "UDP",
    2: "TCP Server",
    3: "TCP Client",
    4: "Management",
    5: "Battery State of Charge",
    6: "External Voice",
    7: "1.2Kbps Voice",
    8: "2.4Kbps Voice",
  },
  uartMode2: {
    "-1": "Disable",
    0: "GPS",
    1: "UDP",
    2: "TCP Server",
    3: "TCP Client",
    4: "Management",
    5: "Battery State of Charge",
    6: "External Voice",
    7: "1.2Kbps Voice",
    8: "2.4Kbps Voice",
  },
  uartParitybits0: {
    0: "No Parity",
    1: "Odd Parity",
    2: "Even Parity",
  },
  uartParitybits1: {
    0: "No Parity",
    1: "Odd Parity",
    2: "Even Parity",
  },
  uartParitybits2: {
    0: "No Parity",
    1: "Odd Parity",
    2: "Even Parity",
  },
  positionModuleMode: {
    0: "GNSS Multi-System",
    1: "GPS",
    2: "BDS",
    3: "GLONASS",
    4: "Galileo",
  },
  audioAppMode: {
    0: "Conference",
    1: "PTT",
  },
  audioCodecType: {
    0: "Built-in AMR 4.8Kbps",
    1: "External serial audio",
    2: "External 1.2K serial audio",
    3: "External 2.4K serial audio",
  },
  transmissionMode: {
    0: "Auto",
    1: "Diversity",
    2: "MIMO",
  },
  stdmaMode: {
    0: "off",
    1: "on",
  },
  minTF: {
    0: "QPSK 1/16FEC",
    1: "QPSK 1/6FEC",
    2: "QPSK 1/3FEC",
    3: "QPSK 2/3FEC",
    4: "16QAM 1/3FEC",
    5: "16QAM 2/3FEC",
    6: "64QAM 1/3FEC",
    7: "64QAM 2/3FEC",
    8: "256QAM 1/3FEC",
    9: "256QAM 2/3FEC",
    10: "1024QAM 1/2FEC",
    11: "1024QAM 2/3FEC",
    12: "1024QAM 3/4FEC",
    13: "Only for lab testing",
  },
  rfDisable: {
    0: "All RF Enable",
    1: "RF 1 Disable",
    2: "RF 2 Disable",
    3: "All RF Disable",
  },
};

/**
 * FALLBACK_VALUE: Default values for all configuration fields
 * 
 * These values are used when:
 * 1. A configuration key is not present in the device's response
 * 2. The UI needs to initialize with sensible defaults
 * 3. The user resets the configuration to default values
 * 
 * Each key maps to a string representation of the default value.
 */
export const FALLBACK_VALUE = {
  freqMode: "Fixed",
  enableDualFreq: "false",
  enableDualSpan: "false",
  freqDefault: "0",
  freqList: "2400000000",
  freqListTx: "2400000000",
  span: "10MHz",
  spanTx: "10MHz",
  rangeMode: "10Km",
  rfDisable: "All RF Enable",
  enableRssiCtrl: "false",
  stdmaMode: "off",
  enableRangeAdaptive: "false",
  enableBurstAggregation: "false",
  enableFEC: "false",
  silence: "false",
  sendToSilenceNodes: "false",
  wakeupNodes: "",
  forbiddenFreqBands: "[]",
  linkSnrThreshold: "-10",
  minTF: "QPSK 1/3FEC",
  mcFormats: "{}",
  disableNodeId: "",
  pwAtten1: "",
  pwAtten2: "",
  snrThreshold: "-10",
  transmissionMode: "Diversity",
  uart: "RS232",
  dataMode: "UDP",
  baudRate: "9600",
  meshName: "",
  name: "",
  id: "0",
  ip: "",
  nwMask: "255.255.255.0",
  gateway: "",
  dhcpServerEnable: "false",
  dhcpForwardEnable: "false",
  wifiDhcpAddressStart: "",
  wifiDhcpAddressEnd: "",
  dhcpAddressMask: "255.255.255.0",
  dhcpServerGateway: "",
  dhcpServerDns: "",
  dataCompressionMode: "Disable",
  enableHeterogeneousNetwork: "false",
  disableDSCP: "false",
  enableSnmpAgent: "false",
  snmpPort: "555",
  trapTargetIP: "",
  trapTargetPort: "668",
  trapKey: "[]",
  trapInterval: "1",
  routes: "[]",
  ocl: "[]",
  ipPrioritylist: "[]",
  servicePrioritylist: "[]",
  dscpPrioritylist: "[]",
  arpDefendList: "[]",
  netIfConfig: "[]",
  ethDisable: "Enable Both",
  maxResRatio: "100",
  ipBroadcastFilterMode: "Whitelist Mode",
  ipBroadcastWhitelist: "[]",
  ipBroadcastBlacklist: "[]",
  ipMulticastFilterMode: "Whitelist Mode",
  ipMulticastWhitelist: "[]",
  ipMulticastBlacklist: "[]",
  ipMulticastIncomingWhitelist: "[]",
  ipMulticastIncomingBlacklist: "[]",
  uartMode0: "GPS",
  uartBaudrate0: "9600",
  uartParitybits0: "No Parity",
  uartFrameInterval0: "0.02",
  uartIp0: "",
  uartPort0: "1024",
  uartPortB0: "0",
  uartMode1: "GPS",
  uartBaudrate1: "9600",
  uartParitybits1: "No Parity",
  uartFrameInterval1: "0.02",
  uartIp1: "",
  uartPort1: "1024",
  uartPortB1: "0",
  uartMode2: "GPS",
  uartBaudrate2: "9600",
  uartParitybits2: "No Parity",
  uartFrameInterval2: "0.02",
  uartIp2: "",
  uartPort2: "1024",
  uartPortB2: "0",
  positionModuleMode: "GNSS Multi-System",
  presetLatitude: "-90",
  presetLongitude: "-180",
  presetAltitude: "0",
  dataEncryptionMode: "Disable",
  enableCrossNetworkAudio: "false",
  audioAppMode: "Conference",
  audioCodecType: "Built-in AMR 4.8Kbps",
  audioMicGain: "0",
  audioHeadGain: "0",
  audioMuteLevel: "0",
  talkPTTGroupId: "0",
  listenPTTGroupId: "",
};

/**
 * CONFIG_KEYS: Complete list of all configuration field keys
 * 
 * This array is generated by extracting all field keys from all sections
 * and is used for:
 * - Configuration validation
 * - Generating configuration forms
 * - Ensuring all fields are accounted for
 * 
 * Additional keys like "freqList", "freqListTx", "pwAtten1", and "pwAtten2"
 * are manually added as they are referenced by fields but may not be
 * explicitly defined in the section fields.
 */
export const CONFIG_KEYS = Array.from(
  new Set(
    Object.values(CONFIG_SECTIONS).flatMap((sections) =>
      sections.flatMap((section) => section.fields.map((field) => field.key)),
    ),
  ),
);

// Add frequency list keys that are referenced but not directly in field definitions
if (!CONFIG_KEYS.includes("freqList")) {
  CONFIG_KEYS.push("freqList");
}
if (!CONFIG_KEYS.includes("freqListTx")) {
  CONFIG_KEYS.push("freqListTx");
}

// Add power attenuation keys that are referenced but not directly in field definitions
["pwAtten1", "pwAtten2"].forEach((key) => {
  if (!CONFIG_KEYS.includes(key)) CONFIG_KEYS.push(key);
});

/**
 * DEVICE_INFO_KEYS: Keys used for device information display
 * 
 * These keys represent read-only device information that is displayed
 * in the UI but not configurable by the user.
 */
export const DEVICE_INFO_KEYS = ["powerMax", "powerMaxAtten", "licenseinfo", "chipLevel", "version"];
