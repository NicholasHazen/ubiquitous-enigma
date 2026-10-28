// Arduino Uno R3 + Adafruit Motor Shield #1438 (v2/v3).
// Install "Adafruit Motor Shield V2 Library" with its dependencies.
// Left motor M1, right motor M2. Calibrate wire polarity on a stand.
#include <Wire.h>
#include <Adafruit_MotorShield.h>

Adafruit_MotorShield shield;
Adafruit_DCMotor *leftMotor = shield.getMotor(1);
Adafruit_DCMotor *rightMotor = shield.getMotor(2);
const int DRIVE_PWM = 90;       // Effort, not a measured wheel speed.
const int TURN_PWM = 70;
const unsigned long TIMEOUT_MS = 350;
unsigned long lastCommandMs = 0;
char requested = 'X';
char applied = '?';
bool shieldReady = false;

void setMotor(Adafruit_DCMotor *motor, int demand) {
  if (demand == 0) {
    motor->setSpeed(0);
    motor->run(RELEASE);       // Coast; this is not an active brake.
  } else {
    motor->setSpeed(abs(demand));
    motor->run(demand > 0 ? FORWARD : BACKWARD);
  }
}

void applyCommand(char command) {
  int left = 0;
  int right = 0;
  switch (command) {
    case 'F': left = DRIVE_PWM; right = DRIVE_PWM; break;
    case 'B': left = -DRIVE_PWM; right = -DRIVE_PWM; break;
    case 'L': left = -TURN_PWM; right = TURN_PWM; break;
    case 'R': left = TURN_PWM; right = -TURN_PWM; break;
    case '1': left = DRIVE_PWM; break;  // Left wheel only, forward.
    case '2': right = DRIVE_PWM; break; // Right wheel only, forward.
    default: break;                    // X means both demands stay 0.
  }
  setMotor(leftMotor, left);
  setMotor(rightMotor, right);
}

void setup() {
  Serial.begin(115200);
  shieldReady = shield.begin();
  if (!shieldReady) {
    Serial.println(F("SHIELD NOT FOUND. Power off; check headers."));
    return;
  }
  applyCommand('X');
  applied = 'X';
  Serial.println(F("READY. F B L R X; bench tests 1 and 2."));
}

void loop() {
  if (!shieldReady) return;

  // Read at most 8 bytes per visit, so timeout checking keeps running.
  for (byte count = 0; count < 8 && Serial.available(); ++count) {
    char incoming = Serial.read();
    if (incoming == '\r' || incoming == '\n' || incoming == ' ') continue;
    switch (incoming) {
      case 'F': case 'B': case 'L': case 'R': case '1': case '2':
        requested = incoming;
        lastCommandMs = millis();
        break;
      case 'X':
        requested = 'X';
        break;
      default:
        requested = 'X';       // Unknown input stops; never refreshes time.
        break;
    }
  }

  if (requested != 'X' &&
      (unsigned long)(millis() - lastCommandMs) >= TIMEOUT_MS) {
    requested = 'X';
    Serial.println(F("STOP timeout"));
  }
  if (requested != applied) {
    applyCommand(requested);
    applied = requested;
    Serial.print(F("Command: "));
    Serial.println(applied);
  }
}
