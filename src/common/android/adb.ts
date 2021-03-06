// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";

import {ChildProcess} from "../../common/node/childProcess";
import {CommandExecutor} from "../../common/commandExecutor";

// See android versions usage at: http://developer.android.com/about/dashboards/index.html
export enum AndroidAPILevel {
    Marshmallow = 23,
    LOLLIPOP_MR1 = 22,
    LOLLIPOP = 21, /* Supports adb reverse */
    KITKAT = 19,
    JELLY_BEAN_MR2 = 18,
    JELLY_BEAN_MR1 = 17,
    JELLY_BEAN = 16,
    ICE_CREAM_SANDWICH_MR1 = 15,
    GINGERBREAD_MR1 = 10,
}

export enum DeviceType {
    AndroidSdkEmulator, // These seem to have emulator-<port> ids
    Other,
}

const AndroidSDKEmulatorPattern = /^emulator-\d{1,5}$/;

export interface IDevice {
    id: string;
    isOnline: boolean;
    type: DeviceType;
}

export interface IAdb {
    getConnectedDevices(): Q.Promise<IDevice[]>;
    launchApp(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void>;
    getOnlineDevices(): Q.Promise<IDevice[]>;
    reloadAppInDebugMode(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void>;
    apiVersion(deviceId: string): Q.Promise<AndroidAPILevel>;
    reverseAdd(deviceId: string, devicePort: string, computerPort: string): Q.Promise<void>;
}

export abstract class AdbEnhancements implements IAdb {
    public abstract getConnectedDevices(): Q.Promise<IDevice[]>;
    public abstract launchApp(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void>;
    public abstract reloadAppInDebugMode(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void>;
    public abstract apiVersion(deviceId: string): Q.Promise<AndroidAPILevel>;
    public abstract reverseAdd(deviceId: string, devicePort: string, computerPort: string): Q.Promise<void>;

    public getOnlineDevices(): Q.Promise<IDevice[]> {
        return this.getConnectedDevices().then(devices => {
            return devices.filter(device =>
                device.isOnline);
        });
    }
}

export class Adb extends AdbEnhancements {
    private childProcess: ChildProcess;
    private commandExecutor: CommandExecutor;

    constructor({childProcess = new ChildProcess(), commandExecutor = new CommandExecutor()} = {}) {
        super();
        this.childProcess = childProcess;
        this.commandExecutor = commandExecutor;
    }

    /**
     * Gets the list of Android connected devices and emulators.
     */
    public getConnectedDevices(): Q.Promise<IDevice[]> {
        let childProcess = new ChildProcess();
        return childProcess.execToString("adb devices")
            .then(output => {
                return this.parseConnectedDevices(output);
            });
    }

    /**
     * Broadcasts an intent to reload the application in debug mode.
     */
    public reloadAppInDebugMode(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void> {
        let enableDebugCommand = `adb ${debugTarget ? "-s " + debugTarget : ""} shell am broadcast -a "${packageName}.RELOAD_APP_ACTION" --ez jsproxy true`;
        return new CommandExecutor(projectRoot).execute(enableDebugCommand);
    }

    /**
     * Sends an intent which launches the main activity of the application.
     */
    public launchApp(projectRoot: string, packageName: string, debugTarget?: string): Q.Promise<void> {
        let launchAppCommand = `adb -s ${debugTarget} shell am start -n ${packageName}/.MainActivity`;
        return new CommandExecutor(projectRoot).execute(launchAppCommand);
    }

    public apiVersion(deviceId: string): Q.Promise<AndroidAPILevel> {
        return this.executeQuery(deviceId, "shell getprop ro.build.version.sdk").then(output =>
            parseInt(output, 10));
    }

    public reverseAdd(deviceId: string, devicePort: string, computerPort: string): Q.Promise<void> {
        return this.execute(deviceId, `reverse tcp:${devicePort} tcp:${computerPort}`);
    }

    private parseConnectedDevices(input: string): IDevice[] {
        let result: IDevice[] = [];
        let regex = new RegExp("^(\\S+)\\t(\\S+)$", "mg");
        let match = regex.exec(input);
        while (match != null) {
            result.push({ id: match[1], isOnline: match[2] === "device", type: this.extractDeviceType(match[1]) });
            match = regex.exec(input);
        }
        return result;
    }

    private extractDeviceType(id: string): DeviceType {
        return id.match(AndroidSDKEmulatorPattern)
            ? DeviceType.AndroidSdkEmulator
            : DeviceType.Other;
    }

    private executeQuery(deviceId: string, command: string): Q.Promise<string> {
        return this.childProcess.execToString(this.generateCommandForDevice(deviceId, command));
    }

    private execute(deviceId: string, command: string): Q.Promise<void> {
        return this.commandExecutor.execute(this.generateCommandForDevice(deviceId, command));
    }

    private generateCommandForDevice(deviceId: string, adbCommand: string): string {
        return `adb -s "${deviceId}" ${adbCommand}`;
    }
}
