@isTest
public class RegistroHorarioCtrTest{

    public static testmethod  void unitTest(){
        RegistroHorarioCtr.extraInfo ei=new RegistroHorarioCtr.extraInfo();
        ei.Latitude=28.698214399999998;
        ei.Longitude=77.26366720000001;
        ei.IpInfo='103.212.158.38';
        RegistroHorarioCtr.startTimer(JSON.serialize(ei));
        RegistroHorarioCtr.result rs=RegistroHorarioCtr.startTimerInit();
        RegistroHorarioCtr.stopTimer(rs.recordId,JSON.serialize(ei));
    }
}