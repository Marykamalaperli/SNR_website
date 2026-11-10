// Exercise native video/frame capture; substitute only the camera hardware.
export async function installAttendanceCamera(page) {
  await page.addInitScript(() => {
    window.attendanceCameraRequests = 0;
    window.attendanceCameraTracks = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints.video.facingMode.ideal !== 'user') throw new Error('Expected selfie camera');
      window.attendanceCameraRequests++;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 600;
      const context = canvas.getContext('2d');
      function draw() {
        context.fillStyle = 'white';
        context.fillRect(0, 0, 600, 600);
        context.fillStyle = '#264653';
        context.font = '24px sans-serif';
        context.fillText('Synthetic attendance photo', 100, 300);
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
  });
}
export async function capturePunch(page, action) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Confirm ' + action.toLowerCase(), exact: true })
    .click();
}
