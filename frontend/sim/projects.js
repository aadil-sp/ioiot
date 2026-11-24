// Example projects: parts, wires, world and starter code that match each other.
// Pin keys: "board:<gpio|5V|3V3|GND>" or "<partId>:<pinId>".
(function (root) {
    const W = (a, b) => ({ a, b });
    const motorWiring = [
        W('board:6', 'drv:IN1'), W('board:7', 'drv:IN2'), W('board:10', 'drv:IN3'), W('board:20', 'drv:IN4'), W('board:GND', 'drv:GND'),
        W('drv:OUT1', 'ml:P'), W('drv:OUT2', 'ml:N'), W('drv:OUT3', 'mr:P'), W('drv:OUT4', 'mr:N')
    ];
    const motorParts = [
        { id: 'drv', type: 'l298n', x: 700, y: 330, props: {} },
        { id: 'ml', type: 'motor', x: 650, y: 520, props: { side: 'left' } },
        { id: 'mr', type: 'motor', x: 840, y: 520, props: { side: 'right' } }
    ];
    const motorCode = `// L298N: IN1/IN2 = left wheel, IN3/IN4 = right wheel
const int IN1 = 6, IN2 = 7, IN3 = 10, IN4 = 20;

void forward()  { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void backward() { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }
void left()     { digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);  }
void right()    { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, HIGH); }
void stopCar()  { digitalWrite(IN1, LOW);  digitalWrite(IN2, LOW);  digitalWrite(IN3, LOW);  digitalWrite(IN4, LOW);  }
`;

    const PROJECTS = [
        {
            id: 'blank', title: 'Empty board', world: 'none', parts: [], wires: [],
            code: `void setup() {
  Serial.begin(115200);
  Serial.println("Hello from the ESP32-C3!");
}

void loop() {
}
`
        },
        {
            id: 'blink', title: 'Blink (built-in + external LED)', world: 'none',
            parts: [{ id: 'led1', type: 'led', x: 720, y: 220, props: { color: 'green' } }],
            wires: [W('board:5', 'led1:A'), W('board:GND', 'led1:K')],
            code: `// The SuperMini's blue LED is on GPIO8 and lights when the pin is LOW.
const int EXTERNAL_LED = 5;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(EXTERNAL_LED, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, LOW);   // built-in on
  digitalWrite(EXTERNAL_LED, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, HIGH);  // built-in off
  digitalWrite(EXTERNAL_LED, LOW);
  delay(500);
}
`
        },
        {
            id: 'dustbin', title: 'Smart dustbin (ultrasonic + servo)', world: 'bin',
            parts: [
                { id: 'us', type: 'hcsr04', x: 700, y: 150, props: { distance: 60, mount: 'bin' } },
                { id: 'sv', type: 'servo', x: 720, y: 330, props: { mount: 'lid' } }
            ],
            wires: [W('board:5V', 'us:VCC'), W('board:3', 'us:TRIG'), W('board:4', 'us:ECHO'), W('board:GND', 'us:GND'),
                W('board:5', 'sv:SIG'), W('board:5V', 'sv:VCC'), W('board:GND', 'sv:GND')],
            code: `// Smart dustbin: the lid opens when a hand comes closer than 20 cm
#include <ESP32Servo.h>

const int TRIG = 3;
const int ECHO = 4;
const int SERVO_PIN = 5;
Servo lid;

long readDistanceCm() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long duration = pulseIn(ECHO, HIGH, 30000);
  return duration * 0.034 / 2;
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  lid.attach(SERVO_PIN);
  lid.write(0);          // closed
}

void loop() {
  long cm = readDistanceCm();
  Serial.print("Distance: ");
  Serial.print(cm);
  Serial.println(" cm");

  if (cm > 0 && cm < 20) {
    lid.write(100);      // open
    delay(3000);         // keep it open for 3 s
  } else {
    lid.write(0);
  }
  delay(200);
}
`
        },
        {
            id: 'obstacle-car', title: 'Obstacle-avoiding car', world: 'arena',
            parts: [...motorParts, { id: 'us', type: 'hcsr04', x: 700, y: 150, props: { mount: 'front' } }],
            wires: [...motorWiring, W('board:5V', 'us:VCC'), W('board:3', 'us:TRIG'), W('board:4', 'us:ECHO'), W('board:GND', 'us:GND')],
            code: `// Obstacle-avoiding car: drive forward, back off and turn when something is near
${motorCode}
const int TRIG = 3, ECHO = 4;

float distanceCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t = pulseIn(ECHO, HIGH, 30000);
  if (t == 0) return 400;
  return t / 58.0;
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
}

void loop() {
  float d = distanceCm();
  Serial.println(d);
  if (d < 25) {
    stopCar();  delay(150);
    backward(); delay(300);
    right();    delay(350);
  } else {
    forward();
  }
  delay(40);
}
`
        },
        {
            id: 'line-follower', title: 'Line follower', world: 'line',
            parts: [...motorParts,
                { id: 'irL', type: 'irline', x: 690, y: 140, props: { mount: 'left' } },
                { id: 'irR', type: 'irline', x: 800, y: 140, props: { mount: 'right' } }],
            wires: [...motorWiring,
                W('board:3V3', 'irL:VCC'), W('board:GND', 'irL:GND'), W('board:0', 'irL:DO'),
                W('board:3V3', 'irR:VCC'), W('board:GND', 'irR:GND'), W('board:1', 'irR:DO')],
            code: `// Line follower: the black line runs between the two sensors.
// A sensor reads HIGH when it is over the black line.
${motorCode}
const int LEFT_IR = 0, RIGHT_IR = 1;

void setup() {
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  pinMode(LEFT_IR, INPUT); pinMode(RIGHT_IR, INPUT);
}

void loop() {
  int l = digitalRead(LEFT_IR);
  int r = digitalRead(RIGHT_IR);
  if (l == LOW && r == LOW) forward();        // line between the sensors
  else if (l == HIGH && r == LOW) left();     // line under the left sensor: turn left
  else if (l == LOW && r == HIGH) right();    // line under the right sensor: turn right
  else stopCar();                             // both on black: a crossing or the end
}
`
        },
        {
            id: 'rc-car', title: 'Wi-Fi RC car (web buttons)', world: 'arena',
            parts: [...motorParts],
            wires: [...motorWiring],
            code: `// Wi-Fi RC car: the ESP32-C3 makes a hotspot; each web page moves the car.
// In the simulator, drive it from the Remote tab (or the arrow keys).
#include <WiFi.h>
#include <WebServer.h>

${motorCode}
WebServer server(80);

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  WiFi.softAP("RC-Car", "12345678");
  Serial.print("Connect to RC-Car, then open http://");
  Serial.println(WiFi.softAPIP());

  server.on("/forward", []() { forward();  server.send(200, "text/plain", "forward"); });
  server.on("/back",    []() { backward(); server.send(200, "text/plain", "back"); });
  server.on("/left",    []() { left();     server.send(200, "text/plain", "left"); });
  server.on("/right",   []() { right();    server.send(200, "text/plain", "right"); });
  server.on("/stop",    []() { stopCar();  server.send(200, "text/plain", "stop"); });
  server.begin();
}

void loop() {
  server.handleClient();
}
`
        },
        {
            id: 'weather', title: 'Weather station (DHT11 + light)', world: 'none',
            parts: [
                { id: 'dht', type: 'dht11', x: 700, y: 150, props: { temp: 31, hum: 58 } },
                { id: 'ldr', type: 'ldr', x: 820, y: 150, props: { light: 70 } },
                { id: 'led', type: 'led', x: 740, y: 360, props: { color: 'red' } }
            ],
            wires: [W('board:3V3', 'dht:VCC'), W('board:4', 'dht:DATA'), W('board:GND', 'dht:GND'),
                W('board:3V3', 'ldr:VCC'), W('board:GND', 'ldr:GND'), W('board:3', 'ldr:AO'),
                W('board:5', 'led:A'), W('board:GND', 'led:K')],
            code: `// Weather station: temperature, humidity and light, with a "too hot" LED
#include <DHT.h>

DHT dht(4, DHT11);
const int LIGHT_PIN = 3;   // LDR module AO (higher = darker)
const int HOT_LED = 5;

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(HOT_LED, OUTPUT);
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int dark = analogRead(LIGHT_PIN);
  if (isnan(t) || isnan(h)) {
    Serial.println("DHT read failed");
  } else {
    Serial.printf("Temp %.1f C   Humidity %.0f %%   Darkness %d\\n", t, h, dark);
    digitalWrite(HOT_LED, t > 30 ? HIGH : LOW);
  }
  delay(1000);
}
`
        },
        {
            id: 'playground', title: 'Sensor playground', world: 'none',
            parts: [
                { id: 'pot', type: 'pot', x: 140, y: 120, props: { value: 30 } },
                { id: 'btn', type: 'button', x: 160, y: 300, props: {} },
                { id: 'pir', type: 'pir', x: 130, y: 440, props: {} },
                { id: 'led', type: 'led', x: 740, y: 140, props: { color: 'yellow' } },
                { id: 'bz', type: 'buzzer', x: 830, y: 140, props: {} },
                { id: 'ir', type: 'irobstacle', x: 760, y: 330, props: {} }
            ],
            wires: [W('board:3V3', 'pot:VCC'), W('board:0', 'pot:OUT'), W('board:GND', 'pot:GND'),
                W('board:10', 'btn:1'), W('board:GND', 'btn:2'),
                W('board:5V', 'pir:VCC'), W('board:7', 'pir:OUT'), W('board:GND', 'pir:GND'),
                W('board:5', 'led:A'), W('board:GND', 'led:K'),
                W('board:6', 'bz:P'), W('board:GND', 'bz:N'),
                W('board:3V3', 'ir:VCC'), W('board:GND', 'ir:GND'), W('board:1', 'ir:OUT')],
            code: `// Sensor playground: knob dims the LED, button or PIR beeps, IR sensor reports obstacles
const int POT = 0, IR = 1, LED = 5, BUZZER = 6, PIR = 7, BUTTON = 10;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(PIR, INPUT);
  pinMode(IR, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  int knob = analogRead(POT);                 // 0 - 4095
  analogWrite(LED, map(knob, 0, 4095, 0, 255));

  if (digitalRead(BUTTON) == LOW || digitalRead(PIR) == HIGH) tone(BUZZER, 880);
  else noTone(BUZZER);

  if (digitalRead(IR) == LOW) Serial.println("Obstacle!");
  delay(100);
}
`
        }
    ];

    const api = { PROJECTS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SimProjects = api;
})(typeof window !== 'undefined' ? window : globalThis);
