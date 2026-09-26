import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type KycImage = { base64: string; width: number; height: number; uri: string };

/** Firestore keeps each photo in one document (under 1 MB), so photos are shrunk before upload. */
const MAX_BYTES = 850_000;

async function shrink(uri: string, width: number, height: number, maxSide: number): Promise<KycImage> {
  for (const [side, compress] of [[maxSide, 0.6], [Math.round(maxSide * 0.8), 0.5], [Math.round(maxSide * 0.6), 0.45]] as const) {
    const scale = Math.min(1, side / Math.max(width, height));
    const out = await ImageManipulator.manipulateAsync(
      uri,
      scale < 1 ? [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }] : [],
      { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    const b64 = out.base64 ?? '';
    if (b64 && (b64.length * 3) / 4 < MAX_BYTES) return { base64: b64, width: out.width, height: out.height, uri: out.uri };
  }
  throw new Error('That photo is too large. Try again with the card filling the frame.');
}

/**
 * Takes a photo (or picks one from the gallery) and returns a small JPEG.
 * The simulator has no camera, so the camera falls back to the gallery there.
 */
export async function captureKycImage(source: 'camera' | 'library', opts: { selfie?: boolean } = {}): Promise<KycImage | null> {
  const useCamera = source === 'camera' && Platform.OS !== 'web';
  if (useCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow camera access in Settings to take the photo.');
  }
  // The gallery picker needs no permission: she picks one photo and the app only ever sees that one.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'], quality: 0.8, allowsEditing: false, exif: false,
    ...(opts.selfie ? { cameraType: ImagePicker.CameraType.front } : {}),
  };
  let res: ImagePicker.ImagePickerResult;
  try {
    res = useCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  } catch (e) {
    // No camera (simulator): let her pick from the gallery instead.
    if (useCamera) res = await ImagePicker.launchImageLibraryAsync(options);
    else throw e;
  }
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return shrink(a.uri, a.width, a.height, opts.selfie ? 900 : 1400);
}
