const fetch = require('node-fetch')
const EventEmitter = require('events')
const SamsungTvPairing = require('./Pairing/SamsungTvPairing')
const SamsungTvConnection = require('./Connection/SamsungTvConnection')
const SamsungTvEvents = require('./SamsungTvEvents')

class SamsungTv {
  constructor(deviceConfig) {
    this.config = deviceConfig
    this.device = null
    this.pairing = null
    this.identity = null
    this.connection = null
    this.eventEmitter = new EventEmitter()
  }

  async init(identity = null) {
    // console.info("Initializing device configuration");
    const device = await this.fetchDeviceInfo()
    // console.info("Initialization successful", device);
    this.device = device
    this.pairing = new SamsungTvPairing(
      this.config,
      this.device,
      this.eventEmitter,
      identity
    )
    if (identity) {
      this.identity = identity
    }
    return device
  }

  async fetchDeviceInfo() {
    // console.debug("Fetching device info");
    const resp = await fetch(`http://${this.config.ip}:8001/ms/1.0/`)
    const device = await resp.json()
    // console.debug("Received device info");
    const deviceInfo = {
      id: device.DeviceID,
      name: device.DeviceName,
    }
    // console.debug("Device info: ", deviceInfo);
    return deviceInfo
  }

  async requestPin() {
    await this.pairing.requestPin()
    // console.debug("PIN showing at TV");
  }

  async confirmPin(pin) {
    const identity = await this.pairing.confirmPin(pin)
    // console.info('PIN confirmation succeeded. Identity: ', identity)
    this.identity = identity
    await this.pairing.hidePinConfirmation()
    return identity
  }

  async connect() {
    this._assertPaired()

    this.connection = new SamsungTvConnection(
      this.config,
      this.identity,
      this.eventEmitter
    )
    const socket = await this.connection.connect()
    return this.connection
  }

  sendKey(keyCode) {
    this._assertPaired()
    this._assertConnected()

    this.connection.sendKey(keyCode)
  }

  onConnected(listener) {
    this.eventEmitter.on(SamsungTvEvents.CONNECTED, listener)
  }

  _assertPaired() {
    if (!this.pairing.isPaired()) {
      // console.error("Pairing is required before connecting to the device.");
      throw Error('Pairing required')
    }
  }

  _assertConnected() {
    if (this.connection === null) {
      // console.error("Connection not established");
      throw Error('Connection not established')
    }

    if (!this.connection.isReady()) {
      // console.error("Connection is established but not yet ready");
      throw Error('Connection not yet ready')
    }
  }
}

module.exports = SamsungTv
