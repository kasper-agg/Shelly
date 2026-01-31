// noinspection JSUnresolvedReference,JSCheckFunctionSignatures

/**
 * This script was written for a Shelly Plug S Gen 3, controlling a publicly accessible power outlet next to my house.
 * The idea is that the driveway outlet will only be enabled if I want to use it (like charging a car).
 * Being Dutch, it is my duty to be cheap, so the charging will only happen when power is cheap (aka daltarief):
 * Happy Hour!
 *
 * But I also don't want others to "accidentally" use my cheap electricity, so I want to "arm" the timer.
 * Currently, this is only possible through HomeAssistant, triggering a Virtual Button.
 *
 * The Schedule will trigger at set times on week-days, and the script script will check if the power is armed.
 * If armed, it will enable the power output. I currently have a timer set (not part of this script - yet) to cut power
 * off after 5 hours of output (which is enough for my personal scenario).
 * If arming the device during the weekend, this script will immediately enable power, as weekends is also "daltarief".
 *
 * A feature request has been submitted, requesting the ability to emit events through a physical button in detached mode.
 * Until then, the functionality to arm the trigger through the power switch will remain impossible,
 * unless it is ok for the device to be briefly powered on and off again without damage.
 * In that case you can leave the button in attached mode (momentary) and implement the event handler to control
 * power output based on the the armed/disarmed state (the value of the Virtual Boolean).
 *
 * The Virtual Boolean is visible in Home Assistant, allowing you to see if the trigger has been armed.
 *
 * What this script does:
 * - TODO: configure default output (off)
 * - TODO: configure output timer to cut power off after 5 hours "on"
 * - configure a virtual button used to emit events
 * - configures a cronjob (Schedule) triggering a "timed" event through the virtual button
 * - configure a virtual boolean used to keep state and make it visible to end users like Home Assistant
 * - TODO: configure the physical button (switch) to be detached (not executed by default!)
 * - TODO: NOT POSSIBLE (yet?): configure the physical button to emit an HTTP request to the virtual button press, emitting an "arm" or "disarm" event in detached mode
 * - TODO: NOT POSSIBLE (yet?): add event handlers handling the physical button events (arm & disarm) if button is in detached mode
 * - add color effects for arming & disarming
 * - add color effects while armed
 * - during weekends, immediately allow physical button to switch power as if it were attached
 */

// noinspection JSUnresolvedReference
const SATURDAY = 6;
const SUNDAY = 0;

const VIRTUAL_BUTTON_ID = 200;
const VIRTUAL_BUTTON_NAME = 'arm-timer-button';

const VIRTUAL_BOOLEAN_ID = 200;
const VIRTUAL_BOOLEAN_NAME = 'timer-armed-boolean';

const SWITCH_TIMER_ORIGIN = 'generated-switch-timer-cron';
const SCHEDULE_CREATE = 'Schedule.Create';
const SCHEDULE_UPDATE = 'Schedule.Update';

let scheduleConfig = {
    id: null,
    enable: true,
    timespec: "0 0 23 * * 1,2,3,4,5",
    calls:
        [
            {
                method: "button.trigger",
                params: {
                    event: "triple_push",
                    id: VIRTUAL_BUTTON_ID
                },
                origin: SWITCH_TIMER_ORIGIN,
            }
        ]
};

let virtualButtonConfig = {
    type:'button',
    id: VIRTUAL_BUTTON_ID,
    config:{
        name: VIRTUAL_BUTTON_NAME,
        meta: {
            ui: {
                view: 'button',
            }
        }
    }
};

let virtualBooleanConfig = {
    type: 'boolean',
    id: VIRTUAL_BOOLEAN_ID,
    config: {
        name: VIRTUAL_BOOLEAN_NAME,
        persisted: true,
        defaultValue: false,
        meta: {
            ui: {
                titles: ['Disarmed', 'Armed'],
                view: "label",
            }
        }
    }
};

function setPowerOn() {
    disarmPowerTrigger();
    Shelly.call('switch.set', {id: 0, on: true});
}

// Triggered by Schedule
function happyHourHandler() {
    Shelly.call('Boolean.GetStatus', {id: VIRTUAL_BOOLEAN_ID}, function(e){
        if(typeof e === 'undefined') {
            print(error);
        }
        if(e.value === true) {
            setPowerOn();
            print('Power ON! Disarmed Power Trigger');
            return;
        }

        print('Power Trigger was not armed, ignoring..');
    });
}

function createEventHandler() {
    Shelly.addEventHandler(
        function (e) {

            // Pressing the Virtual Button through Home Assistant toggles the arm state:
            if (e.id === 200 && e.info.event === 'single_push' && e.info.component === 'button:200') {
                // if weekend, switch power on, else:
                togglePowerTrigger();
            }

            // The Schedule will trigger a tripple_push, allowing us to distinguish it from arming/disarming the trigger:
            if (e.info.event === 'triple_push' && e.info.component === 'button:200') {
                happyHourHandler();
            }
        }
    );
}

// This method is commented out and is not useful (for me) at the moment.
function detachPhysicalSwitch(){
    Shelly.call(
        'PLUGS_UI.SetConfig',
        {
            config: {
                controls: {
                    "switch:0": {
                        in_mode: "detached",
                    }
                }
            }
        },
        printSetConfigResult
    );
}

function armPowerTrigger() {
    Shelly.call('Boolean.Set', {id: VIRTUAL_BOOLEAN_ID, value: true });
}
function disarmPowerTrigger() {
    Shelly.call('Boolean.Set', {id: VIRTUAL_BOOLEAN_ID, value: false });
}

let togglePowerTrigger = function() {
    let d = new Date(Date.now());
    let day = d.getDay();
    let hour = d.getHours();
    if(day === SATURDAY || day === SUNDAY) {
        print('Weekend: immediate power on!');
        setPowerOn();
        return;
    }

    // this is hardcoded and should correspond with the Schedule triggers.
    // NOTE: happy hours during weekdays lasts until 07:00, but we need ~5h of cheap charging.
    // That leaves us a window between 23:00 and 02:00 to charge something for 5 hours.
    if (hour >= 23 || hour <= 2) {
        print('Happy Hour: immediate power on!');
        setPowerOn();
        return;
    }

    Shelly.call('Boolean.GetStatus', {id: VIRTUAL_BOOLEAN_ID}, function(result, c, error){
        if(typeof result === 'undefined') {
            print('Unable to read Virtual Boolean value, aborting.');
            print(error);
            return;
        }
        if(result.value === true) {
            disarmPowerTrigger();
            print('Disarmed Power Trigger');
        } else {
            armPowerTrigger();
            print('Armed Power Trigger');
        }
    });
}

function createScheduleHandler(result, error_code, error) {
    if (error_code === 0 && result.rev) {
        print('Schedule updated to revision [' + result.rev + ']');
        return;
    }
    print(error);
}

function updateOrCreateSchedule(create, timerId) {
    let timerMethod = create ? SCHEDULE_CREATE : SCHEDULE_UPDATE;
    print(timerMethod);
    scheduleConfig.id = timerId;
    Shelly.call(timerMethod, scheduleConfig, createScheduleHandler);
}

function createSchedule() {
// Find existing schedule, or set the Schedule ID
    Shelly.call(
        'Schedule.list',
        null,
        function (r, code, error) {
            if (code !== 0) {
                print(error);
                return;
            }

            let create = true;
            let timerId = r.jobs.length;
            for (let i = 0; i < r.jobs.length; i++) {
                if (r.jobs[i].calls.length) {
                    // since we configure our virtual button to only have one action,
                    // it is safe to only check the first ([0]) call.
                    if (r.jobs[i].calls[0].origin === SWITCH_TIMER_ORIGIN) {
                        timerId = r.jobs[i].id;
                        create = false;
                        print('Schedule laready exists: [' + timerId + ']');
                        break;
                    }
                }
            }
            updateOrCreateSchedule(create, timerId);
        }
    );
}

function handleVirtualButtonSetConfig(result, error_code, error) {
    if(error_code !== 0) {
        print('Button not Created');
        print(error);
        return;
    }
    print('Virtual Button created');
}

function handleVirtualBoolenConfig(result, error_code, error) {
    if(error_code !== 0) {
        print('Boolean not Created');
        print(error);
        return;
    }
    print('Virtual Boolen created');
}
function addVirtualButton() {
    Shelly.call('Virtual.Add', virtualButtonConfig, handleVirtualButtonSetConfig);
}

function addVirtualBoolean() {
    Shelly.call('Virtual.Add', virtualBooleanConfig, handleVirtualBoolenConfig);
}

function printSetConfigResult(result, error_code, error) {
    if(typeof result !== 'undefined') {
        print(result);
    }
    if(error_code !== 0) {
        print(error);
    }
}

function createVirtualButton() {
    Shelly.call('Button.GetConfig', {id: VIRTUAL_BUTTON_ID}, function (e, code) {
        if (code !== 0) {
            print('No Button found matching our ID, creating...');
            addVirtualButton();
            return;
        }
        if (e.name === VIRTUAL_BUTTON_NAME) {
            print('Button with id ' + VIRTUAL_BUTTON_ID + ' already exists, updating config...');
            Shelly.call('Button.SetConfig', virtualButtonConfig, printSetConfigResult);
            return;
        }

        print('Button with id ' + VIRTUAL_BUTTON_ID + ' already exists, but has different name: [' + e.name + '].');
    });
}

function createVirtualBoolean() {
    Shelly.call('Boolean.GetConfig', {id: VIRTUAL_BOOLEAN_ID}, function (e, code) {
        if (code !== 0) {
            print('No Boolean found matching our ID, creating...');
            addVirtualBoolean();
            return;
        }
        if (e.name === VIRTUAL_BOOLEAN_NAME) {
            print('Boolean with id ' + VIRTUAL_BOOLEAN_ID + ' already exists, updating config...');
            Shelly.call('Boolean.SetConfig', virtualBooleanConfig, printSetConfigResult);
            return;
        }

        print('Boolean with id ' + VIRTUAL_BOOLEAN_ID + ' already exists, but has different name: [' + e.name + '].');
    });
}

createVirtualButton();
createVirtualBoolean();
createSchedule();
// detachPhysicalSwitch();
createEventHandler()