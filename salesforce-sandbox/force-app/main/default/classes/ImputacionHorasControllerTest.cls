@isTest
public class ImputacionHorasControllerTest{

    public static testmethod  void unitTest(){
        ImputacionHorasController.TimeInfo ei=new ImputacionHorasController.TimeInfo();
        ei.hours=08;
        ei.minutes=23;
        ei.seconds=06;
        ImputacionHorasController.CreateRecordImputaci(JSON.serialize(ei));
    }
}