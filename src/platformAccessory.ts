import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
} from 'homebridge';

import { PaperspacePlatform } from './platform';
import callbackify from './util/callbackify';
import { promisify } from 'util';
import paperspace from 'paperspace-node';

// Most of the time we're smart about watching for state changes,
// so we don't need to poll too often
const MACHINE_STATE_POLL_FREQUENCY = 30000;

interface PaperspaceAccessoryContext extends Record<string, any> {
  device?: paperspace.machines.Machine;
}

export interface PaperspaceAccessoryData extends PlatformAccessory {
  context: PaperspaceAccessoryContext;
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PaperspaceMachineAccessory {
  private service: Service;
  private updatePending = false;

  constructor(
    private readonly platform: PaperspacePlatform,
    private readonly accessory: PaperspaceAccessoryData,
  ) {
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Paperspace',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device!.os,
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        // If the machine has a public IP, it's useful to show in HomeKit
        accessory.context.device!.publicIpAddress ??
          accessory.context.device!.id,
      );

    // get the Switch service if it exists, otherwise create a new Switch service
    // you can create multiple services for each accessory
    this.service =
      this.accessory.getService(this.platform.Service.Switch) ??
      this.accessory.addService(this.platform.Service.Switch);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device!.name,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/gen/HomeKit.ts

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, callbackify(this.setOn)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, callbackify(this.getOn)); // GET - bind to the `getOn` method below

    setInterval(this.updateOn, MACHINE_STATE_POLL_FREQUENCY);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn = async (value: CharacteristicValue) => {
    const shouldBeOn = value as boolean;
    const machineId = this.accessory.context.device!.id;

    this.platform.log.debug(
      'Set Characteristic On for %s to %s',
      machineId,
      shouldBeOn,
    );

    if (shouldBeOn) {
      const startApi = promisify(this.platform.paperspaceApi.machines.start);
      await startApi({ machineId });
      this.waitAndUpdate(paperspace.machines.MachineState.Ready);
    } else {
      const stopApi = promisify(this.platform.paperspaceApi.machines.stop);
      await stopApi({ machineId });
      this.waitAndUpdate(paperspace.machines.MachineState.Off);
    }
  };

  waitAndUpdate = async (state: paperspace.machines.MachineState) => {
    const machineId = this.accessory.context.device!.id;

    const waitForApi = promisify(this.platform.paperspaceApi.machines.waitfor);

    this.platform.log.debug('Waiting for %s to change to %s', machineId, state);
    this.updatePending = true;
    await waitForApi({ machineId, state });
    this.updatePending = false;
    this.platform.log.debug('%s finished changing to %s', machineId, state);

    this.updateOn();
  };

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   */
  getOn = async () => {
    const machineId = this.accessory.context.device!.id;

    const showApi = promisify(this.platform.paperspaceApi.machines.show);
    const machine = await showApi({ machineId });

    const isOn = (() => {
      switch (machine?.state) {
        case paperspace.machines.MachineState.Off:
          return false;
        default:
          return true;
      }
    })();

    this.platform.log.debug(
      'Fetched On state %s for machine %s',
      isOn,
      machineId,
    );

    return isOn;
  };

  updateOn = async () => {
    // If we're waiting for a pending state change, don't update
    // avoids confusion while machine is booting/shutting down
    if (this.updatePending) {
      return;
    }

    const machineId = this.accessory.context.device!.id;
    const isOn = await this.getOn();

    // push the new value to HomeKit
    this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
    this.platform.log.debug(
      'Pushed On state %s for machine %s to HomeKit',
      isOn,
      machineId,
    );
  };
}
