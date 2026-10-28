#include <Servo.h>

// Arduino Uno R3 + one positional micro servo. External regulated 5 V power.
// Serial Monitor: 115200 baud. A = arm, L/C/R = 75/90/105, X = stop pulses.
// These are nominal command angles, not measured shaft angles.
Servo joint;
const byte SERVO_PIN = 9;
const unsigned long COMMAND_LEASE_MS = 5000;
bool armed = false;
float commandAngle = 90.0f;
float targetAngle = 90.0f;
unsigned long lastCommand = 0;
unsigned long lastTick = 0;

void disarm() {
  joint.detach();                 // Stops signal pulses; does NOT cut servo power.
  digitalWrite(SERVO_PIN, LOW);
  armed = false;
  Serial.println(F("OFF: unplug servo power before handling."));
}

void setup() {
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  Serial.begin(115200);
  Serial.println(F("READY: A arms at center. L C R move. X stops pulses."));
}

void loop() {
  unsigned long now = millis();
  for (byte n = 0; n < 16 && Serial.available(); ++n) {
    char c = Serial.read();
    if (c == '\r' || c == '\n' || c == ' ') continue;
    if (c == 'X') {
      disarm();
    } else if (c == 'A') {
      if (!armed) {
        commandAngle = 90.0f;
        joint.attach(SERVO_PIN, 1000, 2000);
        joint.write(90);          // Initial centering can jump. Start with horn off.
        armed = true;
      }
      targetAngle = 90.0f;
      lastCommand = now;
      lastTick = now;
    } else if (c == 'L' || c == 'C' || c == 'R') {
      if (armed) {
        targetAngle = c == 'L' ? 75.0f : c == 'R' ? 105.0f : 90.0f;
        lastCommand = now;
      } else {
        Serial.println(F("Send A first, with the mechanism clear."));
      }
    } else {
      disarm();                   // Unknown input never creates motion.
    }
  }
  if (!armed) return;
  if (now - lastCommand >= COMMAND_LEASE_MS) {
    disarm();
    return;
  }
  if (now - lastTick >= 20) {
    lastTick = now;
    // At most 0.4 nominal degrees each 20 ms: 20 degrees/second.
    float error = targetAngle - commandAngle;
    commandAngle += constrain(error, -0.4f, 0.4f);
    joint.write((int)(commandAngle + 0.5f));
  }
}
