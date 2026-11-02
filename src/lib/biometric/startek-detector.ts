import type { StartekDeviceState, StartekHardwareInfo } from "./types";

export const STARTEK_HARDWARE_SPECS = {
  vendorIds: ["0B39", "0BCA"],
  productIds: ["8220"],
  knownHardwareIds: [
    "USB\\VID_0B39&PID_8220",
    "USB\\VID_0BCA&PID_8220",
  ],
  deviceNames: [
    "Startek FM220",
    "FM220U Fingerprint Scanner",
    "Startek USB Fingerprint Scanner",
    "ACPL FM220",
  ],
  rdServicePorts: [11100, 11101, 11102, 11103, 11104, 11200],
  sdkDlls: ["StkFP.dll", "StkMatching.dll", "FM220_SDK.dll", "libFM220.dll"],
};

export interface RawDeviceQuery {
  connected: boolean;
  rawHardwareId?: string;
  friendlyName?: string;
  driverInstalled?: boolean;
  driverName?: string;
  driverVersion?: string;
  driverArch?: string;
  hasProblem?: boolean;
  problemCode?: number;
  rdPort?: number;
  sdkDllFound?: boolean;
  sdkDllPath?: string;
}

/**
 * Parses USB Hardware ID strings into normalized VID and PID
 */
export function parseUsbHardwareId(hwId: string): { vid?: string; pid?: string } {
  if (!hwId) return {};
  const vidMatch = hwId.match(/VID_([0-9A-Fa-f]{4})/i);
  const pidMatch = hwId.match(/PID_([0-9A-Fa-f]{4})/i);
  return {
    vid: vidMatch ? vidMatch[1]?.toUpperCase() : undefined,
    pid: pidMatch ? pidMatch[1]?.toUpperCase() : undefined,
  };
}

/**
 * Checks whether the detected hardware matches Startek FM220 specifications
 */
export function isStartekFm220(hwId?: string, friendlyName?: string): boolean {
  if (!hwId && !friendlyName) return false;

  if (hwId) {
    const { vid, pid } = parseUsbHardwareId(hwId);
    if (
      vid &&
      pid &&
      STARTEK_HARDWARE_SPECS.vendorIds.includes(vid) &&
      STARTEK_HARDWARE_SPECS.productIds.includes(pid)
    ) {
      return true;
    }
  }

  if (friendlyName) {
    const lower = friendlyName.toLowerCase();
    if (
      (lower.includes("startek") && lower.includes("fm220")) ||
      lower.includes("fm220u") ||
      (lower.includes("acpl") && lower.includes("fm220"))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolves the precise diagnostic state according to strict rules
 */
export function resolveStartekDeviceState(query: RawDeviceQuery): {
  state: StartekDeviceState;
  description: string;
} {
  // 1. Device Not Connected
  if (!query.connected) {
    return {
      state: "DEVICE_NOT_CONNECTED",
      description:
        "Startek FM220 scanner is physically disconnected from USB ports. Connect the scanner to a USB 2.0/3.0 port on this Windows 11 computer.",
    };
  }

  // 2. Hardware detected but driver problems
  if (query.hasProblem && query.problemCode === 28) {
    return {
      state: "DRIVER_MISSING",
      description:
        "Startek FM220 hardware detected on USB bus, but Windows device driver is missing (Code 28). Install the official ACPL / Startek FM220 x64 Windows 11 driver.",
    };
  }

  if (query.hasProblem && (query.problemCode === 52 || query.problemCode === 31)) {
    return {
      state: "DRIVER_INCOMPATIBLE",
      description:
        "Driver signature or architecture incompatible with Windows 11 64-bit (Code 52/31). An authentic WHQL 64-bit driver package is required.",
    };
  }

  if (!query.driverInstalled) {
    return {
      state: "DRIVER_MISSING",
      description:
        "Startek FM220 is connected via USB, but no functional driver is bound. Install ACPL FM220 driver package.",
    };
  }

  // 3. Driver is present, but neither ACPL RD Service nor SDK DLL is available
  const hasRd = typeof query.rdPort === "number" && query.rdPort > 0;
  const hasSdk = query.sdkDllFound === true;

  if (!hasRd && !hasSdk) {
    return {
      state: "SDK_UNAVAILABLE",
      description:
        "Scanner hardware and driver are recognized by Windows, but neither the ACPL RD Service (localhost:11100-11200) nor the Startek native SDK DLL (StkFP.dll) is running or installed.",
    };
  }

  // 4. Device Ready
  return {
    state: "DEVICE_READY",
    description: `Startek FM220 is connected, driver is active, and biometric interface (${hasRd ? `ACPL RD Service port ${query.rdPort}` : "Startek Native SDK"}) is ready.`,
  };
}

/**
 * Evaluates the full hardware diagnostic profile
 */
export function buildStartekHardwareInfo(query: RawDeviceQuery): StartekHardwareInfo {
  const { state, description } = resolveStartekDeviceState(query);
  const parsed = parseUsbHardwareId(query.rawHardwareId || "");

  const osArch = "win32-x64";
  const driverArch = query.driverArch || "x64";
  const isArchCompat = driverArch.toLowerCase().includes("64");

  let sdkType: "NATIVE_DLL" | "ACPL_RD_SERVICE" | "NONE" = "NONE";
  if (query.rdPort) {
    sdkType = "ACPL_RD_SERVICE";
  } else if (query.sdkDllFound) {
    sdkType = "NATIVE_DLL";
  }

  return {
    connected: query.connected,
    state,
    stateDescription: description,
    vendorId: parsed.vid || (query.connected ? "0B39" : undefined),
    productId: parsed.pid || (query.connected ? "8220" : undefined),
    hardwareId: query.rawHardwareId || (query.connected ? "USB\\VID_0B39&PID_8220" : undefined),
    friendlyName: query.friendlyName || (query.connected ? "Startek FM220 Fingerprint Scanner" : undefined),
    driverInstalled: query.driverInstalled ?? false,
    driverName: query.driverName,
    driverVersion: query.driverVersion,
    driverArchitecture: driverArch,
    isArchitectureCompatible: isArchCompat,
    osArchitecture: osArch,
    rdServiceRunning: Boolean(query.rdPort),
    rdServicePort: query.rdPort,
    sdkAvailable: query.sdkDllFound || Boolean(query.rdPort),
    sdkType,
    sdkDetails: query.sdkDllPath || (query.rdPort ? `ACPL RD Service on port ${query.rdPort}` : undefined),
    lastCheckedAt: new Date().toISOString(),
  };
}
