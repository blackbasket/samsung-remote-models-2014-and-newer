const fetch = require('node-fetch')
const Encryption = require('./Encryption/index')
const SamsungTvEvents = require('../SamsungTvEvents')

const buildPairingStepUri = (config, device, step) => {
  const path = `/ws/pairing?step=${step}&app_id=${config.appId}&device_id=${device.deviceId}`
  return `http://${config.ip}:8080${path}`
}

const _verifyAckAuthData = (authData) => {
  // console.debug("ack auth data", authData);

  const clientAck = Encryption.parseClientAcknowledge(authData.ClientAckMsg)
  // console.debug("client ack", clientAck.toString());

  if (!clientAck) {
    throw Error('failed to acknowledge client')
  }

  return authData
}

const _verifyHelloAuthData = (authData) => {
  // console.debug("hello auth data", authData);
  if (Encryption.parseClientHello(authData.GeneratorClientHello) !== 0) {
    // console.error('Invalid PIN Entered')
    throw Error('Invalid PIN entered')
  }

  // console.debug("hello verified");
  return authData.request_id
}

const _step0 = async (config, device) => {
  // console.info("Step 0: Start pairing");
  const uri = buildPairingStepUri(config, device, 0)
  const res = await fetch(`${uri}&type=1`, { mode: 'no-cors' })
  // console.debug("Step 0, responseStatus", res.status);
}

const _step1HelloServer = async (config, device, pin) => {
  // console.info("Step 1: Saying hello to the server");
  const serverHello = Encryption.generateServerHello(config.userId, pin)
  // console.debug("Generated serverHello", serverHello);

  const uri = buildPairingStepUri(config, device, 1)
  const res = await fetch(uri, {
    method: 'POST',
    body: JSON.stringify({
      auth_Data: {
        auth_type: 'SPC',
        GeneratorServerHello: serverHello,
      },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
  const data = await res.json()
  const authData = JSON.parse(data.auth_data)
  return _verifyHelloAuthData(authData)
}

const _step2AckServer = async (config, device, requestId) => {
  // console.info("Step 2: Acknowledging");
  const serverAck = Encryption.generateServerAcknowledge()
  // console.debug(`generatedServerAcknowledge: ${serverAck}`);

  const uri = buildPairingStepUri(config, device, 2)
  const res = await fetch(uri, {
    method: 'POST',
    body: JSON.stringify({
      auth_Data: {
        auth_type: 'SPC',
        request_id: requestId,
        ServerAckMsg: serverAck,
      },
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
  const data = await res.json()
  const authData = JSON.parse(data.auth_data)
  const authData2 = await _verifyAckAuthData(authData)
  const identity = {
    sessionId: authData2.session_id,
    aesKey: Encryption.getKey(),
  }

  // console.debug('identity', identity)
  return identity
}

class SamsungTvPairing {
  constructor(deviceConfig, deviceInfo, eventEmitter, identity = null) {
    this.device = deviceInfo
    this.config = deviceConfig
    this.eventEmitter = eventEmitter
    this.identity = identity
  }

  async requestPin() {
    const res = await fetch(
      `http://${this.config.ip}:8080/ws/apps/CloudPINPage`,
      {
        method: 'POST',
        mode: 'no-cors',
        cache: 'default',
      }
    )
    // const text = await res.text();
    // const match = /<state[^>]*>([\s\S]*?)<\/state>/.exec(text);
    // if (match && match[1]) {
    //   return match[1].toUpperCase() !== "STOPPED";
    // }
    // return true;
    try {
      return await _step0(this.config, this.device)
    } catch (err) {
      // console.error("Failed to require PIN", err);
      throw Error('Failed to require PIN')
    }
  }

  async confirmPin(pin) {
    // console.log("Confirming pin", pin);
    const requestId = await _step1HelloServer(this.config, this.device, pin)
    const identity = await _step2AckServer(this.config, this.device, requestId)
    this.identity = identity
    this.eventEmitter.emit(SamsungTvEvents.PAIRED, identity)
    return identity
  }

  async hidePinConfirmation() {
    await fetch(`http://${this.config.ip}:8080/ws/apps/CloudPINPage/run`, {
      method: 'DELETE',
    })
  }

  isPaired() {
    return this.identity !== null
  }
}

module.exports = SamsungTvPairing
