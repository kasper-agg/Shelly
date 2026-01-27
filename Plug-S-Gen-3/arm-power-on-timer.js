// noinspection JSUnresolvedReference
const SATURDAY = 6;
const SUNDAY = 0;


const VIRTUAL_BUTTON_ID = 200;
const VIRTUAL_BUTTON_NAME = 'arm-timer-button';

const VIRTUAL_BOOLEAN_ID = 200;
const VIRTUAL_BOOLEAN_NAME = 'timer-armed-boolean';

const SWITCH_TIMER_STATE_KEY = 'timerArmed';
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

function createScheduleHandler(result, error_code, error) {
    if (result.rev) {
        print('Schedule updated to revision [' + result.rev + ']');
        return;
    }
    print('error code: ' + error_code);
    print(error);
}

// Set up the cronjob (update if it exists)
function updateOrCreateSchedule(timerMethod, timerId) {
    print(timerMethod);
    scheduleConfig.id = timerId;
    Shelly.call(timerMethod, scheduleConfig, createScheduleHandler);
}

// Find existing schedule, or set the Schedule ID
Shelly.call(
    'Schedule.list',
    null,
    function (r, code, error) {
        if(code !== 0) {
            print(error);
            return;
        }

        let timerMethod = SCHEDULE_CREATE;
        let timerId = r.jobs.length;
        for (let i = 0; i < r.jobs.length; i++) {
            if (r.jobs[i].calls.length) {
                // since we configure our virtual button to only have one action,
                // it is safe to only check the first ([0]) call.
                if (r.jobs[i].calls[0].origin === SWITCH_TIMER_ORIGIN) {
                    timerId = r.jobs[i].id;
                    timerMethod = SCHEDULE_UPDATE;
                    print('Schedule laready exists: [' + timerId + ']');
                    break;
                }
            }
        }
        updateOrCreateSchedule(timerMethod, timerId);
    }
);


function handleVirtualButtonSetConfig(result, error_code, error) {
    if(error_code !== 0) {
        print('Button not Created');
        print(error);
        return;
    }
    print('Virtual Button created');
}

function addVirtualButton() {
    Shelly.call('Virtual.Add', virtualButtonConfig, handleVirtualButtonSetConfig);
}

function printSetConfigResult(result, error_code, error) {
    if(typeof result !== 'undefined') {
        print(result);
    }
    if(error_code !== 0) {
        print(error);
    }
}

Shelly.call('Button.GetConfig', {id: VIRTUAL_BUTTON_ID}, function (e, code, error) {
    if(code !== 0) {
        print('No Button found matching our ID, creating...');
        addVirtualButton();
        return;
    }
    if (e.name === VIRTUAL_BUTTON_NAME) {
        print('Button with id ' + VIRTUAL_BUTTON_ID + ' already exists, updating config...');
        Shelly.call('Button.SetConfig', virtualButtonConfig, printSetConfigResult);
        return;
    }

    print('Button with id ' + VIRTUAL_BUTTON_ID + ' already exists, but has different name: ['+e.name+'].');
});

function handleVirtualBoolenConfig(result, error_code, error) {
    print('Boolean Created?');
    if(error_code !== 0) {
        print(error);
        return;
    }
    print('hhoray!');
}

function addVirtualBoolean() {
    Shelly.call('Virtual.Add', virtualBooleanConfig, handleVirtualBoolenConfig);
}

Shelly.call('Boolean.GetConfig', {id: VIRTUAL_BOOLEAN_ID}, function (e, code, error) {
    if(code !== 0) {
        print('No Boolean found matching our ID, creating...');
        addVirtualBoolean();
        return;
    }
    if (e.name === VIRTUAL_BOOLEAN_NAME) {
        print('Boolean with id ' + VIRTUAL_BOOLEAN_ID + ' already exists, updating config...');
        Shelly.call('Boolean.SetConfig', virtualBooleanConfig, printSetConfigResult);
        return;
    }

    print('Boolean with id ' + VIRTUAL_BOOLEAN_ID + ' already exists, but has different name: ['+e.name+'].');
});


Shelly.addEventHandler(
    function (e) {
        if (e.id === 200 && e.info.event === 'single_push' && e.info.component === 'button:200') {
            // if weekend, switch power on, else:
            togglePowerTrigger();
        }

        if (e.info.event === 'triple_push' && e.info.component === 'button:200') {
            happyHourHandler();
        }
    }
);

function happyHourHandler() {

    // let d = new Date(Date.now());
    // let day = d.getDay();
    // print(day);
    // if(day === SATURDAY || day === SUNDAY) {
    //     print('set switch state to ON');
    // }
    Shelly.call('Boolean.GetStatus', {id: VIRTUAL_BOOLEAN_ID}, function(e){
        if(typeof e === 'undefined') {
            print(error);
        }
        if(e.value === true) {
            Shelly.call('switch.set', { id:0, on:true });
            disarmPowerTrigger();
            print('Power ON! Disarmed Power Trigger');
            return;
        }

        print('Power Trigger was not armed, ignoring..');
    });
}

let togglePowerTrigger = function() {
    Shelly.call('Boolean.GetStatus', {id: VIRTUAL_BOOLEAN_ID}, function(e,c , error){
        if(typeof e === 'undefined') {
            print(error);
        }
        if(e.value === true) {
            disarmPowerTrigger();
            print('Disarmed Power Trigger');
        } else {
            armPowerTrigger();
            print('Armed Power Trigger');
        }
    });
}

function armPowerTrigger() {
    Shelly.call('Boolean.Set', {id: VIRTUAL_BOOLEAN_ID, value: true });
}
function disarmPowerTrigger() {
    Shelly.call('Boolean.Set', {id: VIRTUAL_BOOLEAN_ID, value: false });
}