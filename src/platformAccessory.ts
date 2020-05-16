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

    // get the GarageDoorOpener service if it exists, otherwise create a new GarageDoorOpener service
    this.service =
      this.accessory.getService(this.platform.Service.GarageDoorOpener) ??
      this.accessory.addService(this.platform.Service.GarageDoorOpener);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device!.name,
    );

    // We will never have an "obstruction"
    this.service.setCharacteristic(
      this.platform.Characteristic.ObstructionDetected,
      false,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/gen/HomeKit.ts

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetDoorState)
      .on(CharacteristicEventTypes.SET, callbackify(this.setTargetDoorState))
      .on(CharacteristicEventTypes.GET, callbackify(this.getTargetDoorState));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentDoorState)
      .on(CharacteristicEventTypes.GET, callbackify(this.getCurrentDoorState));

    setInterval(this.updateStates, MACHINE_STATE_POLL_FREQUENCY);
  }

  setTargetDoorState = async (targetDoorState: CharacteristicValue) => {
    const machineId = this.accessory.context.device!.id;

    this.platform.log.debug(
      'Set Characteristic TargetDoorState for %s to %s',
      machineId,
      targetDoorState,
    );

    switch (targetDoorState) {
      case this.platform.Characteristic.TargetDoorState.OPEN: {
        const startApi = promisify(this.platform.paperspaceApi.machines.start);
        await startApi({ machineId });
        this.waitAndUpdate(paperspace.machines.MachineState.Ready);
        break;
      }
      case this.platform.Characteristic.TargetDoorState.CLOSED: {
        const stopApi = promisify(this.platform.paperspaceApi.machines.stop);
        await stopApi({ machineId });
        this.waitAndUpdate(paperspace.machines.MachineState.Off);
        break;
      }
      default: {
        this.platform.log.warn(
          'Unrecognized target door state %s',
          targetDoorState,
        );
        break;
      }
    }
  };

  getTargetDoorState = async () => {
    const machineId = this.accessory.context.device!.id;

    const showApi = promisify(this.platform.paperspaceApi.machines.show);
    const machine = await showApi({ machineId });

    const targetDoorState = (() => {
      switch (machine?.state!) {
        case paperspace.machines.MachineState.Off:
        case paperspace.machines.MachineState.Stopping:
          return this.platform.Characteristic.TargetDoorState.CLOSED;
        case paperspace.machines.MachineState.Ready:
        case paperspace.machines.MachineState.Provisioning:
        case paperspace.machines.MachineState.Restarting:
        case paperspace.machines.MachineState.ServiceReady:
        case paperspace.machines.MachineState.Starting:
        case paperspace.machines.MachineState.Upgrading:
          return this.platform.Characteristic.TargetDoorState.OPEN;
      }
    })();

    this.platform.log.debug(
      'Fetched TargetDoorState %s for machine %s',
      targetDoorState,
      machineId,
    );

    return targetDoorState;
  };

  getCurrentDoorState = async () => {
    const machineId = this.accessory.context.device!.id;

    const showApi = promisify(this.platform.paperspaceApi.machines.show);
    const machine = await showApi({ machineId });

    const currentDoorState = (() => {
      switch (machine?.state) {
        case paperspace.machines.MachineState.Off:
          return this.platform.Characteristic.TargetDoorState.CLOSED;
        default:
          return this.platform.Characteristic.TargetDoorState.OPEN;
      }
    })();

    this.platform.log.debug(
      'Fetched CurrentDoorState %s for machine %s',
      currentDoorState,
      machineId,
    );

    return currentDoorState;
  };

  waitAndUpdate = async (state: paperspace.machines.MachineState) => {
    const machineId = this.accessory.context.device!.id;

    const waitForApi = promisify(this.platform.paperspaceApi.machines.waitfor);

    this.platform.log.debug('Waiting for %s to change to %s', machineId, state);
    this.updatePending = true;
    await waitForApi({ machineId, state });
    this.updatePending = false;
    this.platform.log.debug('%s finished changing to %s', machineId, state);

    return await this.updateStates();
  };

  updateStates = async () => {
    // If we're waiting for a pending state change, don't update
    // avoids confusion while machine is booting/shutting down
    if (this.updatePending) {
      return;
    }

    const machineId = this.accessory.context.device!.id;
    return await Promise.all([
      (async () => {
        const targetDoorState = await this.getTargetDoorState();

        // push the new value to HomeKit
        this.service.updateCharacteristic(
          this.platform.Characteristic.TargetDoorState,
          targetDoorState,
        );
        this.platform.log.debug(
          'Pushed TargetDoorState %s for machine %s to HomeKit',
          targetDoorState,
          machineId,
        );
      })(),
      (async () => {
        const currentDoorState = await this.getCurrentDoorState();

        // push the new value to HomeKit
        this.service.updateCharacteristic(
          this.platform.Characteristic.CurrentDoorState,
          currentDoorState,
        );
        this.platform.log.debug(
          'Pushed CurrentDoorState %s for machine %s to HomeKit',
          currentDoorState,
          machineId,
        );
      })(),
    ]);
  };
}
