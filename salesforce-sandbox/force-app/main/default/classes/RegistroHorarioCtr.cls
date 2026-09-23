public class RegistroHorarioCtr{
    @auraEnabled
    public static result startTimerInit(){
        result rs=new result();
        try{
            list<Registro_Horario__c> todaysRecords=[select id,Fecha_hora_Registro__c from Registro_Horario__c  where CreatedDate = TODAY and CreatedbyId=:UserInfo.getUserid()
                and Tipo__c='Entrada' and Fecha_hora_Registro__c!=null order by CreatedDate desc];
            if(todaysRecords.size()>0){
                Registro_Horario__c rh=todaysRecords[0];
                rs.isResume=true; 
                time endTime=system.now().time();
                time startTime=rh.Fecha_hora_Registro__c.time();
                Integer elapsedHours = endTime.hour() - startTime.hour();
                Integer elapsedMinutes = endTime.minute() - startTime.minute();
                Integer elapsedSeconds = endTime.second() - startTime.second();
                rs.seconds=elapsedSeconds>9?elapsedSeconds+'':'0'+elapsedSeconds;
                rs.minutes=elapsedMinutes >9?elapsedMinutes +'':'0'+elapsedMinutes ; 
                rs.hours=elapsedHours >9?elapsedHours +'':'0'+elapsedHours ;  
                rs.status=true;
                rs.recordid=rh.id;
            }
        }catch(exception e){
            rs.message=e.getmessage();
        }
        return rs;
    }
    
    @auraEnabled
    public static result startTimer(string extraInfo){
        result rs=new result();
        try{
            extraInfo ei = (extraInfo)JSON.deserialize(extraInfo, extraInfo.class);
            Registro_Horario__c rh=new Registro_Horario__c();
            rh.Fecha_hora_Registro__c=system.now();
            rh.Tipo__c='Entrada';
            rh.Entrada_Latitud_Longitud__latitude__s=ei.Latitude;
            rh.Entrada_Latitud_Longitud__longitude__s=ei.Longitude;
            rh.Entrada_Direccion_IP__c=ei.IpInfo;
            insert rh;
            rs.status=true;
            rs.recordid=rh.id;
        }catch(exception e){
            rs.message=e.getmessage();
        }
       
        return rs;
    }
    public class extraInfo{
        public decimal Latitude;
        public decimal Longitude;
        public string IpInfo;
    }
    @auraEnabled
    public static result stopTimer(string recordId,string extraInfo){
        result rs=new result();
        try{
            extraInfo ei = (extraInfo)JSON.deserialize(extraInfo, extraInfo.class);
            
            Registro_Horario__c rh=new Registro_Horario__c();
            rh.id=recordId;
            rh.Fecha_hora_Salida__c=system.now();
            rh.Tipo__c='Salida';
            rh.Salida_Latitud_Longitud__latitude__s=ei.Latitude;
            rh.Salida_Latitud_Longitud__longitude__s=ei.Longitude;
            rh.Salida_Direccion_IP__c=ei.IpInfo;
            update rh;
            rs.status=true;
            rs.recordid=rh.id;
        }catch(exception e){
            rs.message=e.getmessage();
        }
        return rs;
    }
    
    public class result{
        @auraEnabled
        public id recordId;
        @auraEnabled
        public boolean status;
        @auraEnabled
        public string message;
        @auraEnabled
        public boolean isResume;
        @auraEnabled
        public string seconds;
        @auraEnabled
        public string minutes;
        @auraEnabled
        public string hours;
    }
}