({
    handleStart : function(component, event, helper) {
        helper.getGeoLocation(component, event, helper);
        helper.getIpInfo(component, event, helper);
    },
	createRecord : function(component, event, helper) {  
        var extraInfo={};
        extraInfo.Latitude=component.get("v.startLatitude");
        extraInfo.Longitude=component.get("v.startLongitude");
        extraInfo.IpInfo=component.get("v.startIpInfo").ip;
        console.log('*********extraInfo '+JSON.stringify(extraInfo));
        var action = component.get("c.startTimer");
        action.setParams({ extraInfo : JSON.stringify(extraInfo)});
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                console.log(response.getReturnValue());
                var res=response.getReturnValue();
                if(res.status==true){
                	component.set("v.recordId",res.recordId);
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
        $A.enqueueAction(action);
	},
    handleStop : function(component, event, helper) {
        helper.getGeoLocation(component, event, helper);
        helper.getIpInfo(component, event, helper);
    },
    updateRecord : function(component, event, helper) {
        var extraInfo={};
        extraInfo.Latitude=component.get("v.stopLatitude");
        extraInfo.Longitude=component.get("v.stopLongitude");
        extraInfo.IpInfo=component.get("v.stopIpInfo").ip;
        console.log('*********extraInfo '+JSON.stringify(extraInfo));
        
        var action = component.get("c.stopTimer");
        action.setParams({ "recordId" : component.get("v.recordId"),"extraInfo" : JSON.stringify(extraInfo)});
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                console.log(response.getReturnValue());
                var res=response.getReturnValue();
                if(res.status==true){
                    //NO NEED
                }else{
                    component.set("v.showMessage",true);
                    component.set("v.message",res.message);
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
        $A.enqueueAction(action);
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
    getGeoLocation : function(component, event, helper) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                showPosition, 
                null, 
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
        } else { 
            
        }
        function showPosition(position) {
            var Latitude =  position.coords.latitude;
            var Longitude = position.coords.longitude;
           
            if(component.get("v.isStarted")==true){
                component.set("v.isStartGeoLocation",true);
                component.set("v.startLatitude",Latitude);   
                component.set("v.startLongitude",Longitude);   
                var isStartIpInfo=component.get("v.isStartIpInfo");
                if(isStartIpInfo==true)
                	helper.createRecord(component, event, helper);
            }else{
                component.set("v.isStopGeoLocation",true);
                component.set("v.stopLatitude",Latitude);   
                component.set("v.stopLongitude",Longitude);      
                var isStopIpInfo=component.get("v.isStopIpInfo");
                if(isStopIpInfo==true)
                	helper.updateRecord(component, event, helper);
            }  
        }          
    },
    getIpInfo:function(component, event, helper){
        var IpInfo={};
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {               
                var response = xhttp.responseText;
                console.log(response);
                IpInfo.response=response;
                if(response!=undefined){
                    var obj = JSON.parse(response);
                    console.log(obj.ip);
                    IpInfo.ip=obj.ip;
                }
                if(component.get("v.isStarted")==true){
                    component.set("v.isStartIpInfo",true);
                    component.set("v.startIpInfo",IpInfo);   
                    var isStartGeoLocation=component.get("v.isStartGeoLocation");
                    if(isStartGeoLocation==true){
                        helper.createRecord(component, event, helper);
                    }
                }else{
                    component.set("v.isStopIpInfo",true);
                    component.set("v.stopIpInfo",IpInfo);   
                    var isStopGeoLocation=component.get("v.isStopGeoLocation");
                    if(isStopGeoLocation==true){
                        helper.updateRecord(component, event, helper);
                    }
                }                      
            }
        };
        xhttp.open("GET", "https://ipapi.co/json/", true);        
        xhttp.send();
    },
    handleBrowserClose : function(component, event, helper) {
        console.log('do something');
        if(component.get("v.isStarted")==true){
            component.set("v.isStarted",false);
            helper.updateRecord(component, event, helper);
        }
    },
})