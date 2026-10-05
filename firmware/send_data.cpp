/*
 * ESP32 Firmware - Send Charging Station Data to Backend
 *
 * Hardware:
 * - ESP32
 * - SH1106 128x64 OLED using I2C (SDA=21, SCL=22)
 * - ZMPT101B voltage sensor on GPIO 34
 * - ACS712 current sensor for plug 1 on GPIO 33
 * - ACS712 current sensor for plug 2 on GPIO 32
 * - ACS712 current sensor for plug 3 on GPIO 25
 */

#include <Wire.h>
#include <U8g2lib.h>
#include <math.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// OLED
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0);

// WiFi details
const char* ssid = "Deeksha";
const char* password = "deekshas04";

// Backend URL
String serverURL = "http://10.201.34.114:8000/station/update";

// API Key
const char* API_KEY = "gridpulz-esp32-secret-key-12345678";

// Pins
#define S1   33
#define S2   32
#define S3   25
#define VOLT 34

// ADC
const float VREF = 3.3;
const int ADC_MAX = 4095;

// Sensor calibration
float ACS_SENS = 0.185;
float VOLT_CAL = 635.0;

// Current offsets
float off1, off2, off3;

// No-load baseline currents
float base1, base2, base3;

// Final cutoff
float finalCutoff = 0.015;

// Send interval
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 5000;


float getOffset(int pin) {
  long sum = 0;

  for (int i = 0; i < 1000; i++) {
    sum += analogRead(pin);
    delayMicroseconds(300);
  }

  return sum / 1000.0;
}

float readCurrentRaw(int pin, float offset) {
  float sumSq = 0;

  for (int i = 0; i < 1000; i++) {
    float raw = analogRead(pin);
    float diff = raw - offset;

    float sensorVoltage = diff * (VREF / ADC_MAX);
    float current = sensorVoltage / ACS_SENS;

    sumSq += current * current;
    delayMicroseconds(250);
  }

  return sqrt(sumSq / 1000.0);
}

float cleanCurrent(float measured, float baseline) {
  float actual = measured - baseline;

  if (actual < finalCutoff) {
    actual = 0;
  }

  return actual;
}

float readVoltage(int pin) {
  float mean = 0;

  for (int i = 0; i < 1000; i++) {
    mean += analogRead(pin);
    delayMicroseconds(250);
  }

  mean /= 1000.0;

  float sumSq = 0;

  for (int i = 0; i < 1000; i++) {
    float raw = analogRead(pin);
    float diff = raw - mean;

    float sensorVoltage = diff * (VREF / ADC_MAX);
    sumSq += sensorVoltage * sensorVoltage;

    delayMicroseconds(250);
  }

  float vrms_adc = sqrt(sumSq / 1000.0);
  float voltage = vrms_adc * VOLT_CAL;

  if (voltage < 20) {
    voltage = 0;
  }

  return voltage;
}

void showOLED(float v, float p1, float p2, float p3, String s1, String s2, String s3) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);

  char line[30];

  snprintf(line, sizeof(line), "V: %.1f V", v);
  u8g2.drawStr(0, 10, line);

  snprintf(line, sizeof(line), "P1: %.1fW %s", p1, s1.c_str());
  u8g2.drawStr(0, 25, line);

  snprintf(line, sizeof(line), "P2: %.1fW %s", p2, s2.c_str());
  u8g2.drawStr(0, 40, line);

  snprintf(line, sizeof(line), "P3: %.1fW %s", p3, s3.c_str());
  u8g2.drawStr(0, 55, line);

  u8g2.sendBuffer();
}

void connectWiFi() {
  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi...");

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(0, 30, "Connecting WiFi");
  u8g2.sendBuffer();

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting...");
  }

  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  u8g2.clearBuffer();
  u8g2.drawStr(0, 30, "WiFi Connected");
  u8g2.sendBuffer();
  delay(1000);
}

void sendToCloud(float v, float p1, float p2, float p3,
                 String s1, String s2, String s3) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  StaticJsonDocument<300> doc;

  doc["station_id"] = "STATION_01";
  doc["voltage"] = v;
  doc["plug1_power"] = p1;
  doc["plug2_power"] = p2;
  doc["plug3_power"] = p3;
  doc["plug1_status"] = s1;
  doc["plug2_status"] = s2;
  doc["plug3_status"] = s3;

  String jsonData;
  serializeJson(doc, jsonData);

  int responseCode = http.POST(jsonData);

  Serial.print("Cloud Response: ");
  Serial.println(responseCode);


  Serial.print("JSON Sent: ");
  Serial.println(jsonData);

  http.end();
}

void setup() {
  Serial.begin(115200);

  Wire.begin(21, 22);
  u8g2.begin();

  analogReadResolution(12);
  analogSetPinAttenuation(S1, ADC_11db);
  analogSetPinAttenuation(S2, ADC_11db);
  analogSetPinAttenuation(S3, ADC_11db);
  analogSetPinAttenuation(VOLT, ADC_11db);

  connectWiFi();

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(0, 25, "Turn OFF loads");
  u8g2.drawStr(0, 45, "Calibrating...");
  u8g2.sendBuffer();

  Serial.println("Turn OFF all loads...");
  delay(5000);

  off1 = getOffset(S1);
  off2 = getOffset(S2);
  off3 = getOffset(S3);

  base1 = readCurrentRaw(S1, off1);
  base2 = readCurrentRaw(S2, off2);
  base3 = readCurrentRaw(S3, off3);

  Serial.println("Calibration done");

  Serial.print("Offsets: ");
  Serial.print(off1);
  Serial.print(" ");
  Serial.print(off2);
  Serial.print(" ");
  Serial.println(off3);

  Serial.print("Base currents: ");
  Serial.print(base1, 4);
  Serial.print(" ");
  Serial.print(base2, 4);
  Serial.print(" ");
  Serial.println(base3, 4);

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.drawStr(10, 35, "Ready");
  u8g2.sendBuffer();

  delay(1000);
}

void loop() {
  float v = readVoltage(VOLT);

  float rawI1 = readCurrentRaw(S1, off1);
  float rawI2 = readCurrentRaw(S2, off2);
  float rawI3 = readCurrentRaw(S3, off3);

  float i1 = cleanCurrent(rawI1, base1);
  float i2 = cleanCurrent(rawI2, base2);
  float i3 = cleanCurrent(rawI3, base3);

  float p1 = v * i1;
  float p2 = v * i2;
  float p3 = v * i3;

  if (v == 0) {
    p1 = 0;
    p2 = 0;
    p3 = 0;
  }

  String status1 = (p1 > 50.0) ? "occupied" : "free";
  String status2 = (p2 > 50.0) ? "occupied" : "free";
  String status3 = (p3 > 50.0) ? "occupied" : "free";

  if (status1 == "free") {
    i1 = 0;
    p1 = 0;
  }

  if (status2 == "free") {
    i2 = 0;
    p2 = 0;
  }

  if (status3 == "free") {
    i3 = 0;
    p3 = 0;
  }

  Serial.print("V: "); Serial.print(v, 1);

  Serial.print(" | I1: "); Serial.print(i1, 3);
  Serial.print(" | I2: "); Serial.print(i2, 3);
  Serial.print(" | I3: "); Serial.print(i3, 3);

  Serial.print(" | P1: "); Serial.print(p1, 1);
  Serial.print(" | P2: "); Serial.print(p2, 1);
  Serial.print(" | P3: "); Serial.print(p3, 1);

  Serial.print(" | S1: "); Serial.print(status1);
  Serial.print(" | S2: "); Serial.print(status2);
  Serial.print(" | S3: "); Serial.println(status3);

  showOLED(v, p1, p2, p3, status1, status2, status3);

  if (millis() - lastSendTime >= sendInterval) {
    sendToCloud(v, p1, p2, p3, status1, status2, status3);
    lastSendTime = millis();
  }

  delay(1000);
}
