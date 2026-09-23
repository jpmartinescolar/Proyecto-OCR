/*
*   @Class : CI_XMLUtils
*
*   @Author             :   José Ernesto <jose@calibre360.io>
*   @Created            :   29 ene 2024
*   @Description        :   Clase utility
*/
public with sharing class CI_XMLUtils {
    public static String specialChars  = 'áéíóúÁÉÍÓÚýÝàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛãõÃÕñÑäëïöüÄËÏÖÜÿçÇ€&_';
    public static String remplaceChars = 'aeiouAEIOUyYaeiouAEIOUaeiouAEIOUaoAOnNaeiouAEIOUycCE+-';

    public CI_XMLUtils(){}

    public static void removeIfNotHasChild(Dom.Xmlnode iNode){
        if(iNode != NULL){
           if(iNode.getChildren().size() > 0){
               for (Dom.XmlNode child : iNode.getChildren()) {
                    removeIfNotHasChild(child);
               }               
               if(iNode.getChildren().size() == 0){
                   iNode.getParent().removeChild(iNode); 
               }
           } else {
               if(iNode.getText() == ''){
                    iNode.getParent().removeChild(iNode);
               }
           }
        }
    }

    public static String cleanTextNode(String node){
        for (Integer x = 0; x < node.length(); x++) {
            String specialChar = node.substring(x, x+1);
            if (specialChars.contains(specialChar)) {
               String charToRempl = remplaceChars.substring(specialChars.indexOf(node.substring(x, x+1)), specialChars.indexOf(node.substring(x, x+1))+1);
               node = node.replaceAll(node.substring(x, x+1), charToRempl);  
            }
        }

        String cleanedText = node.replaceAll('[^0-9a-zA-ZñÑ /\\-?:().,\'+€@&_]+', '');
               cleanedText = cleanedText.replaceAll('[/\b]$', '');
               cleanedText = cleanedText.replaceAll('//', '/');
               cleanedText = cleanedText.replaceAll('@', '(at)');
        return cleanedText;
    }
}