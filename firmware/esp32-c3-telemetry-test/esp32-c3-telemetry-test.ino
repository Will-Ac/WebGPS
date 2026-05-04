/*
  WebGPS ESP32-C3 telemetry bridge prototype.

  Stage 1: simulated CRSF telemetry frames are injected into the parser and
  decoded JSON is printed to USB serial.

  Stage 2: set USE_SIMULATED_CRSF_INPUT to 0 and wire Pocket AUX TX /
  Telemetry Mirror to ESP32-C3 GPIO20 for receive-only CRSF probing at
  115200 baud, normal UART polarity.

  Stage 3: set ENABLE_WIFI_WEBSOCKET to 1 to serve the setup page and
  broadcast JSON telemetry to WebGPS over a local WebSocket.
*/

#ifndef USE_SIMULATED_CRSF_INPUT
#define USE_SIMULATED_CRSF_INPUT 0
#endif

#ifndef ENABLE_WIFI_WEBSOCKET
#define ENABLE_WIFI_WEBSOCKET 1
#endif

#ifndef CRSF_UART_BAUD
#define CRSF_UART_BAUD 115200
#endif

#ifndef CRSF_UART_INVERTED
#define CRSF_UART_INVERTED 0
#endif

#include <Arduino.h>

#if ENABLE_WIFI_WEBSOCKET
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiServer.h>
#include "mbedtls/base64.h"
#include "mbedtls/sha1.h"
#endif

static const uint32_t USB_SERIAL_BAUD = 115200;
static const uint32_t CRSF_BAUD = CRSF_UART_BAUD;
static const bool CRSF_UART_RX_INVERTED = CRSF_UART_INVERTED != 0;
static const uint8_t CRSF_RX_PIN = 20;
static const uint8_t CRSF_TX_PIN = 21;
static const uint8_t CRSF_MAX_FRAME_SIZE = 64;
static const uint8_t CRSF_MIN_LENGTH = 4;
static const uint8_t CRSF_MAX_LENGTH = 62;

static const uint8_t CRSF_ADDRESS_FLIGHT_CONTROLLER = 0xC8;
static const uint8_t CRSF_ADDRESS_RADIO_TRANSMITTER = 0xEA;
static const uint8_t CRSF_ADDRESS_CRSF_RECEIVER = 0xEC;
static const uint8_t CRSF_ADDRESS_CRSF_TRANSMITTER = 0xEE;

static const uint8_t CRSF_FRAMETYPE_GPS = 0x02;
static const uint8_t CRSF_FRAMETYPE_VARIO = 0x07;
static const uint8_t CRSF_FRAMETYPE_BATTERY_SENSOR = 0x08;
static const uint8_t CRSF_FRAMETYPE_BARO_ALTITUDE = 0x09;
static const uint8_t CRSF_FRAMETYPE_AIRSPEED = 0x0A;
static const uint8_t CRSF_FRAMETYPE_LINK_STATISTICS = 0x14;
static const uint8_t CRSF_FRAMETYPE_RC_CHANNELS_PACKED = 0x16;
static const uint8_t CRSF_FRAMETYPE_ATTITUDE = 0x1E;
static const uint8_t CRSF_FRAMETYPE_FLIGHT_MODE = 0x21;

static const uint32_t SERIAL_REPORT_INTERVAL_MS = 1000;
static const uint32_t SIMULATED_FRAME_INTERVAL_MS = 200;
static const uint32_t TELEMETRY_TIMEOUT_MS = 1500;
static const uint32_t WEBSOCKET_BROADCAST_INTERVAL_MS = 150;

#if ENABLE_WIFI_WEBSOCKET
static const char* WIFI_AP_SSID = "WebGPS-Telemetry";
static const char* WIFI_AP_PASSWORD = "webgps123";
static const uint32_t WIFI_STA_CONNECT_TIMEOUT_MS = 15000;
static const char* WIFI_PREFS_NAMESPACE = "webgps";
static const char* WIFI_PREFS_STA_SSID_KEY = "staSsid";
static const char* WIFI_PREFS_STA_PASSWORD_KEY = "staPass";
static const uint8_t WEBSOCKET_CLIENT_LIMIT = 4;
WiFiServer fieldServer(80);
WiFiClient webSocketClients[WEBSOCKET_CLIENT_LIMIT];
Preferences wifiPrefs;
String savedStaSsid;
String savedStaPassword;
wl_status_t lastStationStatus = WL_IDLE_STATUS;
String lastStationMessage = "Station not configured.";
#endif

struct TelemetryData {
  bool hasGps = false;
  bool hasPosition = false;
  bool hasBattery = false;
  bool hasLinkStats = false;
  bool hasVario = false;
  bool hasBaroAltitude = false;
  bool hasAirSpeed = false;
  bool hasAttitude = false;
  bool hasFlightMode = false;
  bool hasRcChannels = false;
  bool armed = false;

  double latitude = 0.0;
  double longitude = 0.0;
  float gpsSpeedKph = 0.0f;
  int32_t gpsAltitudeM = 0;
  float gpsHeadingDeg = 0.0f;
  uint8_t gpsSatellites = 0;
  bool gpsFix = false;

  float batteryVoltageV = 0.0f;
  float batteryCurrentA = 0.0f;
  uint32_t batteryCapacityMah = 0;

  int8_t uplinkRssiAnt1Dbm = 0;
  int8_t uplinkRssiAnt2Dbm = 0;
  uint8_t uplinkLq = 0;
  int8_t uplinkSnr = 0;
  uint8_t activeAntenna = 0;
  uint8_t rfMode = 0;
  uint8_t txPower = 0;
  int8_t downlinkRssiDbm = 0;
  uint8_t downlinkLq = 0;
  int8_t downlinkSnr = 0;

  float verticalSpeed = 0.0f;
  int32_t baroAltitudeM = 0;
  float airSpeedKph = 0.0f;
  float pitchDeg = 0.0f;
  float rollDeg = 0.0f;
  float yawDeg = 0.0f;
  char flightMode[16] = "";
  uint16_t rcChannelsUs[16] = {};

  uint32_t lastFrameMs = 0;
};

struct FrameTypeCount {
  uint8_t type = 0;
  uint32_t count = 0;
};

struct FrameCounts {
  uint32_t total = 0;
  uint32_t gps = 0;
  uint32_t battery = 0;
  uint32_t vario = 0;
  uint32_t baroAltitude = 0;
  uint32_t airspeed = 0;
  uint32_t linkStats = 0;
  uint32_t rcChannels = 0;
  uint32_t attitude = 0;
  uint32_t flightMode = 0;
  uint32_t unknown = 0;
  uint32_t invalidSize = 0;
  uint32_t crcErrors = 0;
  uint32_t resyncs = 0;
};

struct ReceiveDiagnostics {
  static const uint8_t RAW_BYTE_HISTORY_SIZE = 32;
  static const uint8_t FRAME_TYPE_HISTORY_SIZE = 16;

  uint32_t validFramesSinceBoot = 0;
  uint32_t decodedFramesSinceBoot = 0;
  uint32_t lastValidFrameMs = 0;
  uint8_t lastFrameAddress = 0;
  uint8_t lastFrameType = 0;
  uint8_t lastUnknownFrameType = 0;
  uint8_t lastInvalidSizeFrameType = 0;
  uint8_t lastInvalidSizeLength = 0;
  bool hasLastFrame = false;
  bool hasLastUnknownFrame = false;
  bool hasLastInvalidSize = false;
  uint8_t rawBytes[RAW_BYTE_HISTORY_SIZE] = {};
  uint8_t rawByteIndex = 0;
  uint8_t rawByteCount = 0;
  FrameTypeCount frameTypes[FRAME_TYPE_HISTORY_SIZE] = {};

  void recordRawByte(uint8_t byte) {
    rawBytes[rawByteIndex] = byte;
    rawByteIndex = (rawByteIndex + 1) % RAW_BYTE_HISTORY_SIZE;
    if (rawByteCount < RAW_BYTE_HISTORY_SIZE) {
      rawByteCount += 1;
    }
  }

  void recordValidFrame(uint8_t address, uint8_t frameType) {
    validFramesSinceBoot += 1;
    lastValidFrameMs = millis();
    lastFrameAddress = address;
    lastFrameType = frameType;
    hasLastFrame = true;

    for (uint8_t i = 0; i < FRAME_TYPE_HISTORY_SIZE; i += 1) {
      if (frameTypes[i].count > 0 && frameTypes[i].type == frameType) {
        frameTypes[i].count += 1;
        return;
      }
    }

    for (uint8_t i = 0; i < FRAME_TYPE_HISTORY_SIZE; i += 1) {
      if (frameTypes[i].count == 0) {
        frameTypes[i].type = frameType;
        frameTypes[i].count = 1;
        return;
      }
    }
  }

  void recordDecodedFrame() {
    decodedFramesSinceBoot += 1;
  }

  void recordUnknownFrame(uint8_t frameType) {
    lastUnknownFrameType = frameType;
    hasLastUnknownFrame = true;
  }

  void recordInvalidSize(uint8_t frameType, uint8_t length) {
    lastInvalidSizeFrameType = frameType;
    lastInvalidSizeLength = length;
    hasLastInvalidSize = true;
  }
};

class CrsfParser {
 public:
  bool push(uint8_t byte, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    diagnostics.recordRawByte(byte);

    switch (state_) {
      case State::Address:
        if (!isSyncAddress(byte)) {
          counts.resyncs += 1;
          return false;
        }
        address_ = byte;
        buffer_[0] = byte;
        index_ = 1;
        state_ = State::Length;
        return false;

      case State::Length:
        if (byte < CRSF_MIN_LENGTH || byte > CRSF_MAX_LENGTH) {
          reset();
          counts.resyncs += 1;
          return false;
        }
        length_ = byte;
        buffer_[index_++] = byte;
        state_ = State::PayloadAndCrc;
        return false;

      case State::PayloadAndCrc:
        buffer_[index_++] = byte;
        if (index_ >= length_ + 2) {
          const bool parsed = parseFrame(telemetry, counts, diagnostics);
          reset();
          return parsed;
        }
        return false;
    }

    reset();
    return false;
  }

 private:
  enum class State {
    Address,
    Length,
    PayloadAndCrc
  };

  State state_ = State::Address;
  uint8_t address_ = 0;
  uint8_t length_ = 0;
  uint8_t index_ = 0;
  uint8_t buffer_[CRSF_MAX_FRAME_SIZE] = {};

  static bool isSyncAddress(uint8_t address) {
    return address == CRSF_ADDRESS_FLIGHT_CONTROLLER ||
           address == CRSF_ADDRESS_RADIO_TRANSMITTER ||
           address == CRSF_ADDRESS_CRSF_RECEIVER ||
           address == CRSF_ADDRESS_CRSF_TRANSMITTER;
  }

  void reset() {
    state_ = State::Address;
    address_ = 0;
    length_ = 0;
    index_ = 0;
  }

  static uint8_t crc8D5(const uint8_t* data, uint8_t len) {
    uint8_t crc = 0;
    while (len--) {
      crc ^= *data++;
      for (uint8_t bit = 0; bit < 8; bit += 1) {
        crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0xD5) : static_cast<uint8_t>(crc << 1);
      }
    }
    return crc;
  }

  static int16_t readI16BE(const uint8_t* data) {
    return static_cast<int16_t>((static_cast<uint16_t>(data[0]) << 8) | data[1]);
  }

  static int32_t readI32BE(const uint8_t* data) {
    const uint32_t value = (static_cast<uint32_t>(data[0]) << 24) |
                           (static_cast<uint32_t>(data[1]) << 16) |
                           (static_cast<uint32_t>(data[2]) << 8) |
                           static_cast<uint32_t>(data[3]);
    return static_cast<int32_t>(value);
  }

  static uint16_t readU16BE(const uint8_t* data) {
    return (static_cast<uint16_t>(data[0]) << 8) | data[1];
  }

  static uint32_t readU24BE(const uint8_t* data) {
    return (static_cast<uint32_t>(data[0]) << 16) |
           (static_cast<uint32_t>(data[1]) << 8) |
           static_cast<uint32_t>(data[2]);
  }

  static uint16_t remapChannelToUs(uint16_t value) {
    int32_t v = static_cast<int32_t>(value) - 992;
    v = v * (2012 - 988) / (1811 - 172);
    v += 1500;
    if (v < 800) {
      return 800;
    }
    if (v > 2200) {
      return 2200;
    }
    return static_cast<uint16_t>(v);
  }

  void markDecoded(TelemetryData& telemetry, ReceiveDiagnostics& diagnostics) {
    telemetry.lastFrameMs = millis();
    diagnostics.recordDecodedFrame();
  }

  bool parseFrame(TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    const uint8_t frameType = buffer_[2];
    const uint8_t payloadLength = length_ - 2;
    const uint8_t* payload = &buffer_[3];
    const uint8_t expectedCrc = buffer_[length_ + 1];
    const uint8_t calculatedCrc = crc8D5(&buffer_[2], length_ - 1);

    if (calculatedCrc != expectedCrc) {
      counts.crcErrors += 1;
      return false;
    }

    counts.total += 1;
    diagnostics.recordValidFrame(address_, frameType);

    switch (frameType) {
      case CRSF_FRAMETYPE_GPS:
        return parseGps(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_BATTERY_SENSOR:
        return parseBattery(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_VARIO:
        return parseVario(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_BARO_ALTITUDE:
        return parseBaroAltitude(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_AIRSPEED:
        return parseAirspeed(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_LINK_STATISTICS:
        return parseLinkStats(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_RC_CHANNELS_PACKED:
        return parseRcChannels(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_ATTITUDE:
        return parseAttitude(payload, payloadLength, telemetry, counts, diagnostics);
      case CRSF_FRAMETYPE_FLIGHT_MODE:
        return parseFlightMode(payload, payloadLength, telemetry, counts, diagnostics);
      default:
        counts.unknown += 1;
        diagnostics.recordUnknownFrame(frameType);
        return false;
    }
  }

  bool rejectInvalidSize(uint8_t frameType, uint8_t payloadLength, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    counts.invalidSize += 1;
    diagnostics.recordInvalidSize(frameType, payloadLength);
    return false;
  }

  bool parseGps(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 15) {
      return rejectInvalidSize(CRSF_FRAMETYPE_GPS, payloadLength, counts, diagnostics);
    }

    const int32_t latitudeRaw = readI32BE(&payload[0]);
    const int32_t longitudeRaw = readI32BE(&payload[4]);
    const uint16_t speedRaw = readU16BE(&payload[8]);
    const uint16_t headingRaw = readU16BE(&payload[10]);
    const uint16_t altitudeRaw = readU16BE(&payload[12]);

    telemetry.latitude = latitudeRaw / 10000000.0;
    telemetry.longitude = longitudeRaw / 10000000.0;
    telemetry.gpsSpeedKph = speedRaw / 10.0f;
    telemetry.gpsHeadingDeg = headingRaw / 100.0f;
    telemetry.gpsAltitudeM = static_cast<int32_t>(altitudeRaw) - 1000;
    telemetry.gpsSatellites = payload[14];
    telemetry.gpsFix = telemetry.gpsSatellites > 6 && latitudeRaw != 0 && longitudeRaw != 0;
    telemetry.hasGps = true;
    telemetry.hasPosition = latitudeRaw != 0 && longitudeRaw != 0;
    counts.gps += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseBattery(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 8) {
      return rejectInvalidSize(CRSF_FRAMETYPE_BATTERY_SENSOR, payloadLength, counts, diagnostics);
    }

    telemetry.batteryVoltageV = readU16BE(&payload[0]) / 10.0f;
    telemetry.batteryCurrentA = readU16BE(&payload[2]) / 10.0f;
    telemetry.batteryCapacityMah = readU24BE(&payload[4]);
    telemetry.hasBattery = true;
    counts.battery += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseVario(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 2) {
      return rejectInvalidSize(CRSF_FRAMETYPE_VARIO, payloadLength, counts, diagnostics);
    }

    telemetry.verticalSpeed = readI16BE(&payload[0]) / 10.0f;
    telemetry.hasVario = true;
    counts.vario += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseBaroAltitude(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 2) {
      return rejectInvalidSize(CRSF_FRAMETYPE_BARO_ALTITUDE, payloadLength, counts, diagnostics);
    }

    telemetry.baroAltitudeM = static_cast<int32_t>(readU16BE(&payload[0])) - 1000;
    telemetry.hasBaroAltitude = true;
    counts.baroAltitude += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseAirspeed(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 2) {
      return rejectInvalidSize(CRSF_FRAMETYPE_AIRSPEED, payloadLength, counts, diagnostics);
    }

    telemetry.airSpeedKph = readU16BE(&payload[0]) * 0.036f;
    telemetry.hasAirSpeed = true;
    counts.airspeed += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseLinkStats(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 10) {
      return rejectInvalidSize(CRSF_FRAMETYPE_LINK_STATISTICS, payloadLength, counts, diagnostics);
    }

    telemetry.uplinkRssiAnt1Dbm = -static_cast<int8_t>(abs(static_cast<int8_t>(payload[0])));
    telemetry.uplinkRssiAnt2Dbm = -static_cast<int8_t>(abs(static_cast<int8_t>(payload[1])));
    telemetry.uplinkLq = payload[2];
    telemetry.uplinkSnr = static_cast<int8_t>(payload[3]);
    telemetry.activeAntenna = payload[4];
    telemetry.rfMode = payload[5];
    telemetry.txPower = payload[6];
    telemetry.downlinkRssiDbm = -static_cast<int8_t>(abs(static_cast<int8_t>(payload[7])));
    telemetry.downlinkLq = payload[8];
    telemetry.downlinkSnr = static_cast<int8_t>(payload[9]);
    telemetry.hasLinkStats = true;
    counts.linkStats += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseRcChannels(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 22) {
      return rejectInvalidSize(CRSF_FRAMETYPE_RC_CHANNELS_PACKED, payloadLength, counts, diagnostics);
    }

    uint32_t readValue = 0;
    uint8_t bitsMerged = 0;
    uint8_t payloadIndex = 0;

    for (uint8_t channel = 0; channel < 16; channel += 1) {
      while (bitsMerged < 11 && payloadIndex < payloadLength) {
        readValue |= static_cast<uint32_t>(payload[payloadIndex++]) << bitsMerged;
        bitsMerged += 8;
      }

      telemetry.rcChannelsUs[channel] = remapChannelToUs(static_cast<uint16_t>(readValue & 0x07FF));
      readValue >>= 11;
      bitsMerged -= 11;
    }

    telemetry.hasRcChannels = true;
    counts.rcChannels += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseAttitude(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength != 6) {
      return rejectInvalidSize(CRSF_FRAMETYPE_ATTITUDE, payloadLength, counts, diagnostics);
    }

    telemetry.pitchDeg = readI16BE(&payload[0]) * 180.0f / 31415.9f;
    telemetry.rollDeg = readI16BE(&payload[2]) * 180.0f / 31415.9f;
    telemetry.yawDeg = readI16BE(&payload[4]) * 180.0f / 31415.9f;
    telemetry.hasAttitude = true;
    counts.attitude += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }

  bool parseFlightMode(const uint8_t* payload, uint8_t payloadLength, TelemetryData& telemetry, FrameCounts& counts, ReceiveDiagnostics& diagnostics) {
    if (payloadLength < 2) {
      return rejectInvalidSize(CRSF_FRAMETYPE_FLIGHT_MODE, payloadLength, counts, diagnostics);
    }

    bool modeHasDisarmedMarker = false;
    uint8_t payloadIndex = 0;
    uint8_t copyLength = 0;
    while (payloadIndex < payloadLength && payload[payloadIndex] != 0 && copyLength < sizeof(telemetry.flightMode) - 1) {
      const char character = static_cast<char>(payload[payloadIndex]);
      payloadIndex += 1;
      if (character == '*') {
        modeHasDisarmedMarker = true;
        continue;
      }
      if (character == '?') {
        continue;
      }
      telemetry.flightMode[copyLength] = character;
      copyLength += 1;
    }
    telemetry.flightMode[copyLength] = '\0';
    telemetry.armed = !modeHasDisarmedMarker;
    telemetry.hasFlightMode = copyLength > 0;
    counts.flightMode += 1;
    markDecoded(telemetry, diagnostics);
    return true;
  }
};

CrsfParser parser;
TelemetryData telemetry;
FrameCounts frameCounts;
ReceiveDiagnostics receiveDiagnostics;
uint32_t lastSerialReportMs = 0;
uint32_t lastSimulatedFrameMs = 0;
uint32_t lastWebSocketBroadcastMs = 0;
uint32_t simulatedSequence = 0;

uint8_t crc8D5ForSimulation(const uint8_t* data, uint8_t len) {
  uint8_t crc = 0;
  while (len--) {
    crc ^= *data++;
    for (uint8_t bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0xD5) : static_cast<uint8_t>(crc << 1);
    }
  }
  return crc;
}

void appendI16BE(uint8_t* data, uint8_t offset, int16_t value) {
  data[offset] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[offset + 1] = static_cast<uint8_t>(value & 0xFF);
}

void appendI32BE(uint8_t* data, uint8_t offset, int32_t value) {
  data[offset] = static_cast<uint8_t>((value >> 24) & 0xFF);
  data[offset + 1] = static_cast<uint8_t>((value >> 16) & 0xFF);
  data[offset + 2] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[offset + 3] = static_cast<uint8_t>(value & 0xFF);
}

void appendU16BE(uint8_t* data, uint8_t offset, uint16_t value) {
  data[offset] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[offset + 1] = static_cast<uint8_t>(value & 0xFF);
}

void appendU24BE(uint8_t* data, uint8_t offset, uint32_t value) {
  data[offset] = static_cast<uint8_t>((value >> 16) & 0xFF);
  data[offset + 1] = static_cast<uint8_t>((value >> 8) & 0xFF);
  data[offset + 2] = static_cast<uint8_t>(value & 0xFF);
}

void injectFrame(uint8_t frameType, const uint8_t* payload, uint8_t payloadLength) {
  uint8_t frame[CRSF_MAX_FRAME_SIZE] = {};
  frame[0] = CRSF_ADDRESS_FLIGHT_CONTROLLER;
  frame[1] = payloadLength + 2;
  frame[2] = frameType;
  memcpy(&frame[3], payload, payloadLength);
  frame[payloadLength + 3] = crc8D5ForSimulation(&frame[2], payloadLength + 1);

  for (uint8_t i = 0; i < payloadLength + 4; i += 1) {
    parser.push(frame[i], telemetry, frameCounts, receiveDiagnostics);
  }
}

void appendRcChannelsPacked(uint8_t* payload, const uint16_t* channels) {
  memset(payload, 0, 22);
  uint32_t bitIndex = 0;
  for (uint8_t channel = 0; channel < 16; channel += 1) {
    const uint16_t value = channels[channel] & 0x07FF;
    for (uint8_t bit = 0; bit < 11; bit += 1) {
      if ((value & (1 << bit)) != 0) {
        payload[bitIndex / 8] |= 1 << (bitIndex % 8);
      }
      bitIndex += 1;
    }
  }
}

void injectSimulatedTelemetry() {
  const double baseLatitude = 51.4733071;
  const double baseLongitude = -2.5859117;
  const double drift = (simulatedSequence % 50) * 0.000004;
  const int32_t latitudeRaw = static_cast<int32_t>((baseLatitude + drift) * 10000000.0);
  const int32_t longitudeRaw = static_cast<int32_t>((baseLongitude - drift) * 10000000.0);
  const uint16_t speedRaw = 421 + (simulatedSequence % 12);
  const uint16_t headingRaw = 31200;
  const uint16_t altitudeRaw = 1123;
  const uint16_t voltageRaw = 157;
  const uint16_t currentRaw = 24;

  uint8_t gpsPayload[15] = {};
  appendI32BE(gpsPayload, 0, latitudeRaw);
  appendI32BE(gpsPayload, 4, longitudeRaw);
  appendU16BE(gpsPayload, 8, speedRaw);
  appendU16BE(gpsPayload, 10, headingRaw);
  appendU16BE(gpsPayload, 12, altitudeRaw);
  gpsPayload[14] = 10;
  injectFrame(CRSF_FRAMETYPE_GPS, gpsPayload, sizeof(gpsPayload));

  uint8_t batteryPayload[8] = {};
  appendU16BE(batteryPayload, 0, voltageRaw);
  appendU16BE(batteryPayload, 2, currentRaw);
  appendU24BE(batteryPayload, 4, 4694);
  batteryPayload[7] = 86;
  injectFrame(CRSF_FRAMETYPE_BATTERY_SENSOR, batteryPayload, sizeof(batteryPayload));

  uint8_t linkPayload[10] = {72, 74, 98, static_cast<uint8_t>(-6), 0, 3, 2, 81, 95, static_cast<uint8_t>(-8)};
  injectFrame(CRSF_FRAMETYPE_LINK_STATISTICS, linkPayload, sizeof(linkPayload));

  uint8_t varioPayload[2] = {};
  appendI16BE(varioPayload, 0, 12);
  injectFrame(CRSF_FRAMETYPE_VARIO, varioPayload, sizeof(varioPayload));

  uint8_t baroPayload[2] = {};
  appendU16BE(baroPayload, 0, 1131);
  injectFrame(CRSF_FRAMETYPE_BARO_ALTITUDE, baroPayload, sizeof(baroPayload));

  uint8_t airspeedPayload[2] = {};
  appendU16BE(airspeedPayload, 0, 1500);
  injectFrame(CRSF_FRAMETYPE_AIRSPEED, airspeedPayload, sizeof(airspeedPayload));

  uint8_t attitudePayload[6] = {};
  appendI16BE(attitudePayload, 0, 1745);
  appendI16BE(attitudePayload, 2, -872);
  appendI16BE(attitudePayload, 4, 15708);
  injectFrame(CRSF_FRAMETYPE_ATTITUDE, attitudePayload, sizeof(attitudePayload));

  uint8_t flightModePayload[5] = {'R', 'T', 'H', '*', 0};
  injectFrame(CRSF_FRAMETYPE_FLIGHT_MODE, flightModePayload, sizeof(flightModePayload));

  uint16_t channels[16] = {};
  for (uint8_t i = 0; i < 16; i += 1) {
    channels[i] = 992;
  }
  channels[0] = 172;
  channels[1] = 1811;
  uint8_t rcPayload[22] = {};
  appendRcChannelsPacked(rcPayload, channels);
  injectFrame(CRSF_FRAMETYPE_RC_CHANNELS_PACKED, rcPayload, sizeof(rcPayload));

  if ((simulatedSequence % 20) == 0) {
    const uint8_t noise[] = {0x00, 0xC0, 0x3C, 0xFC, 0x00, 0xC0, 0x38, 0xF8};
    for (uint8_t byte : noise) {
      parser.push(byte, telemetry, frameCounts, receiveDiagnostics);
    }

    uint8_t frame[6] = {
      CRSF_ADDRESS_FLIGHT_CONTROLLER,
      4,
      0x99,
      0xAA,
      0x55,
      0x00
    };
    for (uint8_t byte : frame) {
      parser.push(byte, telemetry, frameCounts, receiveDiagnostics);
    }
  }

  simulatedSequence += 1;
}

void appendHexByte(String& target, uint8_t value) {
  static const char* hex = "0123456789ABCDEF";
  target += hex[(value >> 4) & 0x0F];
  target += hex[value & 0x0F];
}

void appendHexJsonValue(String& target, uint8_t value, bool hasValue) {
  if (!hasValue) {
    target += "null";
    return;
  }

  target += "\"0x";
  appendHexByte(target, value);
  target += "\"";
}

void appendJsonString(String& target, const char* value, bool hasValue) {
  if (!hasValue) {
    target += "null";
    return;
  }

  target += "\"";
  for (uint8_t i = 0; value[i] != '\0'; i += 1) {
    if (value[i] == '"' || value[i] == '\\') {
      target += "\\";
    }
    target += value[i];
  }
  target += "\"";
}

void appendFloatOrNull(String& json, bool hasValue, float value, uint8_t decimals) {
  if (hasValue) {
    json += String(value, static_cast<unsigned int>(decimals));
  } else {
    json += "null";
  }
}

void appendIntOrNull(String& json, bool hasValue, int32_t value) {
  if (hasValue) {
    json += String(value);
  } else {
    json += "null";
  }
}

void appendUIntOrNull(String& json, bool hasValue, uint32_t value) {
  if (hasValue) {
    json += String(value);
  } else {
    json += "null";
  }
}

String rawByteHistoryHex() {
  String hex = "";
  for (uint8_t i = 0; i < receiveDiagnostics.rawByteCount; i += 1) {
    const uint8_t index = (receiveDiagnostics.rawByteIndex + ReceiveDiagnostics::RAW_BYTE_HISTORY_SIZE - receiveDiagnostics.rawByteCount + i) % ReceiveDiagnostics::RAW_BYTE_HISTORY_SIZE;
    if (i > 0) {
      hex += " ";
    }
    appendHexByte(hex, receiveDiagnostics.rawBytes[index]);
  }
  return hex;
}

void appendFrameTypeCountsJson(String& json) {
  json += "[";
  bool first = true;
  for (uint8_t i = 0; i < ReceiveDiagnostics::FRAME_TYPE_HISTORY_SIZE; i += 1) {
    if (receiveDiagnostics.frameTypes[i].count == 0) {
      continue;
    }

    if (!first) {
      json += ",";
    }
    first = false;

    json += "{\"type\":\"0x";
    appendHexByte(json, receiveDiagnostics.frameTypes[i].type);
    json += "\",\"count\":";
    json += receiveDiagnostics.frameTypes[i].count;
    json += "}";
  }
  json += "]";
}

void appendRcChannelsJson(String& json) {
  if (!telemetry.hasRcChannels) {
    json += "null";
    return;
  }

  json += "[";
  for (uint8_t i = 0; i < 16; i += 1) {
    if (i > 0) {
      json += ",";
    }
    json += telemetry.rcChannelsUs[i];
  }
  json += "]";
}

String telemetryJson() {
  const bool isStale = telemetry.lastFrameMs == 0 || millis() - telemetry.lastFrameMs > TELEMETRY_TIMEOUT_MS;
  String json = "{";
  json += "\"latitude\":";
  if (telemetry.hasPosition) {
    json += String(telemetry.latitude, 7);
  } else {
    json += "null";
  }
  json += ",\"longitude\":";
  if (telemetry.hasPosition) {
    json += String(telemetry.longitude, 7);
  } else {
    json += "null";
  }
  json += ",\"gpsSpeedKph\":";
  appendFloatOrNull(json, telemetry.hasGps, telemetry.gpsSpeedKph, 1);
  json += ",\"gpsAltitudeM\":";
  appendIntOrNull(json, telemetry.hasGps, telemetry.gpsAltitudeM);
  json += ",\"gpsHeadingDeg\":";
  appendFloatOrNull(json, telemetry.hasGps, telemetry.gpsHeadingDeg, 1);
  json += ",\"gpsSatellites\":";
  appendUIntOrNull(json, telemetry.hasGps, telemetry.gpsSatellites);
  json += ",\"gpsFix\":";
  json += telemetry.hasGps ? (telemetry.gpsFix ? "true" : "false") : "null";
  json += ",\"batteryVoltageV\":";
  appendFloatOrNull(json, telemetry.hasBattery, telemetry.batteryVoltageV, 1);
  json += ",\"batteryCurrentA\":";
  appendFloatOrNull(json, telemetry.hasBattery, telemetry.batteryCurrentA, 1);
  json += ",\"batteryCapacityMah\":";
  appendUIntOrNull(json, telemetry.hasBattery, telemetry.batteryCapacityMah);
  json += ",\"verticalSpeed\":";
  appendFloatOrNull(json, telemetry.hasVario, telemetry.verticalSpeed, 1);
  json += ",\"baroAltitudeM\":";
  appendIntOrNull(json, telemetry.hasBaroAltitude, telemetry.baroAltitudeM);
  json += ",\"airSpeedKph\":";
  appendFloatOrNull(json, telemetry.hasAirSpeed, telemetry.airSpeedKph, 1);
  json += ",\"pitchDeg\":";
  appendFloatOrNull(json, telemetry.hasAttitude, telemetry.pitchDeg, 1);
  json += ",\"rollDeg\":";
  appendFloatOrNull(json, telemetry.hasAttitude, telemetry.rollDeg, 1);
  json += ",\"yawDeg\":";
  appendFloatOrNull(json, telemetry.hasAttitude, telemetry.yawDeg, 1);
  json += ",\"flightMode\":";
  appendJsonString(json, telemetry.flightMode, telemetry.hasFlightMode);
  json += ",\"armed\":";
  json += telemetry.hasFlightMode ? (telemetry.armed ? "true" : "false") : "null";
  json += ",\"rcChannelsUs\":";
  appendRcChannelsJson(json);
  json += ",\"linkStats\":";
  if (telemetry.hasLinkStats) {
    json += "{\"uplinkRssiAnt1Dbm\":";
    json += static_cast<int>(telemetry.uplinkRssiAnt1Dbm);
    json += ",\"uplinkRssiAnt2Dbm\":";
    json += static_cast<int>(telemetry.uplinkRssiAnt2Dbm);
    json += ",\"uplinkLq\":";
    json += static_cast<unsigned int>(telemetry.uplinkLq);
    json += ",\"uplinkSnr\":";
    json += static_cast<int>(telemetry.uplinkSnr);
    json += ",\"activeAntenna\":";
    json += static_cast<unsigned int>(telemetry.activeAntenna);
    json += ",\"rfMode\":";
    json += static_cast<unsigned int>(telemetry.rfMode);
    json += ",\"txPower\":";
    json += static_cast<unsigned int>(telemetry.txPower);
    json += ",\"downlinkRssiDbm\":";
    json += static_cast<int>(telemetry.downlinkRssiDbm);
    json += ",\"downlinkLq\":";
    json += static_cast<unsigned int>(telemetry.downlinkLq);
    json += ",\"downlinkSnr\":";
    json += static_cast<int>(telemetry.downlinkSnr);
    json += "}";
  } else {
    json += "null";
  }
  json += ",\"stale\":";
  json += isStale ? "true" : "false";
  json += ",\"frameCounts\":{";
  json += "\"total\":";
  json += frameCounts.total;
  json += ",\"gps\":";
  json += frameCounts.gps;
  json += ",\"battery\":";
  json += frameCounts.battery;
  json += ",\"vario\":";
  json += frameCounts.vario;
  json += ",\"baroAltitude\":";
  json += frameCounts.baroAltitude;
  json += ",\"airspeed\":";
  json += frameCounts.airspeed;
  json += ",\"linkStats\":";
  json += frameCounts.linkStats;
  json += ",\"rcChannels\":";
  json += frameCounts.rcChannels;
  json += ",\"attitude\":";
  json += frameCounts.attitude;
  json += ",\"flightMode\":";
  json += frameCounts.flightMode;
  json += ",\"unknown\":";
  json += frameCounts.unknown;
  json += ",\"invalidSize\":";
  json += frameCounts.invalidSize;
  json += ",\"crcErrors\":";
  json += frameCounts.crcErrors;
  json += ",\"resyncs\":";
  json += frameCounts.resyncs;
  json += "},\"diagnostics\":{";
  json += "\"validFramesSinceBoot\":";
  json += receiveDiagnostics.validFramesSinceBoot;
  json += ",\"decodedFramesSinceBoot\":";
  json += receiveDiagnostics.decodedFramesSinceBoot;
  json += ",\"lastFrameAddress\":";
  appendHexJsonValue(json, receiveDiagnostics.lastFrameAddress, receiveDiagnostics.hasLastFrame);
  json += ",\"lastFrameType\":";
  appendHexJsonValue(json, receiveDiagnostics.lastFrameType, receiveDiagnostics.hasLastFrame);
  json += ",\"lastUnknownFrameType\":";
  appendHexJsonValue(json, receiveDiagnostics.lastUnknownFrameType, receiveDiagnostics.hasLastUnknownFrame);
  json += ",\"lastInvalidSizeFrameType\":";
  appendHexJsonValue(json, receiveDiagnostics.lastInvalidSizeFrameType, receiveDiagnostics.hasLastInvalidSize);
  json += ",\"lastInvalidSizeLength\":";
  appendUIntOrNull(json, receiveDiagnostics.hasLastInvalidSize, receiveDiagnostics.lastInvalidSizeLength);
  json += ",\"lastRawBytesHex\":\"";
  json += rawByteHistoryHex();
  json += "\",\"frameTypeCounts\":";
  appendFrameTypeCountsJson(json);
  json += "}}";
  return json;
}

void readHardwareCrsf() {
#if !USE_SIMULATED_CRSF_INPUT
  while (Serial1.available() > 0) {
    parser.push(static_cast<uint8_t>(Serial1.read()), telemetry, frameCounts, receiveDiagnostics);
  }
#endif
}

void maybeInjectSimulation() {
#if USE_SIMULATED_CRSF_INPUT
  if (millis() - lastSimulatedFrameMs >= SIMULATED_FRAME_INTERVAL_MS) {
    lastSimulatedFrameMs = millis();
    injectSimulatedTelemetry();
  }
#endif
}

void maybeReportSerial() {
  if (millis() - lastSerialReportMs < SERIAL_REPORT_INTERVAL_MS) {
    return;
  }
  lastSerialReportMs = millis();
  Serial.println(telemetryJson());
}

#if ENABLE_WIFI_WEBSOCKET
const char* wifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS:
      return "WL_IDLE_STATUS";
    case WL_NO_SSID_AVAIL:
      return "WL_NO_SSID_AVAIL";
    case WL_SCAN_COMPLETED:
      return "WL_SCAN_COMPLETED";
    case WL_CONNECTED:
      return "WL_CONNECTED";
    case WL_CONNECT_FAILED:
      return "WL_CONNECT_FAILED";
    case WL_CONNECTION_LOST:
      return "WL_CONNECTION_LOST";
    case WL_DISCONNECTED:
      return "WL_DISCONNECTED";
    default:
      return "WL_UNKNOWN";
  }
}

String jsonEscape(const String& value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (uint16_t i = 0; i < value.length(); i += 1) {
    const char character = value[i];
    if (character == '"' || character == '\\') {
      escaped += '\\';
    }
    if (character == '\n') {
      escaped += "\\n";
      continue;
    }
    if (character == '\r') {
      escaped += "\\r";
      continue;
    }
    escaped += character;
  }
  return escaped;
}

String htmlEscape(const String& value) {
  String escaped = value;
  escaped.replace("&", "&amp;");
  escaped.replace("<", "&lt;");
  escaped.replace(">", "&gt;");
  escaped.replace("\"", "&quot;");
  return escaped;
}

String urlDecode(const String& value) {
  String decoded;
  decoded.reserve(value.length());
  for (uint16_t i = 0; i < value.length(); i += 1) {
    const char character = value[i];
    if (character == '+') {
      decoded += ' ';
      continue;
    }
    if (character == '%' && i + 2 < value.length()) {
      const char hex[3] = { value[i + 1], value[i + 2], '\0' };
      decoded += static_cast<char>(strtol(hex, nullptr, 16));
      i += 2;
      continue;
    }
    decoded += character;
  }
  return decoded;
}

String formValue(const String& body, const String& key) {
  uint16_t start = 0;
  while (start < body.length()) {
    int end = body.indexOf('&', start);
    if (end < 0) {
      end = body.length();
    }
    const String pair = body.substring(start, end);
    const int equalsIndex = pair.indexOf('=');
    if (equalsIndex >= 0 && urlDecode(pair.substring(0, equalsIndex)) == key) {
      return urlDecode(pair.substring(equalsIndex + 1));
    }
    start = end + 1;
  }
  return "";
}

void loadSavedWifiCredentials() {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, true);
  savedStaSsid = wifiPrefs.getString(WIFI_PREFS_STA_SSID_KEY, "");
  savedStaPassword = wifiPrefs.getString(WIFI_PREFS_STA_PASSWORD_KEY, "");
  wifiPrefs.end();
}

void saveWifiCredentials(const String& ssid, const String& password) {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, false);
  wifiPrefs.putString(WIFI_PREFS_STA_SSID_KEY, ssid);
  wifiPrefs.putString(WIFI_PREFS_STA_PASSWORD_KEY, password);
  wifiPrefs.end();
  savedStaSsid = ssid;
  savedStaPassword = password;
}

void clearWifiCredentials() {
  wifiPrefs.begin(WIFI_PREFS_NAMESPACE, false);
  wifiPrefs.remove(WIFI_PREFS_STA_SSID_KEY);
  wifiPrefs.remove(WIFI_PREFS_STA_PASSWORD_KEY);
  wifiPrefs.end();
  savedStaSsid = "";
  savedStaPassword = "";
  WiFi.disconnect(false, true);
  lastStationStatus = WL_DISCONNECTED;
  lastStationMessage = "Saved hotspot credentials cleared.";
}

void scanForConfiguredWifi(const String& ssid) {
  Serial.print("Wi-Fi scan: looking for ");
  Serial.println(ssid);

  const int networkCount = WiFi.scanNetworks(false, true);
  if (networkCount < 0) {
    Serial.print("Wi-Fi scan failed: ");
    Serial.println(networkCount);
    return;
  }

  bool foundConfiguredNetwork = false;
  Serial.print("Wi-Fi scan networks found: ");
  Serial.println(networkCount);

  for (int i = 0; i < networkCount; i += 1) {
    if (WiFi.SSID(i) != ssid) {
      continue;
    }

    foundConfiguredNetwork = true;
    Serial.print("Wi-Fi scan match: channel ");
    Serial.print(WiFi.channel(i));
    Serial.print(", RSSI ");
    Serial.print(WiFi.RSSI(i));
    Serial.print(" dBm, encryption ");
    Serial.println(WiFi.encryptionType(i));
  }

  if (!foundConfiguredNetwork) {
    Serial.println("Wi-Fi scan did not find the configured SSID.");
  }

  WiFi.scanDelete();
}

bool connectStationWifi(const String& ssid, const String& password) {
  if (ssid.length() == 0) {
    lastStationStatus = WL_IDLE_STATUS;
    lastStationMessage = "No saved hotspot credentials.";
    return false;
  }

  Serial.print("Wi-Fi station mode: joining ");
  Serial.println(ssid);
  scanForConfiguredWifi(ssid);
  WiFi.begin(ssid.c_str(), password.c_str());

  const uint32_t startedAtMs = millis();
  uint32_t lastStatusReportMs = startedAtMs;
  while (WiFi.status() != WL_CONNECTED && millis() - startedAtMs < WIFI_STA_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
    if (millis() - lastStatusReportMs >= 2000) {
      lastStatusReportMs = millis();
      Serial.print(" ");
      Serial.print(wifiStatusName(WiFi.status()));
      Serial.print("(");
      Serial.print(static_cast<int>(WiFi.status()));
      Serial.print(") ");
    }
  }
  Serial.println();

  lastStationStatus = WiFi.status();
  if (lastStationStatus == WL_CONNECTED) {
    lastStationMessage = "Station connected.";
    Serial.print("Wi-Fi station connected. IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Wi-Fi station RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    return true;
  }

  lastStationMessage = "Station join failed; AP setup remains available.";
  Serial.print("Wi-Fi station final status: ");
  Serial.print(wifiStatusName(lastStationStatus));
  Serial.print("(");
  Serial.print(static_cast<int>(lastStationStatus));
  Serial.println(")");
  Serial.println(lastStationMessage);
  return false;
}

String telemetryApUrl() {
  return String("ws://") + WiFi.softAPIP().toString() + "/telemetry";
}

String telemetryStationUrl() {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }
  return String("ws://") + WiFi.localIP().toString() + "/telemetry";
}

String wifiStatusJson() {
  const bool stationConnected = WiFi.status() == WL_CONNECTED;
  String json = "{";
  json += "\"apSsid\":\"";
  json += jsonEscape(WIFI_AP_SSID);
  json += "\",\"apIp\":\"";
  json += WiFi.softAPIP().toString();
  json += "\",\"setupUrl\":\"http://";
  json += WiFi.softAPIP().toString();
  json += "/setup\",\"telemetryApUrl\":\"";
  json += jsonEscape(telemetryApUrl());
  json += "\",\"savedSsid\":\"";
  json += jsonEscape(savedStaSsid);
  json += "\",\"stationConnected\":";
  json += stationConnected ? "true" : "false";
  json += ",\"stationStatus\":\"";
  json += wifiStatusName(WiFi.status());
  json += "\",\"lastStationStatus\":\"";
  json += wifiStatusName(lastStationStatus);
  json += "\",\"stationIp\":";
  if (stationConnected) {
    json += "\"";
    json += WiFi.localIP().toString();
    json += "\"";
  } else {
    json += "null";
  }
  json += ",\"telemetryStationUrl\":";
  if (stationConnected) {
    json += "\"";
    json += jsonEscape(telemetryStationUrl());
    json += "\"";
  } else {
    json += "null";
  }
  json += ",\"stationRssi\":";
  json += stationConnected ? String(WiFi.RSSI()) : "null";
  json += ",\"message\":\"";
  json += jsonEscape(lastStationMessage);
  json += "\"}";
  return json;
}

String setupPageHtml() {
  String html;
  html.reserve(6400);
  html += F("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
  html += F("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
  html += F("<title>WebGPS ESP Setup</title><style>");
  html += F("body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f4f7fb;color:#162033}");
  html += F("main{max-width:560px;margin:0 auto;padding:22px 16px 32px}h1{font-size:1.35rem;margin:.2rem 0 1rem}");
  html += F(".panel{background:#fff;border:1px solid #d7deea;border-radius:8px;padding:14px;margin:12px 0;box-shadow:0 1px 4px rgba(15,23,42,.08)}");
  html += F("label{display:block;font-weight:700;font-size:.86rem;margin:.8rem 0 .3rem}input{box-sizing:border-box;width:100%;font-size:1rem;padding:.65rem;border:1px solid #b8c2d2;border-radius:6px}");
  html += F("button,a.button{display:inline-flex;align-items:center;justify-content:center;margin:.8rem .4rem 0 0;padding:.65rem .85rem;border:0;border-radius:6px;background:#1d4ed8;color:#fff;font-weight:700;text-decoration:none}");
  html += F("button.secondary{background:#475569}.danger{background:#b91c1c}.muted{color:#64748b;font-size:.86rem;line-height:1.35}.row{display:grid;grid-template-columns:130px 1fr;gap:6px;font-size:.9rem}.row b{color:#334155}code{word-break:break-all}</style></head><body><main>");
  html += F("<h1>WebGPS ESP Setup</h1>");
  html += F("<section class=\"panel\"><p class=\"muted\">Use this page while connected to the ESP Wi-Fi network. Save your phone hotspot details here if ESP AP mode does not give the phone enough internet access for map tiles.</p><div id=\"status\">Loading status...</div><button class=\"secondary\" type=\"button\" onclick=\"refreshStatus()\">Refresh status</button></section>");
  html += F("<section class=\"panel\"><form id=\"wifi-form\"><label for=\"ssid\">Phone hotspot name</label><input id=\"ssid\" name=\"ssid\" autocomplete=\"off\" required><label for=\"password\">Hotspot password</label><input id=\"password\" name=\"password\" type=\"password\" autocomplete=\"current-password\"><button type=\"submit\">Save and connect</button><button class=\"danger\" type=\"button\" onclick=\"clearWifi()\">Clear saved credentials</button></form></section>");
  html += F("<section class=\"panel\"><p class=\"muted\">Default ESP telemetry URL: <code>ws://192.168.4.1/telemetry</code></p><p class=\"muted\">After hotspot mode connects, copy the station telemetry URL into WebGPS telemetry settings.</p></section>");
  html += F("<script>");
  html += F("const statusEl=document.getElementById('status');const form=document.getElementById('wifi-form');const ssid=document.getElementById('ssid');");
  html += F("function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));}");
  html += F("function render(s){ssid.value=s.savedSsid||ssid.value||'';statusEl.innerHTML='<div class=\"row\"><b>AP Wi-Fi</b><span>'+esc(s.apSsid)+'</span></div><div class=\"row\"><b>AP IP</b><span>'+esc(s.apIp)+'</span></div><div class=\"row\"><b>AP telemetry</b><span><code>'+esc(s.telemetryApUrl)+'</code></span></div><div class=\"row\"><b>Saved hotspot</b><span>'+esc(s.savedSsid||'None')+'</span></div><div class=\"row\"><b>Station</b><span>'+esc(s.stationConnected?'connected':'not connected')+' ('+esc(s.lastStationStatus)+')</span></div><div class=\"row\"><b>Station IP</b><span>'+esc(s.stationIp||'--')+'</span></div><div class=\"row\"><b>Station telemetry</b><span><code>'+esc(s.telemetryStationUrl||'--')+'</code></span></div><p class=\"muted\">'+esc(s.message)+'</p>';}");
  html += F("async function refreshStatus(){const r=await fetch('/api/wifi/status',{cache:'no-store'});render(await r.json());}");
  html += F("async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});render(await r.json());}");
  html += F("form.addEventListener('submit',e=>{e.preventDefault();post('/api/wifi/save',new URLSearchParams(new FormData(form)).toString());});");
  html += F("function clearWifi(){post('/api/wifi/clear','');}refreshStatus();</script></main></body></html>");
  return html;
}

void sendHttpResponse(WiFiClient& client, const char* status, const char* contentType, const String& body) {
  client.print("HTTP/1.1 ");
  client.println(status);
  client.print("Content-Type: ");
  client.println(contentType);
  client.println("Cache-Control: no-store");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(body.length());
  client.println();
  client.print(body);
}

int contentLengthFromRequest(const String& request) {
  const int headerIndex = request.indexOf("Content-Length:");
  if (headerIndex < 0) {
    return 0;
  }
  const int valueStart = headerIndex + 15;
  const int valueEnd = request.indexOf('\r', valueStart);
  return request.substring(valueStart, valueEnd).toInt();
}

String readHttpRequest(WiFiClient& client) {
  String request;
  const uint32_t startedAtMs = millis();
  while (client.connected() && millis() - startedAtMs < 1500) {
    while (client.available() > 0) {
      request += static_cast<char>(client.read());
    }
    const int bodyStart = request.indexOf("\r\n\r\n");
    if (bodyStart >= 0) {
      const int contentLength = contentLengthFromRequest(request);
      if (request.length() >= bodyStart + 4 + contentLength) {
        return request;
      }
    }
    delay(2);
  }
  return request;
}

String requestBody(const String& request) {
  const int bodyStart = request.indexOf("\r\n\r\n");
  if (bodyStart < 0) {
    return "";
  }
  return request.substring(bodyStart + 4);
}

String requestPath(const String& request) {
  const int firstSpace = request.indexOf(' ');
  const int secondSpace = request.indexOf(' ', firstSpace + 1);
  if (firstSpace < 0 || secondSpace < 0) {
    return "/";
  }
  String path = request.substring(firstSpace + 1, secondSpace);
  const int queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    path = path.substring(0, queryIndex);
  }
  return path;
}

String headerValue(const String& request, const String& headerName) {
  const String needle = headerName + ":";
  int headerIndex = request.indexOf(needle);
  if (headerIndex < 0) {
    return "";
  }
  const int valueStart = headerIndex + needle.length();
  const int valueEnd = request.indexOf('\r', valueStart);
  String value = request.substring(valueStart, valueEnd);
  value.trim();
  return value;
}

String webSocketAcceptKey(const String& key) {
  const String source = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  uint8_t sha[20] = {};
  uint8_t encoded[32] = {};
  size_t encodedLength = 0;
  mbedtls_sha1(reinterpret_cast<const unsigned char*>(source.c_str()), source.length(), sha);
  mbedtls_base64_encode(encoded, sizeof(encoded), &encodedLength, sha, sizeof(sha));
  encoded[encodedLength] = '\0';
  return String(reinterpret_cast<char*>(encoded));
}

bool attachWebSocketClient(WiFiClient& client) {
  for (uint8_t i = 0; i < WEBSOCKET_CLIENT_LIMIT; i += 1) {
    if (!webSocketClients[i] || !webSocketClients[i].connected()) {
      if (webSocketClients[i]) {
        webSocketClients[i].stop();
      }
      webSocketClients[i] = client;
      return true;
    }
  }
  return false;
}

void handleWebSocketUpgrade(WiFiClient& client, const String& request) {
  const String key = headerValue(request, "Sec-WebSocket-Key");
  if (key.length() == 0) {
    sendHttpResponse(client, "400 Bad Request", "text/plain", "Missing WebSocket key");
    return;
  }

  client.println("HTTP/1.1 101 Switching Protocols");
  client.println("Upgrade: websocket");
  client.println("Connection: Upgrade");
  client.print("Sec-WebSocket-Accept: ");
  client.println(webSocketAcceptKey(key));
  client.println();

  if (!attachWebSocketClient(client)) {
    client.stop();
  }
}

void handleApiSave(WiFiClient& client, const String& body) {
  const String ssid = formValue(body, "ssid");
  const String password = formValue(body, "password");
  if (ssid.length() == 0) {
    lastStationMessage = "Hotspot name is required.";
    sendHttpResponse(client, "400 Bad Request", "application/json", wifiStatusJson());
    return;
  }
  saveWifiCredentials(ssid, password);
  connectStationWifi(savedStaSsid, savedStaPassword);
  sendHttpResponse(client, "200 OK", "application/json", wifiStatusJson());
}

void handleApiConnect(WiFiClient& client) {
  connectStationWifi(savedStaSsid, savedStaPassword);
  sendHttpResponse(client, "200 OK", "application/json", wifiStatusJson());
}

void handleApiClear(WiFiClient& client) {
  clearWifiCredentials();
  sendHttpResponse(client, "200 OK", "application/json", wifiStatusJson());
}

void handleHttpClient(WiFiClient& client) {
  const String request = readHttpRequest(client);
  if (request.length() == 0) {
    client.stop();
    return;
  }

  const String path = requestPath(request);
  if (path == "/telemetry" && headerValue(request, "Upgrade").equalsIgnoreCase("websocket")) {
    handleWebSocketUpgrade(client, request);
    return;
  }

  if (path == "/" || path == "/setup") {
    sendHttpResponse(client, "200 OK", "text/html; charset=utf-8", setupPageHtml());
  } else if (path == "/api/wifi/status") {
    sendHttpResponse(client, "200 OK", "application/json", wifiStatusJson());
  } else if (path == "/api/wifi/save") {
    handleApiSave(client, requestBody(request));
  } else if (path == "/api/wifi/connect") {
    handleApiConnect(client);
  } else if (path == "/api/wifi/clear") {
    handleApiClear(client);
  } else {
    sendHttpResponse(client, "404 Not Found", "text/plain", "Not found");
  }
  client.stop();
}

void serviceWebSocketClients() {
  for (uint8_t i = 0; i < WEBSOCKET_CLIENT_LIMIT; i += 1) {
    WiFiClient& client = webSocketClients[i];
    if (!client) {
      continue;
    }
    if (!client.connected()) {
      client.stop();
      continue;
    }
    while (client.available() > 0) {
      const uint8_t firstByte = client.read();
      if (client.available() <= 0) {
        break;
      }
      const uint8_t secondByte = client.read();
      const uint8_t opcode = firstByte & 0x0F;
      uint64_t payloadLength = secondByte & 0x7F;
      if (payloadLength == 126 && client.available() >= 2) {
        payloadLength = (static_cast<uint16_t>(client.read()) << 8) | client.read();
      } else if (payloadLength == 127 && client.available() >= 8) {
        payloadLength = 0;
        for (uint8_t byteIndex = 0; byteIndex < 8; byteIndex += 1) {
          payloadLength = (payloadLength << 8) | client.read();
        }
      }
      if ((secondByte & 0x80) != 0) {
        for (uint8_t maskIndex = 0; maskIndex < 4 && client.available() > 0; maskIndex += 1) {
          client.read();
        }
      }
      while (payloadLength > 0 && client.available() > 0) {
        client.read();
        payloadLength -= 1;
      }
      if (opcode == 0x08) {
        client.stop();
        break;
      }
    }
  }
}

void broadcastWebSocketText(const String& payload) {
  uint8_t header[10] = { 0x81, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
  uint8_t headerLength = 2;
  const size_t payloadLength = payload.length();
  if (payloadLength <= 125) {
    header[1] = static_cast<uint8_t>(payloadLength);
  } else if (payloadLength <= 65535) {
    header[1] = 126;
    header[2] = static_cast<uint8_t>((payloadLength >> 8) & 0xFF);
    header[3] = static_cast<uint8_t>(payloadLength & 0xFF);
    headerLength = 4;
  } else {
    header[1] = 127;
    for (uint8_t i = 0; i < 8; i += 1) {
      header[2 + i] = static_cast<uint8_t>((static_cast<uint64_t>(payloadLength) >> (56 - (8 * i))) & 0xFF);
    }
    headerLength = 10;
  }

  for (uint8_t i = 0; i < WEBSOCKET_CLIENT_LIMIT; i += 1) {
    WiFiClient& client = webSocketClients[i];
    if (!client || !client.connected()) {
      continue;
    }
    client.write(header, headerLength);
    client.print(payload);
  }
}
#endif

void setupWifiBridge() {
#if ENABLE_WIFI_WEBSOCKET
  loadSavedWifiCredentials();
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASSWORD);

  Serial.print("Wi-Fi setup AP: ");
  Serial.println(WIFI_AP_SSID);
  Serial.print("Setup URL: http://");
  Serial.print(WiFi.softAPIP());
  Serial.println("/setup");
  Serial.print("WebSocket telemetry AP URL: ");
  Serial.println(telemetryApUrl());

  if (savedStaSsid.length() > 0) {
    connectStationWifi(savedStaSsid, savedStaPassword);
  } else {
    lastStationMessage = "No saved hotspot credentials. Use /setup to configure hotspot mode.";
  }

  fieldServer.begin();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WebSocket telemetry station URL: ");
    Serial.println(telemetryStationUrl());
  }
#endif
}

void handleWifiBridge() {
#if ENABLE_WIFI_WEBSOCKET
  WiFiClient client = fieldServer.available();
  if (client) {
    handleHttpClient(client);
  }
  serviceWebSocketClients();
  if (millis() - lastWebSocketBroadcastMs >= WEBSOCKET_BROADCAST_INTERVAL_MS) {
    lastWebSocketBroadcastMs = millis();
    String payload = telemetryJson();
    broadcastWebSocketText(payload);
  }
#endif
}

void setup() {
  Serial.begin(USB_SERIAL_BAUD);
  delay(400);
  Serial.println("WebGPS ESP32-C3 telemetry parser starting");
#if USE_SIMULATED_CRSF_INPUT
  Serial.println("Input mode: simulated CRSF frames");
#else
  Serial.println("Input mode: hardware CRSF UART receive-only probe");
  Serial.print("CRSF RX pin: GPIO");
  Serial.println(CRSF_RX_PIN);
  Serial.print("CRSF UART baud: ");
  Serial.println(CRSF_BAUD);
  Serial.print("CRSF UART inverted: ");
  Serial.println(CRSF_UART_RX_INVERTED ? "true" : "false");
  Serial.println("Safety: keep ESP32 GPIO21 TX disconnected until receive-only CRSF is confirmed.");
  Serial1.begin(CRSF_BAUD, SERIAL_8N1, CRSF_RX_PIN, CRSF_TX_PIN, CRSF_UART_RX_INVERTED);
#endif
  setupWifiBridge();
}

void loop() {
  maybeInjectSimulation();
  readHardwareCrsf();
  maybeReportSerial();
  handleWifiBridge();
}
