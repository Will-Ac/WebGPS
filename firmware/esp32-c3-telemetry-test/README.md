# ESP32-C3 Telemetry Test Firmware

Arduino IDE prototype for reading CRSF telemetry from a RadioMaster Pocket AUX Telemetry Mirror output and forwarding decoded telemetry to WebGPS.

## First Bench Test

1. Open `esp32-c3-telemetry-test.ino` in Arduino IDE.
2. Install the ESP32 board package.
3. Select `ESP32C3 Dev Module`.
4. Enable `USB CDC On Boot`.
5. Leave `USE_SIMULATED_CRSF_INPUT` set to `1`.
6. Upload over USB-C.
7. Open Serial Monitor at `115200`.

Expected output is one JSON line per second, with simulated values such as:

```json
{"latitude":51.4733071,"longitude":-2.5859117,"gpsSpeedKph":42.1,"gpsAltitudeM":123,"gpsHeadingDeg":312.0,"gpsSatellites":10,"gpsFix":true,"batteryVoltageV":15.7,"batteryCurrentA":2.4,"batteryCapacityMah":4694,"verticalSpeed":1.2,"baroAltitudeM":131,"airSpeedKph":54.0,"pitchDeg":10.0,"rollDeg":-5.0,"yawDeg":90.0,"flightMode":"RTH","armed":false,"rcChannelsUs":[988,2011,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500],"linkStats":{"uplinkRssiAnt1Dbm":-72,"uplinkRssiAnt2Dbm":-74,"uplinkLq":98,"uplinkSnr":-6,"activeAntenna":0,"rfMode":3,"txPower":2,"downlinkRssiDbm":-81,"downlinkLq":95,"downlinkSnr":-8},"stale":false,"frameCounts":{"total":45,"gps":5,"battery":5,"vario":5,"baroAltitude":5,"airspeed":5,"linkStats":5,"rcChannels":5,"attitude":5,"flightMode":5,"unknown":0,"invalidSize":0,"crcErrors":1,"resyncs":8},"diagnostics":{"validFramesSinceBoot":45,"decodedFramesSinceBoot":45,"lastFrameAddress":"0xC8","lastFrameType":"0x16","lastUnknownFrameType":null,"lastInvalidSizeFrameType":null,"lastInvalidSizeLength":null,"lastRawBytesHex":"C8 18 16 AC 0A FF E0 03 1F F8 C0 07 3E F0 81 0F 7C E0 03 1F F8 C0 07 3E F0 81 0F 7C E0 03 1F","frameTypeCounts":[{"type":"0x02","count":5},{"type":"0x08","count":5},{"type":"0x14","count":5},{"type":"0x16","count":5}]}}
```

## Hardware UART Test

After the simulated parser is proven:

1. Set `USE_SIMULATED_CRSF_INPUT` to `0`.
2. Flash the ESP32 over USB.
3. For the first receive-only bench probe, keep the ESP32 powered by USB and do not connect Pocket 5V.
4. Configure the Pocket hardware page:
   - `Serial Port`: `Telemetry Mirror`
   - `AUX1`
   - `Baudrate`: `115200`
   - `Sampling`: `Normal`
5. Wire receive-only signal:
   - Pocket AUX `TX` -> ESP32-C3 `GPIO20`
   - Pocket AUX `-` / `GND` -> ESP32-C3 `G`
   - Pocket AUX `RX`, `5V`, and `BOOT` are not connected for the receive-only test.
6. Power the Pocket and check USB Serial output.
7. Leave ESP32-C3 `GPIO21` TX disconnected until receive-only CRSF is confirmed.
8. After valid frames are confirmed, disconnect USB and test installed power:
   - regulated Pocket AUX `5V` -> ESP32-C3 `5V`
   - Pocket AUX `-` / `GND` -> ESP32-C3 `G`

Only connect ESP32 `GPIO21` back to Pocket AUX `RX` after receive-only telemetry parsing is confirmed and firmware needs a transmit path.

## Receive Diagnostics

Hardware mode starts at the confirmed working Pocket AUX Telemetry Mirror settings:

```cpp
#define CRSF_UART_BAUD 115200
#define CRSF_UART_INVERTED 0
```

This has been verified with a RadioMaster Pocket AUX port producing live CRSF GPS, battery, attitude, link stats, vario, and flight-mode frames at `115200` baud with normal UART polarity.

If `validFramesSinceBoot` stays at `0`, try the hardware checks first: common ground, AUX `TX` into ESP32 `GPIO20`, ESP32 `GPIO21` disconnected, and Pocket AUX set to Telemetry Mirror. If the raw byte history only shows repeating `00`, `3C`, `C0`, and `FC` patterns, the baud or polarity is probably wrong.

If you are experimenting with a different radio output, you can still test inverted UART receive:

```cpp
#define CRSF_UART_BAUD 115200
#define CRSF_UART_INVERTED 1
```

If using an internal ELRS module UART rather than Pocket AUX Telemetry Mirror, higher CRSF rates may still be useful:

```cpp
#define CRSF_UART_BAUD 420000
#define CRSF_UART_INVERTED 0
```

The Pocket hardware page may show a `400K` option, but the tested AUX Telemetry Mirror stream decoded cleanly at `115200` and did not decode at `400000`.

Read the diagnostic fields like this:

- `validFramesSinceBoot`: valid CRC frames seen since boot.
- `decodedFramesSinceBoot`: valid frames that matched a supported CRSF telemetry type and expected size.
- `lastFrameAddress`: CRSF address for the most recent valid frame.
- `lastFrameType`: CRSF type for the most recent valid frame.
- `lastUnknownFrameType`: most recent valid frame type that is not currently decoded.
- `lastInvalidSizeFrameType` / `lastInvalidSizeLength`: valid CRC frame with an unexpected payload size.
- `lastRawBytesHex`: latest raw UART bytes, useful for checking whether the input is busy, quiet, or noisy.
- `frameTypeCounts`: valid frame types seen so far and their counts.

If `validFramesSinceBoot` stays at `0`, suspect wrong pin, wrong baud, inverted UART, no signal, or a floating/noisy input. If valid unknown frame types appear but `decodedFramesSinceBoot` remains low, the UART may be real CRSF with unsupported frames, or the stream may still be mis-decoded.

## Wi-Fi WebSocket Bridge

Set `ENABLE_WIFI_WEBSOCKET` to `1` to enable the field setup page and telemetry WebSocket server.

By default, the ESP32 starts an access point and keeps it available for setup:

- SSID: `WebGPS-Telemetry`
- Password: `webgps123`
- Telemetry: `ws://192.168.4.1/telemetry`
- Setup: `http://192.168.4.1/setup`

### Connect to ESP

Scan this QR code from iPhone or Android to join the ESP access point:

![WebGPS telemetry Wi-Fi QR](../../assets/qr/webgps-telemetry-wifi.png)

QR payload:

```text
WIFI:T:WPA;S:WebGPS-Telemetry;P:webgps123;;
```

### Phone Hotspot Mode

If ESP AP mode prevents map tiles or cellular fallback from working well, join `WebGPS-Telemetry`, open `http://192.168.4.1/setup`, and save the phone hotspot credentials there. The credentials are stored in ESP32 NVS preferences, not hard-coded in the sketch.

When hotspot mode connects, Serial Monitor and the setup page show the assigned station IP and a second telemetry URL, for example:

```text
WebSocket telemetry station URL: ws://172.20.10.4/telemetry
```

Useful first checks:

- On iPhone, keep Personal Hotspot open and enable `Maximize Compatibility` before connecting the ESP.
- If the setup page scan diagnostics do not find the iPhone SSID, confirm the hotspot name exactly matches the iPhone name.
- If station status is `WL_CONNECT_FAILED`, re-enter the hotspot password on the setup page.
- If station status stays `WL_DISCONNECTED`, toggle Personal Hotspot off/on and keep the ESP32 close to the phone for the next boot.

WebGPS uses the AP URL by default. Use the `TEL` settings button in WebGPS to reconnect, restore the ESP AP default, clear a saved URL, or paste the station telemetry URL shown by the setup page.

The browser console override still works for quick testing:

```js
localStorage.setItem('webgpsTelemetryWsUrl', 'ws://192.168.4.1/telemetry');
```

You can also set the URL from the page address:

```text
http://localhost:8080/?ws=ws://172.20.10.4/telemetry
```

Browsers usually block `ws://` from an HTTPS page, so the GitHub Pages deployment will not auto-connect to the ESP32 soft-AP WebSocket. For field testing, open WebGPS from a local HTTP server or serve the app from the ESP32/network over HTTP.

## CRSF Fields Parsed

The parser independently implements the CRSF frame behavior researched from RomanLut's Android telemetry app, without copying its source code.

- GPS `0x02`: latitude, longitude, ground speed, heading, altitude, satellites, fix flag.
- Vario `0x07`: vertical speed.
- Battery `0x08`: flight pack voltage, current, consumed capacity.
- Barometer altitude `0x09`: barometric altitude.
- Airspeed `0x0A`: airspeed.
- Link statistics `0x14`: uplink/downlink RSSI, LQ, SNR, active antenna, RF mode, TX power.
- RC channels packed `0x16`: 16 channel values remapped to microseconds.
- Attitude `0x1E`: pitch, roll, yaw.
- Flight mode `0x21`: mode string. Status markers are stripped, so `AIR?` and `AIR*` both become `flightMode: "AIR"`; `*` is exposed as `armed: false`.

Unknown frames are counted and ignored. CRC failures and unexpected payload sizes are counted and rejected.

Current Pocket AUX captures include frequent valid `0x3A` frames. They are counted as unknown and ignored because they are not needed for WebGPS telemetry yet.
