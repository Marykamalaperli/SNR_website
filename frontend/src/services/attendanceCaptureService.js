export const EVIDENCE_NOTICE_VERSION = 'attendance-photo-location-v1';
export const STORE_QR_PATTERN =
  /^snr-attendance:v1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openAttendanceCamera(facingMode) {
  if (!globalThis.isSecureContext)
    throw new Error('Camera access needs HTTPS. Open the secure website and try again.');
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('This browser cannot open a camera. Use a phone or device with a camera.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 } },
      audio: false,
    });
  } catch (error) {
    if (['NotAllowedError', 'PermissionDeniedError'].includes(error.name))
      throw new Error(
        'Camera permission was denied. Allow camera access for this website and retry.',
        { cause: error },
      );
    throw new Error('The camera is unavailable. Close other camera apps and try again.', {
      cause: error,
    });
  }
}

export function stopAttendanceCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function takeAttendancePhoto(video, canvas) {
  if (!video.videoWidth || !video.videoHeight)
    throw new Error('Wait for the camera picture, then take your photo.');
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const jpeg_base64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
  if (!jpeg_base64 || jpeg_base64.length > 204800)
    throw new Error('The photo is too large. Retake it against a plain background.');
  return {
    jpeg_base64,
    captured_at: new Date().toISOString(),
    consent_version: EVIDENCE_NOTICE_VERSION,
  };
}
