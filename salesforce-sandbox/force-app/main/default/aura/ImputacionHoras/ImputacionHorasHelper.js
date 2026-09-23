({
    createRecord1 : function(component, event, helper) {
        let second=parseInt(component.get("v.seconds"));
        let minute=parseInt(component.get("v.minutes"));
        let hour=parseInt(component.get("v.hours"));
        console.log('before hour '+hour);
        console.log('before minute '+minute);
        console.log('before second '+second);
        if(second<60){
            minute = minute + 1;
            second = 0;
        }
        
        if(minute>59){
            hour = hour+1;
            minute = 0;
        }
        console.log('hour '+hour);
        console.log('minute '+minute);
        console.log('second '+second);

        var extraInfo={};
        extraInfo.hours=hour;
        extraInfo.minutes=minute;
        extraInfo.seconds=second;
        console.log('*********extraInfo '+JSON.stringify(extraInfo));
        let finalMinute=minute>9?minute:'0'+minute;
        let finalHour=hour>9?hour:'0'+hour;
        var finaltime = finalHour+':'+finalMinute+':00.000';
         console.log('*********finaltime '+finaltime);
        /*var action = component.get("c.CreateRecordImputaci");
        action.setParams({ extraInfo : JSON.stringify(extraInfo)});
        action.setCallback(this, function(response) {
            var state = response.getState();
            console.log('state '+state)
            if (state === "SUCCESS") {
                console.log(response.getReturnValue());
                var res=response.getReturnValue();
                if(res.status==true){
                	component.set("v.recordId",res.recordId);
                    component.set("v.showSuccessMessage",true);
                    component.set("v.message",'Record Created Successfully');
                    var navEvt = $A.get("e.force:navigateToSObject");
                    navEvt.setParams({
                      "recordId": res.recordId,
                      "slideDevName": "related"
                    });
                    navEvt.fire();
                }else{
                    component.set("v.showMessage",true);
                    component.set("v.message",res.message);
                    component.set("v.isStarted",false);
                }
            }
            else if (state === "ERROR") {
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
        $A.enqueueAction(action);*/
        
        var createRecordEvent = $A.get('e.force:createRecord');
        if ( createRecordEvent ) {
            createRecordEvent.setParams({
                'entityApiName': 'Imputaci_n_horas__c',
                'defaultFieldValues': {
                    'Tiempo_imputaci_n__c' : finaltime,
                }
            });
            createRecordEvent.fire();
        } else {
            /* Create Record Event is not supported */
            alert('Account creation not supported');
        }
    
        
        
    },
    showTimer: function(component, event, helper) {
         window.setTimeout(
            $A.getCallback(function() {
                let second=parseInt(component.get("v.seconds"));
                let minute=parseInt(component.get("v.minutes"));
                let hour=parseInt(component.get("v.hours"));
                console.log(second);
                if(second<59){
                    second+=1;
                    let finalSecond=second>9?second:'0'+second;
                    console.log(finalSecond);
                    component.set("v.seconds",finalSecond);
                }else{
                    let finalSecond='00';
                    component.set("v.seconds",finalSecond);
                    if(minute<59){
                        minute+=1;
                        let finalMinute=minute>9?minute:'0'+minute;
                        component.set("v.minutes",finalMinute);
                    }else{
                        let finalMinute='00';
                        component.set("v.minutes",finalMinute);
                        hour+=1;
                        let finalHour=hour>9?hour:'0'+hour;
                        component.set("v.hours",finalHour);
                    }
                }
                var isStart=component.get("v.isStarted");
                if(isStart==true){
                	helper.showTimer(component, event, helper);
                }
            }), 1000
        );
    },
    handleBrowserClose : function(component, event, helper) {
        console.log('do something');
        if(component.get("v.isStarted")==true){
            component.set("v.isStarted",false);
            helper.updateRecord(component, event, helper);
        }
    },
})