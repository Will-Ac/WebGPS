# RadioMaster Pocket ESP32-C3 Telemetry Tap

This note covers the planned internal installation of an ESP32-C3 Super Mini inside a RadioMaster Pocket to read telemetry from the internal ELRS module.

## Intended Signal Path

```text
Pocket internal ELRS TX  -> ESP32-C3 GPIO20 / RX
Pocket internal ELRS RX  <- ESP32-C3 GPIO21 / TX (optional, later only)
Pocket regulated 5V     -> ESP32-C3 5V
Pocket GND              -> ESP32-C3 G / GND
```

## Safety Rules

- Confirm the Pocket `5V` pad is regulated 5V with a multimeter before connecting it to the ESP32-C3 `5V` pin.
- Do not connect the ESP32-C3 to USB while it is powered from the Pocket.
- Start receive-only with ESP32 powered by USB: connect Pocket/internal ELRS `TX` to ESP32-C3 `GPIO20`, plus common ground only. Leave Pocket `5V` disconnected during this probe.
- Move to installed Pocket `5V` power only after valid CRSF frames are confirmed over receive-only wiring.
- Leave ESP32-C3 `GPIO21` disconnected until valid CRSF frames are confirmed and firmware requires a transmit path.
- Keep all grounds common.
- Do not use the external Nano module bay for this installation; this plan assumes the Pocket internal ELRS module remains the telemetry source.

## Firmware Defaults

- UART: `420000` baud, `8N1`
- ESP32-C3 RX: `GPIO20`
- ESP32-C3 TX: `GPIO21`
- First test mode: simulated CRSF input over USB serial
- Later bridge mode: ESP32 Wi-Fi access point with WebSocket JSON at `ws://192.168.4.1/telemetry`

## Expected WebSocket JSON

```json
{
  "latitude": 51.4733071,
  "longitude": -2.5859117,
  "gpsSpeedKph": 42.1,
  "gpsAltitudeM": 123,
  "batteryVoltageV": 15.7,
  "stale": false,
  "frameCounts": {
    "total": 10,
    "gps": 5,
    "battery": 5,
    "unknown": 0,
    "crcErrors": 0,
    "resyncs": 0
  }
}
```
