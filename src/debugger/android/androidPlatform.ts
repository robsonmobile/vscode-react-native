// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";
import {IAppPlatform} from "../platformResolver";
import {IRunOptions} from "../../common/launchArgs";
import {CommandExecutor} from "../../common/commandExecutor";
import {Package} from "../../common/node/package";
import {PackageNameResolver} from "../../common/android/packageNameResolver";
import {DeviceResolver, IDevice} from "../../common/android/deviceResolver";

/**
 * Android specific platform implementation for debugging RN applications.
 */
export class AndroidPlatform implements IAppPlatform {

    private debugTarget: string;
    private packageName: string;

    public runApp(runOptions: IRunOptions): Q.Promise<void> {
        let pkg = new Package(runOptions.projectRoot);
        return new CommandExecutor(runOptions.projectRoot).spawnAndWaitReactCommand("run-android")
            .then(() => pkg.name())
            .then(appName => new PackageNameResolver(appName).resolvePackageName(runOptions.projectRoot))
            .then(packageName => {
                this.packageName = packageName;
                let cexec = new CommandExecutor(runOptions.projectRoot);
                let deviceResolver = new DeviceResolver();
                return deviceResolver.getConnectedDevices()
                    .then((devices: IDevice[]) => {
                        if (devices.length > 1) {
                            /* more than one device or emulator */
                            this.debugTarget = this.getTargetEmulator(runOptions, devices);
                            if (this.debugTarget) {
                                /* Launching is needed only if we have more than one device active */
                                let launchAppCommand = `adb -s ${this.debugTarget} shell am start -n ${packageName.toLowerCase()}/.MainActivity`;
                                return cexec.execute(launchAppCommand);
                            }
                        }
                    });
            });
    }

    public enableJSDebuggingMode(runOptions: IRunOptions): Q.Promise<void> {
        let cexec = new CommandExecutor(runOptions.projectRoot);
        let enableDebugCommand = `adb ${this.debugTarget ? "-s " + this.debugTarget : ""} shell am broadcast -a "${this.packageName.toLowerCase()}.RELOAD_APP_ACTION" --ez jsproxy true`;
        return cexec.execute(enableDebugCommand);
    }

    /**
     * Returns the target emulator, using the following logic:
     * *  If an emulator is specified and it is connected, use that one.
     * *  Otherwise, use the first one in the list.
     */
    private getTargetEmulator(runOptions: IRunOptions, devices: IDevice[]): string {
        let activeFilterFunction = (device: IDevice) => {
            return device.isOnline;
        };

        let targetFilterFunction = (device: IDevice) => {
            return device.id === runOptions.target && activeFilterFunction(device);
        };

        if (runOptions && runOptions.target && devices) {
            /* check if the specified target is active */
            if (devices.some(targetFilterFunction)) {
                return runOptions.target;
            }
        }

        /* return the first active device in the list */
        let activeDevices = devices && devices.filter(activeFilterFunction);
        return activeDevices && activeDevices[0] && activeDevices[0].id;
    }
}