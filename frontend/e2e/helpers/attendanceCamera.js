import QRCode from 'qrcode';

// The real browser decodes generated QR pixels, opens a video stream and encodes
// its photo. Only the camera hardware is substituted; no production test hook.
export async function installAttendanceCamera(page, siteId, { qr } = {}) {
  const image = await QRCode.toDataURL(
    qr || 'snr-attendance:v1:' + siteId + ':a0000000-0000-4000-8000-000000000001',
    { width: 600, margin: 4 },
  );
  await page.addInitScript(
    ({ image }) => {
      window.attendanceCameraRequests = 0;
      window.attendanceCameraTracks = 0;
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.attendanceCameraRequests++;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 600;
        const context = canvas.getContext('2d');
        const picture = new Image();
        picture.src = image;
        await picture.decode();
        function draw() {
          context.fillStyle = 'white';
          context.fillRect(0, 0, 600, 600);
          if (constraints.video.facingMode.ideal === 'environment')
            context.drawImage(picture, 0, 0);
          else {
            context.fillStyle = '#264653';
            context.font = '24px sans-serif';
            context.fillText('Synthetic attendance photo', 100, 300);
          }
        }
        draw();
        const stream = canvas.captureStream(10);
        const timer = setInterval(draw, 100);
        const track = stream.getVideoTracks()[0];
        const stop = track.stop.bind(track);
        window.attendanceCameraTracks++;
        let stopped = false;
        track.stop = () => {
          if (!stopped) window.attendanceCameraTracks--;
          stopped = true;
          clearInterval(timer);
          stop();
        };
        return stream;
      };
    },
    { image },
  );
}

export async function capturePunch(page, action) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Start QR scanner' }).click();
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Confirm ' + action.toLowerCase(), exact: true })
    .click();
}
