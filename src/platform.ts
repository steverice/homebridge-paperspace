import { APIEvent } from 'homebridge';
import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PaperspaceMachineAccessory } from './platformAccessory';
import { promisify } from 'util';
import { psApi, PsApi } from './paperspace';

interface PaperspaceConfig extends PlatformConfig {
  apiKey?: string;
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class PaperspacePlatform implements DynamicPlatformPlugin {
  public readonly Service = this.api.hap.Service;
  public readonly Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly paperspaceApi: ReturnType<PsApi>;

  constructor(
    public readonly log: Logger,
    public readonly config: PaperspaceConfig,
    public readonly api: API,
  ) {
    if (!config.apiKey) {
      throw Error('apiKey is required');
    }

    this.log.debug('Finished initializing platform:', this.config.name);

    this.paperspaceApi = psApi(config.apiKey);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on(APIEvent.DID_FINISH_LAUNCHING, async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Restoring accessory from cache:', accessory.displayName);

    // create the accessory handler
    // this is imported from `platformAccessory.ts`
    new PaperspaceMachineAccessory(this, accessory);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const listApi = promisify(this.paperspaceApi.machines.list);
    const machines = await listApi(null);

    if (!machines) {
      this.log.warn('No machines found');
      return;
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const machine of machines) {
      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(machine.id);

      // check that the device has not already been registered by checking the
      // cached devices we stored in the `configureAccessory` method above
      if (!this.accessories.find(accessory => accessory.UUID === uuid)) {
        this.log.info('Registering new accessory:', machine.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(machine.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = machine;

        // create the accessory handler
        // this is imported from `platformAccessory.ts`
        new PaperspaceMachineAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

        // push into accessory cache
        this.accessories.push(accessory);
      }
    }

  }
}
