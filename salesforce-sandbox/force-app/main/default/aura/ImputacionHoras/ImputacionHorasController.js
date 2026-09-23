({
	start : function(component, event, helper) {
		component.set("v.isStarted",true);
        component.set("v.seconds","00");
        component.set("v.minutes","00");
        component.set("v.hours","00");
        helper.showTimer(component, event, helper);
        //helper.handleStart(component, event, helper);
	},
    stop : function(component, event, helper) {
    	component.set("v.isStarted",false);
        component.set("v.isStop",true);
        //helper.handleStop(component, event, helper);
	},
    close : function(component, event, helper) {
        component.set("v.showMessage",false);
        component.set("v.showSuccessMessage",false);
    },
    CreateRecord : function(component, event, helper) {
        helper.createRecord1(component, event, helper);
    },
    reset : function(component, event, helper) {
		component.set("v.isStarted",false);
        component.set("v.isStop",false);
        component.set("v.showSuccessMessage",false);
        component.set("v.seconds","00");
        component.set("v.minutes","00");
        component.set("v.hours","00");
        //helper.showTimer(component, event, helper);
        //helper.handleStart(component, event, helper);
	}
})