({
    
    doInit: function(component,event, helper) 
    {
       /* var action = component.get("c.getObjectDetails");
        action.setParams({ recId : component.get("v.recordId") });
        action.setCallback(this, function(response) {
        var state = response.getState();
        if (state === "SUCCESS") 
        {  
        	var Result=response.getReturnValue();  
            //SET THE SELECTED OBJECT 
            var objectName=component.get("v.objectName");
            //RECORD ID
            var RelatedId=(objectName=='Account') ? Result.ParentAccountId:(objectName=='Contact')?Result.ParentContactId : (objectName=='Contract')?Result.ParentContractId :'';
            
            //Execute when an user edit the page and choose the desired object and respective fields.
            if(component.get("v.fieldString")!=null || component.get("v.fieldString")!=undefined)
            {
                 var FieldString=component.get("v.fieldString");
                //GET SELECTED FIELDS LIST
                 var fieldStringList= FieldString.split(',');                 
                 component.set("v.iconName",Result.IconName);
                 component.set("v.fieldToShow",fieldStringList);
                 component.set("v.ParentId",RelatedId);
                   
           }
           //Initially else part will be execute when default object and fields are selected.
           else{
                component.set("v.ParentId",RelatedId);
                component.set("v.iconName",'standard:'+objectName.toLowerCase());
                component.set("v.fieldToShow",component.get("v.DefaultFields"));
           }
        }
      });
                
    $A.enqueueAction(action);    
    */
        var objectName=component.get("v.objectName");
        //Execute when an user edit the page and choose the desired object and respective fields.
        if(component.get("v.fieldString")!=null || component.get("v.fieldString")!=undefined)
        {
             var FieldString=component.get("v.fieldString");
             //GET SELECTED FIELDS LIST
             var fieldStringList= FieldString.split(',');                 
             component.set("v.iconName",'standard:'+objectName.toLowerCase());
             component.set("v.fieldToShow",fieldStringList);
                   
        }
        //Initially else part will be execute when default object and fields are selected.
        else{
             component.set("v.iconName",'standard:'+objectName.toLowerCase());
             component.set("v.fieldToShow",component.get("v.DefaultFields"));
        }
    } ,

	handleSubmit : function(component, event, helper) 
    {
    },    
})