/// <reference types="node" />

declare module 'paperspace-node' {
  type Nullable<T> = T | null;
  type NodeCallback<T> = (err: Nullable<Error> | undefined, data?: T) => void;

  namespace paperspace {
    export interface PaperspaceOptions {
      authEmail?: string;
      email?: string;
      accessToken?: string;
      access_token?: string;
      apiKey?: string;
      api_key?: string;
    }

    export interface Endpoints {
      jobs: any;
      login: any;
      logout: any;
      machines: machines.Machines;
      resourceDelegations: any;
      networks: any;
      project: any;
      scripts: any;
      templates: any;
      users: any;
    }

    namespace machines {
      export interface Machines {
        availability: any;
        create: any;
        destroy: any;
        list(params: Nullable<ListParams>, cb: NodeCallback<Machine[]>): Machine[];
        restart: any;
        show(params: ShowParams, cb: NodeCallback<Machine>): Machine;
        start(params: ShowParams, cb: NodeCallback<null>): null;
        stop(params: ShowParams, cb: NodeCallback<null>): null;
        update: any;
        utilization: any;
        waitfor(params: WaitForParams, cb: NodeCallback<Machine>): Machine;
      }

      export interface Machine extends Record<string, any>{
        id: string;
        name: string;
        os: string;
        state: MachineState;
      }

      export const enum MachineState {
        Off = 'off',
        Starting = 'starting',  // machine is in the process of changing to the ready or serviceready state
        Stopping = 'stopping',  // machine is in the process of changing to the off state
        Restarting = 'restarting',  // combines stopping follow immediately by starting
        ServiceReady = 'serviceready',  // services are running on the machine but the Paperspace agent is not yet available
        Ready = 'ready',  // services are running on machine and the Paperspace agent is ready to stream or accept logins
        Upgrading = 'upgrading',   // the machine specification are being upgraded, which involves a shutdown and startup sequence
        Provisioning = 'provisioning',  // the machine is in the process of being created for the first time
      }

      export interface ListParams {
        filter?: any;
      }

      export interface ShowParams {
        machineId: string;
      }

      export interface WaitForParams extends ShowParams {
        state: MachineState;
      }
    }
  }

  function paperspace(options: paperspace.PaperspaceOptions): paperspace.Endpoints;
  export default paperspace;
}
