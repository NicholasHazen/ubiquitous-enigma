"""Blue-card steering demo. Dry run unless --port is supplied; Space arms.
Requires Python 3.11+, opencv-python and pyserial. Firmware: rover.ino.
No forward motion is sent. Test raised wheels before a tethered floor trial.
"""
import argparse
import threading
import time

import cv2
import numpy as np
import serial

LOWER_BLUE = (90, 100, 60)       # OpenCV HSV: H 0..179, S/V 0..255
UPPER_BLUE = (130, 255, 255)
DEADBAND = 0.12                  # Fraction of half the image width
MAX_FRAME_AGE = 0.25             # Since capture completed, not sensor exposure
PERIOD = 0.10                    # At most 10 command updates per second


class LatestCamera:
    """Keep reading so the control loop uses the latest delivered image."""
    def __init__(self, index):
        self.cap = cv2.VideoCapture(index)
        if not self.cap.isOpened():
            self.cap.release()
            raise RuntimeError("Cannot open camera. Close other camera apps; try --camera 1.")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Best effort; backend may ignore it
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.frame = None
        self.sequence = 0
        self.stamp = 0.0
        self.failed = False
        self.thread = threading.Thread(target=self.read_loop, daemon=True)
        self.thread.start()

    def read_loop(self):
        try:
            while not self.stop.is_set():
                ok, frame = self.cap.read()
                if not ok:
                    with self.lock:
                        self.failed = True
                    break
                with self.lock:
                    self.frame = frame
                    self.sequence += 1
                    self.stamp = time.monotonic()
        except Exception:
            with self.lock:
                self.failed = True
        finally:
            self.cap.release()

    def snapshot(self):
        with self.lock:
            frame = None if self.frame is None else self.frame.copy()
            return self.sequence, self.stamp, frame, self.failed

    def close(self):
        self.stop.set()
        self.thread.join(timeout=0.5)  # A stuck camera must not delay the stop command


def locate_target(frame):
    """Return a command, normalized error, and mask; annotate frame in place."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, LOWER_BLUE, UPPER_BLUE)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    height, width = frame.shape[:2]
    for x in (int(width * (1 - DEADBAND) / 2),
              int(width * (1 + DEADBAND) / 2)):
        cv2.line(frame, (x, 0), (x, height - 1), (0, 200, 255), 1)
    if not contours:
        return "X", None, mask
    target = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(target) / (width * height)
    moments = cv2.moments(target)
    if not 0.003 <= area <= 0.70 or moments["m00"] == 0:
        return "X", None, mask
    cx = moments["m10"] / moments["m00"]
    cy = moments["m01"] / moments["m00"]
    error = (cx - width / 2) / (width / 2)
    cv2.drawContours(frame, [target], -1, (0, 255, 0), 2)
    cv2.circle(frame, (int(cx), int(cy)), 5, (0, 255, 0), -1)
    command = "X" if abs(error) <= DEADBAND else ("L" if error < 0 else "R")
    return command, error, mask


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--port", help="Arduino port, e.g. COM4 or /dev/ttyACM0")
    args = parser.parse_args()
    connection = None
    camera = None
    armed = False
    last_sequence = -1
    armed_at = 0.0
    try:
        if args.port:
            connection = serial.Serial(args.port, 115200, timeout=0.1, write_timeout=0.2)
            time.sleep(2.0)  # Uno normally resets when its serial port opens
            connection.write(b"X")
        camera = LatestCamera(args.camera)
        print("Click the image: Space = arm/disarm; q or Esc = stop and exit.")
        print("LIVE serial connected; starts disarmed." if connection else "DRY RUN: no motor commands sent.")
        while True:
            started = time.monotonic()
            sequence, stamp, frame, failed = camera.snapshot()
            fresh = (frame is not None and not failed and sequence != last_sequence
                     and started - stamp <= MAX_FRAME_AGE)
            last_sequence = sequence
            wanted, error = "X", None
            if frame is None:
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
            if fresh:
                wanted, error, mask = locate_target(frame)
            else:
                mask = np.zeros(frame.shape[:2], dtype=np.uint8)
                armed = False  # Camera hiccup needs a deliberate re-arm
            # Two tenths turning, three tenths stopped: small supervised nudges.
            pulse_on = ((started - armed_at) % 0.5) < 0.2
            sent = wanted if armed and fresh and pulse_on else "X"
            mode = "LIVE" if connection else "DRY RUN"
            status = f"{mode} | {'ARMED' if armed else 'DISARMED'} | want {wanted} | send {sent}"
            if not fresh:
                status += " | waiting for fresh frame"
            elif error is None:
                status += " | no target"
            cv2.putText(frame, status, (10, 25), cv2.FONT_HERSHEY_SIMPLEX,
                        0.45, (255, 255, 255), 1, cv2.LINE_AA)
            cv2.imshow("Rover: Space arm/disarm; q stop", frame)
            cv2.imshow("Blue mask", mask)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord(" "):
                armed = not armed if fresh else False
                armed_at = time.monotonic()
                sent = "X"  # Every arm/disarm transition first requests stop
            if connection:
                connection.write(sent.encode("ascii"))
            time.sleep(max(0.0, PERIOD - (time.monotonic() - started)))
    except KeyboardInterrupt:
        pass
    finally:
        if connection:
            try:
                connection.write(b"X")
            except (serial.SerialException, OSError):
                pass  # The firmware's independent 350 ms timeout is still needed
            connection.close()
        if camera:
            camera.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
