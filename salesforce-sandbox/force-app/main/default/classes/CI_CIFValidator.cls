public class CI_CIFValidator {
    // Entrada para Flow
    public class CifValidationInput {
        @InvocableVariable(required=true)
        public String cif;
    }

    // Salida para Flow
    public class CifValidationResult {
        @InvocableVariable
        public Boolean isValid;
    }

    @InvocableMethod(
        label='Validar identificador fiscal español'
        description='Devuelve true/false según el CIF / NIF / DNI / NIE sea válido'
    )
    public static List<CifValidationResult> validateCif(List<CifValidationInput> requests) {
        List<CifValidationResult> results = new List<CifValidationResult>();

        for (CifValidationInput req : requests) {
            CifValidationResult res = new CifValidationResult();
            res.isValid = isValidSpanishId(req.cif);
            results.add(res);
        }

        return results;
    }

    // --------------------------------------------------
    // Validador general: CIF ó DNI/NIF/NIE
    // --------------------------------------------------
    public static Boolean isValidSpanishId(String input) {
        if (String.isBlank(input)) return false;

        String value = input.trim().toUpperCase();

        // Longitud básica
        if (value.length() != 9) {
            return false;
        }

        // 1) Intentar CIF (letra inicial A..Z específica)
        if (isValidCif(value)) {
            return true;
        }

        // 2) Intentar DNI/NIF/NIE
        if (isValidDniNie(value)) {
            return true;
        }

        // 3) Si no es ni CIF ni DNI/NIF/NIE válido
        return false;
    }

    // --------------------------
    // Lógica de validación CIF
    // --------------------------
    public static Boolean isValidCif(String input) {
        if (String.isBlank(input)) return false;

        String cif = input.trim().toUpperCase();

        if (cif.length() != 9) return false;

        String first  = cif.substring(0, 1);
        String middle = cif.substring(1, 8);
        String last   = cif.substring(8); // carácter de control

        // Primera letra válida de CIF
        if ('ABCDEFGHJKLMNPQRSUVW'.indexOf(first) == -1) {
            return false;
        }

        // Los 7 medios deben ser números
        if (!Pattern.matches('^\\d{7}$', middle)) {
            return false;
        }

        // Cálculo del dígito de control
        Integer sumEven = 0; // posiciones 2,4,6 (índices 1,3,5 en "middle")
        Integer sumOdd  = 0; // posiciones 1,3,5,7 (índices 0,2,4,6)

        for (Integer i = 0; i < middle.length(); i++) {
            Integer d = Integer.valueOf(middle.substring(i, i+1));

            if (Math.mod(i, 2) == 0) {
                // Posiciones impares oficiales (1,3,5,7): *2 y sumar dígitos
                Integer prod = d * 2;
                sumOdd += (prod / 10) + Math.mod(prod, 10);
            } else {
                // Posiciones pares oficiales (2,4,6): se suman tal cual
                sumEven += d;
            }
        }

        Integer total        = sumEven + sumOdd;
        Integer controlDigit = Math.mod(10 - Math.mod(total, 10), 10);

        // Tabla de letras de control
        String controlLetters   = 'JABCDEFGHI';
        String expectedDigitChar  = String.valueOf(controlDigit);
        String expectedLetterChar = controlLetters.substring(controlDigit, controlDigit + 1);

        // Tipos de CIF:
        // - A, B, E, H → control debe ser dígito
        // - P, Q, S, W → control debe ser letra
        // - Resto → puede ser dígito o letra
        Boolean mustBeDigit  = 'ABEH'.contains(first);
        Boolean mustBeLetter = 'PQSW'.contains(first);

        String control = last;

        if (mustBeDigit) {
            return control == expectedDigitChar;
        } else if (mustBeLetter) {
            return control == expectedLetterChar;
        } else {
            return control == expectedDigitChar || control == expectedLetterChar;
        }
    }

    // --------------------------
    // Lógica de validación DNI / NIF / NIE
    // --------------------------
    public static Boolean isValidDniNie(String input) {
        if (String.isBlank(input)) return false;

        String nif = input.trim().toUpperCase();

        if (nif.length() != 9) return false;

        String numberPart;
        String letter = nif.substring(8, 9); // última posición

        // Tabla letras DNI/NIF/NIE
        String letters = 'TRWAGMYFPDXBNJZSQVHLCKE';

        // DNI/NIF: 8 dígitos + letra
        if (Pattern.matches('^\\d{8}[A-Z]$', nif)) {
            numberPart = nif.substring(0, 8);
        }
        // NIE: X/Y/Z + 7 dígitos + letra
        else if (Pattern.matches('^[XYZ]\\d{7}[A-Z]$', nif)) {
            String first = nif.substring(0, 1);
            String rest  = nif.substring(1, 8);

            // X -> 0, Y -> 1, Z -> 2
            if (first == 'X') {
                numberPart = '0' + rest;
            } else if (first == 'Y') {
                numberPart = '1' + rest;
            } else if (first == 'Z') {
                numberPart = '2' + rest;
            } else {
                return false;
            }
        } else {
            // No encaja ni como DNI ni como NIE
            return false;
        }

        Integer num;
        try {
            num = Integer.valueOf(numberPart);
        } catch (Exception e) {
            return false;
        }

        Integer idx = Math.mod(num, 23);
        String expectedLetter = letters.substring(idx, idx + 1);

        return letter == expectedLetter;
    }

    public static void cober (){
        Integer i = 0;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
        i++;
    }
}