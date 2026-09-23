({
    doInit: function(component, event, helper) {
        window.addEventListener('beforeunload', function (e) {
            console.log(' in tab close');
            e.preventDefault(); 
            e.returnValue = ''; 
        });
        component.set("v.spinner",true);
        var action = component.get("c.startTimerInit");
        action.setCallback(this, function(response) {
            component.set("v.spinner",false);
            var state = response.getState();
            if (state === "SUCCESS") {
                console.log(response.getReturnValue());
                var res=response.getReturnValue();
                if(res.status==true && res.isResume==true){
                    component.set("v.recordId",res.recordId);
                    component.set("v.seconds",res.seconds);
                    component.set("v.minutes",res.minutes);
                    component.set("v.hours",res.hours);
                    component.set("v.isStarted",true);
                    helper.showTimer(component, event, helper);
                }
            }
            else if (state === "ERROR") {
                component.set("v.spinner",false);
                var errors = response.getError();
                if (errors) {
                    if (errors[0] && errors[0].message) {
                        console.log("Error message: " + 
                                 errors[0].message);
                    }
                } else {
                    console.log("Unknown error");
                }
            }
        });
        $A.enqueueAction(action);
    },
	start : function(component, event, helper) {
		component.set("v.isStarted",true);
        component.set("v.seconds","00");
        component.set("v.minutes","00");
        component.set("v.hours","00");
        helper.showTimer(component, event, helper);
        helper.handleStart(component, event, helper);
	},
    stop : function(component, event, helper) {
    	component.set("v.isStarted",false);
        helper.handleStop(component, event, helper);
	},
    close : function(component, event, helper) {
        component.set("v.showMessage",false);
    }
})