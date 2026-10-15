import type { ProjectContext } from "../analyzer/project.js";
import type { Evidence } from "../findings/types.js";
import { lineAt, stripCLikeComments } from "../parsers/text.js";

/**
 * A capability links the configuration that requests access (purpose strings,
 * manifest permissions) to the code that would use it (dependencies, APIs).
 */
export interface Capability {
  id: string;
  label: string;
  /** Any of these Info.plist keys declares the capability. */
  iosKeys: string[];
  androidPermissions: string[];
  /**
   * Dependencies that use the capability. `requires` lists Info.plist key
   * groups the dependency needs on iOS (each inner array is any-of).
   */
  dependencies: { name: string; requires?: string[][] }[];
  /** Source-level API signals (Swift/ObjC/Kotlin/Java/Dart/JS). */
  sourcePatterns: RegExp[];
}

export const CAPABILITIES: Capability[] = [
  {
    id: "camera",
    label: "camera",
    iosKeys: ["NSCameraUsageDescription"],
    androidPermissions: ["android.permission.CAMERA"],
    dependencies: [
      { name: "camera", requires: [["NSCameraUsageDescription"]] },
      { name: "image_picker", requires: [["NSCameraUsageDescription"]] },
      { name: "mobile_scanner", requires: [["NSCameraUsageDescription"]] },
      { name: "qr_code_scanner", requires: [["NSCameraUsageDescription"]] },
      { name: "qr_code_scanner_plus", requires: [["NSCameraUsageDescription"]] },
      { name: "flutter_barcode_scanner", requires: [["NSCameraUsageDescription"]] },
      { name: "camerawesome", requires: [["NSCameraUsageDescription"]] },
      { name: "react-native-vision-camera", requires: [["NSCameraUsageDescription"]] },
      { name: "react-native-camera", requires: [["NSCameraUsageDescription"]] },
      { name: "react-native-image-picker", requires: [["NSCameraUsageDescription"]] },
      { name: "expo-camera", requires: [["NSCameraUsageDescription"]] },
      { name: "expo-image-picker" },
      { name: "expo-barcode-scanner", requires: [["NSCameraUsageDescription"]] },
    ],
    sourcePatterns: [
      /\bAVCaptureDevice\b/,
      /\bUIImagePickerController(?:SourceType)?\.camera\b|sourceType\s*=\s*\.camera\b/,
      /\bCameraController\b|\bavailableCameras\s*\(/,
      /ImageSource\.camera\b/,
      /\bCameraX\b|\bandroidx\.camera\b|\bCameraManager\b|MediaStore\.ACTION_IMAGE_CAPTURE/,
      /\blaunchCamera\s*\(|\buseCameraPermissions\b|<Camera(View)?\b/,
    ],
  },
  {
    id: "microphone",
    label: "microphone",
    iosKeys: ["NSMicrophoneUsageDescription"],
    androidPermissions: ["android.permission.RECORD_AUDIO"],
    dependencies: [
      { name: "record", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "flutter_sound", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "speech_to_text", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "agora_rtc_engine", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "flutter_webrtc", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "camera" },
      { name: "react-native-audio-recorder-player", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "@react-native-voice/voice", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "react-native-webrtc", requires: [["NSMicrophoneUsageDescription"]] },
      { name: "expo-av" },
      { name: "react-native-vision-camera" },
    ],
    sourcePatterns: [
      /\bAVAudioRecorder\b|\bAVAudioSession\b.*\brecord/i,
      /\bMediaRecorder\b|\bAudioRecord\b/,
      /\bAudioRecorder\s*\(|\bFlutterSoundRecorder\b/,
      /\bAudio\.Recording\b|\bstartRecorder\s*\(/,
    ],
  },
  {
    id: "location",
    label: "location",
    iosKeys: ["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationAlwaysUsageDescription"],
    androidPermissions: [
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_BACKGROUND_LOCATION",
    ],
    dependencies: [
      { name: "geolocator", requires: [["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"]] },
      { name: "location", requires: [["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"]] },
      { name: "background_location" },
      { name: "flutter_background_geolocation" },
      { name: "google_maps_flutter" },
      { name: "react-native-geolocation-service", requires: [["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"]] },
      { name: "@react-native-community/geolocation", requires: [["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription"]] },
      { name: "expo-location" },
      { name: "react-native-maps" },
    ],
    sourcePatterns: [
      /\bCLLocationManager\b/,
      /\bFusedLocationProviderClient\b|\bLocationManager\b|\bLocationServices\b/,
      /\bGeolocator\.\w+|\bLocation\(\)\.getLocation|\bgetCurrentPosition\s*\(/,
      /\bLocation\.(getCurrentPositionAsync|requestForegroundPermissionsAsync|watchPositionAsync)\b/,
    ],
  },
  {
    id: "photos",
    label: "photo library",
    iosKeys: ["NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"],
    androidPermissions: [
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
    ],
    dependencies: [
      { name: "image_picker", requires: [["NSPhotoLibraryUsageDescription"]] },
      { name: "photo_manager", requires: [["NSPhotoLibraryUsageDescription"]] },
      { name: "wechat_assets_picker", requires: [["NSPhotoLibraryUsageDescription"]] },
      { name: "image_gallery_saver", requires: [["NSPhotoLibraryAddUsageDescription", "NSPhotoLibraryUsageDescription"]] },
      { name: "image_gallery_saver_plus", requires: [["NSPhotoLibraryAddUsageDescription", "NSPhotoLibraryUsageDescription"]] },
      { name: "gal", requires: [["NSPhotoLibraryAddUsageDescription", "NSPhotoLibraryUsageDescription"]] },
      { name: "file_picker" },
      { name: "react-native-image-picker", requires: [["NSPhotoLibraryUsageDescription"]] },
      { name: "react-native-image-crop-picker", requires: [["NSPhotoLibraryUsageDescription"]] },
      { name: "@react-native-camera-roll/camera-roll", requires: [["NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"]] },
      { name: "expo-image-picker" },
      { name: "expo-media-library" },
    ],
    sourcePatterns: [
      /\bPHPhotoLibrary\b|\bPHPickerViewController\b|\bPHAsset\b/,
      /ImageSource\.gallery\b|\bpickImage\s*\(|\bpickMultiImage\s*\(/,
      /MediaStore\.Images\b|ActivityResultContracts\.PickVisualMedia/,
      /\blaunchImageLibrary\s*\(|\blaunchImageLibraryAsync\s*\(|\bMediaLibrary\.\w+/,
    ],
  },
  {
    id: "contacts",
    label: "contacts",
    iosKeys: ["NSContactsUsageDescription"],
    androidPermissions: ["android.permission.READ_CONTACTS", "android.permission.WRITE_CONTACTS"],
    dependencies: [
      { name: "flutter_contacts", requires: [["NSContactsUsageDescription"]] },
      { name: "contacts_service", requires: [["NSContactsUsageDescription"]] },
      { name: "fast_contacts", requires: [["NSContactsUsageDescription"]] },
      { name: "react-native-contacts", requires: [["NSContactsUsageDescription"]] },
      { name: "expo-contacts" },
    ],
    sourcePatterns: [/\bCNContactStore\b/, /ContactsContract\b/, /\bFlutterContacts\.\w+|\bContactsService\.\w+/, /\bContacts\.getContactsAsync\b/],
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    iosKeys: ["NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"],
    androidPermissions: ["android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_ADVERTISE"],
    dependencies: [
      { name: "flutter_blue_plus", requires: [["NSBluetoothAlwaysUsageDescription"]] },
      { name: "flutter_reactive_ble", requires: [["NSBluetoothAlwaysUsageDescription"]] },
      { name: "flutter_blue", requires: [["NSBluetoothAlwaysUsageDescription"]] },
      { name: "react-native-ble-plx", requires: [["NSBluetoothAlwaysUsageDescription"]] },
      { name: "react-native-ble-manager", requires: [["NSBluetoothAlwaysUsageDescription"]] },
    ],
    sourcePatterns: [/\bCBCentralManager\b|\bCBPeripheralManager\b/, /\bBluetoothAdapter\b|\bBluetoothLeScanner\b/, /\bFlutterBluePlus\b|\bFlutterReactiveBle\b|\bBleManager\b/],
  },
  {
    id: "calendar",
    label: "calendar",
    iosKeys: ["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription", "NSCalendarsWriteOnlyAccessUsageDescription"],
    androidPermissions: ["android.permission.READ_CALENDAR", "android.permission.WRITE_CALENDAR"],
    dependencies: [
      { name: "device_calendar", requires: [["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription"]] },
      { name: "add_2_calendar" },
      { name: "react-native-calendar-events", requires: [["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription"]] },
      { name: "expo-calendar" },
    ],
    sourcePatterns: [/\bEKEventStore\b/, /CalendarContract\b/, /\bDeviceCalendarPlugin\b/, /\bCalendar\.getCalendarsAsync\b/],
  },
  {
    id: "faceid",
    label: "Face ID",
    iosKeys: ["NSFaceIDUsageDescription"],
    androidPermissions: [],
    dependencies: [
      { name: "local_auth", requires: [["NSFaceIDUsageDescription"]] },
      { name: "react-native-biometrics", requires: [["NSFaceIDUsageDescription"]] },
      { name: "react-native-touch-id", requires: [["NSFaceIDUsageDescription"]] },
      { name: "expo-local-authentication" },
    ],
    sourcePatterns: [/\bLAContext\b/, /\bLocalAuthentication\s*\(\)/, /\bauthenticateAsync\s*\(/],
  },
  {
    id: "speech",
    label: "speech recognition",
    iosKeys: ["NSSpeechRecognitionUsageDescription"],
    androidPermissions: [],
    dependencies: [
      { name: "speech_to_text", requires: [["NSSpeechRecognitionUsageDescription"]] },
      { name: "@react-native-voice/voice", requires: [["NSSpeechRecognitionUsageDescription"]] },
    ],
    sourcePatterns: [/\bSFSpeechRecognizer\b/, /\bSpeechToText\s*\(/],
  },
  {
    id: "tracking",
    label: "App Tracking Transparency",
    iosKeys: ["NSUserTrackingUsageDescription"],
    androidPermissions: [],
    dependencies: [
      { name: "app_tracking_transparency", requires: [["NSUserTrackingUsageDescription"]] },
      { name: "react-native-tracking-transparency", requires: [["NSUserTrackingUsageDescription"]] },
      { name: "expo-tracking-transparency" },
    ],
    sourcePatterns: [/\bATTrackingManager\b/, /\bAppTrackingTransparency\.\w+/, /\brequestTrackingPermission(sAsync)?\s*\(/],
  },
  {
    id: "health",
    label: "HealthKit",
    iosKeys: ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"],
    androidPermissions: [],
    dependencies: [
      { name: "health", requires: [["NSHealthShareUsageDescription"]] },
      { name: "react-native-health", requires: [["NSHealthShareUsageDescription"]] },
    ],
    sourcePatterns: [/\bHKHealthStore\b/, /\bHealth\(\)|\bHealthFactory\b/],
  },
  {
    id: "nfc",
    label: "NFC",
    iosKeys: ["NFCReaderUsageDescription"],
    androidPermissions: ["android.permission.NFC"],
    dependencies: [
      { name: "nfc_manager", requires: [["NFCReaderUsageDescription"]] },
      { name: "flutter_nfc_kit", requires: [["NFCReaderUsageDescription"]] },
      { name: "react-native-nfc-manager", requires: [["NFCReaderUsageDescription"]] },
    ],
    sourcePatterns: [/\bNFCNDEFReaderSession\b|\bNFCTagReaderSession\b/, /\bNfcAdapter\b/, /\bNfcManager\.\w+/],
  },
];

export interface SourceMatch {
  file: string;
  line: number;
  text: string;
}

const strippedCache = new WeakMap<ProjectContext, Map<string, string>>();

/** Source text with comments removed (cached per project). */
export function codeOf(project: ProjectContext, file: string): string | undefined {
  let cache = strippedCache.get(project);
  if (!cache) strippedCache.set(project, (cache = new Map()));
  if (cache.has(file)) return cache.get(file);
  const raw = project.readText(file);
  const code = raw === undefined ? undefined : /\.(dart|swift|m|mm|h|kt|kts|java|js|jsx|ts|tsx|mjs|cjs)$/.test(file) ? stripCLikeComments(raw) : raw;
  if (code !== undefined) cache.set(file, code);
  return code;
}

export function searchFiles(project: ProjectContext, files: string[], patterns: RegExp[], limit = 20): SourceMatch[] {
  const out: SourceMatch[] = [];
  for (const file of files) {
    const code = codeOf(project, file);
    if (code === undefined) continue;
    for (const p of patterns) {
      const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const line = lineAt(code, m.index);
        const lineText = code.split("\n")[line - 1]?.trim() ?? m[0];
        out.push({ file, line, text: lineText.length > 160 ? `${lineText.slice(0, 157)}...` : lineText });
        if (out.length >= limit) return out;
        if (m[0].length === 0) re.lastIndex++;
      }
    }
  }
  return out;
}

export function matchEvidence(matches: SourceMatch[], description: string, max = 5): Evidence[] {
  return matches.slice(0, max).map((m) => ({ file: m.file, line: m.line, value: m.text, description }));
}

/** Files whose code belongs to the app (not dependencies), for a given platform. */
export function appCodeFiles(project: ProjectContext, scope: "ios" | "android" | "all" = "all"): string[] {
  const all = project.appSourceFiles();
  if (scope === "ios") return all.filter((f) => /\.(swift|m|mm|h)$/.test(f));
  if (scope === "android") return all.filter((f) => /\.(kt|java)$/.test(f));
  return all;
}

export function evidenceForDependency(dep: { name: string; version?: string; file: string; direct: boolean }): Evidence {
  return {
    file: dep.file,
    key: dep.name,
    value: dep.version,
    description: dep.direct ? `Direct dependency ${dep.name}` : `Transitive dependency ${dep.name}`,
  };
}

// --- Accounts -------------------------------------------------------------

const AUTH_DEPENDENCIES = [
  "firebase_auth",
  "supabase_flutter",
  "supabase_auth",
  "gotrue",
  "amplify_auth_cognito",
  "appwrite",
  "pocketbase",
  "parse_server_sdk_flutter",
  "@react-native-firebase/auth",
  "@supabase/supabase-js",
  "aws-amplify",
  "@aws-amplify/auth",
  "@clerk/clerk-expo",
  "@clerk/clerk-react",
  "react-native-appwrite",
  "firebase",
];

const SIGNUP_PATTERNS = [
  /\bcreateUserWithEmailAndPassword\b/,
  /\bsignUp(?:WithEmail|WithPassword)?\s*\(/,
  /\bauth\.signUp\b/,
  /\bregister(?:User|Account|WithEmail)\s*\(/,
  /["'`](?:Create (?:an )?account|Sign up|Register)["'`]/i,
  /["'`](?:Tạo tài khoản|Đăng ký)["'`]/i,
];

const DELETION_PATTERNS = [
  /\bcurrentUser\s*[?!]?\s*\.\s*delete\s*\(/,
  /\buser\s*[?!]?\s*\.\s*delete\s*\(\s*\)/,
  /\bdeleteUser\s*\(/,
  /\bdeleteAccount\w*\s*\(/,
  /\bdelete_account\b/,
  /["'`/](?:delete[ -]?(?:my[ -])?account|remove[ -]account)/i,
  /["'`]Xóa tài khoản/i,
];

export interface AccountSignals {
  declared: boolean | "unknown";
  authDependencies: Evidence[];
  signupEvidence: SourceMatch[];
  deletionEvidence: SourceMatch[];
  likelyCreatesAccounts: boolean;
}

const accountCache = new WeakMap<ProjectContext, AccountSignals>();

export function accountSignals(project: ProjectContext): AccountSignals {
  const cached = accountCache.get(project);
  if (cached) return cached;
  const authDependencies = AUTH_DEPENDENCIES.map((n) => project.dependencies().get(n))
    .filter((d): d is NonNullable<typeof d> => !!d && d.direct)
    .map(evidenceForDependency);
  const code = appCodeFiles(project);
  const signupEvidence = searchFiles(project, code, SIGNUP_PATTERNS, 10);
  const deletionEvidence = searchFiles(project, code, DELETION_PATTERNS, 10);
  const declared = project.config.app.has_account_creation;
  const result: AccountSignals = {
    declared,
    authDependencies,
    signupEvidence,
    deletionEvidence,
    likelyCreatesAccounts: declared === true || (declared !== false && (signupEvidence.length > 0 || authDependencies.length > 0)),
  };
  accountCache.set(project, result);
  return result;
}

export function isPlaceholderUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)(example\.(com|org|net)|localhost|yourdomain\.\w+|domain\.com|test)$/.test(u.hostname) || /todo|placeholder|your[-_]?(app|site|domain)/i.test(url);
  } catch {
    return true;
  }
}
