#include <Servo.h>
#include <math.h>

// Arduino Uno R3; three independently powered positional servos.
// Serial: 115200. A arms; 1/2/3 test a joint; G runs a 12-second wave.
// B reverses wave phase; L/R apply +/-3 nominal degrees of curvature.
// X stops pulses. Physical DC disconnect is the power-off control.
const byte COUNT = 3;
const byte PINS[COUNT] = {9, 10, 11};
const int SIGN[COUNT] = {1, 1, 1}; // Change an entry to -1 after direction test.
const float AMPLITUDE = 12.0f;    // Nominal command degrees, not measured angles.
const float FREQUENCY = 0.25f;    // Cycles per second.
const float PHASE = 1.04719755f;  // 60 degrees expressed in radians.
const unsigned long TRIAL_MS = 12000;
Servo servos[COUNT];
float commandAngles[COUNT] = {90, 90, 90};
enum Mode { OFF, HOLD, TEST, RUN };
Mode mode = OFF;
unsigned long started = 0;
unsigned long lastTick = 0;
unsigned long holdDuration = 5000;
int testJoint = 0;
float bias = 0.0f;
float phaseSign = 1.0f;

void disarm() {
  for (byte i = 0; i < COUNT; ++i) {
    servos[i].detach();
    digitalWrite(PINS[i], LOW);
  }
  mode = OFF;
  Serial.println(F("OFF: disconnect servo power before handling."));
}

void holdCenter(unsigned long now, unsigned long duration) {
  mode = HOLD;
  started = now;
  holdDuration = duration;
}

void setup() {
  for (byte i = 0; i < COUNT; ++i) {
    pinMode(PINS[i], OUTPUT);
    digitalWrite(PINS[i], LOW);
  }
  Serial.begin(115200);
  Serial.println(F("READY: A, then 1/2/3 or G. X stops pulses."));
}

void loop() {
  unsigned long now = millis();
  for (byte n = 0; n < 16 && Serial.available(); ++n) {
    char c = Serial.read();
    if (c == '\r' || c == '\n' || c == ' ') continue;
    if (c == 'X') {
      disarm();
    } else if (c == 'A') {
      if (mode == OFF) {
        for (byte i = 0; i < COUNT; ++i) {
          commandAngles[i] = 90.0f;
          servos[i].attach(PINS[i], 1000, 2000);
          servos[i].write(90);    // Can jump at arming: support the whole body.
        }
      }
      holdCenter(now, 5000);
      lastTick = now;
    } else if (c >= '1' && c <= '3' && mode == HOLD) {
      testJoint = c - '1';
      mode = TEST;
      started = now;
    } else if ((c == 'G' || c == 'B' || c == 'L' || c == 'R') && mode == HOLD) {
      bias = c == 'L' ? 3.0f : c == 'R' ? -3.0f : 0.0f;
      phaseSign = c == 'B' ? -1.0f : 1.0f;
      mode = RUN;
      started = now;
      Serial.println(F("TRIAL: 12 seconds; X stops early."));
    } else {
      // Commands out of sequence also stop. Use A to set up each new run.
      disarm();
    }
  }
  if (mode == OFF) return;
  unsigned long elapsed = now - started;
  if ((mode == TEST && elapsed >= 2000) || (mode == RUN && elapsed >= TRIAL_MS)) {
    holdCenter(now, 3000);
    elapsed = 0;
    Serial.println(F("CENTERING: pulses end in 3 seconds."));
  }
  if (mode == HOLD && elapsed >= holdDuration) {
    disarm();
    return;
  }
  if (now - lastTick < 20) return;
  lastTick = now;
  for (byte i = 0; i < COUNT; ++i) {
    float relative = 0.0f;
    if (mode == TEST && i == testJoint) relative = 8.0f;
    if (mode == RUN) {
      float seconds = elapsed / 1000.0f;
      // One-second fade at each end avoids an abrupt wave start or stop.
      float envelope = min(1.0f, min(seconds, (TRIAL_MS - elapsed) / 1000.0f));
      relative = envelope * (bias + AMPLITUDE * sinf(6.28318531f * FREQUENCY * seconds + phaseSign * i * PHASE));
    }
    float target = constrain(90.0f + SIGN[i] * relative, 75.0f, 105.0f);
    commandAngles[i] += constrain(target - commandAngles[i], -0.6f, 0.6f);
    servos[i].write((int)(commandAngles[i] + 0.5f));
  }
}
