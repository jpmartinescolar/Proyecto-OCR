@isTest
public class RelatedRecordComponentTest {

    @isTest
    Public static void getObjectDetailsTestMethod()
    {
        RelatedRecordComponentCtr.objectDetails objD1=new RelatedRecordComponentCtr.objectDetails();
        RelatedRecordComponentCtr.objectDetails objD2=new RelatedRecordComponentCtr.objectDetails();

        Account a = new Account(Name='Test');
        insert a;
        
        Contact c = new Contact(AccountId=a.Id, Lastname='Smith');
        insert c;
        
        Contract ct = new Contract(AccountId=a.Id);
        ct.Tipo_de_Contrato__c = 'Consultoría Jurídica';
        ct.Tipo_de_Tarifa__c = 'General';
        insert ct;

        Test.startTest();
            objD1=RelatedRecordComponentCtr.getObjectDetails(c.Id);
    
            //objd2.display='display: none;';
            //objd2.ObjectName='Account';
            objd2.IconName='standard:account';
            objd2.ParentAccountId=a.Id;
            //objd2.IsRelatedContact=false;
        Test.stopTest();

        system.assertNotEquals(objd2, objD1);

    }
    /*
    @isTest
    Public static void getObjectDetailForCaseTestMethod()
    {
        RelatedRecordComponentCtr.objectDetails objD1=new RelatedRecordComponentCtr.objectDetails();
        RelatedRecordComponentCtr.objectDetails objD2=new RelatedRecordComponentCtr.objectDetails();
        
        objd2.display='display: block;';
        objd2.ObjectName='Account';
        objd2.IconName='standard:account';
        objd2.ParentAccountId='0015Y00002b6SXmQAM';
        objd2.ParentContactId='0035Y00003njjuDQAQ';
        objd2.IsRelatedContact=True;
        
        
        objD1=RelatedRecordComponentCtr.getObjectDetailForCase('5005Y00001tBelTQAS');
        
        system.assertEquals(objd2, objD1);
 
    }
    */
}