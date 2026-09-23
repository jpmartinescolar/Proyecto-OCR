public class ImputacionHorasController{    
    @auraEnabled
    public static result CreateRecordImputaci(string extraInfo){
        result rs=new result();
        try{
            TimeInfo ti = (TimeInfo)JSON.deserialize(extraInfo, TimeInfo.class);
            System.debug('eiei '+ti);
            Time t = Time.newInstance(ti.hours,ti.minutes,ti.seconds,0);
            Imputaci_n_horas__c  obj = new Imputaci_n_horas__c ();
            obj.Tiempo_imputaci_n__c  =  t;
            insert obj;
            rs.status=true;
            rs.recordid=obj.id;
            System.debug('recordId '+obj.id);
           /* Registro_Horario__c rh=new Registro_Horario__c();
            rh.id=recordId;
            rh.Fecha_hora_Salida__c=system.now();
            rh.Tipo__c='Salida';
            rh.Salida_Latitud_Longitud__latitude__s=ei.Latitude;
            rh.Salida_Latitud_Longitud__longitude__s=ei.Longitude;
            rh.Salida_Direccion_IP__c=ei.IpInfo;
            update rh;
            rs.status=true;
            rs.recordid=rh.id;*/
        }catch(exception e){
            rs.message=e.getmessage();
        }
        return rs;
    }
    public class TimeInfo{
        public Integer hours;
        public Integer minutes;
        public Integer seconds;
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